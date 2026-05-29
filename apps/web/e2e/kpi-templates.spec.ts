/**
 * KPI templates (P2 backlog #6). API-level e2e via Playwright request.
 * Covers gallery list (lazy seed + filter + search ranking), instantiate
 * (DRAFT KPI + dup-name refusal + popularity bump), and org-private create.
 * Requires the api at $API_URL (default http://localhost:4000).
 */
import { expect, request, test } from '@playwright/test';

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
  if (!apiAvailable) console.warn('[skip] api not reachable — kpi-templates skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Template { id: string; name: string; slug: string; function: string | null; popularity: number; isGlobal: boolean }

test('templates: gallery list + filter + search + instantiate + private create', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Tmpl E2E ${stamp}`,
      slug: `tmpl-${stamp}`,
      adminEmail: `admin-${stamp}@tmpl.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Tmpl Admin',
    },
  })).json()) as { accessToken: string };
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  // Gallery lazily seeds the global catalog (>= 13 builtins across 4 quadrants).
  const all = (await (await api.get('/kpi-templates')).json()) as Template[];
  expect(all.length).toBeGreaterThanOrEqual(13);
  expect(all.every((t) => t.isGlobal)).toBe(true);

  // Filter by function.
  const finance = (await (await api.get('/kpi-templates?function=finance')).json()) as Template[];
  expect(finance.length).toBeGreaterThan(0);
  expect(finance.every((t) => t.function === 'finance')).toBe(true);

  // Search ranks revenue templates first and drops non-matches.
  const search = (await (await api.get('/kpi-templates?search=revenue')).json()) as Template[];
  expect(search.length).toBeGreaterThan(0);
  expect(search[0]!.name.toLowerCase()).toContain('revenue');
  expect(search.some((t) => t.name === 'Net Promoter Score')).toBe(false);

  // Instantiate the MRR template → DRAFT KPI carrying the template's shape.
  const mrr = all.find((t) => t.slug === 'monthly-recurring-revenue')!;
  expect(mrr).toBeTruthy();
  const popBefore = mrr.popularity;
  const instRes = await api.post(`/kpi-templates/${mrr.id}/instantiate`, { data: {} });
  expect(instRes.status()).toBe(201);
  const kpi = (await instRes.json()) as { id: string; name: string; status: string; type: string };
  expect(kpi.name).toBe('Monthly Recurring Revenue');
  expect(kpi.status).toBe('DRAFT');
  expect(kpi.type).toBe('CURRENCY');

  // Re-instantiating with the same (default) name is refused → 409.
  const dup = await api.post(`/kpi-templates/${mrr.id}/instantiate`, { data: {} });
  expect(dup.status()).toBe(409);

  // Custom name + target works; popularity bumped twice now.
  const inst2 = await api.post(`/kpi-templates/${mrr.id}/instantiate`, {
    data: { name: `MRR Copy ${stamp}`, targetValue: 100000 },
  });
  expect(inst2.status()).toBe(201);
  const after = (await (await api.get('/kpi-templates?search=recurring')).json()) as Template[];
  const mrrAfter = after.find((t) => t.slug === 'monthly-recurring-revenue')!;
  expect(mrrAfter.popularity).toBe(popBefore + 2);

  // Org-private template create → appears in this org's gallery, tagged non-global.
  const createRes = await api.post('/kpi-templates', {
    data: { name: `Private KPI ${stamp}`, type: 'NUMBER', direction: 'HIGHER_IS_BETTER', frequency: 'MONTHLY', function: 'ops', tags: ['custom'] },
  });
  expect(createRes.status()).toBe(201);
  const priv = (await createRes.json()) as Template;
  expect(priv.isGlobal).toBe(false);
  const opsList = (await (await api.get('/kpi-templates?function=ops')).json()) as Template[];
  expect(opsList.some((t) => t.id === priv.id)).toBe(true);
});
