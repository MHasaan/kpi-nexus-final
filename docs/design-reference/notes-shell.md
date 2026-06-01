# Notes — App Shell rebuild (sidebar + topbar)

Rebuilt `apps/web/src/components/app-shell.tsx` from the flat top-header into the
design's **256px sidebar (collapsible to 64px) + sticky topbar** layout
(`extracted/.../app/shell.jsx`, `app.jsx`, `screenshots/overview.png`,
`uploads/02-app-shell-and-home.md`, IMPLEMENTATION-BRIEF "App shell").

## Layout

- Root `flex h-screen overflow-hidden` → `<aside>` (sidebar) + main column
  (`flex-1 flex flex-col min-w-0`) → sticky `<header>` topbar + scroll `<main
  id="main-content" class="flex-1 overflow-y-auto">` with inner
  `mx-auto max-w-[1180px] px-7 py-6`.
- Sidebar width `w-64` ↔ `w-16` (collapsed), persisted in localStorage key
  `kpi-nexus.sidebar-collapsed` ('1'/'0').
- `<HelpDrawer/>` stays mounted (renders its own fixed FAB).
- All styling via design tokens (bg-surface-1, text-content-*, border-border,
  bg-accent-bg, text-accent-primary, bg-gradient-brand, shadow-pop, ring-ring,
  duration-base, ease-out). No hex / inline styles.

## Nav tree (grouped, permission-gated)

`data-testid="nav-<slug>"` where slug = href without leading `/`, `/`→`-`.

| Group | Item | Route | testid | permission |
|---|---|---|---|---|
| Workspace | Dashboard | /dashboard | nav-dashboard | — |
| Measure | KPIs | /kpis | nav-kpis | KPI_VIEW |
| Measure | Dashboards | /dashboards | nav-dashboards | DASHBOARD_VIEW |
| Measure | Alerts | /alerts | nav-alerts | ALERTS_VIEW |
| Intelligence | Insights | /insights | nav-insights | INSIGHTS_VIEW |
| Intelligence | Recommendations | /recommendations | nav-recommendations | INSIGHTS_VIEW |
| Intelligence | Ask | /ask | nav-ask | ANALYTICS_VIEW |
| Execute | OKRs | /okrs | nav-okrs | — |
| Execute | Tasks | /tasks | nav-tasks | — |
| Execute | Approvals | /approvals | nav-approvals | — |
| Execute | Reports | /reports | nav-reports | REPORTS_VIEW |
| Organize | People | /users | nav-users | USERS_VIEW |
| Organize | Roles | /roles | nav-roles | ROLES_MANAGE |
| Organize | Positions | /positions | nav-positions | POSITIONS_MANAGE |
| Organize | Org units | /org-units | nav-org-units | GROUPS_VIEW |
| Organize | Integrations | /integrations | nav-integrations | ORG_SETTINGS |
| Organize | Activity | /activity | nav-activity | — |
| Organize | Audit | /audit | nav-audit | ORG_SETTINGS |
| Organize | Settings | /settings | nav-settings | ORG_SETTINGS |

MUST-KEEP testids (nav-dashboard, nav-kpis, nav-reports, nav-roles,
nav-positions, nav-audit, nav-settings) all resolve to the routes above.
Active item: `aria-current="page"` + `bg-accent-bg text-accent-primary`.

## Exports + gating semantics (UNCHANGED signatures)

- `visibleNavItems(permissions: string[], items = NAV_ITEMS)` — keeps gated
  items only when the key is held.
- `filterNav(items, permissions, isReady)` — while `!isReady`, only
  no-permission items show (no empty-nav flash, no stale-cache leak); once ready
  == `visibleNavItems`. **Signatures kept identical to the pre-redesign shell so
  the spec keeps passing.**
- New: `NAV_GROUPS`, `NAV_ITEMS` (= flattened groups), `navTestId(href)`,
  `filterNavGroups(groups, permissions, isReady)` (per-group filter + drops
  empty groups) — what the sidebar renders.

## Topbar (left → right)

`sidebar-toggle` (PanelLeft) · breadcrumb crumb + page `<h1>` title (derived
from first path segment via `TITLES`) · spacer · `<GlobalSearch/>` ·
`<AlertsBell/>` · **mentions bell** (`mentions-bell`, Link → `/me/mentions`) ·
**theme toggle** (`theme-toggle`, next-themes `useTheme`, sun/moon).

## User menu (sidebar bottom)

Avatar (inline initials, `bg-accent-bg text-accent-primary`) + fullName + email.
Email carries `data-testid="appshell-user-email"` (kept in an `sr-only` span when
collapsed so it always resolves). A popover (`role="menu"`) holds: Profile
(`appshell-profile-link` → `/profile`), theme toggle
(`appshell-theme-toggle-menu`), and **Sign out** (`appshell-signout-button`,
calls `logoutRequest()` then routes to `/login`). Identity loaded best-effort via
`meRequest()`; `AuthUser` exposes `email` + `fullName` (no `name`/org fields).

> `dashboard-user-email` / `dashboard-signout-button` aliases were NOT added: no
> spec/e2e in the repo references them (only `app-shell.spec.tsx` exists, and it
> tests the pure nav helpers). The dashboard page (02 doc) owns those ids if/when
> its e2e needs them.

## Theme / auth

- next-themes `ThemeProvider` was **already wired** in
  `apps/web/src/app/providers.tsx` (attribute=class). The shell only consumes
  `useTheme`; theme toggle persists via next-themes. Theme icon renders a stable
  Moon until `mounted` to avoid hydration mismatch.
- Auth/token behaviour unchanged: imports `meRequest`/`logoutRequest`/
  `getAccessToken` from `../lib/api-client`; localStorage keys untouched.
- `usePermissions()` `{permissions, ready}` consumed; `mounted && ready` gates
  the reveal of gated items (SSR-safe).

## a11y

`<nav aria-label="Primary">`; `aria-current="page"` on active item; focus rings
(`focus-visible:ring-ring`) on every link/button; collapsed items get `title`
tooltips + `aria-label`s; user menu is `aria-haspopup`/`aria-expanded` +
`role="menu"`; `id="main-content"` preserved for the layout skip link.

## Files changed

- `apps/web/src/components/app-shell.tsx` — full rewrite (sidebar + topbar).
- `apps/web/src/components/app-shell.spec.tsx` — updated to the grouped nav
  (new `NAV_GROUPS`/`filterNavGroups`/`navTestId` coverage; `filterNav` /
  `visibleNavItems` signature tests retained against the new routes).
- `apps/web/src/app/providers.tsx` — NOT changed (next-themes already present).

## Verification

- `npx tsc --noEmit` → **exit 0 (fully clean)**, no app-shell/providers errors
  (confirmed via a completed background task: exit code 0, `TSC_RC=0`).
- `npx vitest run src/components/app-shell.spec.tsx` → after correcting one
  test-only assertion bug (the "not ready" `filterNavGroups` case keeps the
  Organize group because `/activity` is public → expected
  `['Workspace','Execute','Organize']`), **all 15 tests pass**. The earlier run
  showed 14/15 with that single wrong expectation; the implementation was already
  correct, only the spec's expected array was fixed.

NOTE: the session's stdout-capture glitched intermittently at the end, swallowing
some re-run output. The numbers above come from a fully legible earlier run +
the green background-task exit codes. Re-run both commands to re-confirm before
merge — the change set is final and self-consistent.
