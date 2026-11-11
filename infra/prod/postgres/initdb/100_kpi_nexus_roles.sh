#!/bin/bash
# First boot only (empty volume), run by the image's entrypoint as the
# superuser. Does the few things only a superuser may do, so the schema owner
# can be an ordinary role: superusers always bypass row-level security, and
# rls-policies.sql relies on the owner being bound by it (FORCE RLS).
#
#   kpi_nexus  — owns the database and schema; runs the release (migrations +
#                SQL). NOSUPERUSER, NOBYPASSRLS. ADMIN on the two roles below
#                only so the release can set their passwords.
#   kpi_app    — request role, NOBYPASSRLS.
#   kpi_system — background/system role, BYPASSRLS (needs a superuser to grant).
#
# The two runtime roles get no password here; the first release sets them
# from KPI_APP_DB_PASSWORD / KPI_SYSTEM_DB_PASSWORD.
set -euo pipefail
: "${KPI_OWNER_DB_PASSWORD:?KPI_OWNER_DB_PASSWORD must be set (fly secrets set)}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set owner_pw="$KPI_OWNER_DB_PASSWORD" <<'EOSQL'
CREATE ROLE kpi_nexus LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB CREATEROLE PASSWORD :'owner_pw';
CREATE DATABASE kpi_nexus OWNER kpi_nexus;
CREATE ROLE kpi_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE kpi_system LOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT kpi_app, kpi_system TO kpi_nexus WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname kpi_nexus <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS vector;
ALTER SCHEMA public OWNER TO kpi_nexus;
EOSQL
