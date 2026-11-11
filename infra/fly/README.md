# Deploying KPI Nexus (Fly.io + Vercel)

This folder holds the production deploy config from the locked spec (Appendix A #7). Web runs on Vercel. The API, queue worker, ML sidecar and Postgres/TimescaleDB run on Fly.io. Redis is on Upstash, files on Cloudflare R2, and email goes through Resend.

| Fly app | Config | Build context | Reachable at |
|---|---|---|---|
| `kpi-nexus-db` | `postgres.toml` | `infra/fly/postgres` | `kpi-nexus-db.flycast:5432` (private) |
| `kpi-nexus-ml` | `ml.toml` | `apps/ml` | `http://kpi-nexus-ml.flycast` (private) |
| `kpi-nexus-api` | `api.toml` | repo root | `https://kpi-nexus-api.fly.dev` |

`kpi-nexus-api` runs two process groups from one image:
- `app`: the HTTP API, with `RUN_QUEUE_WORKERS=false`;
- `worker`: `node dist/worker.js`, the BullMQ processors (OT-003).

Every API deploy first runs `release_command`, which does the following:
1. runs `prisma migrate deploy`;
2. applies the RLS, hypertable and continuous-aggregate SQL (`packages/db/scripts/release-db.mjs`);
3. aborts the deploy if anything fails.

Never run `db push` against production.

Rehearse everything locally first (no accounts needed) with `infra/docker/prod-rehearsal.compose.yml`; the steps are at the end of this page.

## Before you start

Have these ready. Each value goes in one of the secret commands below.

- **Fly.io:** `flyctl` installed and logged in (`fly auth login`).
- **Upstash Redis:** the `rediss://default:<token>@<host>.upstash.io:6379` URL.
  - The BullMQ worker polls Redis even when idle. The command volume measured in the local rehearsal is under *Redis usage* below, so you can choose an Upstash plan that covers it.
- **Cloudflare R2:**
  - a bucket;
  - an S3 API token: access key and secret;
  - the endpoint `https://<account-id>.r2.cloudflarestorage.com`.
- **Resend:**
  - a verified sending domain;
  - an API key, which doubles as the SMTP password (user `resend`).
- **Vercel:** a project for `apps/web`, set up as described further down.

Generate every secret fresh, using `openssl rand -hex 32` unless noted. Keep them somewhere safe, because several are needed twice.

The sequence below uses `iad`. If you choose another region, change `primary_region` in all three tomls.

## First deploy, in this order

### 1. Database

```bash
fly apps create kpi-nexus-db
fly volumes create pgdata --app kpi-nexus-db --region iad --size 3
fly secrets set --app kpi-nexus-db --stage \
  POSTGRES_PASSWORD=<superuser password: first boot and break-glass only> \
  KPI_OWNER_DB_PASSWORD=<owner password>
fly deploy infra/fly/postgres --config infra/fly/postgres.toml --remote-only --no-public-ips --flycast --ha=false
```

On first boot, `initdb/100_kpi_nexus_roles.sh` sets up the database. Superusers bypass RLS, which is why the owner must not be one (see `rls-policies.sql`).
- **`kpi_nexus`:** the schema owner, an ordinary role (not a superuser).
- **`kpi_nexus` database:** created and owned by that role.
- **Extensions:** `timescaledb` and `vector`.
- **Runtime roles:**
  - `kpi_app`, for requests;
  - `kpi_system`, which can bypass RLS, for system work.
  They get their passwords from the API's first release.

### 2. ML sidecar

```bash
fly apps create kpi-nexus-ml
fly secrets set --app kpi-nexus-ml --stage ML_SIDECAR_HMAC_SECRET=<ml secret>
fly deploy apps/ml --config infra/fly/ml.toml --remote-only --no-public-ips --flycast --ha=false
```

### 3. API and worker

`DB` below is `kpi-nexus-db.flycast:5432/kpi_nexus`.

```bash
fly apps create kpi-nexus-api
fly secrets set --app kpi-nexus-api --stage \
  DATABASE_URL=postgresql://kpi_nexus:<owner password>@DB \
  DATABASE_URL_APP=postgresql://kpi_app:<app password>@DB \
  DATABASE_URL_SYSTEM=postgresql://kpi_system:<system password>@DB \
  KPI_APP_DB_PASSWORD=<app password> \
  KPI_SYSTEM_DB_PASSWORD=<system password> \
  REDIS_URL=rediss://default:<token>@<host>.upstash.io:6379 \
  JWT_SECRET=<hex32> \
  ONBOARDING_DRAFT_SECRET=<hex32> \
  NOTIFICATION_ENCRYPTION_KEY=<hex32> \
  EMBED_TOKEN_SECRET=<hex32> \
  ML_SIDECAR_HMAC_SECRET=<ml secret> \
  BYO_ENCRYPTION_KEY=<hex32> \
  INTEGRATION_CRYPTO_KEY=<hex32> \
  S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
  S3_REGION=auto \
  S3_BUCKET=<bucket> \
  S3_ACCESS_KEY=<r2 access key> \
  S3_SECRET_KEY=<r2 secret> \
  SMTP_HOST=smtp.resend.com \
  SMTP_PORT=465 \
  SMTP_SECURE=true \
  SMTP_USER=resend \
  SMTP_PASS=<resend api key> \
  SMTP_FROM="KPI Nexus <noreply@your-domain>" \
  WEB_APP_URL=https://<your-vercel-domain> \
  CORS_ALLOWED_ORIGINS=https://<your-vercel-domain>
fly deploy . --config infra/fly/api.toml --remote-only
```

- **Placeholders:** `<app password>` and `<system password>` are new values; `<owner password>` and `<ml secret>` are the ones from steps 1 and 2.
- **Required secrets:**
  - **Startup refuses dev values.** The API refuses to start in production with a missing, default or short (under 32 characters) value for `JWT_SECRET`, `ONBOARDING_DRAFT_SECRET`, `NOTIFICATION_ENCRYPTION_KEY`, `EMBED_TOKEN_SECRET` or `ML_SIDECAR_HMAC_SECRET` (`apps/api/src/config/secrets.ts`).
  - **Encryption keys:** `BYO_ENCRYPTION_KEY` and `INTEGRATION_CRYPTO_KEY` (64 hex characters each) are required too.
- **Optional:**
  - `GEMINI_API_KEYS` (comma-separated), `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`;
  - `SENTRY_DSN`;
  - `OTEL_EXPORTER_OTLP_ENDPOINT`.
- **Owner credentials are present on the API machines.** `DATABASE_URL` is the owner and is only meant for `release_command`, but Fly secrets reach every process of the app, and the API's database health check also uses it. Because the owner is not a superuser and is bound by FORCE RLS, a process that connects as it by mistake sees no tenant rows.

### 4. Web (Vercel)

1. **Import the repository** and set **Root Directory** to `apps/web`. `apps/web/vercel.json` already supplies the install command, the build command (turbo from the monorepo root) and the framework.
2. **Set `NEXT_PUBLIC_API_URL=https://kpi-nexus-api.fly.dev`** for Production. It is fixed at build time, so redeploy after changing it.
3. **Deploy.** Then set the API's `WEB_APP_URL` and `CORS_ALLOWED_ORIGINS` (step 3) to the Vercel domain if you haven't already.

The browser calls the API directly with a Bearer token, so cross-site cookies aren't involved.

### Check it

- Visit `https://kpi-nexus-api.fly.dev/health`; it should return `{"db":"ok","redis":"ok"}`.
- Run `fly ips list --app kpi-nexus-db` and `--app kpi-nexus-ml`. They should list private addresses only.
- Run `fly logs --app kpi-nexus-api`:
  - the `app` machines log "Queue processors OFF";
  - the `worker` machines log "kpi-nexus-worker started".

## Later deploys

Use `.github/workflows/release.yml` (Actions → Release → Run workflow), or the same `fly deploy` commands as above.

- **When it runs:** only when started by hand until the first live deploy has worked; after that, add a `push` trigger.
- **Repository secrets it needs:** `FLY_API_TOKEN` (`fly tokens create deploy`, scoped to these apps), `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`.
- **Without the secrets,** each job skips with a notice.

**Rollback:**
- **API or ML:** `fly releases --app <app>`, then `fly deploy --image <previous image>`.
- **Migrations:** they are append-only and backward compatible (spec §10.3), so an older API image runs against a newer schema.
- **Web:** promote the previous deployment in Vercel.

## Not covered yet

- **No database backups or replica.** The database is one machine with one volume. Fly takes daily volume snapshots (`fly volumes snapshots list`), but take your own `pg_dump` regularly, and before risky migrations, until a backup plan exists.
- **Not tested on a real account.** This config has been rehearsed only in local containers. The first live deploy is the first real test of Fly, Vercel, Upstash, R2 and Resend.

## Redis usage

Measured in the local rehearsal, with the worker running and idle (no jobs): see the OT-011 entry in `docs/audit/closure-2026-11-06.md`.

## Local rehearsal

`infra/docker/prod-rehearsal.compose.yml` runs the same images and process commands as this config, plus local stand-ins:

| Production | Rehearsal stand-in |
|---|---|
| Upstash | `redis:7` |
| R2 | SeaweedFS |
| Resend | MailHog |
| Vercel | `next start` |

The steps are at the top of that file.
