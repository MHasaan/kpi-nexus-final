# Enforcing the PEOPLE / ORG / ANALYTICS scopes (audit BE-004)

**Status:** approved by the user ("properly analyze and enforce it, make sure it works, properly test it"), 2026-10-09.

## Problem

Roles carry a per-domain scope ladder — `SELF ⊂ DIRECT_REPORTS ⊂ UNITS ⊂ ORG` — edited on `/roles` and in the Access Center. Seven domains enforce it (KPIs, dashboards, tasks, OKRs, reports, alerts, alert rules; insights via KPI visibility). **PEOPLE, ORG and ANALYTICS are saved and shown but nothing reads them**, so an admin who restricts them gets no restriction.

## Parity first

Today every member sees every user, every org unit, and runs analytics on any KPI they can see. The current non-admin defaults for these three domains are `UNITS` — but "cosmetic". Turning enforcement on with those defaults would narrow everyone at once (and API keys, which have no role, would see nobody).

**Decision:** the default for PEOPLE, ORG and ANALYTICS becomes `ORG`. Nothing changes until an admin sets a narrower scope on a role or user override. No Helios role sets these domains today (checked), so the demo is unchanged.

## Semantics

### PEOPLE — which people a principal can see
Same user-set as the other derived domains (`scopedUserIds`):

| Scope | Visible people |
|---|---|
| SELF | me |
| DIRECT_REPORTS | me + my reports (recursive) |
| UNITS | me + my reports + members of the units I belong to / manage |
| ORG | everyone |

### ORG — which org units a principal can see

| Scope | Visible units |
|---|---|
| SELF | units I belong to or manage |
| DIRECT_REPORTS | those + units my reports belong to |
| UNITS | units I belong to or manage + all their descendant units |
| ORG | all |

The tree renders out-of-scope parents as roots (`treeOrder`), so a partial tree still displays correctly.

### ANALYTICS — which KPIs a principal can run analytics on
Analytics (forecast, what-if, anomalies, seasonality) is per KPI and already requires the KPI to be visible under the KPIS scope. ANALYTICS adds a **ceiling**: the KPI must also be visible when the KPIS visibility rule is evaluated with the ANALYTICS scope. Effective = the narrower of the two. Example: KPIS = UNITS, ANALYTICS = SELF → the user can view their units' KPIs but forecast only their own.

## Enforcement points

Admins are always unrestricted. System paths (escalations, scheduled-report runs, notification fan-out, SCIM, offboarding internals, write-path existence checks such as "is this owner id in my org") stay unscoped.

**PEOPLE**
- `GET /users` — filtered to visible people.
- `GET /users/:id` — 404 when not visible (self is always visible, so the owner override keeps working).
- `GET /search` (people results) — filtered.
- `GET /user-kpis/user/:userId` — 404 when the target is not visible.
- `/users/:id/access-profile`, `/users/:id/access-override` (GET/PUT/DELETE), `offboard`, `suspend`, `reactivate`, `purge` — the target must be visible (a scoped `USERS_MANAGE` holder manages only people they can see).
- `GET /org-units/:id/members` — members filtered to visible people.

**ORG**
- `GET /org-units` — filtered; `GET /org-units/:id`, `/:id/members`, `/:id/name-history`, `/:id/kpis` — 404 when the unit is not visible.
- `GET /org-units/by-user/:userId/memberships` — only visible units.
- `GET /search` (unit results) — filtered.
- Writes (`GROUPS_MANAGE`: update, delete, rename, merge, split, move users, add/remove member, create under a parent) — the unit (and new parent) must be visible.

**ANALYTICS**
- `anomalies` (list/detect/confirm), `forecasts` (list/create), `whatif`, `seasonality` — 404 when the KPI is outside the ANALYTICS ceiling.

## Related fixes found during the analysis

- `GET /search` returned KPI and dashboard names outside the caller's KPIS / DASHBOARDS scope (gated only by `KPI_VIEW`). KPI results are now filtered by KPI visibility, dashboards by dashboard visibility.
- KPI benchmarks checked only the category allowlist, not KPI visibility — now uses `isKpiVisible`.
- Org-unit membership changes did not invalidate the 5-minute access caches, so newly enforced UNITS scopes would lag — membership / hierarchy writes now invalidate them.

## UI

- Role editor and Access Center show the effective default ("Default — whole org") instead of a bare "Default (inherit)".
- Pickers (task assignee, OKR owner, KPI owner, @mentions) list only visible people; a visible record owned by an invisible person shows the owner as "—" (existing fallback).

## Testing

- Unit: scope helpers (all four levels per domain, admin bypass), each enforced service (filter + 404 + write rejection).
- Integration (live API): one org with a unit tree and personas at each level — list counts, detail 404s, write rejections, admin immunity, ORG-default parity, cache invalidation after a membership change.
- Live check on the Helios seed: parity with no scope set; narrowing when a role sets them.
