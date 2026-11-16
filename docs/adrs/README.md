# Architecture decision records

| ADR | Date | Decision |
|---|---|---|
| [ADR-001](./ADR-001-free-tier-hosting.md) | 2026-11-11 | Free-tier hosting: Vercel Hobby + one Oracle Cloud Always Free VM (replaces Fly.io + Upstash) |

## The other "ADR-001"

An earlier decision is also called **ADR-001**: the capability refinement of 2026-06-01, which added 7 permission keys (`KPI_IMPORT`, `REPORTS_MANAGE`, `ANALYTICS_FORECAST`, `EXPORTS`, `AUDIT_VIEW`, `INTEGRATIONS_MANAGE`, `BILLING_MANAGE`) to the 18 core keys, 25 in all. It lives in §5 of [the granular-access spec](../superpowers/specs/2026-06-01-granular-access-control-design.md), not in this folder.

Code comments that say "ADR-001" next to permission keys (`packages/contracts`, default roles, the role editor, app-shell tests) mean that capability refinement, not hosting. The next ADR in this folder is ADR-002.
