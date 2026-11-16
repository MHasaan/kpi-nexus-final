# KPI Nexus Final

A production-grade multi-tenant SaaS for KPI definition, tracking, analytics, and action. Ground-up rewrite of the original KPI Nexus app at `C:\work\FYP\khan\KPI_NEXUS orignal`.

## What this project is

- **6 capability domains**: Tenancy/Identity, Org Modeling, KPI Engine, Visualization/Reporting, Intelligence (AI), Collaboration/Workflow
- **Scale target**: multiple tenants, 1M+ data points per tenant, sub-100ms dashboard queries via TimescaleDB
- **Status**: P0–P9 are implemented on `main`. See [ROADMAP](./ROADMAP.md) for the phases and [HANDOFF](./HANDOFF.md) for verification and remaining work.

## Stack (locked)

The stack choices are locked (spec Appendix A); the major versions below are current as of 2026-11-16. Exact versions live in each `package.json`, `apps/ml/requirements.txt` and the Dockerfiles.

- **Monorepo**: pnpm + Turborepo
- **Language**: TypeScript 6 (strict) on Node.js 22
- **Frontend**: Next.js 16 + React 19 (App Router) — Vercel Hobby
- **Backend API**: NestJS 12 on Fastify 5 — Oracle Cloud Always Free VM ([ADR-001](./docs/adrs/ADR-001-free-tier-hosting.md))
- **Background workers**: NestJS + BullMQ, 13 queue processors (alerts, escalations, calculations, notifications, reports, connectors, webhooks, insights, KPI watches, NLQ re-embedding, Slack commands, onboarding cleanup). Locally the API runs them; production runs them in a separate worker process built from `apps/api` (`dist/worker.js`, with `RUN_QUEUE_WORKERS=false` on the API). There is no `apps/worker` package any more.
- **ML sidecar**: Python 3.14 + FastAPI (Prophet, ARIMA, IsolationForest, what-if) — same VM
- **Database**: PostgreSQL 16 + TimescaleDB + pgvector, self-hosted on the VM with a persistent volume
- **Cache & queue**: Redis 7 — on the VM
- **ORM**: Prisma 7 (through the `@prisma/adapter-pg` driver adapter)
- **Validation**: Zod 4 (shared between web and api via `packages/contracts`)
- **Auth**: JWT + refresh-token rotation, MFA TOTP, SSO (SAML/OIDC) via WorkOS
- **AI**: provider-pluggable; Gemini default (free tier), Claude/OpenAI/Ollama BYO
- **Real-time**: SSE
- **Observability**: Pino + OpenTelemetry + Sentry
- **Testing**: Vitest 4 + Playwright + Testcontainers; Storybook 10 for `packages/ui`
- **CI**: GitHub Actions

## Repository structure (post P0)

```
kpi-nexus-final/
├── apps/
│   ├── web/         Next.js 16 — UI only, no DB
│   ├── api/         NestJS 12 — HTTP + business logic; also builds the queue
│   │                worker (dist/worker.js: BullMQ processors, no HTTP)
│   └── ml/          Python FastAPI — stateless math service
├── packages/
│   ├── contracts/   Zod schemas + TS types shared web ↔ api
│   ├── db/          Prisma schema + migrations + client wrapper
│   ├── ai/          Provider-agnostic AI layer
│   ├── formula/     Unused placeholder — the formula engine is
│   │                apps/api/src/formula (hand-written parser + AST
│   │                evaluator; no eval/Function)
│   ├── ui/          Design tokens, Tailwind preset, cn() and the UI
│   │                components, with Storybook (see packages/ui/README.md)
│   ├── sdk/         TypeScript client generated from apps/api/openapi.json
│   └── config/      Shared tsconfig / eslint / vitest / tailwind
├── infra/
│   ├── docker/      docker-compose for local dev
│   ├── prod/        Production compose, Caddy, deploy/backup scripts (Oracle
│   │                Always Free VM — ADR-001, docs/deploy.md)
│   ├── fly/         (empty — Fly.io replaced by ADR-001)
│   └── github/      (empty — CI lives in .github/workflows)
├── docs/
│   ├── superpowers/specs/   Design specs
│   ├── superpowers/plans/   Per-phase implementation plans
│   └── adrs/                Architecture decision records
├── memory/                  Project-specific memory for AI sessions
├── README.md                You are here
├── CLAUDE.md                Context for future AI sessions
├── ROADMAP.md               Master phase index + status
└── TODOS.md                 Flat checklist across all phases
```

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 22 LTS (22.12+; NestJS 12 needs it) | Runtime for pnpm + apps (`.nvmrc`, Docker and CI all use 22) |
| pnpm | 9.x | Workspace package manager (`npm install -g pnpm@9`) |
| Python | 3.14 | ML sidecar (apps/ml) |
| Docker Desktop | 24+ | Postgres, Redis, SeaweedFS (S3), Mailhog, Jaeger via compose |
| git | any recent | Version control |

## Quick start

```bash
# 1. Install JS deps + link workspaces
pnpm install

# 2. Copy env templates
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/ml/.env.example apps/ml/.env

# 3. Bring up local infra (Postgres + TimescaleDB + Redis + SeaweedFS S3 + Mailhog + Jaeger)
pnpm docker:up

# 4. Provision database (probes Postgres, runs prisma push, verifies extensions)
pnpm db:setup

# 5. Boot the JS/TS stack (web :3000, api :4000 — the api runs the queue
#    processors too; RUN_QUEUE_WORKERS=false + `pnpm --filter @kpi-nexus/api dev:worker`
#    splits them into their own process, as production does)
pnpm dev

# 6. Boot the Python ML sidecar (one-time install + start; separate terminal)
pnpm ml:install      # pip install -r apps/ml/requirements.txt
pnpm ml:dev          # uvicorn on :8000

# Healthchecks
curl http://localhost:4000/health    # {db: "ok", redis: "ok"}
curl http://localhost:8000/health    # {ok: true}
open http://localhost:3000           # landing page
```

## Useful commands

```bash
# Static checks (fast — no infra)
pnpm turbo typecheck lint test build

# E2E (needs web dev server; auto-started by playwright.config.ts)
pnpm --filter @kpi-nexus/web exec playwright install chromium  # one-time
pnpm --filter @kpi-nexus/web test:e2e

# Database
pnpm db:migrate     # create or apply local Prisma migrations
pnpm db:studio      # Prisma Studio at :5555
pnpm db:reset       # nuke + reseed (destructive)

# Docker lifecycle
pnpm docker:up      # start the stack
pnpm docker:down    # stop, keep volumes
pnpm docker:reset   # stop + delete volumes (destructive)
pnpm docker:logs    # tail logs
pnpm docker:ps      # show container status
```

## Service ports (local dev)

| Service | Port | URL |
|---|---|---|
| Web (Next.js) | 3000 | http://localhost:3000 |
| API (NestJS) | 4000 | http://localhost:4000 |
| ML (FastAPI) | 8000 | http://localhost:8000 |
| Postgres | 5432 | `postgresql://kpi_nexus:dev_password@localhost:5432/kpi_nexus` |
| Redis | 6379 | `redis://localhost:6379` |
| S3 (SeaweedFS) | 9000 | http://localhost:9000 (key kpinexus / kpinexus-dev-secret) |
| Mailhog SMTP | 1025 | (smtp) |
| Mailhog UI | 8025 | http://localhost:8025 |
| Jaeger UI | 16686 | http://localhost:16686 |

## Documents you should read

| Document | When to read |
|---|---|
| [Design spec](./docs/superpowers/specs/2026-05-25-kpi-nexus-final-design.md) | First — the source of truth for what we're building and why |
| [ROADMAP](./ROADMAP.md) | Second — phase-by-phase plan with status indicators |
| [TODOS](./TODOS.md) | When picking up work — flat checklist across all phases |
| [CLAUDE.md](./CLAUDE.md) | If you're an AI session starting work here — project context, conventions, gotchas |
| [Phase plans](./docs/superpowers/plans/) | When executing a specific phase — detailed step-by-step |

## Current status

All ten phases (P0–P9) are implemented and tagged (`p0-complete` … `p9-complete`, `v1.0.0`); see [ROADMAP](./ROADMAP.md).

The October 2026 full audit is fixed and merged into `main`, and so is every item from the "Not built" list (#94–#114: onboarding co-pilot, NLQ tool loop, data corrections / saved views / watches / snapshots, OpenAPI + SDK, Teams cards, Slack `/kpi`, the shared UI library with Storybook, `allowNegative` enforcement). The fix log in [docs/audit/README.md](./docs/audit/README.md) is the source of truth for what was broken and how it was fixed. What is left is the owner's: the Windows launcher run (OT-017) and going live ([docs/deploy.md](./docs/deploy.md)). The phase checklists in `TODOS.md` predate v1.0.0; trust its status banner and its "Not built" section.

## Context

This is a Final Year Project (FYP) but designed at production-shippable quality. The original app at `C:\work\FYP\khan\KPI_NEXUS orignal` is a working React/Node/Postgres single-server app — we use it as a feature reference but do NOT inherit its code.

The full design history and decision rationale lives in:
- The design spec (linked above)
- The brainstorming transcript (2026-05-25 session)
- Memory file at `memory/project-kpi-nexus-final.md`
