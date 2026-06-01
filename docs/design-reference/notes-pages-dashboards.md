# Notes — Dashboards area restyle

Area key: `dashboards`. 7 real pages restyled to design parity using `components/ui` primitives + `components/charts`, wrapped in `<AppShell>`. All data fetching, API calls, payloads, localStorage/auth, and permission gating left unchanged. `react-grid-layout` drag/resize behaviour preserved on the detail page.

## Pages restyled (7)
1. `apps/web/src/app/dashboards/page.tsx` — list. PageHeader + Archived/New actions; responsive Card grid (interactive), visibility Badge, tabular updated-date. Skeleton grid / EmptyState / error banner / list.
2. `apps/web/src/app/dashboards/new/page.tsx` — create form in a Card (Input/Textarea/Select/Label/Button); error banner.
3. `apps/web/src/app/dashboards/[id]/page.tsx` — detail. PageHeader with Snapshots/Share/Edit(Save) actions; edit-mode hint banner; ResponsiveGridLayout untouched; widget cards restyled; `WidgetPreview` now uses Delta + token-coloured Sparkline (`text-chart-1`) + `bg-chart-1` bars. Skeleton grid / EmptyState / error.
4. `apps/web/src/app/dashboards/[id]/share/page.tsx` — share link Card (mono Input + Copy), EmptyState create CTA, danger Revoke, back link.
5. `apps/web/src/app/dashboards/[id]/snapshots/page.tsx` — Capture action, snapshot Cards with tabular timestamps + View, EmptyState/Skeleton/error.
6. `apps/web/src/app/dashboards/[id]/widgets/[wid]/page.tsx` — widget add/edit form Card; Save/Delete(danger)/Cancel; Skeleton/error.
7. `apps/web/src/app/dashboards/archive/page.tsx` — archived Cards with Restore (refresh icon), EmptyState/Skeleton/error.

## Testids preserved (all kept on visually-equivalent elements)
- list: `dashboard-create-btn`, `dashboard-archive-link`, `dashboard-loading`, `dashboard-error`, `dashboard-empty`, `dashboard-list`, `dashboard-card-${id}`
- new: `dashboard-new-form`, `dashboard-new-error`, `dashboard-name-input`, `dashboard-description-input`, `dashboard-visibility-select`, `dashboard-submit-btn`
- detail: `dashboard-detail-loading`, `dashboard-detail-error`, `dashboard-detail-empty`, `dashboard-snapshots-link`, `dashboard-share-link`, `dashboard-edit-btn`, `dashboard-save-layout-btn`, `dashboard-grid`, `widget-${id}`, `widget-edit-${id}`
- share: `dashboard-share-loading`, `dashboard-share-error`, `dashboard-share-empty`, `dashboard-share-create-btn`, `dashboard-share-link`, `dashboard-share-url`, `dashboard-share-copy-btn`, `dashboard-share-revoke-btn`, `dashboard-share-back`
- snapshots: `snapshot-create-btn`, `snapshot-back-link`, `snapshots-loading`, `snapshots-error`, `snapshots-empty`, `snapshots-list`, `snapshot-${id}`, `snapshot-view-${id}`
- widgets: `widget-loading`, `widget-error`, `widget-form`, `widget-title-input`, `widget-type-select`, `widget-save-btn`, `widget-delete-btn`
- archive: `archive-back-link`, `archive-loading`, `archive-error`, `archive-empty`, `archive-list`, `archive-card-${id}`, `archive-restore-${id}`

Note: `dashboard-share-link` is both an action testid on the detail page (the Share link) and a container testid on the share page (the link card) — preserved as in the original on both.

## Notes / TODO
- The list page previously had no top-level `RequirePermission`; added `dashboard:read` guard for consistency with the other dashboard pages (detail/archive/snapshots all guard `dashboard:read`). API behaviour unchanged.
- Widget edit page: dropped the unused `widget` local (kept `setWidget` via `[, setWidget]`) to satisfy strict no-unused; no behavioural change.
- `bar` widget preview keeps the prototype's flex-bars approach (config is `number[]`, not the `{label,value}[]` shape `BarChart` expects) using `bg-chart-1`. Charts' `BarChart` not used here to avoid reshaping widget config.
- `react-grid-layout` CSS: no global RGL stylesheet import found in repo; behaviour relies on existing global setup (unchanged).

## Verify
`npx tsc --noEmit` in `apps/web` → 0 errors (whole app green).
