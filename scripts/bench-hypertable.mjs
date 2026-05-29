/**
 * TimescaleDB hypertable benchmark.
 *
 * Seeds a throwaway org with N KPIs × D days of KPIDataPoint rows, then times
 * three representative query patterns over R iterations and reports p50/p95/p99.
 *
 * Usage:
 *   node scripts/bench-hypertable.mjs [--kpis=1000] [--days=365] [--iters=20]
 *
 * Reads DATABASE_URL from the environment (.env). Cleans up the throwaway org
 * (ON DELETE CASCADE removes all seeded rows) unless --keep is passed.
 */
import { Client } from 'pg';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const KPIS = Number(args.kpis ?? 1000);
const DAYS = Number(args.days ?? 365);
const ITERS = Number(args.iters ?? 20);
const KEEP = Boolean(args.keep);

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://kpi_nexus:dev_password@localhost:5432/kpi_nexus';

function pct(sortedMs, p) {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length));
  return Math.round(sortedMs[idx] * 100) / 100;
}

async function time(fn) {
  const t0 = process.hrtime.bigint();
  await fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

async function main() {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  const stamp = `${Date.now()}`;
  console.log(`[bench] seeding ${KPIS} KPIs × ${DAYS} days (~${(KPIS * DAYS).toLocaleString()} rows)…`);

  // Throwaway org.
  const org = (
    await c.query(
      `INSERT INTO "Organization" (id, name, slug, "planKey", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'ENTERPRISE', now(), now()) RETURNING id`,
      [`bench-org-${stamp}`, `Bench ${stamp}`, `bench-${stamp}`],
    )
  ).rows[0].id;

  try {
    // Bench user (KPI.createdById is a FK to User).
    const userId = `bench-user-${stamp}`;
    await c.query(
      `INSERT INTO "User" (id, "organizationId", email, "fullName", status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'Bench User', 'ACTIVE', now(), now())`,
      [userId, org, `bench-${stamp}@bench.local`],
    );

    // Seed KPIs.
    const kpiIds = [];
    for (let i = 0; i < KPIS; i++) {
      const id = `bench-kpi-${stamp}-${i}`;
      kpiIds.push(id);
    }
    // Bulk insert KPIs via UNNEST.
    await c.query(
      `INSERT INTO "KPI" (id, "organizationId", name, scope, type, direction, frequency, "aggregationMethod", status, "createdById", "createdAt", "updatedAt")
       SELECT u.id, $1, 'Bench KPI ' || u.ord, 'ORG_WIDE', 'NUMBER', 'HIGHER_IS_BETTER', 'DAILY', 'LAST', 'ACTIVE', $3, now(), now()
       FROM unnest($2::text[]) WITH ORDINALITY AS u(id, ord)`,
      [org, kpiIds, userId],
    );

    // Seed data points day-by-day in batches (generate_series per KPI).
    console.log('[bench] inserting data points…');
    const seedStart = await time(async () => {
      await c.query(
        `INSERT INTO "KPIDataPoint" (id, "organizationId", "kpiId", value, "periodStart", "periodEnd", "recordedAt", "sourceType", "qualityFlag", "isOutlier")
         SELECT 'dp-' || k.id || '-' || g.n, $1, k.id, (random()*100)::float8,
                now() - (g.n || ' days')::interval, now() - (g.n || ' days')::interval,
                now() - (g.n || ' days')::interval, 'MANUAL', 'HIGH', false
         FROM unnest($2::text[]) AS k(id)
         CROSS JOIN generate_series(0, $3::int - 1) AS g(n)`,
        [org, kpiIds, DAYS],
      );
    });
    console.log(`[bench] seed insert: ${Math.round(seedStart)}ms`);

    const sampleKpi = kpiIds[Math.floor(kpiIds.length / 2)];
    const patterns = {
      'latest-per-kpi (1 KPI)': `SELECT value FROM "KPIDataPoint" WHERE "organizationId"=$1 AND "kpiId"=$2 ORDER BY "recordedAt" DESC LIMIT 1`,
      'last-30-days (1 KPI)': `SELECT avg(value) FROM "KPIDataPoint" WHERE "organizationId"=$1 AND "kpiId"=$2 AND "recordedAt" > now() - interval '30 days'`,
      'org-wide last-7-days agg': `SELECT "kpiId", avg(value) FROM "KPIDataPoint" WHERE "organizationId"=$1 AND "recordedAt" > now() - interval '7 days' GROUP BY "kpiId"`,
    };

    for (const [label, sql] of Object.entries(patterns)) {
      const params = sql.includes('$2') ? [org, sampleKpi] : [org];
      const samples = [];
      for (let i = 0; i < ITERS; i++) samples.push(await time(() => c.query(sql, params)));
      samples.sort((a, b) => a - b);
      console.log(`[bench] ${label.padEnd(28)} p50=${pct(samples, 50)}ms p95=${pct(samples, 95)}ms p99=${pct(samples, 99)}ms`);
    }
  } finally {
    if (!KEEP) {
      await c.query(`DELETE FROM "Organization" WHERE id = $1`, [org]);
      console.log('[bench] cleaned up throwaway org');
    } else {
      console.log(`[bench] kept org ${org}`);
    }
    await c.end();
  }
}

main().catch((err) => {
  console.error('[bench] failed:', err);
  process.exit(1);
});
