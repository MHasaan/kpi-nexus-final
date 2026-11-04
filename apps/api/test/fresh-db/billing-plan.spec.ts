/** Run only against a newly provisioned disposable DB, before normal integration tests. */
import { Client } from 'pg';
import { expect, test } from 'vitest';

const API = process.env.API_URL ?? 'http://127.0.0.1:4000';

test('concurrent first KPI writes initialize the empty catalog without weakening tenant isolation', async () => {
  expect(process.env.BILLING_FRESH_DB_TEST, 'Explicit fresh-database opt-in required').toBe('true');
  const owner = new Client({ connectionString: process.env.DATABASE_URL });
  const app = new Client({ connectionString: process.env.DATABASE_URL_APP });
  await owner.connect();
  await app.connect();
  try {
    const initial = await owner.query('SELECT count(*)::int AS n FROM "Plan"');
    expect(initial.rows[0].n, 'This suite requires an empty, disposable Plan catalog').toBe(0);
    const tokens = await Promise.all([0, 1, 2].map(async (i) => {
      const id = `fresh-billing-${Date.now()}-${i}`;
      const response = await fetch(`${API}/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orgName: id, slug: id, adminEmail: `${id}@test.local`, adminPassword: 'Password123!', adminFullName: 'Fresh DB Admin' }),
      });
      expect(response.status).toBe(201);
      return (await response.json() as { accessToken: string }).accessToken;
    }));
    const kpis = await Promise.all(tokens.map(async (token, i) => {
      const response = await fetch(`${API}/kpis`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: `Fresh KPI ${i}` }),
      });
      expect(response.status).toBe(201);
      return await response.json() as { id: string };
    }));
    expect((await owner.query('SELECT count(*)::int AS n FROM "Plan"')).rows[0].n).toBe(3);
    expect((await app.query('SELECT count(*)::int AS n FROM "Plan"')).rows[0].n).toBe(3);
    await expect(app.query(`INSERT INTO "Plan" (id, key, "displayName", features, quotas) VALUES ('forbidden', 'FORBIDDEN', 'Forbidden', '{}', '{}')`)).rejects.toThrow(/row-level security/i);
    for (let i = 0; i < tokens.length; i++) {
      const headers = { authorization: `Bearer ${tokens[i]}` };
      const own = await fetch(`${API}/kpis`, { headers });
      expect(own.status).toBe(200);
      expect((await own.json() as Array<{ id: string }>).map((k) => k.id)).toEqual([kpis[i]!.id]);
      expect((await fetch(`${API}/kpis/${kpis[(i + 1) % tokens.length]!.id}`, { headers })).status).toBe(404);
    }
  } finally {
    await app.end();
    await owner.end();
  }
}, 30_000);
