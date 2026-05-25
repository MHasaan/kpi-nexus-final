---
name: project-kpi-nexus-final
description: Project memory for the KPI Nexus Final rebuild — status, locked decisions, and pointers.
type: project
---

# Project: KPI Nexus Final

## What this is

A fresh ground-up rebuild of the KPI Nexus FYP project. Production-quality multi-tenant SaaS. Lives at `C:\work\FYP\khan\KPI_NEXUS_Final` as a separate git repo.

## Status

As of 2026-05-25 (end of P0): **P0 (Foundation) merged to master and pushed to https://github.com/MHasaan/kpi-nexus-final (private).** Static verification (typecheck/lint/test/build) all green at merge. Live-infra acceptance (docker:up, db:setup, /health responses, e2e) ran end of session — see `git tag` for `p0-complete` status.

**P1 (Identity + Tenancy + RBAC) is the next thing to execute** — see `docs/superpowers/plans/P1-identity-tenancy-rbac.md`.

Spec + framework docs + all 10 phase plans were committed on the same day during the prior planning session.

## Locked decisions (from brainstorming session 2026-05-25)

1. **Fresh design** — does NOT inherit from the prior `another/todo.md` or partial rebuild blueprint at `~/.claude/plans/first-understand-the-current-greedy-dongarra.md`. Those exist but are explicitly NOT the basis.
2. **Production-quality multi-tenant SaaS** — not just FYP demo polish
3. **Stack**: pnpm + Turborepo · Next.js 15 App Router · NestJS 11 (Fastify) · Prisma 6 · Postgres 16 + TimescaleDB + pgvector · Redis 7 · BullMQ · Python FastAPI ML sidecar · Zod · Pino + OTel + Sentry
4. **Deployment**: Docker locally for dev; Vercel (web) + Fly.io (api, worker, ml, postgres) + Upstash (redis) for prod
5. **AI**: Gemini default (free tier with key rotation, ports current app's 8-key pattern) + multi-provider abstraction (Claude/OpenAI/Ollama pluggable per-org-per-feature) from day one. Default budget caps: $1/day, $30/month per org. Circuit breaker FAIL_CLOSED or FALLBACK.
6. **Scope**: maximum — ~77 NestJS modules across 10 domains, ~70 Prisma models, 18 canonical permissions, ~18 BullMQ queues, 5 ML endpoints, 11 AI features
7. **Multi-tenancy**: 3-layer defense — AsyncLocalStorage context + Prisma filter + Postgres RLS
8. **KPI scope model** (ORG_WIDE/PER_UNIT/PER_USER) as first-class concept with cross-user isolation invariants enforced by tests. Critical: the current app had a bug where user A could see user B's PER_USER values — this must not recur in the rebuild.
9. **Permissions** threaded through backend AND frontend at every layer — never trust the client
10. **Frontend visual design**: deferred to future "Claude Design" session using the brief in spec §12

## Delivery plan

**10 phases (P0–P9), ~37 weeks solo, each shippable, each tagged on completion:**

| Phase | Goal | Effort |
|---|---|---|
| P0 | Foundation (scaffold + CI + docker-compose + empty apps boot) | 2 wk |
| P1 | Identity + Tenancy + RBAC + onboarding stub | 4 wk |
| P2 | KPI Engine + Data Layer | 5 wk |
| P3 | Visualization + Reporting | 4 wk |
| P4 | Alerting | 3 wk |
| P5 | AI Layer (multi-provider + NLQ + insights + recs + ML sidecar) | 5 wk |
| P6 | Onboarding 2.0 + AI Co-pilot | 3 wk |
| P7 | Collaboration + Workflow (tasks/comments/OKRs/approvals) | 4 wk |
| P8 | Integrations + Extensibility | 4 wk |
| P9 | Polish (SSO/SCIM/i18n/a11y/perf) | 3 wk |

## Where to find things

- **Design spec** (source of truth): `docs/superpowers/specs/2026-05-25-kpi-nexus-final-design.md`
- **Roadmap with status**: `ROADMAP.md`
- **Flat task checklist**: `TODOS.md`
- **AI session context**: `CLAUDE.md`
- **Per-phase detailed plans**: `docs/superpowers/plans/P{0-9}-*.md`
- **Project memory**: `memory/` (this directory)
- **Original app for feature reference** (NOT code reference): `C:\work\FYP\khan\KPI_NEXUS orignal\`
- **Original app seed.ts depth gold standard**: `C:\work\FYP\khan\KPI_NEXUS orignal\backend\prisma\seed.ts`

## When working in this project

- Read `CLAUDE.md` first — it captures all the conventions
- Pick the current phase from `ROADMAP.md`
- Open the phase's plan file in `docs/superpowers/plans/`
- Use `superpowers:executing-plans` or `subagent-driven-development` skill to execute
- Verify exit criteria from the plan before claiming complete
- Tag at phase completion: `git tag p{N}-complete`

## Why this matters

This is the user's Final Year Project but built at production-shippable quality. The original app works but has tech debt (no tests, hardcoded keys, manual cron, no transactional guarantees on some flows). The rebuild fixes those AND adds substantial enterprise feature surface (NLQ chat, OKRs, approvals, SSO/SCIM, custom domains, plugin system, etc.).

Examiners will want to see depth + breadth + production discipline. The 10-phase decomposition lets the user demo any subset.
