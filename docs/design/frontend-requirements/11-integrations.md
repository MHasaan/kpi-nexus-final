# 11 — Integrations, Connectors, Plugins

Third-party connections (Slack/Teams/Jira), scheduled data connectors (REST/GraphQL/…),
and the plugin catalog. All admin (`ORG_SETTINGS`).

---

## `/integrations` — Integration marketplace

- **Access**: `ORG_SETTINGS`.
- **Purpose**: connect/disconnect third-party providers.
- **Layout**: a **provider grid** (`provider-grid`) of cards (`provider-<slack|teams|jira>`) — each with name, blurb, a **Connected** badge (`status-<provider>`) when connected, and **Connect** (`connect-<provider>`) / **Disconnect** (`disconnect-<provider>`).
- **Data/API**: `GET /integrations`, `POST /integrations` (records a connection; real OAuth lands via the provider's callback), `DELETE /integrations/:id`. Tokens are encrypted at rest and never shown.
- **States**: `integrations-error`.
- **Design notes**: marketplace look (logos, categories); a connected card shows last-sync + a manage link (e.g., Slack channel mapping). **Connect** should ultimately kick off OAuth (WorkOS/provider) — today it records a placeholder connection.

## `/connectors` — Data connectors

- **Access**: `ORG_SETTINGS`.
- **Purpose**: pull external data into a KPI on a schedule or on demand.
- **Layout**: heading; **New connector** form — name (`connector-name`), **type** (`connector-type`: REST/GraphQL), URL (`connector-url`), **value JSON path** (`connector-valuepath`), **KPI id** (`connector-kpiid`), optional **cron** (`connector-schedule`); create (`connector-create`). A **list** (`connector-list`) — each connector: type, schedule, **last run status** (`connector-status-<id>`, success/failed/partial), a **Run now** (`connector-run-<id>`) and delete; row → `/connectors/[id]`. Links to `/integrations`, `/plugins`.
- **Data/API**: `/connectors` CRUD, `/connectors/:id/run`, `/connectors/:id/runs`.
- **States**: `connectors-empty`, `connectors-error`.
- **Design notes**: the create form is a stand-in for a richer **wizard** (source picker → schema map with JSON-path/KPI picker → schedule → **test/preview rows** → save) — the design pass should build that 5-step wizard. Last-run status as icon+label.

## `/connectors/[id]` — Connector detail + run history

- **Access**: `ORG_SETTINGS`.
- **Purpose**: inspect a connector, run it, see ingestion history.
- **Layout**: heading (`connector-heading`); config (type + schedule + JSON config); **Run now** (`connector-run`); a **run history** (`run-history`) of IngestionJob rows (timestamp, kind, status).
- **States**: `runs-empty`.
- **Design notes**: show what each run ingested (row counts); errors expandable.

## `/plugins` — Plugin catalog

- **Access**: `ORG_SETTINGS`.
- **Purpose**: install/enable custom extensions (widget / template / formula-fn / connector). (Catalog only — sandboxed execution is a documented post-v1 item.)
- **Layout**: heading + blurb (note sandboxing arrives later); an **install** form — name (`plugin-name`), **type** (`plugin-type`), version (`plugin-version`), entry URL (`plugin-entryurl`), install (`plugin-install`); a **list/gallery** (`plugin-list`) — each plugin (`plugin-<id>`): name, type, version, an **enable/disable** toggle (`plugin-toggle-<id>`), uninstall.
- **Data/API**: `/plugins` CRUD + enable/disable.
- **States**: `plugins-empty`, `plugins-error`.
- **Design notes**: gallery cards; clearly mark unverified/external entry URLs; enabled vs disabled state (label, not color-only).
