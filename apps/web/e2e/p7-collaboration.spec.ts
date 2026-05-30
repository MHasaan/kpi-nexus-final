/**
 * P7 Collaboration & Workflow — API-level e2e (Playwright request). Exercises
 * the full stack against the running api for all four exit criteria:
 *   1. Tasks — create + kanban status transition persists
 *   2. OKRs — objective + 2 KRs, currentValue edit recomputes weighted progress
 *   3. Comments + mentions — @mention creates a Mention in the recipient's inbox
 *   4. Approvals — active workflow turns a KPI edit into a 202; approver applies it
 *   5. Workflow rule engine — kpi_changed event auto-creates a task
 * Requires the api at $API_URL.
 */
import { type APIRequestContext, expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    return (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) console.warn('[skip] api not reachable — p7-collaboration skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Registered {
  ctx: APIRequestContext;
  token: string;
  userId: string;
  stamp: string;
}

async function registerOrg(): Promise<Registered> {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = await anon.post('/auth/register', {
    data: {
      orgName: `P7 ${stamp}`,
      slug: `p7-${stamp}`,
      adminEmail: `admin-${stamp}@p7.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'P7 Admin',
    },
  });
  expect(reg.status()).toBe(201);
  const body = (await reg.json()) as { accessToken: string };
  const ctx = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${body.accessToken}` },
  });
  const me = (await (await ctx.get('/auth/me')).json()) as { user: { id: string } };
  return { ctx, token: body.accessToken, userId: me.user.id, stamp };
}

/** Invite + accept a second user with the given role; returns their authed ctx. */
async function inviteUser(admin: APIRequestContext, roleId: string, stamp: string) {
  const email = `member-${stamp}@p7.test.local`;
  const invite = await admin.post('/users', {
    data: { email, fullName: 'P7 Member', roleId },
  });
  expect(invite.status()).toBe(201);
  const { inviteToken } = (await invite.json()) as { inviteToken: string };
  const anon = await request.newContext({ baseURL: API_URL });
  const accept = await anon.post('/auth/accept-invitation', {
    data: { token: inviteToken, password: 'member-pw-123456' },
  });
  expect(accept.status()).toBe(200);
  const tok = (await accept.json()) as { accessToken: string };
  const ctx = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${tok.accessToken}` },
  });
  const me = (await (await ctx.get('/auth/me')).json()) as { user: { id: string } };
  return { ctx, userId: me.user.id };
}

async function createKpi(ctx: APIRequestContext, name: string): Promise<string> {
  const res = await ctx.post('/kpis', {
    data: {
      name,
      scope: 'ORG_WIDE',
      type: 'NUMBER',
      direction: 'HIGHER_IS_BETTER',
      frequency: 'MONTHLY',
      aggregationMethod: 'LAST',
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test('tasks: create → move across kanban → status persists', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { ctx } = await registerOrg();

  const created = await ctx.post('/tasks', { data: { title: 'Investigate churn', priority: 'HIGH' } });
  expect(created.status()).toBe(201);
  const task = (await created.json()) as { id: string; status: string };
  expect(task.status).toBe('TODO');

  const moved = await ctx.patch(`/tasks/${task.id}`, { data: { status: 'IN_PROGRESS' } });
  expect(moved.status()).toBe(200);

  const list = (await (await ctx.get('/tasks')).json()) as Array<{ id: string; status: string }>;
  expect(list.find((t) => t.id === task.id)!.status).toBe('IN_PROGRESS');
});

test('okrs: objective + 2 KRs, currentValue edit recomputes weighted progress', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { ctx, userId } = await registerOrg();

  const obj = (await (await ctx.post('/objectives', {
    data: { name: 'Grow revenue', ownerUserId: userId, periodStart: '2026-01-01', periodEnd: '2026-12-31', status: 'ACTIVE' },
  })).json()) as { id: string };

  // KR1: weight 3, will be 100% (current 100 of 0→100)
  await ctx.post(`/objectives/${obj.id}/key-results`, {
    data: { name: 'MRR', baselineValue: 0, targetValue: 100, currentValue: 100, weight: 3 },
  });
  // KR2: weight 1, 0%
  const kr2 = (await (await ctx.post(`/objectives/${obj.id}/key-results`, {
    data: { name: 'NPS', baselineValue: 0, targetValue: 100, currentValue: 0, weight: 1 },
  })).json()) as { id: string };

  let detail = (await (await ctx.get(`/objectives/${obj.id}`)).json()) as { progress: number };
  expect(detail.progress).toBeCloseTo(0.75, 2); // (1*3 + 0*1) / 4

  // Bump KR2 to 50% → progress = (1*3 + 0.5*1)/4 = 0.875
  await ctx.patch(`/objectives/${obj.id}/key-results/${kr2.id}`, { data: { currentValue: 50 } });
  detail = (await (await ctx.get(`/objectives/${obj.id}`)).json()) as { progress: number };
  expect(detail.progress).toBeCloseTo(0.875, 2);
});

test('comments + mentions: @mention lands in the recipient inbox, mark read clears it', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { ctx: admin, stamp } = await registerOrg();
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const employee = roles.find((r) => r.name === 'Employee')!;
  const member = await inviteUser(admin, employee.id, stamp);

  const kpiId = await createKpi(admin, `Mention KPI ${stamp}`);

  // Admin comments mentioning the member.
  const comment = await admin.post('/comments', {
    data: { entityType: 'kpi', entityId: kpiId, body: 'great work @member', mentionedUserIds: [member.userId] },
  });
  expect(comment.status()).toBe(201);
  expect(((await comment.json()) as { mentionedUserIds: string[] }).mentionedUserIds).toContain(member.userId);

  // Member's inbox shows one unread mention.
  const count = (await (await member.ctx.get('/me/mentions/unread-count')).json()) as { count: number };
  expect(count.count).toBe(1);
  const inbox = (await (await member.ctx.get('/me/mentions')).json()) as Array<{ id: string }>;
  expect(inbox).toHaveLength(1);

  // Mark read → unread count drops to 0.
  await member.ctx.post(`/me/mentions/${inbox[0]!.id}/read`);
  const after = (await (await member.ctx.get('/me/mentions/unread-count')).json()) as { count: number };
  expect(after.count).toBe(0);
});

test('approvals: active workflow turns a KPI edit into a 202; approver applies it', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { ctx: admin, stamp } = await registerOrg();
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const manager = roles.find((r) => r.name === 'Manager')!;
  const approver = await inviteUser(admin, manager.id, stamp);

  const kpiId = await createKpi(admin, `Approval KPI ${stamp}`);

  // Enable the KPI_DEFINITION workflow with the Manager role as approver.
  const wf = await admin.put('/approvals/workflows/KPI_DEFINITION', {
    data: { requiredApproverRoleIds: [manager.id], requireAll: false, isActive: true },
  });
  expect(wf.status()).toBe(200);

  // Admin edits the KPI → captured by the workflow → 202 with requestId.
  const edit = await admin.patch(`/kpis/${kpiId}`, { data: { name: `Renamed ${stamp}` } });
  expect(edit.status()).toBe(202);
  const { requestId } = (await edit.json()) as { requestId: string };
  expect(requestId).toBeTruthy();

  // KPI is unchanged until approved.
  let kpi = (await (await admin.get(`/kpis/${kpiId}`)).json()) as { name: string };
  expect(kpi.name).toContain('Approval KPI');

  // Approver (Manager, different user) approves → patch is replayed.
  const decide = await approver.ctx.post(`/approvals/requests/${requestId}/decide`, { data: { decision: 'approve' } });
  expect(decide.status()).toBe(200);
  expect(((await decide.json()) as { status: string }).status).toBe('APPROVED');

  kpi = (await (await admin.get(`/kpis/${kpiId}`)).json()) as { name: string };
  expect(kpi.name).toBe(`Renamed ${stamp}`);
});

test('workflow rule engine: a kpi_changed event auto-creates a task', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { ctx } = await registerOrg();
  const kpiId = await createKpi(ctx, `Workflow KPI ${suffix()}`);

  // Workflow: when this KPI's value > 100000, create a "Celebrate!" task.
  const wf = await ctx.post('/workflows', {
    data: {
      name: 'Celebrate big MRR',
      triggers: ['kpi_changed'],
      rule: { kind: 'kpi_value', kpiId, operator: '>', value: 100000 },
      action: { kind: 'create_task', title: 'Celebrate!' },
      isActive: true,
    },
  });
  expect(wf.status()).toBe(201);

  // Record a data point above the threshold.
  const dp = await ctx.post(`/kpis/${kpiId}/data`, {
    data: { value: 150000, periodStart: '2026-05-01', periodEnd: '2026-05-31' },
  });
  expect([200, 201]).toContain(dp.status());

  // The task should have been auto-created.
  const tasks = (await (await ctx.get('/tasks')).json()) as Array<{ title: string }>;
  expect(tasks.some((t) => t.title === 'Celebrate!')).toBe(true);
});
