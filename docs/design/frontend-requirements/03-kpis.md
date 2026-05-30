# 03 — KPIs

The core domain. A KPI has a **scope** (`ORG_WIDE` / `PER_UNIT` / `PER_USER`), a type
(NUMBER/CURRENCY/PERCENTAGE/…), a direction (HIGHER/LOWER_IS_BETTER), a frequency, an
aggregation method, optional targets/thresholds/benchmarks, optional formula + cascade
relationships, and time-series data points. **Scope drives where data is recorded** and
**who can see the KPI** — this must be reflected in the UI.

---

## `/kpis` — KPI catalog + quick create + quick record

- **Access**: authenticated; needs `KPI_VIEW`. Mutations gated by `KPI_CREATE` / `KPI_DATA_ENTRY`.
- **Purpose**: browse all KPIs the viewer can see (visibility-filtered by scope+role), create new KPIs, and quick-record an ORG_WIDE value.
- **Layout**:
  - Heading (`kpis-heading`) + `nav-kpis`. Sub-nav/links to: Categories, Templates, Tree, Scorecard, Import, Archive.
  - **Create KPI** section (`create-kpi-section`, gated `KPI_CREATE`): name (`kpi-name-input`), type (`kpi-type-select`), unit (`kpi-unit-input`), target (`kpi-target-input`), **scope** (`kpi-scope-select`) → when PER_UNIT show an **org-unit picker** (`kpi-orgunit-picker`; `kpi-no-orgunits` when none), when PER_USER show a **user picker** (`kpi-user-picker`); submit (`kpi-submit-button`). Scope is **immutable after creation** — make that clear.
  - **List** (`kpis-list-section` → `kpis-list`): each row shows name, current value (tabular), unit, a **scope badge** (`kpi-scope-badge`), status, trend sparkline; click → `/kpis/[id]`.
  - **Quick record** (for an ORG_WIDE KPI, gated `KPI_DATA_ENTRY`): value (`record-value-input`), period start/end (`record-start-input`/`record-end-input`), submit (`record-submit-button`). PER_UNIT/PER_USER KPIs must **not** offer org-wide record here (route the user to `/my-kpis` or the unit assignment).
- **Data/API**: `GET /kpis` (visibility-filtered), `POST /kpis`, `POST /kpis/:id/data` (ORG_WIDE only). Catalog should expose a **scope facet/filter**; PER_USER KPIs are hidden from users with no assignment.
- **States**: `kpis-empty` (no KPIs → CTA to create or use a template), `kpis-load-error`, `kpi-error` (create), `record-error` (record), `no-data-points` indicator on rows without data.
- **Design notes**: data-dense table (TanStack DataTable; sticky header, sortable, virtualize >500 rows); scope badge is a key visual (ORG_WIDE / PER_UNIT / PER_USER). Direction shown as ▲/▼ intent. Create can move to a Sheet/Dialog rather than an always-open section.

---

## `/kpis/[id]` — KPI detail (tabbed)

- **Access**: `KPI_VIEW` + visibility (a Manager/Individual cannot open a PER_USER KPI assigned to someone else → 404). PER_USER + non-admin viewer sees **only their own** data and records via `/user-kpis/my-kpis/:assignmentId/data`.
- **Purpose**: the full workspace for one KPI.
- **Layout**: header — name (`kpi-detail-name`), status badge, `v{version} · {scope} · {type}`, description, and a **💬 Comments** trigger (CommentsDrawer, entityType `kpi` — see 08). Below: a **tab bar**:
  - **Overview** — current value (`overview-latest`), target vs actual, trend chart, threshold status, owner, last-updated-by.
  - **Data** — time-series table + record form (`data-value`, `data-record`); edit/delete points; quality flags; outlier markers.
  - **Formula** — expression editor (`formula-raw`) with save (`formula-save`); validation message (`formula-msg`) / error (`formula-err`); shows dependencies (this KPI is COMPUTED from others).
  - **Cascade** — parent/child rollup: add a child (`cascade-add`, `cascade-child`); shows the rollup tree.
  - **Targets** — period-scoped targets: add (`target-add`, `target-value`); list with effective windows; **approval-gated** when a KPI_TARGET workflow is active (a target change may return 202 → "submitted for approval", see 08/Approvals).
  - **Thresholds** — warning/critical bands: add (`band-add`, `band-name`).
  - **Benchmarks** — internal/external benchmarks: add (`benchmark-add`, `benchmark-value`), compute (`benchmark-compute`).
  - **Lineage** — upstream/downstream graph (what feeds this, what it feeds).
  - **Audit** — version history + who/when changed what.
- **Data/API**: `GET /kpis/:id`, data points, `/kpi-targets`, `/kpi-threshold-bands`, `/kpi-benchmarks`, `/kpi-cascades`, formula endpoints, lineage endpoints, version history. Editing the KPI definition may be **approval-gated** (PATCH returns 202 + requestId when a KPI_DEFINITION workflow is active — surface "submitted for approval").
- **States**: load error; per-tab empty states; validation errors inline.
- **Design notes**: tabs over a sticky header; charts are theme-aware + ARIA-described; the analytics tabs (Anomalies/Forecast/What-if) live on **dedicated subroutes** (see 04) but should be linked from Overview. Show **trust signals** (last updated by X at T, version number).

---

## `/kpis/categories` — Category management

- **Access**: `KPI_VIEW`; mutate `KPI_CREATE`/`EDIT`.
- **Purpose**: CRUD KPI categories (name, color, icon, sort order) used to group KPIs.
- **Layout**: heading (`categories-heading`); create form (`category-create-form`: `category-name-input`, `category-color-input`, submit `category-create-submit`); table (`categories-table`) with edit/delete; delete blocked when the category is in use (show count + reassign hint).
- **States**: `categories-empty`, `categories-error`, `category-create-error`.
- **Design notes**: color swatches; the color is used as the KPI accent in lists/charts.

## `/kpis/import` — Bulk import (CSV/JSON dry-run → commit)

- **Access**: `KPI_CREATE`.
- **Purpose**: paste/upload KPI definitions, validate (dry-run), then commit.
- **Layout**: heading (`kpi-import-heading`); a large textarea (`kpi-import-textarea`) + a "load sample" (`kpi-import-sample`); **Dry-run** (`kpi-import-dryrun`) → result (`kpi-import-result`) with **valid count** (`kpi-import-valid-count`) and **error count** (`kpi-import-error-count`) + an errors table (`kpi-import-errors-table`); **Commit** (`kpi-import-commit`) → done (`kpi-import-done`).
- **States**: `kpi-import-error`; disable Commit until a clean (or partial-ok) dry-run.
- **Design notes**: two-phase (validate then commit) is the safety pattern — make the error table row-addressable (line number + reason). Consider a real file dropzone + column-mapping step.

## `/kpis/tree` — KPI hierarchy / cascade tree

- **Access**: `KPI_VIEW`.
- **Purpose**: visualize parent→child cascade rollups across all KPIs.
- **Layout**: roots list (`tree-roots`) with expandable children (TreeView); each node shows name + current value + rollup contribution.
- **States**: `tree-empty`.
- **Design notes**: collapsible TreeView; clicking a node → `/kpis/[id]`. The design pass may add an SVG graph view.

## `/kpis/scorecard` — Balanced Scorecard grid

- **Access**: `KPI_VIEW`.
- **Purpose**: KPIs arranged in the 4 BSC quadrants (Financial / Customer / Internal Process / Learning & Growth) via each KPI's `scorecardQuadrant`.
- **Layout**: a 2×2 grid (`scorecard-grid`); each quadrant lists its KPIs with value + status.
- **Design notes**: classic strategy-map feel; quadrant headers; drag-to-reassign quadrant is a nice future add.

## `/kpis/templates` — KPI template gallery

- **Access**: `KPI_VIEW`.
- **Purpose**: browse curated KPI templates and instantiate them.
- **Layout**: search (`tmpl-search` + `tmpl-search-btn`); grid (`tmpl-grid`) of template cards; a formula-function helper (`tmpl-function`); apply → creates a KPI prefilled from the template. Status message (`tmpl-msg`).
- **Design notes**: cards show what each template measures + a sample formula.

## `/kpis/archive` — Soft-deleted KPIs (restore / purge)

- **Access**: `KPI_VIEW`; restore/purge `KPI_DELETE`.
- **Purpose**: list soft-deleted KPIs with a 30-day window; restore or purge.
- **Layout**: list (`archive-list`) — each row: name, deletedAt, **countdown to purge**; actions **Restore** (clears deletedAt) and **Purge now** (hard delete, type-to-confirm AlertDialog).
- **States**: `archive-empty`.
- **Design notes**: muted treatment; clear "X days until permanent deletion"; restore is optimistic.
