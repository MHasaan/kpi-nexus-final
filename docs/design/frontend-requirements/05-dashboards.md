# 05 — Dashboards

Composable dashboards of widgets bound to KPIs, with a drag-drop grid, real-time
(SSE) refresh, date-range scoping, snapshots, public share links, embeds, and drill-down.
List/view require `DASHBOARD_VIEW`; create/edit/share require `DASHBOARD_MANAGE`.

---

## `/dashboards` — Dashboard list

- **Access**: `DASHBOARD_VIEW`.
- **Purpose**: browse dashboards; create; open.
- **Layout**: heading (`dashboards-heading`) + **New dashboard** link (`dashboards-new-link` → `/dashboards/new`); a **grid** (`dashboards-grid`) of dashboard cards (name, owner, shared badge, widget count, last updated); click → `/dashboards/[id]`.
- **States**: `dashboards-empty` (CTA to create), `dashboards-load-error`, `dashboards-action-error` (e.g., delete failure).
- **Design notes**: card thumbnails would be ideal (mini widget preview); shared/public dashboards get a badge.

## `/dashboards/new` — Create dashboard

- **Access**: `DASHBOARD_MANAGE`.
- **Layout**: form (`dashboards-new-form`): name (`dashboards-new-name`), description (`dashboards-new-description`), **shared** toggle (`dashboards-new-shared`); submit (`dashboards-new-submit`).
- **States**: `dashboards-new-error`.
- **Design notes**: minimal; on success go straight into the new dashboard in edit mode.

## `/dashboards/[id]` — Dashboard view / builder

- **Access**: `DASHBOARD_VIEW`; editing `DASHBOARD_MANAGE`.
- **Purpose**: render the widget grid; edit layout + widgets; scope by date range; refresh live.
- **Layout**:
  - Header: title (`dashboard-detail-heading`); a toolbar with **Edit** toggle (`dashboard-edit-toggle`), **Settings** (`dashboard-settings-toggle`), **Add widget** toggle (`dashboard-add-widget-toggle`), **Snapshot** (`dashboard-snapshot-btn` + link `dashboard-snapshots-link`), **Share** (`dashboard-share-link`), **Print** (`dashboard-print-btn`).
  - **Date range** control: presets + **custom** (`date-preset-custom`, `date-custom-from`, `date-custom-to`) scoping all widgets.
  - **Grid**: draggable/resizable widget tiles (react-grid-layout) — each renders a KPI via a typed widget (number, line, bar, pie, trend, etc.). Drag handles only in Edit mode; a `.widget-no-drag` zone protects interactive controls (delete buttons must not start a drag).
  - **Add widget** section (`dashboard-add-widget-section`): title (`widget-title-input`), KPI id (`widget-kpiid-input`), type (`widget-type-select`); submit (`widget-add-submit`); error (`widget-add-error`).
  - **Snapshot** inline: label (`snapshot-label-input`) → capture; `snapshot-success` / `snapshot-error`.
- **Real-time**: widgets refresh via **SSE** (fetch-stream, since EventSource can't send the bearer) when underlying KPI data changes. Show a subtle "live" indicator.
- **Data/API**: `GET /dashboards/:id`, widget CRUD, data per widget scoped by date range, snapshot create, share link, SSE stream.
- **Concurrency**: optimistic-concurrency on layout save (If-Match / 412); on conflict show a 3-way diff dialog (planned; today surfaces an error) — design a clean conflict resolution.
- **States**: `dashboard-detail-load-error`; empty grid (Edit → "add your first widget").
- **Design notes**: the flagship visualization surface — must feel fast (skeleton tiles, optimistic drag commit + rollback). Widgets are theme-aware, ARIA-described charts. Edit vs View modes visually distinct.

## `/dashboards/[id]/share` — Share-link admin

- **Access**: `DASHBOARD_MANAGE`.
- **Purpose**: create/manage public share links (optional password + expiry).
- **Layout**: heading (`share-heading`); **create** (`share-create-section`): password (`share-password-input`), expiry (`share-expires-input`), submit (`share-create-submit`) → new link result (`share-new-link-result` / `share-new-link-url` + copy `share-new-link-copy`); **existing links** (`share-links-section` → `share-link-row`) with revoke.
- **States**: `share-load-error`, `share-create-error`, `share-action-error`, `share-links-empty`.
- **Design notes**: emphasize the link is public; show password-protected/expiry badges; copy gives a toast. Target viewer is `/share/[token]` (see 13).

## `/dashboards/[id]/snapshots` — Snapshots

- **Access**: `DASHBOARD_VIEW`.
- **Purpose**: point-in-time captures of a dashboard's data.
- **Layout**: heading (`snapshots-heading`); **capture** (`snapshot-capture-section`: label `snapshot-capture-label`, button `snapshot-capture-btn`); list (`snapshots-list`) of past snapshots (label + timestamp) → open a frozen view.
- **States**: `snapshots-empty`, `snapshots-load-error`, `snapshot-capture-error`.
- **Design notes**: snapshots are immutable; show "captured by X at T".

## `/dashboards/[id]/widgets/[wid]` — Widget drill-down

- **Access**: `DASHBOARD_VIEW`.
- **Purpose**: expand a single widget to a full-screen detail with its own date range + data quality view.
- **Layout**: heading (`drilldown-heading`); date range (`drilldown-from`/`drilldown-to`); large chart (`drilldown-chart`); a data-**quality** indicator (`drilldown-quality`); `drilldown-no-data` when empty.
- **States**: `drilldown-error`, `drilldown-no-data`.
- **Design notes**: full chart + underlying table; link back to the parent dashboard and to the KPI detail.
