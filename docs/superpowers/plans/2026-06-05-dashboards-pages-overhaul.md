# Dashboards Pages Overhaul — Implementation Plan

> Execute with superpowers:subagent-driven-development. **Frontend only** — the backend is complete:
> `POST /dashboards` (name/description/isShared), `POST|PATCH|DELETE /dashboards/:id/widgets[/:wid]`
> with freeform `config: z.record(z.unknown())`, position {x,y,w,h on 12-col grid}; `updateWidget`
> exists but no UI calls it; widget data comes from `GET /kpis/:id/data` + `listKpis()`.

**Goal:** make the Dashboards page + sub-pages properly built, and especially make **creating a
dashboard and adding/configuring widgets (charts) genuinely usable**.

**Root problems (all FE):**
- Add-widget = 3 fields (type dropdown, title, **raw KPI-ID text box**). No KPI picker, no preview, no
  per-type config, no guidance. ← the chief complaint.
- No widget EDIT UI (updateWidget unused) — must delete + re-add to fix anything.
- `activity` + `strategy_map` are stub renderers but offered in the picker.
- Create drops you on an empty dashboard; list has no search.

**Widget config per type (what the renderers actually read):** kpi_card → `{kpiId, unit?}`; line/bar/pie/
gauge/number/trend → `{kpiId}` (number/kpi_card also read `unit`); list → `{maxItems?}` (no kpi);
activity/strategy_map → none (stubs). 8/10 have real renderers.

Helios seed login for live checks: `admin@helios.io` / `Password123!`. Seed has 4 dashboards with real
kpi_card/line/bar/gauge widgets bound to live KPIs (MRR, NRR, NPS, …) + ~35 KPIs to bind to.

---

## Task A — foundation: WIDGET_META + KpiPicker + config types
**Files:** `apps/web/src/lib/api-client.ts`; new `apps/web/src/components/dashboard-grid/widget-meta.ts`;
new `apps/web/src/components/dashboard-grid/kpi-picker.tsx`.
- A `WIDGET_META` catalog: for each of the 10 types → `{ type, label, description, icon (lucide),
  requiresKpi: boolean, supportsUnit: boolean, supportsMaxItems: boolean, experimental?: boolean }`.
  Mark `activity` + `strategy_map` `experimental: true` (still selectable but clearly labelled
  "Preview — limited"). Use it to drive the type picker + per-type config in the editor.
- A `<KpiPicker value onChange>` — a searchable dropdown over `listKpis()` showing each KPI's name + unit
  + scope badge, with a type-ahead filter (a combobox; a filtered native `<Select>` with a search Input
  above it is acceptable). Returns the selected KPI id. This REPLACES the raw KPI-ID textbox everywhere.
- Confirm `addWidget`/`updateWidget` api-client types accept `{ widgetType, title?, config, position }` /
  `{ title?, config?, position? }` (they do). Keep `config` as `Record<string, unknown>` but provide a
  small typed helper `buildWidgetConfig(type, { kpiId, unit, maxItems })`.
- Verify web typecheck/lint/build. Commit `feat(web): widget meta catalog + searchable KpiPicker`.

## Task B — CENTERPIECE: `<WidgetEditor>` (add + edit) with live preview
**Files:** new `apps/web/src/components/dashboard-grid/widget-editor.tsx`;
`apps/web/src/app/dashboards/[id]/page.tsx` (wire add); `apps/web/src/components/dashboard-grid/grid.tsx`
(per-widget Edit in edit mode).
- `<WidgetEditor mode="add"|"edit" initial? onSubmit(body) onCancel busy?>` — a panel/modal with:
  - **Type picker** driven by `WIDGET_META` (a grid of selectable type cards or a Select with the
    description shown beneath; show the icon + description; experimental types flagged).
  - **KPI** via `<KpiPicker>` — shown + REQUIRED when `requiresKpi`; validated before submit.
  - **Title** (Input, optional — defaults to the KPI name when blank).
  - Per-type config: unit override (when `supportsUnit`), max items (when `supportsMaxItems`, number,
    default 10). Build `config` via `buildWidgetConfig`.
  - **Live preview**: render `<WidgetRenderer widget={previewWidget} dateRange={...} />` inside a fixed
    ~240px-tall bordered box, where `previewWidget` is a synthetic `{ id:'preview', widgetType, title,
    config, position }` rebuilt from the current form state. So the user SEES the chart/card update as
    they pick the KPI + type. (Debounce kpiId changes lightly to avoid refetch spam.)
  - Footer: "Add widget"/"Save changes" (disabled until valid: requiresKpi ⇒ kpiId set), Cancel.
- **Wire add** on `/dashboards/[id]/page.tsx`: replace the inline 3-field add form with this editor
  (open it from the existing "Add widget" toggle; it can render inline in the same Card slot or as a
  modal). On submit → `addWidget(dashboardId, { ...body, position: nextPosition })` where nextPosition
  stacks below existing widgets (reuse the existing `{x:0,y:rows*?,w,h}` logic, default w/h from
  WIDGET_META, e.g. kpi_card 3×2, charts 6×4). Refresh.
- **Wire edit**: in `grid.tsx`, in `editMode`, add a small "Edit" (pencil) button on each widget header
  (class `widget-no-drag`) → opens `<WidgetEditor mode="edit" initial={widget}>` → on submit
  `updateWidget(dashboardId, widget.id, { title, config })` (keep position/type as-is, or allow type
  change). Refresh the widget. (Pass an `onEditWidget(widget)` callback from the page down to the grid,
  the page owns the editor state.)
- Commit `feat(web): WidgetEditor — type picker + KpiPicker + live preview; add & edit widgets`.

## Task C — dashboard create + list polish
**Files:** `apps/web/src/app/dashboards/new/page.tsx`; `apps/web/src/app/dashboards/page.tsx`.
- **Create**: keep name/description/isShared; ADD an optional **"Starter widgets"** section — a KPI
  multi-select (reuse `listKpis`/a checkbox list or multi KpiPicker) where the user picks a few KPIs; on
  create, after `createDashboard`, also `addWidget` a `kpi_card` for each picked KPI (positioned in a row/
  grid) so the new dashboard isn't empty. Clear guidance copy. Still redirect to the detail page. (If none
  picked → blank dashboard as today.)
- **List**: add a **search** Input (filter by name, client-side) + a simple filter (All / Shared / Mine /
  Default). Keep the thumbnail glyphs + PageHeader + New-dashboard CTA + Archive link.
- Commit `feat(web): dashboard create starter-widgets + list search/filter`.

## Task D — sub-pages polish
**Files:** `apps/web/src/app/dashboards/archive/page.tsx`; `apps/web/src/app/dashboards/[id]/share/page.tsx`;
`apps/web/src/app/dashboards/[id]/snapshots/page.tsx`; `apps/web/src/app/dashboards/[id]/widgets/[wid]/page.tsx`.
- **Archive**: same treatment as the KPI archive — surface restore/purge errors (no silent catch), per-row
  loading/disabled, replace any `window.confirm` with an inline styled confirm. Consistent states.
- **Share**: verify list/create/revoke works; ensure the create form exposes expiry + password options
  and a **copy-link** button for the generated public URL; show view count + revoke; good states.
- **Snapshots**: verify list/view/delete works; clean states + a clear "capture" entry; link to a snapshot.
- **Drill-down** (`widgets/[wid]`): it's a read-only data explorer — fine; add an "Edit widget" link that
  opens the widget editor on the dashboard (or links back to the dashboard in edit mode).
- Commit per page or one cohesive commit.

## Task E — verify + live + memory
- typecheck/lint/build clean; web unit tests green (update specs touching the add-widget form/dashboard
  pages); full API suite green (no backend change).
- Run the stack (Helios, `admin@helios.io`). Browser-verify: open a seeded dashboard; **Edit → Add widget →
  pick type → pick a KPI from the picker → see the LIVE PREVIEW → add → it renders on the grid**; **edit an
  existing widget** (change KPI/title) and see it update; create a new dashboard WITH starter widgets;
  list search; archive restore/purge with confirm; create+copy a share link and open it; capture+view a
  snapshot. 0 unexpected console errors. Clean up anything you create.
- Update memory; final commit.

## Out of scope (note, don't build)
- Real `activity`/`strategy_map` data (kept as labelled previews). Per-widget date-range overrides,
  chart sub-types/multi-series, drag-to-reposition-on-add. Backend changes (none needed).
