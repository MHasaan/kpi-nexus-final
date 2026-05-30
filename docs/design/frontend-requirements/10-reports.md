# 10 — Reports

Scheduled + on-demand reports (CSV/Excel/PDF), a board-pack executive summary, and run
history. Reports run **as their creator** (so §6 visibility applies). Require `REPORTS_VIEW`.

---

## `/reports` — Report list

- **Access**: `REPORTS_VIEW`.
- **Purpose**: browse configured reports; create; open.
- **Layout**: heading (`reports-heading`) + **New report** link (`reports-new-link` → `/reports/new`); a **list** (`reports-list`) — name, format, schedule (cron, human-readable), last run status, recipients; row → `/reports/[id]`. Nav `nav-reports`.
- **States**: `reports-empty`, `reports-load-error`, `reports-action-error`.
- **Design notes**: humanize cron ("Every Mon 8:00"); format + schedule as chips; last-run status (icon+label).

## `/reports/new` — Create report

- **Access**: `REPORTS_VIEW` (+ manage).
- **Purpose**: configure a report — name, description, source (dashboard or KPI set), format, schedule, recipients.
- **Layout**: form — name (`report-name-input`), description (`report-description-input`), **format** (`report-format-select`: CSV/XLSX/PDF), **dashboard** source (`report-dashboard-select`) and/or a **KPI list** (`report-kpi-list`), a **cron** field (presets + **custom** `report-cron-custom-input`), and **recipients** (`report-add-recipient`, repeatable); submit (`report-create-submit`).
- **States**: `report-create-error`.
- **Design notes**: schedule builder with presets + custom cron (validate + preview next runs); recipient chips; format affects preview hint.

## `/reports/[id]` — Report detail + run history

- **Access**: `REPORTS_VIEW`.
- **Purpose**: inspect a report; trigger a run now; see past runs + download.
- **Layout**: heading (`report-detail-heading`); **Trigger now** (`report-detail-trigger`) + **Refresh** (`report-detail-refresh`); a **runs table** (`report-runs-section` → `report-runs-table`) — each run: timestamp, status, download link (presigned URL to the generated file in object storage), recipient delivery status.
- **States**: `report-detail-load-error`, `report-runs-empty`, `report-trigger-error`, `report-trigger-success`.
- **Design notes**: run rows show progress (queued→running→done/failed); download button per completed run; "delivered to N recipients via email".

## `/reports/board-pack` — Executive board pack

- **Access**: `REPORTS_VIEW`.
- **Purpose**: a one-screen executive summary — scorecard quadrants + top movers.
- **Layout**: heading (`board-pack-heading`); a **quadrants** section (`board-pack-quadrants`, BSC summary) and a **movers** section (`board-pack-movers`, biggest gainers/losers this period); printable.
- **States**: `board-pack-loading`, `board-pack-error`; content region `board-pack-content`.
- **Design notes**: print-optimized layout (the app has a print stylesheet); designed to be exported as the monthly board PDF — generous, presentation-grade typography; deltas as icon+sign+value.
