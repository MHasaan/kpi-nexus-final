-- TimescaleDB hypertable conversions.
--
-- Idempotent: each create_hypertable() call uses if_not_exists => TRUE so
-- the script is safe to re-run via `pnpm db:setup`.
--
-- A hypertable partitions a regular Postgres table by a time column
-- (`recordedAt` here) into chunks, which gives:
--   * fast time-bounded queries via chunk pruning
--   * compression on the rollups (continuous-aggregates.sql); not on the base
--     table, which carries row-level security (OT-014)
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

-- No compression on the base hypertable (OT-014). TimescaleDB refuses
-- compression on a table with row-level security, and KPIDataPoint holds the
-- most sensitive tenant data, so it gets RLS like every other tenant table
-- (rls-policies.sql, applied after this file). Compression only touched rows
-- older than 90 days; at this data volume the disk cost is negligible.
-- Idempotent, and it undoes the old setup on existing databases: drop the
-- policy, decompress any compressed chunk, then switch compression off.
-- The switch-off runs only while compression is still on: once RLS is enabled
-- TimescaleDB rejects even `compress = false`, which broke every re-run.
SELECT remove_compression_policy('"KPIDataPoint"', if_exists => TRUE);
SELECT decompress_chunk(c, if_compressed => TRUE) FROM show_chunks('"KPIDataPoint"') c;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_name = 'KPIDataPoint' AND compression_enabled
  ) THEN
    ALTER TABLE "KPIDataPoint" SET (timescaledb.compress = false);
  END IF;
END $$;

-- The five continuous aggregates (hourly/daily/weekly/monthly/quarterly) plus
-- their refresh + compression policies live in continuous-aggregates.sql,
-- which setup-db.mjs applies separately with splitStatements:true because CAGG
-- DDL cannot run inside a transaction block.
