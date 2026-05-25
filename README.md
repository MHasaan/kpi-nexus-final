# KPI Nexus Final

A production-grade multi-tenant SaaS for KPI definition, tracking, analytics, and action. Ground-up rewrite of the original KPI Nexus app at `C:\work\FYP\khan\KPI_NEXUS orignal`.

## What this project is

- **6 capability domains**: Tenancy/Identity, Org Modeling, KPI Engine, Visualization/Reporting, Intelligence (AI), Collaboration/Workflow
- **Scale target**: multiple tenants, 1M+ data points per tenant, sub-100ms dashboard queries via TimescaleDB
- **Status**: planning phase — design spec and detailed phase plans committed; implementation has not yet started (P0 is next)

## Stack (locked)

- **Monorepo**: pnpm + Turborepo
- **Frontend**: Next.js 15 (App Router, RSC) — deploys to Vercel
- **Backend API**: NestJS 11 on Fastify — deploys to Fly.io
- **Background workers**: NestJS + BullMQ — separate process on Fly.io
- **ML sidecar**: Python FastAPI (Prophet, ARIMA, IsolationForest, what-if) — Fly.io
- **Database**: PostgreSQL 16 + TimescaleDB + pgvector, self-hosted on Fly.io with persistent volume
- **Cache & queue**: Redis 7 — Upstash (managed)
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
│   ├── api/         NestJS 11 — HTTP + business logic
│   ├── worker/      NestJS — BullMQ processors, same modules as api
│   └── ml/          Python FastAPI — stateless math service
├── packages/
│   ├── contracts/   Zod schemas + TS types shared web ↔ api
│   ├── db/          Prisma schema + migrations + client wrapper
│   ├── ai/          Provider-agnostic AI layer
│   ├── formula/     Formula parser + evaluator (isolated-vm sandbox)
│   ├── ui/          Design tokens + theme + primitive utilities
│   └── config/      Shared tsconfig / eslint / vitest / tailwind
├── infra/
│   ├── docker/      docker-compose for local dev
│   ├── fly/         fly.toml per service
│   └── github/      CI workflows
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

## Quick start (after P0 is done)

```bash
# Bring up local dev environment
pnpm install
cp .env.example .env
pnpm db:setup       # postgres + redis + minio + mailhog up + migrate + seed
pnpm dev            # web (3000) + api (4000) + worker + ml (8000)

# Run tests
pnpm test           # unit
pnpm test:int       # integration (Testcontainers)
pnpm test:e2e       # Playwright

# Database utilities
pnpm db:migrate     # apply migrations
pnpm db:studio      # Prisma Studio at :5555
pnpm db:reset       # nuke + reseed
```

## Documents you should read

| Document | When to read |
|---|---|
| [Design spec](./docs/superpowers/specs/2026-05-25-kpi-nexus-final-design.md) | First — the source of truth for what we're building and why |
| [ROADMAP](./ROADMAP.md) | Second — phase-by-phase plan with status indicators |
| [TODOS](./TODOS.md) | When picking up work — flat checklist across all phases |
| [CLAUDE.md](./CLAUDE.md) | If you're an AI session starting work here — project context, conventions, gotchas |
| [Phase plans](./docs/superpowers/plans/) | When executing a specific phase — detailed step-by-step |

## Current status

Phase **P0 (Foundation)** is the next thing to execute. See:
- [ROADMAP §P0](./ROADMAP.md#p0--foundation)
- [Detailed plan](./docs/superpowers/plans/P0-foundation.md)

Nothing in `apps/` or `packages/` yet — those get created during P0.

## Context

This is a Final Year Project (FYP) but designed at production-shippable quality. The original app at `C:\work\FYP\khan\KPI_NEXUS orignal` is a working React/Node/Postgres single-server app — we use it as a feature reference but do NOT inherit its code.

The full design history and decision rationale lives in:
- The design spec (linked above)
- The brainstorming transcript (2026-05-25 session)
- Memory file at `memory/project-kpi-nexus-final.md`
