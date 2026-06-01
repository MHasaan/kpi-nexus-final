# KPI Nexus — Frontend Requirement Docs (for the Claude Design session)

This folder specifies **every frontend page** of KPI Nexus so a design pass can rebuild
the UI properly without re-discovering behaviour. The backend, API contracts, and a
working (if visually plain) frontend already exist across phases P0–P9 (v1.0.0). These
docs describe **what each page must do and contain** — not how it currently looks.

> **Read this index first.** It defines the global conventions (app shell, design
> system, shared states, permissions, hard constraints) that every page doc assumes.
> Page docs only call out what is *specific* to that page.

## How to read a page doc

Each page is specified with a consistent template:

- **Route / access** — URL, auth requirement, permission gate, whether it uses the app shell
- **Purpose** — the job the page does for the user
- **Layout & components** — sections, key UI elements, hierarchy
- **Data / API** — endpoints the page reads/writes
- **States** — loading, empty, error, success (every page must handle all four)
- **Interactions** — actions, optimistic updates, confirmations, keyboard
- **Permission gating** — which routes/buttons are gated and by which permission
- **`data-testid`s to preserve** — see the hard constraint below
- **Design notes** — visual intent specific to the page

## Files in this folder

| File | Covers |
|---|---|
| [01-auth-and-onboarding.md](./01-auth-and-onboarding.md) | `/login`, `/register`, `/accept-invitation`, `/signup`, `/signup/wizard` |
| [02-app-shell-and-home.md](./02-app-shell-and-home.md) | Marketing `/`, role-adaptive `/dashboard`, sidebar, header, ⌘K search, alerts bell, setup checklist, tour |
| [03-kpis.md](./03-kpis.md) | `/kpis`, `/kpis/[id]` (tabs), categories, import, tree, scorecard, templates, archive |
| [04-kpi-analytics.md](./04-kpi-analytics.md) | `/kpis/[id]/anomalies`, `/forecast`, `/whatif`, `/embed` |
| [05-dashboards.md](./05-dashboards.md) | `/dashboards`, `/new`, `/[id]`, `/share`, `/snapshots`, widget drill-down |
| [06-alerts.md](./06-alerts.md) | `/alerts`, `/alerts/new`, `/alerts/[id]`, `/alerts/channels` |
| [07-ai.md](./07-ai.md) | `/insights`, `/recommendations`, `/ask` (NLQ chat) |
| [08-okrs-tasks-collaboration.md](./08-okrs-tasks-collaboration.md) | `/okrs`, `/okrs/[id]`, `/tasks`, `/approvals`, `/workflows`, `/activity`, `/me/mentions`, CommentsDrawer |
| [09-people-and-org.md](./09-people-and-org.md) | `/users`, `/users/[id]`, `/roles`, `/positions`, `/org-units`, `/team`, `/my-kpis`, `/profile` |
| [10-reports.md](./10-reports.md) | `/reports`, `/new`, `/[id]`, `/board-pack` |
| [11-integrations.md](./11-integrations.md) | `/integrations`, `/connectors`, `/connectors/[id]`, `/plugins` |
| [12-settings.md](./12-settings.md) | `/settings/*` (organization, ai, notifications, dlq, api-keys, webhooks, audit, retention, scim, sso) |
| [13-public-and-embeds.md](./13-public-and-embeds.md) | `/share/[token]`, `/embed/kpi/[token]` (public, no shell) |

---

## Global design system (locked token names, retunable values)

Tokens live in `packages/ui/src/tokens.css` as HSL CSS variables wired into Tailwind.
**Token names are locked** (per spec §12.3); only their values may be retuned. Light +
dark mode values exist for every token (`class` strategy, persisted to localStorage +
`prefers-color-scheme`).

- **Surfaces**: `surface-bg` (page) → `surface-1` (cards) → `surface-2` → `surface-hover` → `surface-pressed`
- **Content (text)**: `content-strong` (headings) → `content-default` (body) → `content-muted` (secondary) → `content-disabled`
- **Borders**: `border-default`, `border-strong`, `border-divider`
- **Accents**: `accent-primary` (brand/CTA, indigo-violet), `accent-secondary`
- **Status (semantic only)**: `status-success`, `status-warning`, `status-critical`, `status-info`, `status-neutral`
- **Charts**: `chart-1 … chart-12` (categorical, colorblind-safe, AA on `surface-bg`)
- **System**: `ring` (focus), `radius` (0.5rem), `font-sans` (Inter/Geist), `font-mono` (JetBrains/Geist Mono)

Tailwind utility classes already used across the app (keep these working):
`bg-surface-bg / bg-surface-1 / bg-surface-2`, `text-content-strong / -default / -muted`,
`border-border`, `bg-accent-primary`, `text-status-positive|warning|critical`.
(Note: some pages use `text-status-positive`; align to the `status-success` token —
this is a known minor alias to normalize during the design pass.)

### Aesthetic (spec §12.1)

Modern minimal SaaS — **Linear / Vercel / Notion / Stripe Dashboard** class.
- Data-dense without cramped (lists/tables routinely show 10–100 rows)
- Calm by default, opinionated when it matters; neutral palette ~90% of the time
- Fast-feeling: skeletons for waits >300ms, optimistic UI, motion ≤200ms ease-out, **no spinners under 300ms**
- Keyboard-first: every action has a shortcut; ⌘K command palette
- Trust signals everywhere: "last updated by X", audit timestamps, AI confidence/cost indicators
- **Status is never communicated by color alone** — always pair an icon or text label.

### Typography & spacing (spec §12.4–12.5)

- Sans Inter/Geist; mono JetBrains/Geist Mono; modular scale 1.25 (text-xs 12 → text-4xl 36)
- **Tabular numerals on all numbers**; heading line-height 1.2, body 1.5
- 8px base grid (4px for tight inline); page max-width `max-w-7xl` (1280px); full-width for dashboards/tables
- Sidebar 256px expanded / 64px collapsed; mobile sheet drawer < 768px
- User-toggleable **comfortable vs compact** density
- Card: `rounded-lg`, subtle border + light shadow (never both heavy)

### Component library (spec §12.6)

Build on **shadcn/ui + Radix** wrapped with our tokens (customize, don't copy).
Primitives (Button 5×4, Input/Select/Combobox/DatePicker/DateRangePicker, Checkbox/Radio/Switch,
Card, Badge, Avatar, Tooltip/Popover/DropdownMenu, Dialog/Sheet/Drawer/AlertDialog, Tabs/Accordion,
Toast (Sonner), Skeleton, Progress, Breadcrumb, Pagination, Command). Composite (DataTable via TanStack,
Form via react-hook-form + Zod, KpiCard, StatTile, Sparkline/MetricChart, Stepper, PermissionMatrix,
TreeView, KanbanBoard, CommentThread, DiffPreview, EmptyState, ErrorBoundary, AsyncBoundary).
Charts (Recharts wrappers, theme-aware, **ARIA-described, keyboard-navigable**): Line/Bar/Area/Pie/Gauge/Scatter/Radar/Heatmap, plus a **forecast variant** (yhat + confidence bands) and **anomaly variant** (markers + tooltips).

---

## App shell (applies to every authenticated page)

Today most pages render their own minimal header (`<Link>KPI Nexus</Link>` + page name).
**The design pass should introduce a single persistent app shell** and slot existing pages into it:

- **AppSidebar** (256px / 64px collapsed; mobile = sheet drawer): primary nav, **permission-filtered**
  (hide items the user lacks permission for), org switcher, platform-admin **impersonation banner**
  when active, user menu (profile, theme toggle, sign out). Nav groups: Home, KPIs, Dashboards, Alerts,
  AI (Insights/Recommendations/Ask), OKRs, Tasks, Approvals, Reports, People & Org, Integrations, Settings, Activity.
- **AppHeader**: page title + breadcrumb, **global ⌘K search** (already built — see 02), **alerts bell**
  with unread badge (built), **mentions bell** (built, `/me/mentions`), theme toggle.
- **CommandPalette (⌘K)**: fuzzy global search across KPIs/Dashboards/Users/Units (built — `global-search.tsx`).
- Auth pages, `/signup*`, `/share/[token]`, `/embed/*` render **without** the shell.

---

## Shared behaviours every page must implement

- **Auth redirect**: unauthenticated access to a shell page → redirect to `/login` (pages read the access token from `localStorage` key `kpi-nexus.access-token`).
- **Loading**: skeleton matching the final layout for waits >300ms; inline button spinner on submit; optional top progress bar.
- **Empty**: a dedicated EmptyState (icon + one-line explanation + primary CTA) — never a blank page. Each list page already has an `*-empty` testid.
- **Error**: inline error banner (`role="alert"`, `text-status-critical`) carrying the API message; never a silent failure. Each page has an `*-error` testid.
- **Optimistic UI**: status toggles, kanban moves, archive/restore flip immediately and roll back on failure (with a toast).
- **Confirmations**: destructive/irreversible actions use an AlertDialog with an explicit verb ("Delete 3 KPIs permanently"); type-to-confirm for purges.
- **Toasts** (Sonner): success/failure feedback for mutations that don't navigate.

## Permission & visibility (FE contract — spec §12.8)

- `<RequirePermission permission="X">` hard-guards a route (redirect to an unauthorized state); `<RequireAnyPermission>` for or-guards.
- `<PermissionGuard permission="X" fallback={null}>` soft-hides an action; disabled controls show a tooltip explaining the missing permission.
- **Sidebar items and action buttons are permission-filtered.** The frontend never trusts itself; the backend re-checks. The 18 canonical permissions: `KPI_VIEW/CREATE/EDIT/DELETE/DATA_ENTRY`, `DASHBOARD_VIEW/MANAGE`, `USERS_VIEW/MANAGE`, `ROLES_MANAGE`, `POSITIONS_MANAGE`, `GROUPS_VIEW/MANAGE`, `ALERTS_VIEW`, `REPORTS_VIEW`, `ANALYTICS_VIEW`, `INSIGHTS_VIEW`, `ORG_SETTINGS`.
- **List visibility mirrors the backend**: pages render only what the API returned (no client-side filtering of data the user shouldn't have received).

### PER_USER KPI patterns (FE contract — spec §12.9)

- KPI detail with `scope=PER_USER` + non-admin viewer → show **only the viewer's own data**; record via `POST /user-kpis/my-kpis/:assignmentId/data`.
- `/my-kpis` lists the viewer's PER_USER assignments with inline value entry.
- `/team` shows direct reports' PER_USER KPIs side-by-side (managers).
- `/users/[id]` shows that user's PER_USER assignments + trends.
- Data entry posts to the **scope-correct endpoint**; posting to the wrong one returns 422 with the correct endpoint named — surface that as a helpful inline error.

## Data / API conventions

- All calls go through `apps/web/src/lib/api-client.ts` `api(path, { method, body, auth })`; tokens auto-attached from localStorage. Domain helper modules: `lib/collab-client.ts` (P7), `lib/integrations-client.ts` (P8), `lib/polish-client.ts` (P9), `lib/onboarding-client.ts` (P6, public + `X-Draft-Token`).
- Errors surface as `ApiError { status, code, message, details }` — render `message`; use `code`/`details` for field-level mapping where relevant.
- The API base URL is `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`).

## Internationalization (P9)

- `LocaleProvider` (`src/i18n/locale-provider.tsx`) exposes `useTranslations().t(key)` + `setLocale`; flips `<html dir>` to `rtl` for `ur-PK` and syncs `<html lang>`. Locales: `en-US`, `es`, `fr`, `ur-PK` (only `/profile` PoC strings translated so far).
- **Design must be RTL-safe**: use logical properties (start/end), mirror layouts under `dir=rtl`, keep numerals tabular. The locale picker lives on `/profile`.

## Accessibility (spec §12, P9)

- WCAG 2.1 AA: 4.5:1 body / 3:1 UI contrast. Target **0 axe-core violations** on the top 10 routes.
- Skip-to-content link exists in the root layout (keep it). Every interactive element keyboard-reachable; visible focus ring (`ring` token); ESC closes overlays.
- Charts: `role="img"` + a generated summary `aria-label` (the `series-chart.tsx` / `summariseAria()` pattern); never color-only encodings.
- `<html lang>` matches the active locale.

---

## ⚠️ HARD CONSTRAINTS (do not break)

1. **Preserve every `data-testid`.** The Playwright e2e suites (UC specs + per-phase specs across P2–P9) select elements by `data-testid`. Each page doc lists the testids it must keep. You may restyle, restructure, and rename components freely — but the same testids must remain on semantically equivalent elements, or the e2e suite breaks. If a redesign genuinely removes an element, update the corresponding spec in the same change.
2. **Keep the token class names** (`bg-surface-*`, `text-content-*`, `border-border`, `text-status-*`, `bg-accent-primary`). Retune values in `tokens.css`, not the class names.
3. **Keep auth/token behaviour**: localStorage keys `kpi-nexus.access-token` / `kpi-nexus.refresh-token`; onboarding uses `X-Draft-Token` (no bearer).
4. **Keep API request shapes** — these pages talk to a locked backend; don't change endpoints or payloads to suit the UI.
5. **Permission gating is mandatory**, not decorative — never show an action the backend will 403.
