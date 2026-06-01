# 06 — Alerts

Threshold/anomaly alert rules with multi-level escalation, multi-channel notifications,
dedup/digest, and a DLQ (settings). Viewing requires `ALERTS_VIEW`; rule/channel config is
admin-ish (`ALERTS_VIEW` to read, `ORG_SETTINGS`/manage for channels).

---

## `/alerts` — Alert inbox

- **Access**: `ALERTS_VIEW`.
- **Purpose**: triage triggered alerts (open / acknowledged / resolved).
- **Layout**: heading (`alerts-heading`) + **New rule** link (`alerts-new-link` → `/alerts/new`); a **table** (`alerts-table`) of alerts — severity (icon+label, never color-only), KPI, message, status, triggered-at; row → `/alerts/[id]`; filters by status/severity.
- **States**: `alerts-empty` ("All clear"), `alerts-error`.
- **Design notes**: severity as a labelled chip (LOW/MEDIUM/HIGH); unread/open emphasized; bulk ack is a nice add. Mirrors the header **alerts bell**.

## `/alerts/new` — Rule builder

- **Access**: rule creation (manage).
- **Purpose**: define an alert rule + escalation policy.
- **Layout**: form (`new-rule-form`, heading `new-rule-heading`): name (`rule-name-input`), **type** (`rule-type-select`: threshold/anomaly/…), **KPI** (`rule-kpi-select`), **operator** (`rule-operator-select`), **threshold** (`rule-threshold-input`), **severity** (`rule-severity-select`); a **rule config** region (`rule-config`) that adapts to type; an **escalation builder** (`escalation-builder`) with **add level** (`escalation-add-level`) — each level = delay + channel(s) + recipients. Submit (`rule-submit`).
- **States**: `rule-error`.
- **Design notes**: progressive form (operator/threshold appear for threshold type, etc.); escalation levels as an ordered list (level 1 → N) with per-level channel pickers; preview "what will fire and to whom".

## `/alerts/[id]` — Alert detail

- **Access**: `ALERTS_VIEW`.
- **Purpose**: inspect one alert + act on it; discuss via comments.
- **Layout**: status (`alert-detail-status`), message (`alert-detail-message`), the triggering KPI + value + threshold + a mini chart at the trigger moment; **Acknowledge** (`alert-detail-ack`) and **Resolve** (`alert-detail-resolve`); escalation timeline (which levels fired, when, to whom); a **💬 Comments** drawer (entityType `alert`); inbound-email replies appear as comments.
- **States**: `alert-detail-error`.
- **Design notes**: acknowledge/resolve are optimistic; show the full escalation/notification delivery trail. Slack "Acknowledge" button (P8) syncs status here.

## `/alerts/channels` — Notification channels

- **Access**: manage (`ORG_SETTINGS`/notifications).
- **Purpose**: configure where alerts go (email, webhook, Slack, SMS, …).
- **Layout**: heading (`channels-heading`); a **create form** (`channel-create-form`): name (`channel-name-input`), **kind** (`channel-kind-select`) → conditional fields: recipients (`channel-recipients-input`), URL (`channel-url-input`), from-number (`channel-fromnumber-input`); submit (`channel-create-submit`); a **test message** action (`channel-test-msg`). Table (`channels-table`) of existing channels with test/disable/delete.
- **States**: `channels-empty`, `channels-error`, `channel-create-error`.
- **Design notes**: kind-specific fields appear/disappear; a "send test" gives immediate confidence; show last-delivery status per channel.
