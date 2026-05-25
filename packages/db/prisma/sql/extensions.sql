-- Postgres extensions required by KPI Nexus.
-- Applied by scripts/setup-db.mjs after `prisma db push`.

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS vector;
