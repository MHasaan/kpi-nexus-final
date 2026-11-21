/**
 * Personal notifications (plan 6.6): people named on an escalation level get
 * an email of their own, and their notification preferences decide what
 * happens to it. Until now preferences were saved and nothing read them.
 */
import { describe, expect, test, vi } from 'vitest';

import type { EmailService } from '../email/email.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { NotificationAdaptersService } from './notification-adapters.service.js';
import { NotificationDispatcherService } from './notification-dispatcher.service.js';
import { PersonalDigestService } from './personal-digest.service.js';

interface Row {
  id: string;
  organizationId: string;
  alertId: string;
  channelId: string | null;
  kind: string | null;
  targetUserId: string | null;
  status: string;
  held: string | null;
  error: string | null;
  attempts: number;
  sentAt: Date | null;
}
interface Person {
  id: string;
  email: string;
  status: string;
  timezone: string | null;
  notificationSettings: unknown;
}

const NOW = new Date('2026-11-18T23:30:00.000Z'); // a Wednesday

function harness(people: Person[], existing: Row[] = []) {
  const rows: Row[] = [...existing];
  const prisma = {
    organization: { findUnique: vi.fn(async () => ({ timezone: 'UTC' })) },
    kPI: { findUnique: vi.fn(async () => ({ name: 'Churn' })) },
    user: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => people.filter((p) => where.id.in.includes(p.id) && p.status === 'ACTIVE')),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => people.find((p) => p.id === where.id) ?? null),
    },
    alert: {
      findUnique: vi.fn(async () => ({ id: 'a1', kpiId: 'k1', severity: 'HIGH', message: 'Revenue is below its critical threshold' })),
      findMany: vi.fn(async () => [{ id: 'a1', severity: 'HIGH', message: 'Revenue is below its critical threshold', createdAt: NOW }]),
    },
    notificationChannel: { findUnique: vi.fn(async () => null) },
    notificationDelivery: {
      create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        const row: Row = { id: `d${rows.length + 1}`, channelId: null, kind: null, targetUserId: null, status: 'PENDING', held: null, error: null, attempts: 0, sentAt: null, organizationId: '', alertId: '', ...data };
        rows.push(row);
        return { id: row.id };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = rows.find((r) => r.id === where.id);
        return row ? { ...row } : null;
      }),
      findMany: vi.fn(async ({ where }: { where: { status: string; held: string } }) => rows.filter((r) => r.status === where.status && r.held === where.held).map((r) => ({ ...r }))),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(rows.find((r) => r.id === where.id)!, data)),
      updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: Partial<Row> }) => {
        const hit = rows.filter((r) => where.id.in.includes(r.id));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
    },
  };
  const adapters = { send: vi.fn(async (_kind: string, _config: Record<string, unknown>, _payload: unknown) => undefined) };
  const retryQueue = { add: vi.fn(async (_name: string, _data: unknown, _opts: { delay: number }) => ({})) };
  const email = { send: vi.fn(async (_opts: { to: string; subject: string; text: string; html: string }) => undefined) };
  const dispatcher = new NotificationDispatcherService(prisma as unknown as PrismaService, adapters as unknown as NotificationAdaptersService, retryQueue as never);
  const digest = new PersonalDigestService(prisma as unknown as PrismaService, email as unknown as EmailService);
  return { rows, prisma, adapters, retryQueue, email, dispatcher, digest };
}

const person = (over: Partial<Person> = {}): Person => ({ id: 'u1', email: 'ada@example.test', status: 'ACTIVE', timezone: null, notificationSettings: null, ...over });
const send = (h: ReturnType<typeof harness>, userIds = ['u1']) => h.dispatcher.dispatchToPeople({ organizationId: 'org-a', alertId: 'a1', userIds, now: NOW });

describe('NotificationDispatcherService.dispatchToPeople', () => {
  test('someone with no preferences gets the email at once, at their own address', async () => {
    const h = harness([person()]);
    await send(h);
    expect(h.adapters.send).toHaveBeenCalledWith('EMAIL', { recipients: ['ada@example.test'] }, expect.objectContaining({ alertId: 'a1' }));
    expect(h.rows).toEqual([expect.objectContaining({ kind: 'EMAIL', targetUserId: 'u1', status: 'SENT', held: null })]);
  });

  test('someone who muted email gets none: the row says so and nothing is sent', async () => {
    const h = harness([person({ notificationSettings: { mutedChannelKinds: ['EMAIL'] } })]);
    await send(h);
    expect(h.adapters.send).not.toHaveBeenCalled();
    expect(h.rows[0]).toMatchObject({ status: 'SUPPRESSED', error: 'Muted by the recipient' });
  });

  test('inside their mute hours the email waits until the hours end', async () => {
    const h = harness([person({ notificationSettings: { muteStart: '22:00', muteEnd: '07:00' } })]);
    await send(h);
    expect(h.adapters.send).not.toHaveBeenCalled();
    expect(h.rows[0]).toMatchObject({ status: 'PENDING', held: 'MUTE_HOURS' });
    // 23:30 → 07:00 is seven and a half hours.
    expect(h.retryQueue.add.mock.calls[0]![2].delay).toBe(7.5 * 3_600_000);
    // When the wait is over, the same row is sent.
    await h.dispatcher.attemptDelivery(h.rows[0]!.id);
    expect(h.adapters.send).toHaveBeenCalledOnce();
    expect(h.rows[0]).toMatchObject({ status: 'SENT', held: null });
  });

  test("the mute hours are on the person's own clock", async () => {
    // 23:30 UTC is 04:30 in Karachi: inside 22:00–07:00 there, two and a half hours to go.
    const h = harness([person({ timezone: 'Asia/Karachi', notificationSettings: { muteStart: '22:00', muteEnd: '07:00' } })]);
    await send(h);
    expect(h.retryQueue.add.mock.calls[0]![2].delay).toBe(2.5 * 3_600_000);
  });

  test('someone on a digest gets nothing now: the email is kept for the digest', async () => {
    const h = harness([person({ notificationSettings: { digestMode: 'DAILY' } })]);
    await send(h);
    expect(h.adapters.send).not.toHaveBeenCalled();
    expect(h.retryQueue.add).not.toHaveBeenCalled();
    expect(h.rows[0]).toMatchObject({ status: 'PENDING', held: 'DIGEST' });
    // A retry of that row does not send it either — only the digest does.
    await h.dispatcher.attemptDelivery(h.rows[0]!.id);
    expect(h.adapters.send).not.toHaveBeenCalled();
  });

  test('someone who is not active gets nothing, and no row', async () => {
    const h = harness([person({ status: 'SUSPENDED' })]);
    await send(h);
    expect(h.rows).toHaveLength(0);
  });
});

describe('PersonalDigestService.sendDue', () => {
  const held = (over: Partial<Row> = {}): Row => ({ id: 'd1', organizationId: 'org-a', alertId: 'a1', channelId: null, kind: 'EMAIL', targetUserId: 'u1', status: 'PENDING', held: 'DIGEST', error: null, attempts: 0, sentAt: null, ...over });
  // The run is hourly; a digest goes out at 07:00 on the person's own clock (UTC for these people).
  const SEVEN_UTC = new Date('2026-11-18T07:00:00.000Z'); // a Wednesday

  test('a daily digest is one email with everything kept for that person, and the rows are marked sent', async () => {
    const h = harness([person({ notificationSettings: { digestMode: 'DAILY' } })], [held(), held({ id: 'd2' })]);
    await expect(h.digest.sendDue(SEVEN_UTC)).resolves.toEqual({ people: 1, notifications: 2 });
    expect(h.email.send).toHaveBeenCalledOnce();
    expect(h.email.send.mock.calls[0]![0]).toMatchObject({ to: 'ada@example.test', subject: '2 KPI alerts' });
    expect(h.email.send.mock.calls[0]![0].text).toContain('Revenue is below its critical threshold');
    expect(h.rows.every((r) => r.status === 'SENT' && r.held === null)).toBe(true);
  });

  test('a weekly digest goes out on Monday only', async () => {
    const h = harness([person({ notificationSettings: { digestMode: 'WEEKLY' } })], [held()]);
    await expect(h.digest.sendDue(SEVEN_UTC)).resolves.toEqual({ people: 0, notifications: 0 }); // Wednesday
    expect(h.rows[0]).toMatchObject({ status: 'PENDING', held: 'DIGEST' });
    await expect(h.digest.sendDue(new Date('2026-11-23T07:00:00.000Z'))).resolves.toEqual({ people: 1, notifications: 1 }); // Monday
  });

  test('someone who has since turned the digest off gets what was kept, on the next run', async () => {
    const h = harness([person({ notificationSettings: { digestMode: 'OFF' } })], [held()]);
    await expect(h.digest.sendDue(NOW)).resolves.toEqual({ people: 1, notifications: 1 });
  });

  test('a failed email leaves the rows kept, for the next run', async () => {
    const h = harness([person({ notificationSettings: { digestMode: 'DAILY' } })], [held()]);
    h.email.send.mockRejectedValueOnce(new Error('smtp down'));
    await expect(h.digest.sendDue(SEVEN_UTC)).resolves.toEqual({ people: 0, notifications: 0 });
    expect(h.rows[0]).toMatchObject({ status: 'PENDING', held: 'DIGEST' });
  });

  // Since 2026-11-20 the digest goes out at 07:00 on each person's own clock, not at 07:00 UTC.
  describe('at 07:00 on the person’s own clock', () => {
    test('someone in Karachi gets it at 02:00 UTC — 07:00 there — and not at 07:00 UTC', async () => {
      const h = harness([person({ timezone: 'Asia/Karachi', notificationSettings: { digestMode: 'DAILY' } })], [held()]);
      await expect(h.digest.sendDue(SEVEN_UTC)).resolves.toEqual({ people: 0, notifications: 0 }); // 12:00 in Karachi
      await expect(h.digest.sendDue(new Date('2026-11-18T02:00:00.000Z'))).resolves.toEqual({ people: 1, notifications: 1 });
    });

    test('with no timezone of their own, the organisation’s clock is theirs', async () => {
      const h = harness([person({ notificationSettings: { digestMode: 'DAILY' } })], [held()]);
      h.prisma.organization.findUnique.mockResolvedValue({ timezone: 'America/New_York' });
      await expect(h.digest.sendDue(SEVEN_UTC)).resolves.toEqual({ people: 0, notifications: 0 }); // 02:00 in New York
      await expect(h.digest.sendDue(new Date('2026-11-18T12:00:00.000Z'))).resolves.toEqual({ people: 1, notifications: 1 }); // 07:00 there
    });

    test('weekly means Monday morning where they are, though it is still Sunday in UTC', async () => {
      const h = harness([person({ timezone: 'Pacific/Auckland', notificationSettings: { digestMode: 'WEEKLY' } })], [held()]);
      // Sunday 18:00 UTC is Monday 07:00 in Auckland (summer time, UTC+13).
      await expect(h.digest.sendDue(new Date('2026-11-22T18:00:00.000Z'))).resolves.toEqual({ people: 1, notifications: 1 });
    });

    test('a timezone that is not one is read as UTC', async () => {
      const h = harness([person({ timezone: 'Mars/Olympus', notificationSettings: { digestMode: 'DAILY' } })], [held()]);
      await expect(h.digest.sendDue(SEVEN_UTC)).resolves.toEqual({ people: 1, notifications: 1 });
    });
  });
});
