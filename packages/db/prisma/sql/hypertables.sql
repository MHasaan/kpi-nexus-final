-- TimescaleDB hypertable conversions.
--
-- Idempotent: each create_hypertable() call uses if_not_exists => TRUE so
-- the script is safe to re-run via `pnpm db:setup`.
--
-- A hypertable partitions a regular Postgres table by a time column
-- (`recordedAt` here) into chunks, which gives:
--   * fast time-bounded queries via chunk pruning
--   * efficient compression policies (P2.3+)
--   * retention policy hooks (P9)
--
-- The Prisma model must already have the time column as part of its
-- primary key — Prisma's `@@id([recordedAt, id])` produces that.

-- KPIDataPoint — partition by recordedAt with 7-day chunks
SELECT create_hypertable(
  '"KPIDataPoint"',
  by_range('recordedAt', INTERVAL '7 days'),
  if_not_exists => TRUE
);

-- Base-hypertable compression: compress raw KPIDataPoint chunks older than
-- 90 days. Segment-by (kpiId, organizationId) so per-KPI scans stay fast on
-- compressed chunks; order-by recordedAt DESC keeps "latest" lookups cheap.
-- Idempotent: ALTER SET is a no-op if already set; add_compression_policy
-- uses if_not_exists.
ALTER TABLE "KPIDataPoint" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"kpiId", "organizationId"',
  timescaledb.compress_orderby = '"recordedAt" DESC'
);

SELECT add_compression_policy(
  '"KPIDataPoint"',
  compress_after => INTERVAL '90 days',
  if_not_exists => TRUE
);

-- The five continuous aggregates (hourly/daily/weekly/monthly/quarterly) plus
-- their refresh + compression policies live in continuous-aggregates.sql,
-- which setup-db.mjs applies separately with splitStatements:true because CAGG
-- DDL cannot run inside a transaction block.
