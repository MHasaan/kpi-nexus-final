# Claude Code Context — KPI Nexus Final

If you're a Claude (or other AI) session starting work in this repo, read this first.

## What this project is

Production-grade multi-tenant SaaS for KPI tracking — see [README.md](./README.md) for product overview and [docs/superpowers/specs/2026-05-25-kpi-nexus-final-design.md](./docs/superpowers/specs/2026-05-25-kpi-nexus-final-design.md) for the locked design spec.

## How this project plans work

Work is broken into **10 phases (P0–P9)**, each with its own detailed plan in `docs/superpowers/plans/`. Each phase is shippable on its own. Phase order matters — earlier phases unlock later ones.

| Phase | Location | What it builds |
|---|---|---|
| P0 | `docs/superpowers/plans/P0-foundation.md` | Repo scaffold + CI + docker-compose + empty apps |
| P1 | `docs/superpowers/plans/P1-identity-tenancy-rbac.md` | Auth + tenancy + 18-permission RBAC + basic onboarding stub |
| P2 | `docs/superpowers/plans/P2-kpi-engine.md` | KPI defs + formulas + cascades + targets + thresholds + TimescaleDB hypertable |
| P3 | `docs/superpowers/plans/P3-visualization.md` | Dashboards + widgets + SSE real-time + scheduled reports + public share + embeds |
| P4 | `docs/superpowers/plans/P4-alerting.md` | Alert rules + escalation + multi-channel notifications + dedup + digest + DLQ |
| P5 | `docs/superpowers/plans/P5-ai-layer.md` | Multi-provider AI + budget + NLQ + insights + recommendations + ML sidecar |
| P6 | `docs/superpowers/plans/P6-onboarding-v2.md` | 3-pane wizard + AI co-pilot + drafts + templates + setup checklist |
| P7 | `docs/superpowers/plans/P7-collaboration.md` | Tasks + comments + mentions + OKRs + approvals + rule engine |
| P8 | `docs/superpowers/plans/P8-integrations.md` | Slack/Teams/Jira + connectors + email-in + webhooks + API keys + plugins |
| P9 | `docs/superpowers/plans/P9-polish.md` | SSO + SCIM + custom domains + i18n + search + activity + a11y + perf |

The flat checklist across all phases is in [TODOS.md](./TODOS.md). The high-level navigation is in [ROADMAP.md](./ROADMAP.md).

## How to execute work

**Recommended workflow**:
1. Open `ROADMAP.md` — find the current phase
2. Open the phase's plan file in `docs/superpowers/plans/` — find the next unchecked task
3. Read the surrounding context (the task may have setup steps before it)
4. Use the `superpowers:executing-plans` skill OR `superpowers:subagent-driven-development` skill to actually do the work
5. Tick the task in the plan file AND in TODOS.md when done
6. Commit with a descriptive message

**Don't skip ahead** — phases are sequential. P2 depends on P1's auth and tenancy. P5's AI features call into KPI services built in P2. Skipping phases will create rework.

## Key decisions you should not re-litigate

These are locked in `docs/superpowers/specs/2026-05-25-kpi-nexus-final-design.md` Appendix A. Do NOT change without an ADR and user signoff:

1. Tech stack: NestJS + Next.js + Prisma + Postgres + TimescaleDB + pgvector + Redis + BullMQ + Python FastAPI ML
2. AI: Gemini default + multi-provider abstraction (Claude/OpenAI/Ollama)
3. Multi-tenancy: 3-layer defense (ALS context + Prisma filter + Postgres RLS)
4. 18 canonical permissions (locked enum)
5. KPI scope is first-class: ORG_WIDE / PER_UNIT / PER_USER
6. Default AI budget: $1/day, $30/month per org
7. Deployment: Vercel (web) + Fly.io (api/worker/ml/postgres) + Upstash (redis)
8. Local dev: docker-compose with all dependencies
9. Testing: Vitest + Playwright + Testcontainers; cross-tenant fuzz on every PR
10. Observability: Pino + OpenTelemetry + Sentry

If a phase plan contradicts the spec, the spec wins (and the plan should be updated).

## Conventions in this codebase

Once code starts landing (during P0+), conventions to follow:

### TypeScript

- **Strict mode** on everywhere (`"strict": true` + `noUncheckedIndexedAccess`)
- **No `any`** without an explicit comment explaining why
- **Branded types** for IDs where possible (`type OrganizationId = string & {__brand: 'OrganizationId'}`)
- **Zod schemas in `packages/contracts/`** are the source of truth; TS types are inferred via `z.infer`

### NestJS (`apps/api/`)

- One module per `apps/api/src/<domain>/<module>/` directory
- Each module has: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.spec.ts`
- Controllers use `@RequirePermissions(...)` decorators — never check permissions ad-hoc
- Services use `RequestContextStore.require()` for tenancy — never accept `organizationId` as a parameter
- Background work goes through BullMQ — never inline long operations in HTTP handlers
- Errors throw typed exceptions (`KpiNotFoundError extends NotFoundException`) — never raw `throw new Error()`

### Next.js (`apps/web/`)

- App Router only — no pages router
- Server Components by default — Client Components only when needed (interactivity, browser APIs)
- Data fetching via Server Actions OR API route proxies — never direct fetch to api from client component (loses cookie context)
- Forms use react-hook-form + Zod resolver pulling schema from `packages/contracts`
- Permission gating via `<PermissionGuard>` + `<RequirePermission>` components — never check `user.permissions.includes(...)` ad-hoc

### Prisma (`packages/db/`)

- Schema lives in `packages/db/prisma/schema.prisma`
- Migrations are append-only; rename via dual-write across 3 releases (never destructive)
- Every tenant-scoped model has `organizationId String` + `@@index([organizationId])` + RLS policy
- Every query in a service includes `where: { organizationId: ctx.organizationId, ... }` explicitly
- RLS policies in `packages/db/prisma/sql/rls-policies.sql` are defense in depth — don't rely on them as primary enforcement

### Testing

- **Unit tests** (`*.spec.ts`) next to source files; Vitest; ≥85% coverage on `apps/api/src/`
- **Integration tests** (`*.int-spec.ts`) for cross-module flows; Testcontainers for real Postgres+Redis
- **e2e tests** in `apps/web/e2e/`; one spec per use case (UC-01..UC-11) + happy-path
- **Cross-tenant fuzz** in `apps/api/test/cross-tenant.e2e.spec.ts`; parameterized over every endpoint × verb; runs in CI
- Before claiming a task complete, run the relevant tests AND verify exit criteria from the phase plan

### Git

- Branch per phase: `phase/p0-foundation`, `phase/p1-identity`, etc.
- Commit early and often within a phase; merge to main at phase boundaries
- Conventional commit format: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Never skip pre-commit hooks (lint, typecheck, test)
- Tag at phase completion: `git tag p0-complete`, `p1-complete`, etc.

### Skills to use

- **`superpowers:writing-plans`** if a phase plan needs to be expanded further before execution
- **`superpowers:executing-plans`** if executing a plan in a separate session with review checkpoints
- **`superpowers:subagent-driven-development`** if executing in the current session with parallel agents
- **`superpowers:test-driven-development`** when implementing features — write tests first
- **`superpowers:systematic-debugging`** when hitting bugs — don't propose fixes before understanding
- **`superpowers:verification-before-completion`** before claiming any task complete — run the tests, confirm output
- **`superpowers:requesting-code-review`** at phase boundaries before merging to main
- **`superpowers:dispatching-parallel-agents`** for genuinely independent task batches

## Per-user KPI handling (critical correctness invariant)

The current app had a bug where user A could see user B's recorded values. This must not recur. See spec §6 for the full pattern. In short:

- Every `KPI` has a `scope` enum: `ORG_WIDE | PER_UNIT | PER_USER`
- Data is recorded via scope-specific endpoints:
  - ORG_WIDE → `POST /kpis/:id/data`
  - PER_UNIT → `POST /org-units/kpi-assignments/:id/data`
  - PER_USER → `POST /user-kpis/my-kpis/:assignmentId/data`
- Posting to the wrong endpoint must return HTTP 422 with the correct endpoint name
- Visibility helpers (`buildKpiVisibilityWhere(ctx)`) filter list endpoints by scope + role:
  - Admin: all
  - Manager: ORG_WIDE + PER_UNIT (managed) + PER_USER (direct reports)
  - Individual: ORG_WIDE + PER_UNIT (member units) + PER_USER (self only)

P1 + P2 exit criteria include explicit tests for these invariants (12-case unit test for visibility helper, cross-user isolation test). DO NOT mark P2 complete without these passing.

## Permission enforcement (critical correctness invariant)

Permissions must be checked at every layer (endpoint, service, UI element). See spec §5 for the full model. In short:

- 18 canonical permissions (locked enum in `packages/contracts/src/permissions.ts`)
- Resolver order: `isAdmin` → `ResourcePermission` → role direct → role inherited → delegation → owner-override
- Backend: every endpoint gated by `@RequirePermissions(...)`; every list endpoint applies visibility filter
- Frontend: every route by `<RequirePermission>` or `<RequireAnyPermission>`; every action button by `<PermissionGuard>`; sidebar nav filtered

The frontend never trusts itself. The backend never trusts the frontend.

## When in doubt

- Read the design spec section relevant to what you're doing
- Read the phase plan for the phase you're in
- Check memory in `memory/` for relevant prior decisions
- Ask the user before changing anything in Appendix A of the spec

## Don't do

- Don't change locked decisions (Appendix A of spec) without ADR + user signoff
- Don't skip writing tests — phase exit criteria require specific tests
- Don't bypass `RequestContextStore` — every tenant-scoped query needs it
- Don't add features beyond what the phase plan calls for — scope creep kills timelines
- Don't claim a task complete without running its acceptance check
- Don't commit `.env` files or secrets
- Don't push to main directly during a phase — merge at boundaries

## Project memory

Persistent context for this project lives in `memory/` (and is mirrored from `~/.claude/projects/.../memory/`). Read it. Key files:

- `memory/project-kpi-nexus-final.md` — this project's status and decisions
- `memory/reference-original-app.md` — pointers to the original app at `C:\work\FYP\khan\KPI_NEXUS orignal\` for feature reference
- `memory/reference-seed-ts.md` — the depth gold standard the new onboarding must reproduce
