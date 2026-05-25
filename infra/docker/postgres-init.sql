-- Runs once on a fresh Postgres data volume.
-- Subsequent boots reuse the volume — re-running this script requires `pnpm docker:reset`.
-- For incremental extension changes use scripts/setup-db.mjs instead.

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS vector;
