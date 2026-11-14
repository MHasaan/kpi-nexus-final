/**
 * Per-subscriber filter for GET /realtime/stream. Events are published to the
 * whole organization; the stream used to forward every one of them to every
 * signed-in user, so anyone could watch other users' PER_USER values (with
 * their userId), alerts on KPIs they cannot see, and everyone's digest. Each
 * event now goes only to subscribers allowed to read what it carries.
 */
import { describe, expect, it, vi } from 'vitest';

import type { RealtimeEvent } from '@kpi-nexus/contracts';

import type { AlertsService } from '../alerts/alerts.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { RealtimeAccessService } from './realtime-access.service.js';

const ME: RequestContext = { userId: 'me', organizationId: 'org', roleId: 'role', principalType: 'user' };

const point = (over: Partial<Extract<RealtimeEvent, { type: 'data_point_added' }>> = {}): RealtimeEvent => ({
  type: 'data_point_added',
  kpiId: 'k_user',
  dataPointId: 'p1',
  value: 42,
  recordedAt: '2026-11-14T10:00:00.000Z',
  orgUnitId: null,
  userId: 'me',
  ...over,
});

function make(opts: { visible?: string[]; scopes?: Record<string, 'ORG_WIDE' | 'PER_UNIT' | 'PER_USER'>; pointScope?: object; alertVisible?: boolean } = {}) {
  const seen: Array<RequestContext | undefined> = [];
  const isKpiVisible = vi.fn(async (kpiId: string) => {
    seen.push(RequestContextStore.get());
    return (opts.visible ?? ['k_user', 'k_org', 'k_unit']).includes(kpiId);
  });
  const kpiPointScopeWhere = vi.fn(async () => opts.pointScope ?? { userId: { in: ['me', 'report'] } });
  const findFirst = vi.fn(async ({ where }: { where: { id: string } }) => {
    const scope = (opts.scopes ?? { k_user: 'PER_USER', k_org: 'ORG_WIDE', k_unit: 'PER_UNIT' })[where.id];
    return scope ? { scope } : null;
  });
  const isVisible = vi.fn(async () => opts.alertVisible ?? true);
  const svc = new RealtimeAccessService(
    { kPI: { findFirst } } as unknown as PrismaService,
    { isKpiVisible, kpiPointScopeWhere } as unknown as AccessContextService,
    { isVisible } as unknown as AlertsService,
  );
  return { svc, isKpiVisible, kpiPointScopeWhere, findFirst, isVisible, seen };
}

const subscriber = (svc: RealtimeAccessService) => RequestContextStore.run(ME, () => svc.forSubscriber()) as ReturnType<RealtimeAccessService['forSubscriber']>;

describe('RealtimeAccessService', () => {
  it('a data point on a visible KPI, within the subscriber\'s point scope, is allowed', async () => {
    const { svc } = make();
    const f = subscriber(svc);
    await expect(f.allows(point({ userId: 'me' }))).resolves.toBe(true);
    await expect(f.allows(point({ userId: 'report' }))).resolves.toBe(true);
  });

  it("another user's PER_USER value outside the subscriber's scope is withheld", async () => {
    const { svc } = make();
    await expect(subscriber(svc).allows(point({ userId: 'stranger' }))).resolves.toBe(false);
  });

  it('a data point on a KPI the subscriber cannot see is withheld', async () => {
    const { svc } = make({ visible: ['k_org'] });
    await expect(subscriber(svc).allows(point())).resolves.toBe(false);
  });

  it('a PER_UNIT point needs its unit in scope; an unrestricted scope sees all', async () => {
    const units = make({ pointScope: { orgUnitId: { in: ['u1'] } } });
    await expect(subscriber(units.svc).allows(point({ kpiId: 'k_unit', userId: null, orgUnitId: 'u1' }))).resolves.toBe(true);
    await expect(subscriber(units.svc).allows(point({ kpiId: 'k_unit', userId: null, orgUnitId: 'u2' }))).resolves.toBe(false);
    const admin = make({ pointScope: {} });
    await expect(subscriber(admin.svc).allows(point({ userId: 'stranger' }))).resolves.toBe(true);
  });

  it('checks run as the subscriber (their context), and a KPI is looked up once per stream', async () => {
    const { svc, isKpiVisible, findFirst, seen } = make();
    const f = subscriber(svc);
    await f.allows(point());
    await f.allows(point({ dataPointId: 'p2' }));
    expect(seen[0]).toMatchObject({ userId: 'me', organizationId: 'org' });
    expect(isKpiVisible).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('alert events follow the alert\'s own visibility', async () => {
    const alert = { type: 'alert_triggered', alertId: 'a1', alertRuleId: null, kpiId: 'k_user', severity: 'HIGH', message: 'x', createdAt: '2026-11-14T10:00:00.000Z' } as const;
    const allowed = make({ alertVisible: true });
    await expect(subscriber(allowed.svc).allows(alert)).resolves.toBe(true);
    expect(allowed.isVisible).toHaveBeenCalledWith('a1');
    const hidden = make({ alertVisible: false });
    await expect(subscriber(hidden.svc).allows({ type: 'alert_escalated', alertId: 'a1', kpiId: 'k_user', level: 2, createdAt: '2026-11-14T10:00:00.000Z' })).resolves.toBe(false);
  });

  it("a digest goes only to its own user; ping always passes", async () => {
    const { svc } = make();
    const f = subscriber(svc);
    await expect(f.allows({ type: 'alert_digest', userId: 'me', openCount: 3, createdAt: '2026-11-14T10:00:00.000Z' })).resolves.toBe(true);
    await expect(f.allows({ type: 'alert_digest', userId: 'someone-else', openCount: 3, createdAt: '2026-11-14T10:00:00.000Z' })).resolves.toBe(false);
    await expect(f.allows({ type: 'ping', timestamp: '2026-11-14T10:00:00.000Z' })).resolves.toBe(true);
  });

  it('an event type the filter does not know is withheld; a failed check withholds', async () => {
    const { svc, isKpiVisible } = make();
    const f = subscriber(svc);
    await expect(f.allows({ type: 'comment_added' } as unknown as RealtimeEvent)).resolves.toBe(false);
    isKpiVisible.mockRejectedValueOnce(new Error('db down'));
    await expect(f.allows(point({ kpiId: 'k_org', userId: null }))).resolves.toBe(false);
  });
});
