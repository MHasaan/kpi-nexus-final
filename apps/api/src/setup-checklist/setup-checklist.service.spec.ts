/**
 * Plan 3.3: a checklist task is complete when the organisation has done the
 * thing, without anyone ticking it. Prisma is a fake that answers each
 * existence check from a table of "what this organisation has".
 */
import { describe, expect, test, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { SetupChecklistService } from './setup-checklist.service.js';

const ctx = { organizationId: 'org-1', userId: 'admin' } as RequestContext;

interface Has {
  people?: number;
  dataPoint?: boolean;
  widget?: boolean;
  channel?: boolean;
  escalation?: boolean;
  report?: boolean;
  objective?: boolean;
  connector?: boolean;
  connection?: boolean;
  admins?: number;
  adminWithoutMfa?: boolean;
  sso?: boolean;
  aiConfig?: boolean;
  domain?: boolean;
  verifiedDomain?: boolean;
}

function make(has: Has, persisted: Array<{ key: string; status: string }> = []) {
  const row = (yes: boolean | undefined) => vi.fn(async () => (yes ? { id: 'x' } : null));
  const wheres: Array<Record<string, unknown>> = [];
  const track = <T,>(fn: (args: { where: Record<string, unknown> }) => Promise<T>) =>
    vi.fn(async (args: { where: Record<string, unknown> }) => {
      wheres.push(args.where);
      return fn(args);
    });
  const prisma = {
    onboardingTask: { findMany: vi.fn(async () => persisted) },
    user: {
      count: track(async ({ where }) => ('role' in where ? (has.admins ?? 1) : (has.people ?? 1))),
      findFirst: track(async () => (has.adminWithoutMfa === false ? null : { id: 'admin' })),
    },
    kPIDataPoint: { findFirst: track(row(has.dataPoint)) },
    dashboardWidget: { findFirst: track(row(has.widget)) },
    notificationChannel: { findFirst: track(row(has.channel)) },
    escalationRule: { findFirst: track(row(has.escalation)) },
    scheduledReport: { findFirst: track(row(has.report)) },
    objective: { findFirst: track(row(has.objective)) },
    connector: { findFirst: track(row(has.connector)) },
    integrationConnection: { findFirst: track(row(has.connection)) },
    ssoConfig: { findFirst: track(row(has.sso)) },
    aiFeatureConfig: { findFirst: track(row(has.aiConfig)) },
    customDomain: {
      findFirst: track(async ({ where }) => (('verifiedAt' in where ? has.verifiedDomain : has.domain) ? { id: 'd' } : null)),
    },
  };
  const service = new SetupChecklistService(prisma as unknown as PrismaService);
  const list = () => RequestContextStore.run(ctx, () => service.list());
  return { list, wheres };
}

const done = async (has: Has, persisted: Array<{ key: string; status: string }> = []) =>
  (await make(has, persisted).list()).items.filter((i) => i.status === 'complete').map((i) => i.key);

describe('SetupChecklistService.list — detection', () => {
  test('a brand-new organisation has done nothing yet', async () => {
    const view = await make({}).list();
    expect(view.complete).toBe(0);
    expect(view.items.every((i) => i.status === 'pending' && !i.detected)).toBe(true);
  });

  test.each<[string, Has]>([
    ['remaining_invites', { people: 2 }],
    ['historical_import', { dataPoint: true }],
    ['default_dashboard', { widget: true }],
    ['channels', { channel: true }],
    ['escalation', { escalation: true }],
    ['scheduled_report', { report: true }],
    ['okrs', { objective: true }],
    ['data_source', { connector: true }],
    ['data_source', { connection: true }],
    ['mfa', { adminWithoutMfa: false }],
    ['sso', { sso: true }],
    ['ai_tuning', { aiConfig: true }],
    ['custom_domain', { domain: true }],
  ])('%s is complete once the organisation has it', async (key, has) => {
    expect(await done(has)).toEqual([key]);
  });

  test('a verified domain completes both domain tasks', async () => {
    expect(await done({ domain: true, verifiedDomain: true })).toEqual(['custom_domain', 'domain_verification']);
  });

  test('the administrator alone is not "a team invited"', async () => {
    expect(await done({ people: 1 })).toEqual([]);
  });

  test('two-step sign-in needs every active administrator, and at least one', async () => {
    expect(await done({ adminWithoutMfa: true })).toEqual([]);
    expect(await done({ adminWithoutMfa: false, admins: 0 })).toEqual([]);
  });

  test('a detected task is marked as such; a dismissed one stays dismissed', async () => {
    const view = await make({ channel: true, objective: true }, [{ key: 'okrs', status: 'dismissed' }]).list();
    expect(view.items.find((i) => i.key === 'channels')).toMatchObject({ status: 'complete', detected: true });
    expect(view.items.find((i) => i.key === 'okrs')).toMatchObject({ status: 'dismissed', detected: false });
    expect(view.complete).toBe(1);
  });

  test('every check is scoped to the caller\'s organisation', async () => {
    const { list, wheres } = make({});
    await list();
    expect(wheres.length).toBeGreaterThanOrEqual(15);
    expect(wheres.every((w) => w.organizationId === 'org-1')).toBe(true);
  });
});
