# Notes: Dashboard home + public landing

Faithful recreation of the design (`extracted/.../app/views.jsx` DashboardView +
SetupChecklist + PageHead + StatTile + Delta, `uploads/02-app-shell-and-home.md`,
`screenshots/overview.png`) using ONLY tokenized primitives + the real data wiring.

## Files

- `apps/web/src/app/dashboard/page.tsx` — REWRITTEN inside the app shell.
  - Greeting header (inline markup so `data-testid="dashboard-heading"` lives on the
    `<h1>`): "Good {morning/afternoon/evening}, {firstName}" + sub "{weekday, mon day} ·
    org health at a glance". Actions: static "Last 30 days" `Button` (Calendar icon in
    children) + `<PermissionGuard permission="KPI_CREATE">` "New KPI" link → `/kpis`
    (`dashboard-new-kpi`).
  - 4 StatTiles (`data-testid="dashboard-summary-grid"`, `.kn-stagger`): Total KPIs /
    On track / At risk / Avg attainment — all DERIVED from the summary rows.
  - Grid `lg:grid-cols-[1.7fr_1fr]`: LEFT "KPIs to watch" Card (up to 5 rows: name +
    ScopeBadge + quadrant, mini Sparkline, value, Delta vs target, StatusBadge), each row
    links to `/kpis/:id`. RIGHT rail: reused `SetupChecklistCard` + "Recent activity" Card
    (Avatar + who/what/obj/when).
  - `<OnboardingTour/>` kept mounted (when ready). 4 states: Skeletons (loading),
    EmptyState wrapped in `data-testid="dashboard-empty"` (no KPIs), error banner
    (`data-testid="dashboard-error"`, role=alert, `text-status-critical` /
    `bg-status-critical-bg`), success. Auth redirect to `/login` when no token; 401 clears
    tokens + redirects.
  - Preserved testids: `dashboard-heading`, `dashboard-summary-grid`, `dashboard-empty`,
    `dashboard-error`, plus existing `dashboard-new-kpi`, `dashboard-card-<name>`,
    `dashboard-card-value-<name>`, `dashboard-card-empty-<name>`.

- `apps/web/src/app/page.tsx` — public landing (NO shell) LEFT AS-IS: it already
  satisfies the brief (gradient-brand wordmark + "KPI Nexus", tagline "Measure what
  matters.", "Sign in" → `/login`, "Create organization" → `/signup` with
  `data-testid="home-guided-setup"`, client redirect to `/dashboard` when a token exists).
  Uses valid tokens (`bg-gradient-brand`, `bg-accent-primary`, etc.) + Button-like links.

## Data wiring (unchanged — uses api-client directly; NO dashboard-client, NO TerminologyProvider)

- `meRequest()` → `{ user: AuthUser }` (`fullName`, `email`, `permissions`). There is NO
  org name or terminology on this payload, so the subtitle uses date + a static phrase
  (org name is shown by the AppShell topbar/org switcher, not here). NOTE: `dashboard-client.ts`,
  `TerminologyProvider`, and `firstName`/org fields named in the brief DO NOT EXIST in this
  repo — the page uses the real `getDashboardSummary` + `AuthUser.fullName`.
- `getDashboardSummary()` → `DashboardSummaryRow[]`. Real fields ONLY: `kpiId, name,
  scope, unit, targetValue, latestValue, latestRecordedAt, aggregatedValue, pointCount,
  scorecardQuadrant`. (No server `status`, `delta`, `category`, or `spark` — all derived.)
- `SetupChecklistCard` self-fetches `/setup-checklist`.

## Status derivation

`deriveStatus(row)`: `latestValue/targetValue` ratio — ≥0.95 on-track, ≥0.8 at-risk, else
off-track; null value or null/0 target → no-data. `StatusBadge` renders icon + label
(never colour-only). Numbers use tabular-nums (StatTile / Delta / value cell).

## Endpoints

- `GET /auth/me` (meRequest)
- `GET /kpis/dashboard-summary` (getDashboardSummary)
- `GET /setup-checklist` (+ `/setup-checklist/:key/{complete,dismiss,reset}` via the card)

## Typecheck

`cd apps/web && npx tsc --noEmit` → **RC=0, ZERO errors** (confirmed; tsc emits no output
on success). Three initial errors in `dashboard/page.tsx` were found and fixed:
1. `AppShell` accepts ONLY `{ children }` (no `title`/`crumbs`, despite the brief). The
   shell derives the page title + breadcrumb from the route via its internal `TITLES` map
   (`dashboard → { title: 'Dashboard', crumb: 'Home' }`), so a bare `<AppShell>` already
   renders "Dashboard / Home" — reverted to `<AppShell>`.
2. `StatusBadge` has no `size` prop — removed `size="sm"`.
3. `Delta`'s `pct` is a `number`, not a boolean flag — pass `pct={Math.round(pct - 100)}`.

All imports used (`Avatar`, `Button`, `Delta`, `StatusBadge`, `Sparkline`, `KpiStatus`,
`ScopeBadge`, `StatTile`) exist in the `components/ui` / `components/charts` barrels.

## TODO / follow-ups

- DashboardSummaryRow has no real trend series, so the per-row Sparkline uses a 2-point
  `[aggregatedValue, latestValue]` (flat `[0,0]` when absent). Wire a real sparkline series
  when the summary endpoint exposes one (cf. EmbedKpiSnapshot.sparkline shape).
- StatTile deltas are intentionally omitted (no prior-period delta in the payload). The
  design shows delta arrows on tiles — add when the API returns period-over-period change.
- "Recent activity" rail uses a static `RECENT_ACTIVITY` seed; no activity feed is exposed
  to the dashboard. Replace with a real feed (the `/activity` page exists separately).
- Subtitle omits org name (not on the /auth/me payload). Fold it in if an org-name source
  is added to the dashboard data, to match the prototype copy exactly.
- `.kn-stagger` is a decorative animation hook; layout fidelity does not depend on it.
- The brief asked to set `<AppShell title="Dashboard" crumbs={['Home']}>` — the current
  AppShell does not accept those props (it auto-derives them). If per-page title/crumb
  overrides are wanted, extend `AppShellProps` with optional `title`/`crumbs` first.
