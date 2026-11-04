/**
 * TimescaleDB hypertable benchmark.
 *
 * Seeds a throwaway org with N KPIs × D days of KPIDataPoint rows, then times
 * representative query patterns over R iterations and reports p50/p95/p99.
 *
 * It also runs a RAW-vs-CAGG comparison: the same dashboard-summary aggregate
 * (org-wide rollup grouped by KPI over a time window) is timed against the raw
 * `KPIDataPoint` hypertable AND against the matching `kpi_data_daily`
 * continuous aggregate (refreshed over the seeded window first). A p95 BUDGET
 * gate fails the process (exit 1) if the raw dashboard aggregate p95 exceeds
 * the threshold.
 *
 * Usage:
 *   node scripts/bench-hypertable.mjs [--kpis=1000] [--days=365] [--iters=20]
 *                                     [--p95budget=100] [--keep]
 *
 *   --p95budget   p95 budget in ms for the dashboard-summary aggregate against
 *                 the RAW hypertable (default 100). Also settable via the
 *                 BENCH_P95_BUDGET_MS env var. The process exits non-zero if
 *                 the measured raw p95 exceeds it.
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
const P95_BUDGET_MS = Number(
  args.p95budget ?? process.env.BENCH_P95_BUDGET_MS ?? 100,
);

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://kpi_nexus:dev_password@127.0.0.1:5432/kpi_nexus';

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
  let budgetFailed = false;
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

    // ---------------------------------------------------------------------
    // RAW vs CAGG comparison — dashboard-summary aggregate.
    //
    // The dashboard summary rolls up every KPI in the org over a time window.
    // Against raw rows this scans the hypertable; against the daily CAGG it
    // reads pre-aggregated buckets. We refresh the daily CAGG over the seeded
    // window first (CAGGs are materialized incrementally; a fresh org has no
    // materialized buckets until refreshed).
    // ---------------------------------------------------------------------
    console.log('\n[bench] refreshing kpi_data_daily over seeded window…');
    // refresh_continuous_aggregate cannot run inside a txn; node-pg single
    // statement query() is autocommit, so this is fine. The window bounds must
    // be `timestamp WITHOUT time zone` because KPIDataPoint.recordedAt (and
    // thus the CAGG time dimension) is `timestamp without time zone` — cast the
    // tz-aware now() expressions explicitly.
    await c.query(
      `CALL refresh_continuous_aggregate('kpi_data_daily', (now() - interval '${DAYS + 2} days')::timestamp, (now() + interval '1 day')::timestamp)`,
    );

    const WINDOW_DAYS = 90;
    const rawDashboardSql = `SELECT "kpiId", avg(value) AS avg_value, min(value) AS min_value, max(value) AS max_value, count(*) AS n
       FROM "KPIDataPoint"
       WHERE "organizationId"=$1 AND "recordedAt" > now() - interval '${WINDOW_DAYS} days'
       GROUP BY "kpiId"`;
    const caggDashboardSql = `SELECT "kpiId", avg(avg_value) AS avg_value, min(min_value) AS min_value, max(max_value) AS max_value, sum(sample_count) AS n
       FROM kpi_data_daily
       WHERE "organizationId"=$1 AND bucket > (now() - interval '${WINDOW_DAYS} days')::timestamp
       GROUP BY "kpiId"`;

    function runPattern(label, sql) {
      const samples = [];
      return (async () => {
        for (let i = 0; i < ITERS; i++) samples.push(await time(() => c.query(sql, [org])));
        samples.sort((a, b) => a - b);
        const p50 = pct(samples, 50), p95 = pct(samples, 95), p99 = pct(samples, 99);
        console.log(`[bench] ${label.padEnd(40)} p50=${p50}ms p95=${p95}ms p99=${p99}ms`);
        return { p50, p95, p99 };
      })();
    }

    console.log(`\n[bench] dashboard-summary aggregate (last ${WINDOW_DAYS}d, grouped by KPI) — RAW vs CAGG:`);
    const rawStats = await runPattern('RAW  hypertable  (KPIDataPoint)', rawDashboardSql);
    const caggStats = await runPattern('CAGG kpi_data_daily', caggDashboardSql);

    const speedup = caggStats.p95 > 0 ? (rawStats.p95 / caggStats.p95) : 0;
    console.log(`[bench] CAGG p95 speedup vs raw: ${speedup.toFixed(2)}×`);

    // p95 BUDGET gate on the raw dashboard aggregate (the worst case the API
    // would serve if the CAGG were unavailable).
    if (rawStats.p95 > P95_BUDGET_MS) {
      console.error(
        `[bench] BUDGET FAIL: raw dashboard-summary p95 ${rawStats.p95}ms > budget ${P95_BUDGET_MS}ms`,
      );
      budgetFailed = true;
    } else {
      console.log(
        `[bench] BUDGET OK: raw dashboard-summary p95 ${rawStats.p95}ms ≤ budget ${P95_BUDGET_MS}ms`,
      );
    }
  } finally {
    if (!KEEP) {
      await c.query(`DELETE FROM "Organization" WHERE id = $1`, [org]);
      // Re-refresh the daily CAGG over the seeded window so the now-deleted
      // org's materialized buckets are recomputed to empty (CAGG buckets are
      // not auto-removed when source rows are deleted until the next refresh).
      try {
        await c.query(
          `CALL refresh_continuous_aggregate('kpi_data_daily', (now() - interval '${DAYS + 2} days')::timestamp, (now() + interval '1 day')::timestamp)`,
        );
      } catch {
        /* best-effort cleanup of materialized buckets */
      }
      console.log('[bench] cleaned up throwaway org');
    } else {
      console.log(`[bench] kept org ${org}`);
    }
    await c.end();
  }

  if (budgetFailed) {
    console.error('[bench] exiting non-zero: p95 budget gate failed');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[bench] failed:', err);
  process.exit(1);
});
