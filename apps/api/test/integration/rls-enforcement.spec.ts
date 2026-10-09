/**
 * RLS enforcement (spec §3.1 + §5.1, OT-014) — DB-layer regression test.
 *
 * Connects to Postgres directly as the two runtime roles provisioned by
 * `packages/db/prisma/sql/rls-policies.sql` and proves the isolation model:
 *
 *   kpi_app (every user request — no bypass of any kind)
 *     - no `app.current_org` → no tenant rows; writes rejected
 *     - `app.current_org` = org A → only org A rows, on every kind of table
 *       (organizationId tables, KPIDataPoint, parent-owned token / history tables)
 *     - setting the old `app.bypass_rls` variable changes nothing
 *     - no access to PlatformAdmin or the kpi_data_* rollups
 *   kpi_system (background jobs, pre-login lookups) — BYPASSRLS by role attribute
 *
 * Context is set with set_config(..., false) here (session-wide, for test
 * convenience); the API sets it with is_local = true inside each transaction.
 */
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const OWNER_URL = process.env.DATABASE_URL ?? 'postgresql://kpi_nexus:dev_password@127.0.0.1:5432/kpi_nexus';
const APP_URL = process.env.DATABASE_URL_APP ?? 'postgresql://kpi_app:app_password@127.0.0.1:5432/kpi_nexus';
const SYSTEM_URL =
  process.env.DATABASE_URL_SYSTEM ?? 'postgresql://kpi_system:system_password@127.0.0.1:5432/kpi_nexus';

async function isApiUp(): Promise<boolean> {
  try {
    return (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

interface RegisterResult {
  orgId: string;
  userId: string;
  email: string;
}

async function registerOrg(tag: string): Promise<RegisterResult> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `${tag}-${stamp}@rls.test.local`;
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      orgName: `rls-${tag}-${stamp}`,
      slug: `rls-${tag}-${stamp}`,
      adminEmail: email,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: `RLS ${tag} Admin`,
    }),
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { user: { id: string }; organization: { id: string } };
  return { orgId: body.organization.id, userId: body.user.id, email };
}

let apiAvailable = false;
let app: Client;
let sys: Client;
let orgA: RegisterResult;
let orgB: RegisterResult;

beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn('[skip] api not reachable — RLS-enforcement spec skipped');
    return;
  }
  orgA = await registerOrg('orga');
  orgB = await registerOrg('orgb');
  app = new Client({ connectionString: APP_URL });
  sys = new Client({ connectionString: SYSTEM_URL });
  await app.connect();
  await sys.connect();
});

afterAll(async () => {
  await app?.end();
  await sys?.end();
});

/** Set the request role's org context for the session (null = none). */
async function asOrg(orgId: string | null): Promise<void> {
  await app.query(`SELECT set_config('app.current_org', $1, false)`, [orgId ?? '']);
}

const VIOLATION = /row-level security|new row violates/i;

describe('RLS — kpi_app (request role)', () => {
  test('without an org context → no rows', async () => {
    if (!apiAvailable) return;
    await asOrg(null);
    expect((await app.query('SELECT id FROM "User"')).rowCount).toBe(0);
    expect((await app.query('SELECT id FROM "Organization"')).rowCount).toBe(0);
  });

  test('org A context → only org A rows; org B context → only org B rows', async () => {
    if (!apiAvailable) return;
    await asOrg(orgA.orgId);
    const a = await app.query<{ email: string; organizationId: string }>('SELECT email, "organizationId" FROM "User"');
    expect(a.rows.length).toBeGreaterThan(0);
    expect(a.rows.every((r) => r.organizationId === orgA.orgId)).toBe(true);
    await asOrg(orgB.orgId);
    const b = await app.query<{ email: string }>('SELECT email FROM "User"');
    expect(b.rows.some((r) => r.email === orgB.email)).toBe(true);
    expect(b.rows.some((r) => r.email === orgA.email)).toBe(false);
    expect((await app.query('SELECT id FROM "Organization"')).rows).toEqual([{ id: orgB.orgId }]);
  });

  test('the old app.bypass_rls variable has no effect any more', async () => {
    if (!apiAvailable) return;
    await asOrg(orgA.orgId);
    await app.query(`SELECT set_config('app.bypass_rls', 'true', false)`);
    try {
      const rows = await app.query<{ email: string }>('SELECT email FROM "User"');
      expect(rows.rows.some((r) => r.email === orgB.email)).toBe(false);
      await asOrg(null);
      expect((await app.query('SELECT id FROM "User"')).rowCount).toBe(0);
    } finally {
      await app.query(`SELECT set_config('app.bypass_rls', '', false)`);
    }
  });

  test('cross-tenant INSERT is rejected; cross-tenant UPDATE touches nothing', async () => {
    if (!apiAvailable) return;
    await asOrg(orgA.orgId);
    await expect(
      app.query(
        `INSERT INTO "User" (id, "organizationId", email, "fullName", "passwordHash", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'RLS Probe', 'x', 'ACTIVE', NOW(), NOW())`,
        [`rls_probe_${Date.now()}`, orgB.orgId, `probe-${Date.now()}@rls.test.local`],
      ),
    ).rejects.toThrow(VIOLATION);
    await asOrg(orgB.orgId);
    const upd = await app.query(`UPDATE "User" SET status = 'SUSPENDED' WHERE id = $1`, [orgA.userId]);
    expect(upd.rowCount).toBe(0);
    const still = await sys.query<{ status: string }>('SELECT status FROM "User" WHERE id = $1', [orgA.userId]);
    expect(still.rows[0]?.status).toBe('ACTIVE');
  });

  test('KPIDataPoint (time-series hypertable) is isolated too', async () => {
    if (!apiAvailable) return;
    const kpiId = `rls_kpi_${Date.now()}`;
    await sys.query(
      `INSERT INTO "KPI" (id, "organizationId", name, type, direction, frequency, scope, status, "createdAt", "updatedAt")
       VALUES ($1, $2, 'RLS series', 'NUMBER', 'HIGHER_IS_BETTER', 'MONTHLY', 'ORG_WIDE', 'ACTIVE', NOW(), NOW())`,
      [kpiId, orgA.orgId],
    );
    try {
      await sys.query(
        `INSERT INTO "KPIDataPoint" (id, "organizationId", "kpiId", value, "recordedAt", "periodStart", "periodEnd")
         VALUES ($1, $2, $3, 42, NOW(), NOW(), NOW())`,
        [`${kpiId}_dp`, orgA.orgId, kpiId],
      );
      await asOrg(orgA.orgId);
      expect((await app.query('SELECT id FROM "KPIDataPoint" WHERE "kpiId" = $1', [kpiId])).rowCount).toBe(1);
      await asOrg(orgB.orgId);
      expect((await app.query('SELECT id FROM "KPIDataPoint" WHERE "kpiId" = $1', [kpiId])).rowCount).toBe(0);
      await expect(
        app.query(
          `INSERT INTO "KPIDataPoint" (id, "organizationId", "kpiId", value, "recordedAt", "periodStart", "periodEnd")
           VALUES ($1, $2, $3, 1, NOW(), NOW(), NOW())`,
          [`${kpiId}_x`, orgA.orgId, kpiId],
        ),
      ).rejects.toThrow(VIOLATION);
    } finally {
      await sys.query('DELETE FROM "KPIDataPoint" WHERE "kpiId" = $1', [kpiId]);
      await sys.query('DELETE FROM "KPI" WHERE id = $1', [kpiId]);
    }
  });

  test('tables without organizationId are scoped through their parent (refresh tokens)', async () => {
    if (!apiAvailable) return;
    // Registration issued each admin a refresh token.
    await asOrg(orgA.orgId);
    const mine = await app.query<{ userId: string }>('SELECT "userId" FROM "RefreshToken"');
    expect(mine.rows.length).toBeGreaterThan(0);
    expect(mine.rows.some((r) => r.userId === orgB.userId)).toBe(false);
    await asOrg(null);
    expect((await app.query('SELECT id FROM "RefreshToken"')).rowCount).toBe(0);
  });

  test('no access to platform admins or the kpi_data_* rollups', async () => {
    if (!apiAvailable) return;
    await asOrg(orgA.orgId);
    expect((await app.query('SELECT "userId" FROM "PlatformAdmin"')).rowCount).toBe(0);
    await expect(app.query('SELECT 1 FROM kpi_data_daily LIMIT 1')).rejects.toThrow(/permission denied/i);
  });

  test('KPITemplate built-ins (NULL org) are shared read-only', async () => {
    if (!apiAvailable) return;
    const slug = `rls-builtin-${Date.now()}`;
    await sys.query(
      `INSERT INTO "KPITemplate" (id, "organizationId", slug, name, type, direction, frequency, tags)
       VALUES ($1, NULL, $1, 'RLS builtin', 'NUMBER', 'HIGHER_IS_BETTER', 'MONTHLY', '{}')`,
      [slug],
    );
    try {
      await asOrg(orgA.orgId);
      expect((await app.query('SELECT id FROM "KPITemplate" WHERE id = $1', [slug])).rowCount).toBe(1);
      await expect(app.query(`UPDATE "KPITemplate" SET name = 'hijacked' WHERE id = $1`, [slug])).rejects.toThrow(VIOLATION);
    } finally {
      const after = await sys.query<{ name: string }>('SELECT name FROM "KPITemplate" WHERE id = $1', [slug]);
      expect(after.rows[0]?.name).toBe('RLS builtin');
      await sys.query('DELETE FROM "KPITemplate" WHERE id = $1', [slug]);
    }
  });
});

describe('RLS — kpi_system and the catalog', () => {
  test('kpi_system sees every tenant (role-level BYPASSRLS)', async () => {
    if (!apiAvailable) return;
    const rows = await sys.query<{ email: string }>('SELECT email FROM "User" WHERE email = ANY($1)', [[orgA.email, orgB.email]]);
    expect(rows.rows.map((r) => r.email).sort()).toEqual([orgA.email, orgB.email].sort());
  });

  test('role attributes: kpi_app cannot bypass and is not a superuser; kpi_system can bypass', async () => {
    if (!apiAvailable) return;
    const owner = new Client({ connectionString: OWNER_URL });
    await owner.connect();
    try {
      const { rows } = await owner.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
        `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('kpi_app', 'kpi_system') ORDER BY rolname`,
      );
      expect(rows).toEqual([
        { rolname: 'kpi_app', rolsuper: false, rolbypassrls: false },
        { rolname: 'kpi_system', rolsuper: false, rolbypassrls: true },
      ]);
    } finally {
      await owner.end();
    }
  });

  test('catalog: every public table has RLS on, and no GUC bypass policy remains', async () => {
    if (!apiAvailable) return;
    const owner = new Client({ connectionString: OWNER_URL });
    await owner.connect();
    try {
      const noRls = await owner.query<{ relname: string }>(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`,
      );
      expect(noRls.rows.map((r) => r.relname)).toEqual([]);
      const bypass = await owner.query(`SELECT 1 FROM pg_policies WHERE policyname = 'service_role_bypass'`);
      expect(bypass.rowCount).toBe(0);
      const tenant = await owner.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_policies WHERE policyname = 'tenant_isolation'`,
      );
      expect(tenant.rows[0]!.n).toBeGreaterThanOrEqual(75);
      // FORCE binds the owner too — every RLS table except KPIDataPoint, whose
      // continuous aggregates are refreshed as the owner (stage C).
      const notForced = await owner.query<{ relname: string }>(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity AND NOT c.relforcerowsecurity`,
      );
      expect(notForced.rows.map((r) => r.relname)).toEqual(['KPIDataPoint']);
    } finally {
      await owner.end();
    }
  });
});
