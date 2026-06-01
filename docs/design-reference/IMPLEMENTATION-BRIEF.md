# KPI Nexus — Frontend Design Implementation Brief (authoritative)

Written by the lead session after reading the design bundle + repo firsthand. Subagents:
**read this top-to-bottom before touching code.** Paths are absolute-ish from repo root
`C:/work/FYP/khan/KPI_NEXUS_Final`. Branch: `feat/frontend-design`.

## What we're doing
The backend (P0–P9, v1.0.0) is done. The frontend exists but is visually plain. A Claude
Design session produced a full UI kit; we are recreating it faithfully in our Next.js 15
App Router + Tailwind stack. **Match the design's visual output; do NOT copy the prototype's
inline-style internals** — translate to our tokens + Tailwind classes + reusable components.

## Design source of truth (READ THESE)
Under `docs/design-reference/extracted/kpi-nexus/`:
- `project/uploads/README.md` — **master FE spec** (design system, app shell, shared behaviours,
  permissions, PER_USER patterns, ⚠️ HARD CONSTRAINTS). Read fully.
- `project/uploads/01..13-*.md` — per-area page specs (what each page must do/contain + its testids).
- `project/app/tokens.css` — final retuned tokens (already ported to repo — see Foundation below).
- `project/app/lib.jsx` — primitive + chart vocabulary (Button, StatusBadge, ScopeBadge, Card,
  Sparkline, LineChart, BarChart) + STATUS_META/SCOPE_META + sample data + NAV groups.
- `project/app/shell.jsx` — Sidebar (256/64 collapsed) + Header (breadcrumb, ⌘K search, bell,
  mentions, theme) + CommandPalette.
- `project/app/views.jsx` — Dashboard home, KPIs list, KPI detail (10 tabs), Dashboards, Ask, StubView.
- `project/app/views-intel.jsx` (insights/AI), `views-execute.jsx` (okrs/tasks/approvals/reports),
  `views-org.jsx` (people&org), `views-kpitabs.jsx` (KPI detail tabs), `views-collab.jsx`
  (comments/mentions/activity), `views-extras.jsx` (alerts/integrations/settings), `auth.jsx`, `public.jsx`.
- `project/screenshots/*.png` — `overview.png` (dashboard home), `forecast-full.png`, auth, public-viewer/embed.

## Aesthetic (must achieve)
Linear/Vercel/Notion/Stripe-Dashboard class. Calm, data-dense, neutral ~90% of the time, accent
sky→azure used sparingly. Tabular numerals on ALL numbers. Status NEVER by color alone (icon+label).
Motion ≤200ms ease-out, no spinners <300ms (skeletons instead). Keyboard-first. Trust signals
("updated by X", timestamps, AI cost/model). Subtle border + light shadow (never both heavy).

## Foundation — ALREADY DONE by lead (do NOT redo; build on it)
Typecheck passed (exit 0) after these:
- `packages/ui/src/tokens.css` — retuned to sky/azure accent (`--accent-primary: 200 98% 39%`) +
  expanded to the full design token set: finished `--c-*` colors, tinted `--c-*-bg`, `--gradient-brand`,
  `--shadow-xs..pop/inset`, glass, `--radius-sm..2xl/full`, `--space-*`, full modular `--text-*` scale,
  weights, `--ease-*`, `--dur-*`. Light + dark. `--font-sans/--font-mono` reference next/font vars.
- `packages/ui/tailwind.preset.ts` — extended: `accent.bg`, `status.{success,warning,critical,info,
  neutral,positive,negative}` each with `.bg`, radii `sm/md/lg/xl/2xl/full`, `boxShadow xs/sm/md/lg/pop/inset`,
  `transitionTimingFunction out/in-out`, `transitionDuration fast/base/slow`, `backgroundImage
  gradient-brand(-soft)`. (`status-positive` now resolves — fixes the ~21 files using `text-status-positive`.)
- `apps/web/src/app/globals.css` — base body/scrollbar/selection + `@layer components` type roles
  (`.kn-h1/.kn-h2/.kn-h3/.kn-body/.kn-eyebrow/.kn-metric/.tnum` …) + motion utilities
  (`.kn-view/.kn-stagger/.kn-pop/.kn-pulse/.kn-card-hover/.kn-aura*`) + print rules.
- `apps/web/src/app/layout.tsx` — Inter + JetBrains_Mono via next/font (vars `--font-inter`,
  `--font-jetbrains-mono`) on `<html>`. Keep the skip-to-content link + Providers.

Available Tailwind classes now: `bg-surface-bg/1/2/hover/pressed`, `text-content-strong/DEFAULT/muted/
disabled`, `border-border/-strong/-divider`, `bg-accent-primary/secondary`, `bg-accent-bg`,
`text-status-{success,warning,critical,info,neutral,positive,negative}` + `bg-status-*-bg`,
`text-chart-1..12`, `rounded-sm/md/lg/xl/2xl/full`, `shadow-xs/sm/md/lg/pop`, `ring-ring`,
`font-sans/font-mono`, `bg-gradient-brand(-soft)`, `duration-fast/base/slow`, `ease-out`.
Use `cn()` (clsx + tailwind-merge — create `apps/web/src/lib/cn.ts` if missing; `cn.spec.ts` exists so a `cn` must exist).

## Deps already present (apps/web/package.json)
`lucide-react@0.460`, `clsx`, `tailwind-merge`, `recharts@3.8`, `react-grid-layout`, `next-themes`,
`next@15`, `react@18`. Icons = lucide-react (import the PascalCase icon, render as `<Icon className=…>`).

## ⚠️ HARD CONSTRAINTS (break = broken build/e2e)
1. **Preserve every `data-testid`** (319 in e2e). You may restyle/restructure/rename components, but
   the SAME testid must remain on a semantically-equivalent element. If you truly remove one, update its
   spec in the same change. Per-area testids are listed in each `uploads/NN-*.md`.
2. **Keep token CLASS names** (retune values in tokens.css, not class names — already done).
3. **Keep auth/token behaviour**: localStorage `kpi-nexus.access-token`/`-refresh-token`; onboarding `X-Draft-Token`.
4. **Keep API shapes** — locked backend; don't change endpoints/payloads. All calls via
   `apps/web/src/lib/api-client.ts` `request()`/helpers + domain clients (`collab-client`, `integrations-client`,
   `polish-client`, `onboarding-client`). Base `NEXT_PUBLIC_API_URL` default `http://localhost:4000`.
5. **Permission gating mandatory** — reuse `components/auth/{permission-guard,require-permission}.tsx`,
   `lib/{permissions,use-permissions}.ts`. Never show an action the backend will 403. The 18 keys are in
   `packages/contracts/src/permissions.ts` (KPI_VIEW/CREATE/EDIT/DELETE/DATA_ENTRY, DASHBOARD_VIEW/MANAGE,
   USERS_VIEW/MANAGE, ROLES_MANAGE, POSITIONS_MANAGE, GROUPS_VIEW/MANAGE, ALERTS_VIEW, REPORTS_VIEW,
   ANALYTICS_VIEW, INSIGHTS_VIEW, ORG_SETTINGS).
6. Every page handles all 4 states: loading (skeleton), empty (EmptyState + CTA, keep `*-empty` testid),
   error (role="alert", `text-status-critical`, keep `*-error` testid), success.
7. RTL-safe (logical props start/end), a11y (focus ring, ESC closes overlays, charts role=img + aria-label).

## Component plan

### Primitives → `apps/web/src/components/ui/` (Phase A — built once, then READ-ONLY for page agents)
Translate from `lib.jsx`/`views.jsx` to Tailwind+token components (typed, forwardRef where useful, `cn()`):
- `cn.ts` (in lib/) if missing — `export const cn = (...a)=>twMerge(clsx(a))`.
- `button.tsx` — variants primary|secondary|ghost|danger, sizes sm(28)|md(36)|lg(44), `icon`/`iconRight`
  (lucide), `loading`, `full`. Primary = `bg-accent-primary text-white shadow-sm` + hover brightness;
  secondary = surface-bg + border-strong; ghost = transparent + hover surface-hover.
- `card.tsx` — `Card` (bg-surface-bg, border-border, rounded-xl, shadow-sm; `hover`→`.kn-card-hover`),
  + `CardHeader/CardTitle/CardContent/CardFooter` (header = px-4 py-3.5 border-b border-divider, title 14/600).
- `badge.tsx` — generic Badge (neutral/info/etc tinted) +:
- `status-badge.tsx` — `StatusBadge` for KPI status: on-track(check/success), at-risk(triangle-alert/warning),
  off-track(circle-alert/critical), no-data(minus/muted). pill, icon+label, sizes sm|md. (mirror STATUS_META)
- `scope-badge.tsx` — `ScopeBadge` mono pill: ORG_WIDE(accent), PER_UNIT(chart-10), PER_USER(chart-7/pink).
- `delta.tsx` — `Delta {value, up, good}`: arrow-up-right/arrow-down-right + abs%; green if good else red; 0→“—”. tabular.
- `metric.tsx` / `stat-tile.tsx` — `StatTile {label, value, delta, up, good, spark, color}`: uppercase eyebrow
  label + Delta on top row, big `.kn-metric`(28/600 tabular) value, fluid Sparkline beneath. Card hover.
- `page-header.tsx` — `PageHeader {title, sub, children(actions)}` (h1 24/700 tracking-tight + muted sub + right actions).
- `input.tsx`,`select.tsx`,`textarea.tsx`,`label.tsx` — h-9, rounded-md, border-border, focus ring-ring; placeholder muted.
- `table.tsx` — Table/THead/TBody/Tr/Th/Td — header bg-surface-1 uppercase 11/600 muted, rows border-t border-divider,
  hover bg-surface-1. (Many list pages use a grid “table”; provide both Table and a `DataRow` helper if helpful.)
- `tabs.tsx` — underline tabs (active = text-strong + 2px accent border-bottom).
- `avatar.tsx` — initials circle (chart color bg) + sizes.
- `empty-state.tsx` — `EmptyState {icon, title, description, action}` — centered, aura-soft icon tile (gradient-brand-soft).
- `skeleton.tsx` — `Skeleton` (bg-surface-2 animate-pulse rounded) + `SkeletonText`.
- `segmented.tsx` (optional) — segmented control (scope filter: All/ORG_WIDE/PER_UNIT/PER_USER) per views.jsx KpisView.
- charts → `apps/web/src/components/charts/`: `sparkline.tsx`, `line-chart.tsx`, `bar-chart.tsx` — port the SVG
  from lib.jsx (theme-aware via currentColor/hsl(var(--…))), each `role="img"` + aria-label. (recharts is also available
  if cleaner; the existing `series-chart.tsx` + widgets/* already use recharts — prefer matching those for consistency.)
- `index.ts` barrel re-exporting all of the above.
NOTE: an existing `components/widgets/*` (KpiCard, LineChartWidget, …) + `series-chart.tsx` already exist for dashboards —
do NOT duplicate widget behaviour; the ui/ primitives are the shared kit those can later adopt.

### App shell → rebuild `apps/web/src/components/app-shell.tsx` (Phase B)
Replace the top-header layout with the design's **sidebar + topbar** (from shell.jsx), as a flex row:
`<div class="flex h-screen overflow-hidden">` → `<Sidebar/>` + `<div class="flex-1 flex flex-col min-w-0">`
→ `<Topbar/>` + `<main id=… class="flex-1 overflow-y-auto">` with inner `max-w-[1180px] mx-auto px-7 py-6` + `<HelpDrawer/>`.
- **Sidebar (w-64; collapsible to w-16)**: brand tile (gradient-brand logo mark + “KPI Nexus” + org name + chevrons-up-down
  org switcher) ; grouped nav; bottom user block (avatar + name + email + ellipsis menu → Profile, theme toggle, Sign out).
  Active item = `bg-accent-bg text-accent-primary` (+ aria-current="page"); hover = `.kn-navitem`/surface-hover.
- **Grouped, permission-filtered nav** — REPLACE the flat NAV_ITEMS with grouped sections. Keep `filterNav`/
  `visibleNavItems` exports + their ready-gating semantics (the spec test relies on them; UPDATE `app-shell.spec.tsx`
  to the new structure — change is allowed). Each item keeps `data-testid="nav-<slug>"` (slug = path minus leading /,
  `/`→`-`; e.g. `/org-units`→`nav-org-units`, `/dashboard`→`nav-dashboard`). MUST keep these existing testids working:
  `nav-roles, nav-settings, nav-reports, nav-positions, nav-audit` (positions/audit may live under People/Settings sub-items
  or you can keep a flat fallback — but those exact testids must resolve to a link to that route). Groups (map to real routes):
    • (top) Dashboard `/dashboard`
    • MEASURE: KPIs `/kpis` (KPI_VIEW), Dashboards `/dashboards` (DASHBOARD_VIEW), Alerts `/alerts` (ALERTS_VIEW)
    • INTELLIGENCE: Insights `/insights` (INSIGHTS_VIEW), Recommendations `/recommendations` (INSIGHTS_VIEW), Ask `/ask` (ANALYTICS_VIEW)
    • EXECUTE: OKRs `/okrs`, Tasks `/tasks`, Approvals `/approvals`, Reports `/reports` (REPORTS_VIEW)
    • ORGANIZE: People `/users` (USERS_VIEW) [sub: Roles `/roles` ROLES_MANAGE, Positions `/positions` POSITIONS_MANAGE,
      Org units `/org-units` GROUPS_VIEW, Team `/team`], Integrations `/integrations` (ORG_SETTINGS),
      Activity `/activity`, Settings `/settings` (ORG_SETTINGS) [sub incl. Audit `/settings/audit`]
  Keep `/profile` reachable (user menu). Keep `appshell-user-email` + `appshell-signout-button` testids
  AND add `dashboard-user-email` + `dashboard-signout-button` aliases if the 02 doc / e2e need them (they're referenced).
- **Topbar (h-14 sticky, glass bg)**: sidebar toggle (panel-left), breadcrumb + page title (accept `title`/`crumbs`
  props with sensible defaults), then on the right reuse existing `<GlobalSearch/>` (⌘K — keep its trigger/modal testids),
  `<AlertsBell/>`, a mentions bell linking `/me/mentions`, and a theme toggle (next-themes `useTheme`; sun/moon).
- Keep `<HelpDrawer/>` mounted. Keep auth-token + logout behaviour. SSR-safe (the mounted/ready gating already there).
- a11y: `<nav aria-label="Primary">`, skip-link target stays, focus rings, ESC closes the palette (GlobalSearch already does).

### Home dashboard → `apps/web/src/app/dashboard/page.tsx` (Phase C) — THIS IS app/index.html's main view
Recreate `views.jsx DashboardView` (see `screenshots/overview.png`), wired to real data, inside `<AppShell>`:
- `PageHeader` greeting “Good {morning/afternoon/evening}, {firstName}” (from `meRequest()`), sub = date + org + “org health
  at a glance”; actions: a range button (“Last 30 days”, static ok) + `<PermissionGuard permission="KPI_CREATE">`
  “New KPI” → `/kpis`. Keep `data-testid="dashboard-heading"` on the h1.
- 4 `StatTile`s in a `grid grid-cols-4 gap-3.5` (`.kn-stagger`) — fed by real KPI summary if available, else top KPIs.
  Wrap the row (or the main grid) with `data-testid="dashboard-summary-grid"`.
- Below: `grid grid-cols-[1.7fr_1fr] gap-3.5` →
   • LEFT: a “KPIs to watch” Card listing top ~5 KPIs (name + ScopeBadge + category, mini Sparkline, value, StatusBadge),
     each row links to `/kpis/[id]`; header “View all” → `/kpis`.
   • RIGHT rail: reuse existing `components/setup-checklist-card.tsx` (keep `setup-checklist-card` testid) styled per the
     design's “Finish setup” gradient card if easy, + a “Recent activity” Card (from `/activity` or recent audit; degrade to
     empty state). Also keep `<OnboardingTour/>` mounted (gated by localStorage `kpi-nexus.tour-completed`, `tour-skip` testid).
- Data: `GET /auth/me`; KPIs via existing kpis client/endpoint; setup checklist via its client; activity via polish/collab client.
  Unknown/empty → skeletons then EmptyState (`dashboard-empty`), errors → `dashboard-error` banner. Role-adaptive copy per 02 doc
  (admin→checklist+activity; manager→team; individual→my KPIs+tasks+mentions) — at minimum admin layout; keep it scannable <5s.

### Marketing landing → `apps/web/src/app/page.tsx` (Phase C)
Public, NO shell. Keep it minimal-but-polished per 02 doc: wordmark + tagline “Measure what matters.” + two CTAs
“Sign in” `/login` and “Create organization” `/signup` (keep `data-testid="home-guided-setup"` on the create-org CTA).
Use the gradient-brand mark, tokens, Inter. Redirect authenticated users to `/dashboard` if a token exists.

### All other pages (Phase D — one agent per uploads/NN doc area)
For each area: read its `uploads/NN-*.md` + the matching design `views-*.jsx`/`pages-*.jsx`, then restyle the real
pages listed below to match, USING the ui primitives + charts + (where pages currently roll their own header) wrap them in
`<AppShell>`. Preserve every testid that area's doc lists; keep API calls/permissions intact. Each page: 4 states.
Areas → real route files under `apps/web/src/app/`:
- 01 auth+onboarding: `(auth)/login`, `(auth)/register`, `(auth)/accept-invitation`, `signup`, `signup/wizard` (these render WITHOUT AppShell; design `auth.jsx`/`pages-auth.jsx`).
- 03 kpis: `kpis`, `kpis/[id]` (10 tabs — `views-kpitabs.jsx`), `kpis/categories`, `kpis/import`, `kpis/tree`, `kpis/scorecard`, `kpis/templates`, `kpis/archive`.
- 04 kpi-analytics: `kpis/[id]/anomalies`, `kpis/[id]/forecast`, `kpis/[id]/whatif`, `kpis/[id]/embed` (forecast = yhat+band per `forecast-full.png`).
- 05 dashboards: `dashboards`, `dashboards/new`, `dashboards/[id]`, `dashboards/[id]/share`, `dashboards/[id]/snapshots`, widget drill-down `dashboards/[id]/widgets/[wid]` (KEEP all the dashboard-* + widgets testids; uses react-grid-layout + recharts widgets — restyle chrome, keep grid behaviour).
- 06 alerts: `alerts`, `alerts/new`, `alerts/[id]`, `alerts/channels`, `settings/notifications`, `settings/notifications/dlq`.
- 07 ai: `insights`, `recommendations`, `ask` (NLQ chat per `views.jsx AskView`), `settings/ai`.
- 08 collab: `okrs`, `okrs/[id]`, `tasks` (kanban), `approvals`, `workflows`, `activity`, `me/mentions`, + `components/comments-drawer.tsx`.
- 09 people-org: `users`, `users/[id]`, `roles`, `positions`, `org-units`, `team`, `my-kpis`, `profile` (PER_USER patterns — §12.9).
- 10 reports: `reports`, `reports/new`, `reports/[id]`, `reports/board-pack`.
- 11 integrations: `integrations`, `connectors`, `connectors/[id]`, `plugins`.
- 12 settings: `settings` (index), `settings/{organization,branding,fiscal,password-policy,custom-domain,api-keys,webhooks,audit,retention,scim,sso}`, `billing`.
- 13 public+embeds: `share/[token]`, `embed/kpi/[token]` (NO shell; chromeless; design `public.jsx`).
- status/unauthorized: `status`, `unauthorized` (polish).

## Verify (Phase E)
`pnpm --filter @kpi-nexus/web typecheck` (must be clean) → `pnpm --filter @kpi-nexus/web test` (vitest: app-shell,
permissions, cn, terminology, i18n specs must pass — update specs you intentionally changed) → `pnpm --filter
@kpi-nexus/web lint` → `pnpm --filter @kpi-nexus/web build` (Next build). Fix ALL errors/regressions; don't mask. Loop.

## Dual-dir note
App Router root is `apps/web/src/app/` (only). There is NO `apps/web/app/`. tailwind.config.ts content glob is `./src/**`.
