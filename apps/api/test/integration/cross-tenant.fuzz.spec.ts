/**
 * Cross-tenant fuzz harness — P1 exit criterion.
 *
 * Spec §3.1, §5: every endpoint MUST refuse cross-tenant access. This
 * harness creates two organizations (A + B) with admin users, then
 * exhaustively tries to read / modify A's resources using B's token (and
 * vice versa) over every resource × verb combination wired in P1.
 *
 * A leak — any 200 response on a cross-tenant probe — fails the build.
 *
 * Requires the api to be reachable at API_URL (default http://localhost:4000)
 * with a connected Postgres. Skips itself when the api isn't reachable so
 * unit CI gates that don't boot the api stay green.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

interface RegisteredOrg {
  organizationId: string;
  userId: string;
  email: string;
  token: string;
}

interface Endpoint {
  label: string;
  method: 'GET' | 'PATCH' | 'DELETE' | 'POST';
  /** Resource being created for the test in org A */
  setup: (org: RegisteredOrg) => Promise<{ id: string; extra?: Record<string, string> }>;
  /** URL given a resource id (from org A) */
  url: (id: string, extra?: Record<string, string>) => string;
  /** Payload for write methods */
  body?: () => unknown;
  /** Expected status when org B tries to access org A's id */
  expect: number | number[];
}

async function http<T = unknown>(
  url: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: T | null }> {
  const headers = new Headers(init.headers);
  // Only set content-type when there's actually a body — Fastify rejects
  // empty-body requests that advertise application/json with 400.
  if (init.body !== undefined && init.body !== null) {
    headers.set('content-type', 'application/json');
  }
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const res = await fetch(`${API_URL}${url}`, { ...init, headers });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    // 204 No Content, etc.
  }
  return { status: res.status, body };
}

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function registerOrg(label: string): Promise<RegisteredOrg> {
  const safe = label.toLowerCase().replace(/[^a-z0-9]/g, '');
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `${safe}-${stamp}@test.local`;
  const slug = `${safe}-${stamp}`;
  const { status, body } = await http<{
    organization: { id: string };
    user: { id: string };
    accessToken: string;
  }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      orgName: `${label} ${stamp}`,
      slug,
      adminEmail: email,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: `${label} Admin`,
    }),
  });
  if (status !== 201 || !body) {
    throw new Error(`register-org failed (${status}): ${JSON.stringify(body)}`);
  }
  return {
    organizationId: body.organization.id,
    userId: body.user.id,
    email,
    token: body.accessToken,
  };
}

async function createRoleIn(org: RegisteredOrg, name: string): Promise<string> {
  const { status, body } = await http<{ id: string }>('/roles', {
    method: 'POST',
    token: org.token,
    body: JSON.stringify({ name, level: 50 }),
  });
  if (status !== 201 || !body?.id) {
    throw new Error(`create-role failed (${status}): ${JSON.stringify(body)}`);
  }
  return body.id;
}

async function createPositionIn(org: RegisteredOrg, name: string): Promise<string> {
  const { status, body } = await http<{ id: string }>('/positions', {
    method: 'POST',
    token: org.token,
    body: JSON.stringify({ name, level: 10 }),
  });
  if (status !== 201 || !body?.id) {
    throw new Error(`create-position failed (${status}): ${JSON.stringify(body)}`);
  }
  return body.id;
}

async function createOrgUnitIn(org: RegisteredOrg, name: string): Promise<string> {
  const { status, body } = await http<{ id: string }>('/org-units', {
    method: 'POST',
    token: org.token,
    body: JSON.stringify({ name }),
  });
  if (status !== 201 || !body?.id) {
    throw new Error(`create-org-unit failed (${status}): ${JSON.stringify(body)}`);
  }
  return body.id;
}

let orgA: RegisteredOrg;
let orgB: RegisteredOrg;
let apiAvailable = false;

beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    // eslint-disable-next-line no-console
    console.warn(`[skip] api not reachable at ${API_URL} — cross-tenant fuzz skipped`);
    return;
  }
  orgA = await registerOrg('orga');
  orgB = await registerOrg('orgb');
});

afterAll(() => {
  // Each run leaves two new orgs in the dev DB; cleanup is intentional
  // (audit trail). Reset via `pnpm docker:reset` or prisma migrate reset.
});

const skipIfNoApi = () => {
  if (!apiAvailable) return true;
  return false;
};

describe('Cross-tenant fuzz harness (P1 exit criterion)', () => {
  describe('GET-by-id endpoints return 404 for the other tenant', () => {
    test('GET /users/:id — user from org A is invisible to org B', async () => {
      if (skipIfNoApi()) return;
      const { status } = await http(`/users/${orgA.userId}`, { token: orgB.token });
      expect(status).toBe(404);
    });

    test('GET /roles/:id — role from org A is invisible to org B', async () => {
      if (skipIfNoApi()) return;
      const roleA = await createRoleIn(orgA, 'TenantA-Custom-Role');
      const { status } = await http(`/roles/${roleA}`, { token: orgB.token });
      expect(status).toBe(404);
    });

    test('GET /positions/:id — position from org A is invisible to org B', async () => {
      if (skipIfNoApi()) return;
      const posA = await createPositionIn(orgA, 'TenantA-Custom-Position');
      const { status } = await http(`/positions/${posA}`, { token: orgB.token });
      expect(status).toBe(404);
    });

    test('GET /org-units/:id — unit from org A is invisible to org B', async () => {
      if (skipIfNoApi()) return;
      const unitA = await createOrgUnitIn(orgA, 'TenantA-Unit');
      const { status } = await http(`/org-units/${unitA}`, { token: orgB.token });
      expect(status).toBe(404);
    });
  });

  describe('List endpoints scope to the caller tenant only', () => {
    test('GET /users — org B sees only its own users', async () => {
      if (skipIfNoApi()) return;
      const { status, body } = await http<Array<{ id: string }>>('/users', {
        token: orgB.token,
      });
      expect(status).toBe(200);
      expect(body?.map((u) => u.id)).not.toContain(orgA.userId);
    });

    test('GET /roles — org B sees only its own roles', async () => {
      if (skipIfNoApi()) return;
      const roleA = await createRoleIn(orgA, 'IsolationCheck-A');
      const { status, body } = await http<Array<{ id: string }>>('/roles', {
        token: orgB.token,
      });
      expect(status).toBe(200);
      expect(body?.map((r) => r.id)).not.toContain(roleA);
    });

    test('GET /org-units — org B sees only its own units', async () => {
      if (skipIfNoApi()) return;
      const unitA = await createOrgUnitIn(orgA, 'IsolationCheck-Unit-A');
      const { status, body } = await http<Array<{ id: string }>>('/org-units', {
        token: orgB.token,
      });
      expect(status).toBe(200);
      expect(body?.map((u) => u.id)).not.toContain(unitA);
    });

    test('GET /organizations/me — each tenant gets only its own org', async () => {
      if (skipIfNoApi()) return;
      const { status: sA, body: bA } = await http<{ id: string }>(
        '/organizations/me',
        { token: orgA.token },
      );
      const { status: sB, body: bB } = await http<{ id: string }>(
        '/organizations/me',
        { token: orgB.token },
      );
      expect(sA).toBe(200);
      expect(sB).toBe(200);
      expect(bA?.id).toBe(orgA.organizationId);
      expect(bB?.id).toBe(orgB.organizationId);
      expect(bA?.id).not.toBe(bB?.id);
    });
  });

  describe('Mutation endpoints reject cross-tenant writes', () => {
    test('PATCH /roles/:id — org B cannot modify org A roles', async () => {
      if (skipIfNoApi()) return;
      const roleA = await createRoleIn(orgA, 'TryToModify-A');
      const { status } = await http(`/roles/${roleA}`, {
        method: 'PATCH',
        token: orgB.token,
        body: JSON.stringify({ description: 'pwned' }),
      });
      expect(status).toBe(404);
    });

    test('DELETE /roles/:id — org B cannot delete org A roles', async () => {
      if (skipIfNoApi()) return;
      const roleA = await createRoleIn(orgA, 'TryToDelete-A');
      const { status } = await http(`/roles/${roleA}`, {
        method: 'DELETE',
        token: orgB.token,
      });
      expect(status).toBe(404);
    });

    test('PATCH /positions/:id — org B cannot modify org A positions', async () => {
      if (skipIfNoApi()) return;
      const posA = await createPositionIn(orgA, 'TryModify-Pos-A');
      const { status } = await http(`/positions/${posA}`, {
        method: 'PATCH',
        token: orgB.token,
        body: JSON.stringify({ description: 'pwned' }),
      });
      expect(status).toBe(404);
    });

    test('DELETE /positions/:id — org B cannot delete org A positions', async () => {
      if (skipIfNoApi()) return;
      const posA = await createPositionIn(orgA, 'TryDelete-Pos-A');
      const { status } = await http(`/positions/${posA}`, {
        method: 'DELETE',
        token: orgB.token,
      });
      expect(status).toBe(404);
    });

    test('PATCH /org-units/:id — org B cannot modify org A units', async () => {
      if (skipIfNoApi()) return;
      const unitA = await createOrgUnitIn(orgA, 'TryModify-Unit-A');
      const { status } = await http(`/org-units/${unitA}`, {
        method: 'PATCH',
        token: orgB.token,
        body: JSON.stringify({ description: 'pwned' }),
      });
      expect(status).toBe(404);
    });

    test('DELETE /org-units/:id — org B cannot delete org A units', async () => {
      if (skipIfNoApi()) return;
      const unitA = await createOrgUnitIn(orgA, 'TryDelete-Unit-A');
      const { status } = await http(`/org-units/${unitA}`, {
        method: 'DELETE',
        token: orgB.token,
      });
      expect(status).toBe(404);
    });

    test('POST /org-units/:id/members — org B cannot add to org A units', async () => {
      if (skipIfNoApi()) return;
      const unitA = await createOrgUnitIn(orgA, 'TryAddMember-Unit-A');
      // Use orgB's own admin userId — we should still be blocked because
      // the unit belongs to A, regardless of who's being added.
      const { status } = await http(`/org-units/${unitA}/members`, {
        method: 'POST',
        token: orgB.token,
        body: JSON.stringify({ userId: orgB.userId }),
      });
      expect(status).toBe(404);
    });

    test('PATCH /organizations/me — only mutates the caller tenant', async () => {
      if (skipIfNoApi()) return;
      await http('/organizations/me', {
        method: 'PATCH',
        token: orgB.token,
        body: JSON.stringify({ industry: 'Test-Industry-B' }),
      });
      // Read back org A — it should be unchanged
      const { body } = await http<{ id: string; industry: string | null }>(
        '/organizations/me',
        { token: orgA.token },
      );
      expect(body?.id).toBe(orgA.organizationId);
      expect(body?.industry).not.toBe('Test-Industry-B');
    });
  });

  describe('Public endpoints stay public', () => {
    test('GET /health requires no auth', async () => {
      if (skipIfNoApi()) return;
      const { status } = await http('/health');
      expect(status).toBe(200);
    });
  });

  describe('Authenticated endpoints require a token', () => {
    test('GET /users without a token is 401', async () => {
      if (skipIfNoApi()) return;
      const { status } = await http('/users');
      expect(status).toBe(401);
    });

    test('GET /roles without a token is 401', async () => {
      if (skipIfNoApi()) return;
      const { status } = await http('/roles');
      expect(status).toBe(401);
    });
  });
});
