/**
 * Client IP handling (audit OT-009) — live api + DB.
 *
 * With TRUST_PROXY unset (the default), X-Forwarded-For must be ignored: the
 * recorded login-attempt IP is the real socket peer, so a client can't spoof
 * its address to dodge per-IP limits. Attempts now record the IP at all
 * (previously `ipAddress` was always empty).
 */
import pg from 'pg';
import { describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
// Read back as kpi_system, the role allowed to see every org's rows. The owner
// is bound by FORCE RLS; where it is not a superuser (production, OT-011) it
// sees nothing without an org set.
const DATABASE_URL =
  process.env.DATABASE_URL_SYSTEM ??
  process.env.DATABASE_URL ??
  'postgresql://kpi_nexus:dev_password@127.0.0.1:5432/kpi_nexus';

async function up() {
  try {
    return (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) })).ok;
  } catch {
    return false;
  }
}

const apiUp = await up();
if (!apiUp) console.warn('[skip] api not reachable — client IP tests skipped');

describe.skipIf(!apiUp)('Login attempts record the real client IP (OT-009)', () => {
  test('spoofed X-Forwarded-For is ignored; socket IP and user agent are recorded', async () => {
    const email = `ip-probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@int.test.local`;
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.66', 'user-agent': 'ip-probe/1.0' },
      body: JSON.stringify({ email, password: 'wrong-password' }),
    });
    expect(res.status).toBe(401);

    const db = new pg.Client({ connectionString: DATABASE_URL });
    await db.connect();
    try {
      const { rows } = await db.query<{ ipAddress: string | null; userAgent: string | null }>(
        'SELECT "ipAddress", "userAgent" FROM "LoginAttempt" WHERE email = $1',
        [email],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.ipAddress).toBeTruthy();
      expect(rows[0]!.ipAddress).not.toBe('203.0.113.66');
      expect(rows[0]!.ipAddress).toMatch(/127\.0\.0\.1|::1/);
      expect(rows[0]!.userAgent).toBe('ip-probe/1.0');
    } finally {
      await db.end();
    }
  });
});
