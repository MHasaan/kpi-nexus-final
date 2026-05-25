# 🚀 Next Session — Start Here

**You are opening the KPI Nexus Final project. Planning is complete; coding has not started.**

## In 30 seconds

1. **The plan is done.** Design spec + 10 phase plans + framework docs are all committed.
2. **Nothing is coded yet.** No `apps/`, no `packages/`, no `docker-compose.yml`.
3. **Next thing to do**: execute **P0 (Foundation)** — about 2 weeks.

## Read these in order (≈10 min total)

1. **`README.md`** — what this project is, stack, repo layout
2. **`CLAUDE.md`** — conventions + locked decisions you must NOT re-litigate
3. **`ROADMAP.md`** — phase-by-phase status table
4. **`docs/superpowers/plans/P0-foundation.md`** — the 17 tasks that scaffold everything

## To begin executing

```bash
# 1. You're in the project root (cd C:\work\FYP\khan\KPI_NEXUS_Final)
# 2. The plan is at docs/superpowers/plans/P0-foundation.md
# 3. Recommended workflow:
#    - Tell Claude: "Let's execute P0 using the executing-plans skill"
#    - Or: "Use subagent-driven-development to parallelize the independent tasks in P0"
# 4. Tick tasks in TODOS.md as work lands
# 5. At end of P0: run acceptance checklist + git tag p0-complete
```

## If you want to do something other than P0

- **Re-read the spec**: `docs/superpowers/specs/2026-05-25-kpi-nexus-final-design.md`
- **Modify the plan**: edit the relevant phase plan in `docs/superpowers/plans/` + update `TODOS.md`
- **Add a new ADR** (architecture decision record) for any deviation from Appendix A of the spec: create `docs/adrs/NNNN-<title>.md`
- **Skip ahead** is discouraged — phases are sequential; P2 depends on P1's auth, P5 depends on P2's KPI engine, etc.

## Where memory + context lives

- **Auto-loaded** for any session in this directory: `~/.claude/projects/C--work-FYP-khan-KPI-NEXUS-Final/memory/`
- **Committed in repo**: `memory/` (mirrored from above for portability)

The auto-loaded memory's `MEMORY.md` index lists 4 files: project-kpi-nexus-final.md (status + locked decisions), reference-original-app.md (feature reference pointers), reference-seed-ts.md (P6 depth gold standard), resume_2026_05_25.md (this guide as memory).

## Git state

5 commits on `master` branch:

```
52beb9b docs(plans): add detailed plans for P7-P9
08e20f2 docs(plans): add detailed plans for P4-P6
e358979 docs(plans): add detailed plans for P1-P3
c3b5d49 docs(p0): add framework docs, project memory, and P0 implementation plan
ecdb603 docs: add design spec for ground-up rebuild
```

No remote configured. If you push to GitHub, run `git remote add origin <url>` first.

## Brainstorming session record (2026-05-25)

The decisions in `CLAUDE.md` + spec Appendix A came from a single brainstorming session on 2026-05-25. The user explicitly chose:
- Fresh design (over inheriting the prior rebuild attempt)
- Production-quality multi-tenant SaaS (over FYP demo / portfolio / personal learning)
- Gemini default + multi-provider abstraction (over Claude-only / OpenAI / Gemini-only)
- NestJS + TimescaleDB + Python ML sidecar (over lighter Hono + plain Postgres + TS-only ML)
- Maximum scope including enterprise features (over parity-only / parity+enhancements)

If the user pushes back on any of these now, treat it as a meaningful architectural shift and ask for confirmation before propagating changes through all 10 phase plans.

## Don't

- Don't start writing code without reading P0 first
- Don't change locked decisions (Appendix A of spec) without ADR + user signoff
- Don't skip phases — they're sequential and build on each other
- Don't trust your training memory of these decisions — the spec + memory files are authoritative
