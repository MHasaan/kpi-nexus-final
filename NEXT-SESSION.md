# Next Session — Start Here

**KPI Nexus Final is built: all ten phases (P0–P9) are implemented and tagged `v1.0.0`.** Current work is fixing the findings of the October 2026 full audit on branch `fix/full-audit`.

## In 30 seconds

1. **Status of what is broken or open:** [`docs/audit/README.md`](./docs/audit/README.md) — findings table, suggested batches, and the fix log (finding → commit → regression test). Details per area in `docs/audit/backend.md`, `frontend.md`, `other.md`.
2. **What the product is and how the repo is laid out:** [`README.md`](./README.md).
3. **Conventions and locked decisions you must not re-litigate:** [`CLAUDE.md`](./CLAUDE.md).
4. **Phase history:** [`ROADMAP.md`](./ROADMAP.md). `TODOS.md` checkboxes predate v1.0.0 and are stale — trust its status banner.

## Running it locally

```bash
pnpm install
pnpm docker:up      # Postgres/TimescaleDB, Redis, MailHog, MinIO, Jaeger
pnpm db:setup
pnpm dev
```

E2E in CI mode needs the API started with `AI_MOCK=1` and `AI_MOCK_RESPONSE` set from `apps/api/test/fixtures/ai-mock-response.json` (see `.github/workflows/ci.yml`). ML sidecar tests: `apps/ml/.venv/Scripts/python.exe -m pytest` from `apps/ml`.

## Where memory + context lives

- **Auto-loaded** for any session in this directory: `~/.claude/projects/C--work-FYP-khan-KPI-NEXUS-Final/memory/` (index: `MEMORY.md`).

## Brainstorming session record (2026-05-25)

The decisions in `CLAUDE.md` + spec Appendix A came from a single brainstorming session on 2026-05-25. The user explicitly chose:
- Fresh design (over inheriting the prior rebuild attempt)
- Production-quality multi-tenant SaaS (over FYP demo / portfolio / personal learning)
- Gemini default + multi-provider abstraction (over Claude-only / OpenAI / Gemini-only)
- NestJS + TimescaleDB + Python ML sidecar (over lighter Hono + plain Postgres + TS-only ML)
- Maximum scope including enterprise features (over parity-only / parity+enhancements)

If the user pushes back on any of these, treat it as a meaningful architectural shift and ask for confirmation before propagating changes.

## Don't

- Don't change locked decisions (Appendix A of spec) without ADR + user signoff
- Don't mark an audit finding fixed without a regression test and a live check — record it in the fix log
- Don't trust your training memory of these decisions — the spec, audit docs and memory files are authoritative
