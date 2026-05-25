/**
 * RLS enforcement (spec §3.1 + §5.1) — DB-layer regression test.
 *
 * Connects to Postgres directly as the non-owner `kpi_app` role (provisioned by
 * `packages/db/prisma/sql/rls-policies.sql`) and proves that the row-level
 * security policies enforce tenant isolation correctly:
 *
 *   1. With NO `app.current_org` GUC set → SELECT returns 0 tenant-scoped rows
 *   2. With `app.current_org` set to org A → only org A rows are visible
 *   3. With `app.current_org` set to org B → only org B rows are visible
 *   4. With `app.bypass_rls = 'true'` → all rows visible (service-role escape)
 *   5. INSERT with a mismatched organizationId → blocked by WITH CHECK
 *   6. UPDATE of another tenant's row → updates 0 rows (filtered out by USING)
 *
 * This commit proves the POLICIES are correct. The runtime API still connects
 * as the `kpi_nexus` table-owner today (which bypasses RLS automatically per
 * Postgres semantics); the switch to `kpi_app` + a Prisma `$extends` query
 * extension that calls `set_config('app.current_org', ...)` before every query
 * is a follow-up commit that's small once the policies are proven correct.
 */
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const OWNER_URL =
  process.env.DATABASE_URL ??
  'postgresql://kpi_nexus:dev_password@localhost:5432/kpi_nexus';
const APP_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://kpi_app:app_password@localhost:5432/kpi_nexus';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
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
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    user: { id: string };
    organization: { id: string };
  };
  return { orgId: body.organization.id, userId: body.user.id, email };
}

let apiAvailable = false;
let appClient: Client | null = null;
let orgA: RegisterResult | null = null;
let orgB: RegisterResult | null = null;

beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn('[skip] api not reachable — RLS-enforcement spec skipped');
    return;
  }

  // Two separate orgs whose User rows we'll probe via the kpi_app role
  orgA = await registerOrg('orga');
  orgB = await registerOrg('orgb');

  // Confirm the kpi_app role exists and has SELECT — fail loudly if rls-policies.sql wasn't applied
  const ownerClient = new Client({ connectionString: OWNER_URL });
  await ownerClient.connect();
  try {
    const role = await ownerClient.query(
      `SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'kpi_app'`,
    );
    if (role.rowCount === 0) {
      throw new Error(
        'kpi_app role does not exist. Re-run `pnpm db:setup` to apply rls-policies.sql.',
      );
    }
  } finally {
    await ownerClient.end();
  }

  appClient = new Client({ connectionString: APP_URL });
  await appClient.connect();
});

afterAll(async () => {
  if (appClient) {
    await appClient.end();
  }
});

describe('RLS enforcement (spec §3.1 + §5.1) — kpi_app non-owner role', () => {
  // Helper: set/clear the tenancy GUCs. Uses `set_config(..., false)` so the
  // setting persists for the SESSION (until the next call) — matches how the
  // production Prisma $extends will set it (one GUC update per request).
  async function setGuc(orgId: string | null, bypass = false): Promise<void> {
    if (!appClient) throw new Error('appClient not initialized');
    await appClient.query(`SELECT set_config('app.current_org', $1, false)`, [
      orgId ?? '',
    ]);
    await appClient.query(`SELECT set_config('app.bypass_rls', $1, false)`, [
      bypass ? 'true' : 'false',
    ]);
  }

  test('without app.current_org → User SELECT returns 0 rows (RLS blocks)', async () => {
    if (!apiAvailable || !appClient) return;
    await setGuc(null, false);
    const { rows } = await appClient.query('SELECT id FROM "User"');
    expect(rows).toHaveLength(0);
  });

  test('app.current_org = orgA → only orgA rows visible', async () => {
    if (!apiAvailable || !appClient || !orgA) return;
    await setGuc(orgA.orgId, false);
    const { rows } = await appClient.query<{
      id: string;
      email: string;
      organizationId: string;
    }>('SELECT id, email, "organizationId" FROM "User"');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA.orgId)).toBe(true);
    expect(rows.some((r) => r.email === orgA.email)).toBe(true);
  });

  test('app.current_org = orgB → only orgB rows visible (no cross-tenant leak)', async () => {
    if (!apiAvailable || !appClient || !orgA || !orgB) return;
    await setGuc(orgB.orgId, false);
    const { rows } = await appClient.query<{
      email: string;
      organizationId: string;
    }>('SELECT email, "organizationId" FROM "User"');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgB.orgId)).toBe(true);
    expect(rows.some((r) => r.email === orgB.email)).toBe(true);
    expect(rows.some((r) => r.email === orgA.email)).toBe(false);
  });

  test('app.bypass_rls = true → all tenants visible (service-role escape)', async () => {
    if (!apiAvailable || !appClient || !orgA || !orgB) return;
    await setGuc(null, true);
    const { rows } = await appClient.query<{ email: string }>(
      'SELECT email FROM "User"',
    );
    const emails = rows.map((r) => r.email);
    expect(emails).toContain(orgA.email);
    expect(emails).toContain(orgB.email);
  });

  test('Organization table filters to only the current_org row', async () => {
    if (!apiAvailable || !appClient || !orgA) return;
    await setGuc(orgA.orgId, false);
    const { rows } = await appClient.query<{ id: string }>(
      'SELECT id FROM "Organization"',
    );
    expect(rows).toEqual([{ id: orgA.orgId }]);
  });

  test('INSERT into User with mismatched organizationId is rejected by WITH CHECK', async () => {
    if (!apiAvailable || !appClient || !orgA || !orgB) return;
    // Set the GUC to orgA — INSERTing a row for orgB should fail
    await setGuc(orgA.orgId, false);

    await expect(
      appClient!.query(
        `INSERT INTO "User"
           (id, "organizationId", email, "fullName", "passwordHash",
            status, "createdAt", "updatedAt")
         VALUES
           ($1, $2, $3, 'RLS Probe', 'x', 'ACTIVE', NOW(), NOW())`,
        [
          `rls_probe_${Date.now()}`,
          orgB.orgId, // wrong tenant
          `probe-${Date.now()}@rls.test.local`,
        ],
      ),
    ).rejects.toThrow(/row-level security|new row violates/i);
  });

  test('UPDATE of another tenant row touches 0 rows (filtered by USING)', async () => {
    if (!apiAvailable || !appClient || !orgA || !orgB) return;
    // Sitting as orgB, try to flip orgA's admin to SUSPENDED — should affect 0 rows
    await setGuc(orgB.orgId, false);
    const result = await appClient.query(
      `UPDATE "User" SET status = 'SUSPENDED' WHERE id = $1`,
      [orgA.userId],
    );
    expect(result.rowCount).toBe(0);

    // Verify with bypass that the orgA user is still ACTIVE
    await setGuc(null, true);
    const verify = await appClient.query<{ status: string }>(
      'SELECT status FROM "User" WHERE id = $1',
      [orgA.userId],
    );
    expect(verify.rows[0]?.status).toBe('ACTIVE');
  });

  test('Cross-tenant DELETE under bypass works (platform-admin path)', async () => {
    if (!apiAvailable || !appClient) return;
    // Just verify the bypass GUC allows a DELETE — using a row we created
    // for this purpose, leave the seeded orgs intact
    await setGuc(null, true);
    const insertId = `rls_delete_${Date.now()}`;
    if (!orgA) return;
    await appClient.query(
      `INSERT INTO "User"
         (id, "organizationId", email, "fullName", "passwordHash",
          status, "createdAt", "updatedAt")
       VALUES
         ($1, $2, $3, 'Delete Me', 'x', 'ACTIVE', NOW(), NOW())`,
      [insertId, orgA.orgId, `${insertId}@rls.test.local`],
    );
    const del = await appClient.query(`DELETE FROM "User" WHERE id = $1`, [
      insertId,
    ]);
    expect(del.rowCount).toBe(1);
  });
});
