# KPI Nexus Final

A production-grade multi-tenant SaaS for KPI definition, tracking, analytics, and action. Ground-up rewrite of the original KPI Nexus app at `C:\work\FYP\khan\KPI_NEXUS orignal`.

## What this project is

- **6 capability domains**: Tenancy/Identity, Org Modeling, KPI Engine, Visualization/Reporting, Intelligence (AI), Collaboration/Workflow
- **Scale target**: multiple tenants, 1M+ data points per tenant, sub-100ms dashboard queries via TimescaleDB
- **Status**: P0–P9 are implemented on `main`. See [ROADMAP](./ROADMAP.md) for the phases and [HANDOFF](./HANDOFF.md) for verification and remaining work.

## Stack (locked)

- **Monorepo**: pnpm + Turborepo
- **Frontend**: Next.js 15 (App Router, RSC) — Vercel Hobby
- **Backend API**: NestJS 11 on Fastify — Oracle Cloud Always Free VM ([ADR-001](./docs/adrs/ADR-001-free-tier-hosting.md))
- **Background workers**: NestJS + BullMQ. Product queues run in the API. The separate worker is an echo scaffold.
- **ML sidecar**: Python FastAPI (Prophet, ARIMA, IsolationForest, what-if) — same VM
- **Database**: PostgreSQL 16 + TimescaleDB + pgvector, self-hosted on the VM with a persistent volume
- **Cache & queue**: Redis 7 — on the VM
- **ORM**: Prisma 6
- **Validation**: Zod (shared between web and api via `packages/contracts`)
- **Auth**: JWT + refresh-token rotation, MFA TOTP, SSO (SAML/OIDC) via WorkOS
- **AI**: provider-pluggable; Gemini default (free tier), Claude/OpenAI/Ollama BYO
- **Real-time**: SSE
- **Observability**: Pino + OpenTelemetry + Sentry
- **Testing**: Vitest + Playwright + Testcontainers
- **CI**: GitHub Actions

## Repository structure (post P0)

```
kpi-nexus-final/
├── apps/
│   ├── web/         Next.js 15 — UI only, no DB
│   ├── api/         NestJS 11 — HTTP + business logic; also builds the queue
│   │                worker (dist/worker.js: BullMQ processors, no HTTP)
│   └── ml/          Python FastAPI — stateless math service
├── packages/
│   ├── contracts/   Zod schemas + TS types shared web ↔ api
│   ├── db/          Prisma schema + migrations + client wrapper
│   ├── ai/          Provider-agnostic AI layer
│   ├── formula/     Unused placeholder — the formula engine is
│   │                apps/api/src/formula (hand-written parser + AST
│   │                evaluator; no eval/Function)
│   ├── ui/          Design tokens + theme + primitive utilities
│   └── config/      Shared tsconfig / eslint / vitest / tailwind
├── infra/
│   ├── docker/      docker-compose for local dev
│   ├── fly/         (empty — deploy config not written yet, audit OT-011)
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
| Node.js | 20 LTS (or 22) | Runtime for pnpm + apps |
| pnpm | 9.x | Workspace package manager (`npm install -g pnpm@9`) |
| Python | 3.12 | ML sidecar (apps/ml) |
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

A full audit (October 2026) is being worked through on branch `fix/full-audit`. Its findings, their status and the fix log are in [docs/audit/README.md](./docs/audit/README.md) — that is the current source of truth for what is broken or open. `TODOS.md` checkboxes predate v1.0.0 and are stale; trust its status banner instead.

## Context

This is a Final Year Project (FYP) but designed at production-shippable quality. The original app at `C:\work\FYP\khan\KPI_NEXUS orignal` is a working React/Node/Postgres single-server app — we use it as a feature reference but do NOT inherit its code.

The full design history and decision rationale lives in:
- The design spec (linked above)
- The brainstorming transcript (2026-05-25 session)
- Memory file at `memory/project-kpi-nexus-final.md`
