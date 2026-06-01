# Notes — Reports area restyle (10-reports)

Area key: **reports**. Pages restyled: **4**
(`reports`, `reports/new`, `reports/[id]`, `reports/board-pack`) — all under
`apps/web/src/app/`.

Source of truth read: `uploads/10-reports.md`, `IMPLEMENTATION-BRIEF.md`,
`notes-primitives.md`, `notes-shell.md`. (No dedicated `ReportsView` exists in the
design `views-execute.jsx` — reports is a StubView in the prototype — so the
layout follows the 10-reports spec + the shared primitive/Card vocabulary, same
visual language as the other Execute pages.)

## What changed (all 4 pages)

- Replaced each page's roll-your-own top `<header>` + nav with `<AppShell title crumbs>`
  (authenticated, non-public). Inner content now lives inside the shell's centered
  `max-w-[1180px]` main; per-page widths kept where it helps (forms `max-w-3xl`).
- Swapped hand-rolled markup for ui primitives: `PageHeader`, `Card`/`CardHeader`/
  `CardTitle`/`CardContent`, `Badge`, `Button`, `Input`/`Select`/`Textarea`/`Label`,
  `Table`(+Header/Body/Row/Head/Cell), `EmptyState`, `Skeleton`. lucide icons.
- All 4 states on every page: Skeleton while loading, EmptyState (or empty-row) keeping
  the `*-empty` testid, error banner `role="alert"` + `text-status-critical` keeping the
  `*-error` testid, and the success/content state.
- Status is icon+label (`Badge` tones success/error/warning/neutral) — never colour-only.
  Cron is humanized ("Every Mon at 9:00") with the raw cron shown in mono tabular-nums.
- Numbers use `tabular-nums`. Token classes only (e.g. `bg-status-critical-bg`,
  `text-accent-primary`, `border-border-divider`, `shadow-inset/xs`).
- API calls, payloads, localStorage auth keys, and 401→/login redirects: **unchanged**.
- Permission gating: the "New report" CTA (header + empty-state) is wrapped in
  `<PermissionGuard permission="REPORTS_VIEW">` (manage path per the 10 doc).

### reports (list)
- PageHeader (title "Scheduled reports" + sub) with gated New-report action.
- Each report is a `Card` row: name link, active/paused + format `Badge`s, humanized
  cron + raw cron, recipient count, last-run status `Badge`. Actions are `Button`s
  (Run now / Pause-Resume / Delete[danger]).
- Loading → 3 Skeleton cards. Empty → `EmptyState` (FileText) with gated CTA.

### reports/new
- Grouped into `Card`s: Details (name, description), Source (format + hint,
  dashboard select, KPI multi-select), Schedule (cron presets as radios + custom +
  effective-cron preview), Recipients (repeatable). Submit via `Button isLoading`.
- KPI checkboxes restyled as selectable chips; selected = accent-bg.

### reports/[id]
- PageHeader (name + description) with Run now (`isLoading`) + Refresh actions.
- Meta chips row (active/paused, format, cron, last/next run). Recipients line:
  "Delivered to N recipients via email".
- Run history in a `Card` + `Table`; per-run status `Badge`, tabular ran-at, Download
  link (presigned `fileUrl`), error cell. Empty → `report-runs-empty` message in card.

### reports/board-pack
- Kept `<PrintButton/>` and `no-print` on the controls. Period picker rebuilt as a
  segmented `role=radiogroup` of buttons (KEEPS `board-pack-period-{7,14,30,90}` testids;
  values are now string-keyed for the click handler, still call `getBoardPack(Number)`).
- Presentation-grade header (eyebrow + org name + tabular period range).
- Top movers as `Card`s with delta icon+sign+value (ArrowUpRight/DownRight/Minus,
  status-success/critical/muted). BSC quadrants as `Card`s with health-distribution
  pills + KPI list (divided rows, tabular values).
- Loading → `board-pack-loading` region (sr-only text + Skeletons). Error →
  `board-pack-error`. Content region keeps `board-pack-content`.

## data-testids preserved (every one from 10-reports.md + the originals)

- list: `reports-heading` (now on PageHeader h1), `reports-new-link`, `reports-list`,
  `reports-empty`, `reports-load-error`, `reports-action-error`, `nav-reports` (via AppShell sidebar),
  `report-row-{id}`, `report-trigger-{id}`, `report-toggle-{id}`, `report-delete-{id}`.
- new: `report-name-input`, `report-description-input`, `report-format-select`,
  `report-dashboard-select`, `report-kpi-list`, `report-kpi-checkbox-{id}`,
  `report-cron-custom-input`, `report-recipient-{i}`, `report-add-recipient`,
  `report-create-submit`, `report-create-error`.
- detail: `report-detail-heading` (PageHeader h1), `report-detail-trigger`,
  `report-detail-refresh`, `report-detail-load-error`, `report-trigger-success`,
  `report-trigger-error`, `report-runs-section`, `report-runs-table`, `report-runs-empty`,
  `run-row-{id}`, `run-download-{id}`.
- board-pack: `board-pack-heading`, `board-pack-content`, `board-pack-movers`,
  `board-pack-quadrants`, `board-pack-loading`, `board-pack-error`,
  `board-pack-period-{7|14|30|90}`, `mover-card-{id}`, `quadrant-card-{idx}`.

> Note: `reports-heading` / `report-detail-heading` now sit on the `PageHeader`'s
> rendered `<h1>` (semantically equivalent element) rather than a bare `<h1>`.

## TODO / verification gap (IMPORTANT — Verify phase must run this)

- I could NOT observe command output this session (the tool-output channel went silent
  mid-run), so `npx tsc --noEmit` was launched but its result was unreadable to me.
  **Re-run `cd apps/web && npx tsc --noEmit` and reconcile any errors in these 4 files.**
- HIGHEST-RISK item: the `AppShell` props. The CURRENT `app-shell.tsx` interface is
  `{ children }` ONLY — it does NOT yet accept `title`/`crumbs` (they are derived
  internally from the pathname). So `<AppShell title=... crumbs=...>` currently
  TYPE-ERRORS. This is a SHARED, pre-existing cross-area situation: kpis/okrs/tasks
  pages already pass `title`+`crumbs` and hit the identical error. The brief explicitly
  instructs passing title+crumbs, and the shell's internal state is named `pageTitle`
  + `crumbs`, so the intended final shell will accept them — the Verify phase must widen
  `AppShellProps` to `{ children; title?; crumbs?: { label: string; href?: string }[] }`.
  I matched the `{ label, href? }[]` object-array crumb shape used by the majority of
  sibling pages (kpis/okrs) so all areas converge on one shape.
- Secondary: confirm `PermissionGuard` is a named export from
  `components/auth/permission-guard` taking `permission` (used per the brief's example);
  and that `Badge` accepts `tone="error"`, `Button` accepts `leftIcon`/`isLoading`,
  `Card`/`Table*` forward `data-testid`/`className` (all per notes-primitives.md).
