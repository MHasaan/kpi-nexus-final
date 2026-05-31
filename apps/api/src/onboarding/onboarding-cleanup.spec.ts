/**
 * Tests for the stale-draft cleanup subsystem:
 *   - OnboardingService.cleanupStale — transitions in_progress rows older than
 *     the cutoff to 'archived'; leaves fresh/completed rows alone.
 *   - OnboardingCleanupProcessor — delegates to the service on job receipt.
 *   - OnboardingCleanupProducer — schedules the repeatable on module init with
 *     the canonical cron expression and deterministic jobId.
 */
import { describe, beforeEach, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal stubs so we can test without NestJS DI / BullMQ infrastructure
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1.  OnboardingService.cleanupStale
// ---------------------------------------------------------------------------
describe('OnboardingService.cleanupStale', () => {
  // Build a minimal mock of PrismaService with just the onboardingSession model.
  function makePrisma(updateManyCount: number) {
    return {
      onboardingSession: {
        updateMany: vi.fn().mockResolvedValue({ count: updateManyCount }),
      },
    };
  }

  async function buildService(updateManyCount: number) {
    // Import lazily so vi.mock replacements (if any) take effect before first use.
    const { OnboardingService } = await import('./onboarding.service.js');
    const prisma = makePrisma(updateManyCount);
    // Instantiate with mocked deps — auth and templates are not exercised.
    const svc = new OnboardingService(
      prisma as never,
      {} as never, // AuthService — not called by cleanupStale
      {} as never, // OrgTemplatesService — not called by cleanupStale
    );
    return { svc, prisma };
  }

  it('calls updateMany with in_progress status and updatedAt < cutoff', async () => {
    const { svc, prisma } = await buildService(3);

    const before = Date.now();
    const result = await svc.cleanupStale(30);
    const after = Date.now();

    expect(result).toEqual({ cleaned: 3 });

    const call = (prisma.onboardingSession.updateMany as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      where: { status: string; updatedAt: { lt: Date } };
      data: { status: string };
    };

    // Must target only in_progress rows
    expect(call.where.status).toBe('in_progress');

    // The cutoff is `serviceNow - 30 days`, where `before <= serviceNow <= after`.
    // So it must fall within [before - 30d, after - 30d] (inclusive). Asserting a
    // range — not `<= before - 30d` — avoids a 1ms flake when serviceNow > before.
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoff = call.where.updatedAt.lt;
    expect(cutoff).toBeInstanceOf(Date);
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - THIRTY_DAYS_MS);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - THIRTY_DAYS_MS);

    // Must transition to 'archived'
    expect(call.data.status).toBe('archived');
  });

  it('uses 30 days as the default cutoff when called without arguments', async () => {
    const { svc, prisma } = await buildService(0);
    await svc.cleanupStale(); // no arg

    const call = (prisma.onboardingSession.updateMany as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      where: { updatedAt: { lt: Date } };
    };
    const cutoffAge = Date.now() - call.where.updatedAt.lt.getTime();
    // Should be approximately 30 days
    expect(cutoffAge).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 2000);
    expect(cutoffAge).toBeLessThan(31 * 24 * 60 * 60 * 1000);
  });

  it('does NOT include an organizationId filter (system-wide job)', async () => {
    const { svc, prisma } = await buildService(0);
    await svc.cleanupStale(30);

    const call = (prisma.onboardingSession.updateMany as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    // No tenant scope on a maintenance sweep
    expect(call.where).not.toHaveProperty('organizationId');
  });

  it('leaves completed and fresh in_progress rows untouched (updateMany is scoped)', async () => {
    // The scope is enforced by the WHERE clause; updateMany only touches matched
    // rows in Postgres. We verify the WHERE does NOT match completed or fresh rows.
    const { svc, prisma } = await buildService(0);
    await svc.cleanupStale(30);

    const call = (prisma.onboardingSession.updateMany as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      where: { status: string; updatedAt: { lt: Date } };
    };

    // status filter excludes completed (only targets in_progress)
    expect(call.where.status).toBe('in_progress');
    // updatedAt.lt excludes rows updated recently
    const cutoff = call.where.updatedAt.lt;
    const now = new Date();
    expect(cutoff.getTime()).toBeLessThan(now.getTime()); // cutoff is in the past
  });

  it('returns 0 when nothing matches', async () => {
    const { svc } = await buildService(0);
    expect(await svc.cleanupStale(30)).toEqual({ cleaned: 0 });
  });
});

// ---------------------------------------------------------------------------
// 2.  OnboardingCleanupProcessor
// ---------------------------------------------------------------------------
describe('OnboardingCleanupProcessor', () => {
  it('calls cleanupStale when it receives the cleanup job', async () => {
    const { OnboardingCleanupProcessor } = await import('./onboarding-cleanup.processor.js');
    const { ONBOARDING_CLEANUP_JOB } = await import('./onboarding-cleanup.producer.js');

    const mockSvc = { cleanupStale: vi.fn().mockResolvedValue({ cleaned: 5 }) };
    const processor = new OnboardingCleanupProcessor(mockSvc as never);

    const mockJob = { name: ONBOARDING_CLEANUP_JOB } as import('bullmq').Job;
    await processor.process(mockJob);

    expect(mockSvc.cleanupStale).toHaveBeenCalledOnce();
  });

  it('does nothing for unknown job names', async () => {
    const { OnboardingCleanupProcessor } = await import('./onboarding-cleanup.processor.js');

    const mockSvc = { cleanupStale: vi.fn() };
    const processor = new OnboardingCleanupProcessor(mockSvc as never);

    const mockJob = { name: 'unrelated-job' } as import('bullmq').Job;
    await processor.process(mockJob);

    expect(mockSvc.cleanupStale).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3.  OnboardingCleanupProducer
// ---------------------------------------------------------------------------
describe('OnboardingCleanupProducer', () => {
  it('schedules the repeatable job with the daily 03:00 cron on module init', async () => {
    const { OnboardingCleanupProducer, ONBOARDING_CLEANUP_JOB, ONBOARDING_CLEANUP_CRON } =
      await import('./onboarding-cleanup.producer.js');

    const mockQueue = { add: vi.fn().mockResolvedValue(undefined) } as unknown as import('bullmq').Queue;
    const producer = new OnboardingCleanupProducer(mockQueue);

    await producer.onModuleInit();

    expect(mockQueue.add).toHaveBeenCalledOnce();

    const [name, _data, opts] = (mockQueue.add as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      unknown,
      { repeat: { pattern: string }; jobId: string },
    ];

    // Job name matches the exported constant
    expect(name).toBe(ONBOARDING_CLEANUP_JOB);
    // Cron pattern matches the exported constant (daily at 03:00 UTC)
    expect(opts.repeat.pattern).toBe(ONBOARDING_CLEANUP_CRON);
    expect(ONBOARDING_CLEANUP_CRON).toBe('0 3 * * *');
    // Deterministic jobId prevents duplicate schedules on re-deploy
    expect(opts.jobId).toBe(ONBOARDING_CLEANUP_JOB);
  });

  it('exported ONBOARDING_CLEANUP_JOB is a stable string constant', async () => {
    const { ONBOARDING_CLEANUP_JOB } = await import('./onboarding-cleanup.producer.js');
    expect(typeof ONBOARDING_CLEANUP_JOB).toBe('string');
    expect(ONBOARDING_CLEANUP_JOB.length).toBeGreaterThan(0);
  });
});
