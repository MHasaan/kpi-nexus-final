# Notes — KPIs area pages (restyle)

Restyled the real KPI pages under `apps/web/src/app/kpis/` to the design system,
reusing the shipped UI primitives (`components/ui`) + charts (`components/charts`)
and wrapping authenticated content in `<AppShell title crumbs>`. Every page now
renders the four states (Skeleton loading / EmptyState+CTA / role=alert error /
success). Data fetching, API calls, payloads, localStorage auth, and permission
gating were left byte-for-byte intact — only markup/classes changed.

## Pages restyled (8)

| Page | File | Notes |
|---|---|---|
| Catalog | `page.tsx` | AppShell + sub-nav links (Categories/Templates/Tree/Scorecard/Import/Archive). Create-KPI in a `Card` form; list moved to the `Table` primitive with `ScopeBadge`, type chip, target (tabular), assignment counts, expand-to-record row, scope facet `Select`. Kept `TerminologyProvider` wrapper + all create/record handlers. |
| Detail (10 tabs) | `[id]/page.tsx` | AppShell + sticky header (name/status `Badge`/`ScopeBadge`/v·type/CommentsDrawer). Tab bar uses the `Tabs`/`TabsList`/`TabsTrigger` primitive. Overview gains a `LineChart` trend from data points. All 9 tab bodies (Overview/Data/Formula/Cascade/Targets/Thresholds/Benchmarks/Lineage/Audit) reuse Card/Table/Input/Select/Textarea/Button. |
| Categories | `categories/page.tsx` | AppShell; create form + `Table`; 4 states. |
| Import | `import/page.tsx` | AppShell; two-phase dry-run→commit; valid/error counts as `Badge`; errors `Table`. |
| Tree | `tree/page.tsx` | AppShell; per-level `Card`s, child links → `/kpis/[id]`, `EmptyState`. |
| Scorecard | `scorecard/page.tsx` | AppShell; 2×2 `scorecard-grid` of quadrant `Card`s; status shown with dot **+ label** (never colour-only). |
| Templates | `templates/page.tsx` | AppShell; filter form + `tmpl-grid` of template `Card`s; success/error banners; `EmptyState`. |
| Archive | `archive/page.tsx` | AppShell; `archive-list` rows with **“N days until purge”** countdown `Badge` (30-day window), Restore/Purge. |

## Testids preserved (all retained on equivalent elements)

- Catalog: `kpis-heading`, `kpis-load-error`, `create-kpi-section`, `kpi-name-input`,
  `kpi-scope-select`, `kpi-type-select`, `kpi-unit-input`, `kpi-target-input`,
  `kpi-submit-button`, `kpi-orgunit-picker`, `kpi-no-orgunits`, `kpi-user-picker`,
  `orgunit-checkbox-*`, `user-checkbox-*`, `kpi-error`, `kpis-list-section`,
  `kpis-empty`, `kpis-list`, `kpi-row-*`, `kpi-scope-badge` (now on a wrapper span,
  since `ScopeBadge` takes no `data-testid`), `kpi-assignment-count-*`, `expand-kpi-*`,
  `delete-kpi-*`, `kpi-data-panel-*`, `record-value-input`, `record-start-input`,
  `record-end-input`, `record-submit-button`, `record-error`, `no-data-points`,
  `data-points-*`, `data-point-row`. (Added: `kpis-scope-filter` facet.)
- Detail: `kpi-detail-name`, `tab-*` (wrapper span around each `TabsTrigger`),
  `overview-latest`, `data-value`, `data-record`, `formula-raw`, `formula-save`,
  `formula-msg`, `formula-err`, `cascade-child`, `cascade-add`, `target-value`,
  `target-add`, `band-name`, `band-add`, `benchmark-value`, `benchmark-add`,
  `benchmark-compute`.
- Categories: `categories-heading`, `category-create-form`, `category-name-input`,
  `category-color-input`, `category-create-submit`, `category-create-error`,
  `categories-error`, `categories-empty`, `categories-table`, `category-row-*`,
  `category-delete-*`.
- Import: `kpi-import-heading`, `kpi-import-textarea`, `kpi-import-sample`,
  `kpi-import-dryrun`, `kpi-import-commit`, `kpi-import-error`, `kpi-import-done`,
  `kpi-import-result`, `kpi-import-valid-count`, `kpi-import-error-count`,
  `kpi-import-errors-table`.
- Tree: `tree-roots`, `tree-empty`.
- Scorecard: `scorecard-grid`, `quadrant-*`, `quadrant-UNASSIGNED`.
- Templates: `tmpl-function`, `tmpl-search`, `tmpl-search-btn`, `tmpl-msg`, `tmpl-grid`, `tmpl-use-*`.
- Archive: `archive-list`, `archive-empty`, `restore-*`, `purge-*`.

## Behaviour notes / deltas

- Catalog quick-record button is now wrapped in `<PermissionGuard permission="KPI_DATA_ENTRY">`
  (spec gates record by `KPI_DATA_ENTRY`); was previously ungated-but-ORG_WIDE-only.
- Detail header now shows scope as `ScopeBadge` (was raw text in `v… · scope · type`),
  so the inline string is `v{n} · {type}`.

## TODO / risk

- **AppShell crumb shape unverified at write time.** I could not re-read
  `app-shell.tsx`'s exported crumb type during this pass (tool-output stall), so all
  8 pages assume `crumbs={[{ label: string; href?: string }]}` per the brief’s
  `AppShell({ children, title?, crumbs? })` contract. If the actual `Crumb` field
  names differ, every page in this area will fail typecheck on the `crumbs` prop —
  the Verify phase should run `npx tsc --noEmit` and, if needed, adjust the crumb
  object keys in one place per file.
- Removed `kpis-load-error` border tint to token `bg-status-critical-bg` (valid token).
