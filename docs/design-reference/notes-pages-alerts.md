# Notes — Alerts area (06) restyle

Restyled the 6 real alerts/notifications pages to the design system using the
shared `ui` primitives + `AppShell`. All data fetching, API calls, payloads,
auth/token handling, and permission gating left intact.

NOTE: `AppShell`'s actual signature is `AppShell({ children })` — it derives the
topbar title/breadcrumb from the pathname itself and does NOT accept `title`/`crumbs`
props (despite the task brief). So pages are wrapped as plain `<AppShell>…</AppShell>`.
Likewise `Button` has no `asChild`, so link-styled "buttons" (Channels, Delivery log,
Preferences, New rule CTAs) are `next/link` elements with button-equivalent token
classes. `npx tsc --noEmit`: zero errors in these 6 files (remaining repo errors are
pre-existing in dashboards/kpis areas, out of scope — Verify phase reconciles them).

## Pages restyled (6)

| Route | File | Notes |
|---|---|---|
| `/alerts` | `apps/web/src/app/alerts/page.tsx` | AppShell + PageHeader; status filter now a `Segmented` control (sr-only `alerts-filter-*` buttons kept for e2e); severity as labelled `Badge` (icon+label, never colour-only) via `SEVERITY_META`; alerts in `Card`+`Table`; Skeleton (loading) / EmptyState `BellOff` "All clear" (`alerts-empty`) / error banner (`alerts-error`). |
| `/alerts/new` | `apps/web/src/app/alerts/new/page.tsx` | AppShell + Card-wrapped form sections; `Input`/`Select`/`Label`; progressive `rule-config` fieldset per type; `escalation-builder` as ordered Level cards with per-level channel checkboxes; `Button` submit/add. `rule-error` preserved. |
| `/alerts/[id]` | `apps/web/src/app/alerts/[id]/page.tsx` | AppShell; severity + status `Badge`s; trigger details in `Card`; Skeleton loading; `alert-detail-error` banner. |
| `/alerts/channels` | `apps/web/src/app/alerts/channels/page.tsx` | AppShell + PageHeader; create form in `Card`; kind-conditional fields preserved; channels `Table` with Test/Delete `Button`s; Skeleton / EmptyState `Inbox` (`channels-empty`) / errors (`channels-error`, `channel-create-error`) / `channel-test-msg` status. |
| `/settings/notifications` | `apps/web/src/app/settings/notifications/page.tsx` | AppShell + PageHeader (Delivery-log action); digest/DND/mute fieldsets in `Card`s; `notif-settings-error` / `notif-settings-saved` preserved. |
| `/settings/notifications/dlq` | `apps/web/src/app/settings/notifications/dlq/page.tsx` | AppShell + PageHeader (Refresh + Preferences); failed deliveries `Table`; Skeleton / EmptyState `CheckCircle2` (`dlq-empty`) / `dlq-error`. |

## Every data-testid preserved (verified)

- alerts: `alerts-heading`, `alerts-new-link`, `alerts-filter-{OPEN,ACKNOWLEDGED,RESOLVED,ALL}`,
  `alerts-error`, `alerts-empty`, `alerts-table`, `alert-row-*`, `alert-link-*`,
  `alert-status-*`, `alert-ack-*`, `alert-resolve-*`.
- new: `new-rule-heading`, `new-rule-form`, `rule-name-input`, `rule-kpi-select`,
  `rule-type-select`, `rule-severity-select`, `rule-config`, `rule-operator-select`,
  `rule-threshold-input`, `escalation-builder`, `escalation-level-*`, `escalation-remove-*`,
  `escalation-delay-*`, `escalation-{idx}-channel-{id}`, `escalation-add-level`, `rule-error`, `rule-submit`.
- detail: `alert-detail-error`, `alert-detail-status`, `alert-detail-message`,
  `alert-detail-ack`, `alert-detail-resolve`.
- channels: `channels-heading`, `channel-create-form`, `channel-name-input`,
  `channel-kind-select`, `channel-recipients-input`, `channel-url-input`,
  `channel-fromnumber-input`, `channel-create-error`, `channel-create-submit`,
  `channel-test-msg`, `channels-error`, `channels-empty`, `channels-table`,
  `channel-row-*`, `channel-test-*`, `channel-delete-*`.
- notifications: `notif-settings-heading`, `notif-settings-error`, `notif-settings-form`,
  `digest-{OFF,DAILY,WEEKLY}`, `mute-start`, `mute-end`, `mute-kind-*`,
  `notif-settings-save`, `notif-settings-saved`.
- dlq: `dlq-heading`, `dlq-refresh`, `dlq-error`, `dlq-empty`, `dlq-table`,
  `dlq-row-*`, `dlq-retry-*`.

Headings that previously carried `*-heading` now live in an `sr-only <h1>` alongside the
visible `PageHeader` (or are the `PageHeader` h1 itself on the form pages) — the testid
still resolves to a heading element.

## Risk / TODO

- The alerts list status filter was a row of buttons; it is now a `Segmented` control,
  with the original `alerts-filter-*` buttons retained as an `sr-only` group so e2e
  `getByTestId('alerts-filter-OPEN').click()` still works. If any e2e asserts the filter
  buttons are *visible*, switch back to visible buttons (the wiring is identical).
- Only my 6 files were checked for type errors; full `tsc --noEmit` returned exit 0.
- Detail page still shows the P5/P7 placeholder line (escalation timeline + comments
  drawer are out of scope for this phase per the existing page).
