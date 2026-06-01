# Notes — KPI Analytics pages restyle (area: kpi-analytics)

Restyled 4 authenticated single-KPI analytics subroutes to the design system using
the shared UI primitives + charts. All previously rolled their own `KPI Nexus`
top-bar header; now each wraps content in the app shell (`title` + `crumbs`) +
`PageHeader`. Data fetching, API endpoints/payloads, and auth-token handling are
UNCHANGED.

## Pages restyled (4)

| Page | File |
|---|---|
| Anomalies | `apps/web/src/app/kpis/[id]/anomalies/page.tsx` |
| Forecast | `apps/web/src/app/kpis/[id]/forecast/page.tsx` |
| What-if | `apps/web/src/app/kpis/[id]/whatif/page.tsx` |
| Embed | `apps/web/src/app/kpis/[id]/embed/page.tsx` |

## Layout / components

- 2-column `lg:grid-cols-[280px_minmax(0,1fr)]`: a left **controls Card** + right
  **results column** (matches the design's analytics tab layout). Embed uses a
  single-column flow with security-model info Card.
- Replaced the bespoke `SeriesChart` with the kit charts:
  - Anomalies → `LineChart series=[{data}] anomalies=[{index,value,label}]`
    (shape+colour markers with `<title>` score tooltip — never colour-only).
  - Forecast → `LineChart series=[] forecast={yhat,lower(95),upper(95)}`
    (translucent band + dashed yhat). 80/95 bands also in the predictions table.
  - What-if → `BarChart` before→after (aggregate sums) + per-period table.
- Controls use `Label`+`Select`/`Input`; actions use `Button` (primary/secondary,
  `isLoading`). Tables use `Table`/`TableHeader`/... ; all numbers `tabular-nums`.
  Fit metrics via `Metric` tiles; lift % via `Delta` (`value` + `pct`).
- Status via `Badge` (Confirmed=success, else a Confirm button) — icon/text,
  never colour-only.
- Chart components take `aria-label` (NOT `ariaLabel`) — corrected during typing.

## 4 states (per page)

- Loading: `Skeleton` (anomalies chart + saved-table rows).
- Empty: `EmptyState` — anomalies "No anomalies detected" positive empty keeps
  `anom-saved`; forecast/what-if/embed empty CTAs.
- Error: `role="alert"` banner, `text-status-critical`, keeps `*-error` testids
  (`anom-error`, `fc-error`, `wi-error`, `embed-generate-error`).
- Success: charts + tables + metric tiles.

## Testids preserved (all kept on equivalent elements)

- Anomalies: `anom-error`, `anom-chart`, `anom-method`, `anom-threshold`,
  `anom-detect`, `anom-detect-persist`, `anom-detected`, `anom-saved`,
  `anom-row-<id>`, `anom-confirm-<id>`, `anom-confirmed-<id>`.
- Forecast: `fc-error`, `fc-model`, `fc-horizon`, `fc-run`, `fc-chart`, `fc-metrics`.
- What-if: `wi-error`, `wi-mechanic`, `wi-delta`, `wi-run`, `wi-chart`, `wi-result`,
  `wi-lift-pct`.
- Embed: `embed-generator-heading`, `embed-generate-btn`, `embed-generate-error`,
  `embed-token-output`, `embed-token-value`, `embed-copy-token-btn`,
  `embed-iframe-snippet`, `embed-copy-iframe-btn`, `embed-preview-iframe`.

## Permission gating

The original pages did NOT gate the primary actions, and the e2e suites
(`ai-analytics-ui.spec.ts`, `embed-ui.spec.ts`) assert `anom-detect-persist`/
`fc-run`/`wi-run`/`embed-generate-btn` are clickable. Because `usePermissions()`
resolves to `[]` when the `/auth/me` perms endpoint isn't populated, wrapping
those in `PermissionGuard` would HIDE them and break the suite. So the
run/detect/generate/confirm actions stay ungated — parity with the originals.
(All these routes already require `ANALYTICS_VIEW` server-side; the page is only
reachable by authorised users.)

## TODO / risk

- **`crumbs` prop shape could not be tsc-verified this session** (tool output was
  globally suppressed mid-run). I passed `crumbs={['KPIs','Forecast']}` etc. as a
  `string[]`, chosen because the dashboards-area pages that pass `{label,href}`
  objects produce a type error against `AppShellProps['crumbs']`, so the prop is
  NOT an object array. If the real type is `ReactNode[]`, `string[]` is still
  assignable. **Verify-phase: run `npx tsc --noEmit` and, if crumbs errors, adjust
  the crumb literal shape to match `app-shell.tsx`'s exported type.**
- What-if chart is now a before→after BAR visual (matches the design) rather than
  a line series; `wi-chart` is re-attached to the `BarChart` wrapper div.
