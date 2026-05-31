-- TimescaleDB continuous aggregates over KPIDataPoint.
--
-- A continuous aggregate (CAGG) is an incrementally-maintained materialized
-- view over a hypertable. Dashboard/report rollups read these instead of
-- scanning raw rows, turning a full time-range aggregate into an index lookup
-- on a far smaller pre-aggregated table.
--
-- Five buckets are materialized: hourly / daily / weekly / monthly / quarterly.
-- Each carries avg / min / max / sum / count grouped by (bucket, kpiId,
-- organizationId) so the API can serve any of these summaries directly.
--
-- IMPORTANT — transaction constraint:
--   `CREATE MATERIALIZED VIEW ... WITH (timescaledb.continuous)` CANNOT run
--   inside a transaction block. scripts/setup-db.mjs applies THIS file with
--   `splitStatements: true`, executing each statement in its own implicit
--   autocommit `query()` call (never wrapped in BEGIN/COMMIT). Keep every
--   statement self-contained and terminated by a single `;` on its own.
--
-- Idempotency:
--   * CREATE MATERIALIZED VIEW IF NOT EXISTS  → re-runnable
--   * add_continuous_aggregate_policy(..., if_not_exists => TRUE) → re-runnable
--   * ALTER MATERIALIZED VIEW ... SET (timescaledb.compress = true) → no-op if
--     already set
--   * add_compression_policy(..., if_not_exists => TRUE) → re-runnable
--   So `pnpm db:setup` can be run repeatedly without error.
--
-- TimescaleDB version note (verified live on 2.26.4 / PG16):
--   month ('1 month') and quarter ('3 months') time_bucket intervals are
--   supported in CAGG definitions on this version — no 30-day/90-day fallback
--   was needed. On older TimescaleDB (<2.x month buckets) these two statements
--   would need a fixed '30 days' / '90 days' interval instead.

-- ---------------------------------------------------------------------------
-- hourly
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS kpi_data_hourly
WITH (timescaledb.continuous) AS
SELECT time_bucket(INTERVAL '1 hour', "recordedAt") AS bucket,
       "kpiId", "organizationId",
       avg("value") AS avg_value, min("value") AS min_value,
       max("value") AS max_value, sum("value") AS sum_value, count(*) AS sample_count
FROM "KPIDataPoint"
GROUP BY bucket, "kpiId", "organizationId"
WITH NO DATA;

SELECT add_continuous_aggregate_policy('kpi_data_hourly',
  start_offset => INTERVAL '7 days', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes', if_not_exists => TRUE);

ALTER MATERIALIZED VIEW kpi_data_hourly SET (timescaledb.compress = true);

SELECT add_compression_policy('kpi_data_hourly', compress_after => INTERVAL '90 days', if_not_exists => TRUE);

-- ---------------------------------------------------------------------------
-- daily
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS kpi_data_daily
WITH (timescaledb.continuous) AS
SELECT time_bucket(INTERVAL '1 day', "recordedAt") AS bucket,
       "kpiId", "organizationId",
       avg("value") AS avg_value, min("value") AS min_value,
       max("value") AS max_value, sum("value") AS sum_value, count(*) AS sample_count
FROM "KPIDataPoint"
GROUP BY bucket, "kpiId", "organizationId"
WITH NO DATA;

SELECT add_continuous_aggregate_policy('kpi_data_daily',
  start_offset => INTERVAL '90 days', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes', if_not_exists => TRUE);

ALTER MATERIALIZED VIEW kpi_data_daily SET (timescaledb.compress = true);

SELECT add_compression_policy('kpi_data_daily', compress_after => INTERVAL '90 days', if_not_exists => TRUE);

-- ---------------------------------------------------------------------------
-- weekly (7 days)
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS kpi_data_weekly
WITH (timescaledb.continuous) AS
SELECT time_bucket(INTERVAL '7 days', "recordedAt") AS bucket,
       "kpiId", "organizationId",
       avg("value") AS avg_value, min("value") AS min_value,
       max("value") AS max_value, sum("value") AS sum_value, count(*) AS sample_count
FROM "KPIDataPoint"
GROUP BY bucket, "kpiId", "organizationId"
WITH NO DATA;

SELECT add_continuous_aggregate_policy('kpi_data_weekly',
  start_offset => INTERVAL '1 year', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes', if_not_exists => TRUE);

ALTER MATERIALIZED VIEW kpi_data_weekly SET (timescaledb.compress = true);

SELECT add_compression_policy('kpi_data_weekly', compress_after => INTERVAL '90 days', if_not_exists => TRUE);

-- ---------------------------------------------------------------------------
-- monthly (1 month — variable-width bucket, requires TimescaleDB month support)
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS kpi_data_monthly
WITH (timescaledb.continuous) AS
SELECT time_bucket(INTERVAL '1 month', "recordedAt") AS bucket,
       "kpiId", "organizationId",
       avg("value") AS avg_value, min("value") AS min_value,
       max("value") AS max_value, sum("value") AS sum_value, count(*) AS sample_count
FROM "KPIDataPoint"
GROUP BY bucket, "kpiId", "organizationId"
WITH NO DATA;

SELECT add_continuous_aggregate_policy('kpi_data_monthly',
  start_offset => INTERVAL '2 years', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes', if_not_exists => TRUE);

ALTER MATERIALIZED VIEW kpi_data_monthly SET (timescaledb.compress = true);

SELECT add_compression_policy('kpi_data_monthly', compress_after => INTERVAL '90 days', if_not_exists => TRUE);

-- ---------------------------------------------------------------------------
-- quarterly (3 months — variable-width bucket)
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS kpi_data_quarterly
WITH (timescaledb.continuous) AS
SELECT time_bucket(INTERVAL '3 months', "recordedAt") AS bucket,
       "kpiId", "organizationId",
       avg("value") AS avg_value, min("value") AS min_value,
       max("value") AS max_value, sum("value") AS sum_value, count(*) AS sample_count
FROM "KPIDataPoint"
GROUP BY bucket, "kpiId", "organizationId"
WITH NO DATA;

SELECT add_continuous_aggregate_policy('kpi_data_quarterly',
  start_offset => INTERVAL '5 years', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes', if_not_exists => TRUE);

ALTER MATERIALIZED VIEW kpi_data_quarterly SET (timescaledb.compress = true);

SELECT add_compression_policy('kpi_data_quarterly', compress_after => INTERVAL '90 days', if_not_exists => TRUE);
