# KPI Nexus Final — full audit (2026-10)

Report-only audit: problems are documented here with repro steps; **no product code is changed** during the audit. Fixes come afterwards, in batches, once the findings are reviewed.

| Part | Report | Status |
|---|---|---|
| Backend — API, worker, ML | [backend.md](./backend.md) | ✅ done — 25 findings: 2 Critical · 7 High · 8 Medium · 8 Low |
| Frontend — all 80 pages | [frontend.md](./frontend.md) | not started |
| Everything else — packages, infra, CI, security, docs | [other.md](./other.md) | not started |

## Conventions

**Finding IDs:** `BE-nnn` backend · `FE-nnn` frontend · `OT-nnn` other.

**Severity**

| Level | Meaning |
|---|---|
| Critical | Security hole, data loss/corruption, crash |
| High | Feature broken / unusable |
| Medium | Wrong behaviour, workaround exists |
| Low | Cosmetic, lint, test drift, docs |

Each finding lists: area · severity · summary · repro · expected vs actual · evidence · suspected location.

## Environment

- Branch `fix/full-audit` (from `feat/okrs-tasks-pages` @ `2971f87`)
- Local stack: Docker (Postgres 16 + TimescaleDB, Redis 7, MinIO, Mailhog, Jaeger), API :4000, web :3000, worker, ML :8000
- Data: seeded `helios` demo org (`SEED_ANCHOR` = current month); login `admin@helios.io` / `Password123!`

## Baseline (static checks)

| Check | Result |
|---|---|
| Typecheck (all packages) | ✅ pass |
| Lint | ❌ 12 errors (api 11, db 1) + 96 `sort-imports` warnings → OT-001 |
| Unit tests — api | ✅ 1364 / 1364 |
| Unit tests — web | ✅ 92 / 92 |
| Unit tests — ai / worker | ✅ 42 / 42 · 2 / 2 |
| Unit tests — contracts | ❌ 19 / 20 → OT-002 |
| ML pytest | ✅ 34 / 34 |

## Re-running the audit tooling

```bash
node scripts/audit/api-routes.mjs                              # static route inventory → api-routes.json
node --env-file=.env scripts/audit/api-sweep.mjs               # live GET sweep, 5 personas → api-sweep.json
node --env-file=.env scripts/audit/api-crud.mjs [domain ...]   # write-side cycles in 2 disposable orgs → api-crud.json
node --env-file=apps/ml/.env scripts/audit/ml-probe.mjs        # ML sidecar edge cases + HMAC → ml-probe.json
```

The sweep and CRUD scripts need the stack running and `helios` seeded. The CRUD script registers two new `audit-*` orgs per run (never touches `helios`). Response excerpts are secret-redacted before being written.

## Summary

_Filled in at the end of the audit._
