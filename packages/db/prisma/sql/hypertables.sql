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
