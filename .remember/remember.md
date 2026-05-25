# Handoff

## State
This project is the production-quality rebuild of KPI Nexus (original at `C:\work\FYP\khan\KPI_NEXUS orignal\`). Planning phase complete on 2026-05-25 — design spec + 10 detailed phase plans + framework docs + project memory all committed (6 commits on master). **No code yet** — `apps/` and `packages/` are empty conceptually; they get created during P0.

## Next
1. Read `NEXT-SESSION.md` (front-door) → `README.md` → `CLAUDE.md` → `ROADMAP.md` (≈10 min total).
2. Open `docs/superpowers/plans/P0-foundation.md` and execute the 17 tasks (≈2 weeks) via `superpowers:executing-plans` or `superpowers:subagent-driven-development`.
3. Tick items in `TODOS.md`; tag `git tag p0-complete` when acceptance checklist passes; move to P1.

## Context
- Locked stack: NestJS+Next.js+Prisma+Postgres+TimescaleDB+pgvector+Redis+BullMQ+Python FastAPI ML; Gemini default + multi-provider AI abstraction; Vercel + Fly.io + Upstash. Don't re-litigate without ADR in `docs/adrs/` + user signoff.
- Critical invariants from spec §6 (P2 exit): PER_USER KPI cross-user isolation tests; POST /kpis/:id/data returns 422 if scope != ORG_WIDE.
- Original app's `seed.ts` (1945 lines) is the depth gold standard P6 must reproduce in one onboarding session.
- 18 canonical permissions locked in `packages/contracts/src/permissions.ts` (created during P1).
- Memory in two places: `~/.claude/projects/C--work-FYP-khan-KPI-NEXUS-Final/memory/` (auto-loaded) and `memory/` (committed). Update both when changing.
