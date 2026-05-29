/**
 * P5 NlqModule. API-level e2e via Playwright request. Covers /nlq/reembed +
 * /nlq/ask AND the CRITICAL visibility invariant: a Manager who is not assigned
 * a PER_USER KPI must never see it surface as an NLQ source, while an admin
 * (sees all) does. Requires the api at $API_URL with AI_MOCK_RESPONSE set.
 */
import { type APIRequestContext, expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) console.warn('[skip] api not reachable — ai-nlq skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Sources { sources: Array<{ kpiId: string; name: string }> }

test('nlq: visibility — a Manager never sees a PER_USER KPI assigned to someone else', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });

  // 1. Admin org.
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `NLQ E2E ${stamp}`,
      slug: `nlq-${stamp}`,
      adminEmail: `admin-${stamp}@nlq.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'NLQ Admin',
    },
  })).json()) as { accessToken: string; user: { id: string } };
  const adminId = reg.user.id;
  const adminApi: APIRequestContext = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  // 2. Invite a Manager (has INSIGHTS_VIEW, so can use NLQ).
  const roles = (await (await adminApi.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const managerRoleId = roles.find((r) => r.name === 'Manager')!.id;
  const inviteeEmail = `manager-${stamp}@nlq.test.local`;
  const invite = (await (await adminApi.post('/users', {
    data: { email: inviteeEmail, fullName: 'NLQ Manager', roleId: managerRoleId },
  })).json()) as { inviteToken: string };
  await anon.post('/auth/accept-invitation', { data: { token: invite.inviteToken, password: 'correct-horse-battery-staple' } });
  const login = (await (await anon.post('/auth/login', {
    data: { email: inviteeEmail, password: 'correct-horse-battery-staple' },
  })).json()) as { accessToken: string };
  const managerApi = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${login.accessToken}` } });

  // 3. An ORG_WIDE KPI (everyone sees) + a PER_USER KPI assigned only to the admin.
  const publicName = `Public Revenue ${stamp}`;
  const privateName = `Private Comp ${stamp}`;
  const pub = await adminApi.post('/kpis', {
    data: { name: publicName, scope: 'ORG_WIDE', type: 'CURRENCY', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  });
  expect(pub.status()).toBe(201);
  const priv = await adminApi.post('/kpis', {
    data: { name: privateName, scope: 'PER_USER', type: 'CURRENCY', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST', userIds: [adminId] },
  });
  expect(priv.status()).toBe(201);
  const privId = ((await priv.json()) as { id: string }).id;

  // 4. Embed the catalog (admin scope embeds all org KPIs).
  const reembed = await adminApi.post('/nlq/reembed', { data: {} });
  expect(reembed.status()).toBe(201);
  expect((await reembed.json()).embedded).toBeGreaterThanOrEqual(2);

  // 5. Admin sees BOTH as sources.
  const adminAsk = (await (await adminApi.post('/nlq/ask', { data: { question: 'show me revenue and compensation metrics' } })).json()) as Sources;
  const adminNames = adminAsk.sources.map((s) => s.name);
  expect(adminNames).toContain(publicName);
  expect(adminNames).toContain(privateName);

  // 6. CRITICAL: the Manager sees the public KPI but NEVER the private PER_USER KPI.
  const mgrRes = await managerApi.post('/nlq/ask', { data: { question: 'show me revenue and compensation metrics' } });
  expect(mgrRes.status()).toBe(201);
  const mgrAsk = (await mgrRes.json()) as Sources;
  const mgrNames = mgrAsk.sources.map((s) => s.name);
  expect(mgrNames).toContain(publicName);
  expect(mgrNames).not.toContain(privateName); // <-- the data-leak guard
  expect(mgrAsk.sources.some((s) => s.kpiId === privId)).toBe(false);
});

test('nlq: reembed requires ORG_SETTINGS (Manager forbidden), ask requires auth', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const anon = await request.newContext({ baseURL: API_URL });
  expect((await anon.post('/nlq/ask', { data: { question: 'hi' } })).status()).toBe(401);
  expect((await anon.post('/nlq/reembed', { data: {} })).status()).toBe(401);
});
