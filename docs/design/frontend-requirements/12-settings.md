# 12 — Settings

Admin configuration. These are separate routes today; the design pass should present them
as a **tabbed/sectioned Settings shell** (left sub-nav: Organization, AI, Notifications,
API keys, Webhooks, Retention, SSO, SCIM, Audit, …) with a consistent two-column
"setting + description" layout. All require `ORG_SETTINGS` unless noted.

---

## `/settings/organization` — Org settings, branding & terminology

- **Purpose**: org name/branding, **custom terminology** (rename "KPI"→"Metric", "Org Unit"→"Team", etc.), fiscal calendar, locale defaults, lifecycle.
- **Layout**: grouped setting rows; terminology editor (singular/plural per term) that re-labels the whole app; save → `settings-saved` confirmation. Nav `nav-roles` present in the settings sub-nav.
- **Data/API**: `GET/PATCH /organizations/me`, `/organizations/me/terminology`.
- **Design notes**: live preview of terminology changes; branding (logo/color) feeds the app shell.

## `/settings/ai` — AI providers, budget & BYO keys

- **Purpose**: configure AI provider routing, **budget caps**, and bring-your-own provider keys (encrypted).
- **Layout**: a **budget** section (`ai-budget-section`): daily cap input (`ai-daily-cap-input`) + save (`ai-save-cap`), monthly cap, current spend vs cap; a **configs** section (`ai-configs-section`): per-feature provider/model selection (11 AI features) with fallback order; a **BYO keys** section (`ai-byo-section`): add/rotate provider keys (AES-encrypted; never displayed after save).
- **States**: `ai-settings-error`.
- **Design notes**: show budget usage as a meter (spend/cap) with reset time; per-feature config in a table; BYO key add shows masked value + "set" state only.

## `/settings/notifications` — Notification preferences

- **Purpose**: per-user/org notification settings + quiet hours.
- **Layout**: form (`notif-settings-form`) — channel toggles + **mute window** (`mute-start`/`mute-end`); save (`notif-settings-save`) → `notif-settings-saved`.
- **States**: `notif-settings-error`.
- **Design notes**: quiet-hours as a time range; per-event-type toggles.

## `/settings/notifications/dlq` — Notification dead-letter queue

- **Purpose**: inspect failed notification deliveries and retry.
- **Layout**: heading (`dlq-heading`); **Refresh** (`dlq-refresh`); a **table** (`dlq-table`) of failed deliveries (channel, alert, error, attempts) with retry.
- **States**: `dlq-empty`, `dlq-error`.
- **Design notes**: ops-flavored table; per-row retry + bulk retry; show attempt count + last error.

## `/settings/api-keys` — API keys

- **Purpose**: mint/revoke API keys with **permission scopes** (scopes are the 18 PermissionKeys; e.g., a `KPI_DATA_ENTRY`-only key can POST `/ingest` but not create KPIs).
- **Layout**: heading (`apikeys-heading`); **create** (`apikey-create-form`): name (`apikey-name-input`), scopes (multi-select), submit (`apikey-create-submit`) → **plaintext shown once** (`apikey-plaintext`) with copy + dismiss (`apikey-plaintext-dismiss`); a **table** (`apikeys-table`) — prefix, scopes, last used, revoke.
- **States**: `apikeys-empty`, `apikeys-error`, `apikey-create-error`.
- **Design notes**: the "copy now, shown once" pattern must be unmistakable (modal, mono, copy button, warning); scope multi-select grouped like the permission matrix.

## `/settings/webhooks` — Outbound webhooks

- **Purpose**: subscribe external URLs to domain events.
- **Layout**: heading (`webhooks-heading`); **create** (`webhook-create-form`): name (`webhook-name-input`), URL (`webhook-url-input`), **events** multi-select (from `GET /webhooks/events` catalog — data_point_added, alert_triggered, task_created, approval_request_decided, connector_run_completed, …); submit (`webhook-create-submit`) → **signing secret shown once** (`webhook-secret` + dismiss `webhook-secret-dismiss`); a **table** (`webhooks-table`) with rotate-secret, test, enable/disable, delete (`webhook-status-msg`).
- **States**: `webhooks-empty`, `webhooks-error`, `webhook-create-error`.
- **Design notes**: event picker grouped by domain; secret-shown-once like API keys; per-webhook delivery health.

## `/settings/retention` — Data retention (P9)

- **Purpose**: per-entity retention + **tier presets** (FREE 90d / PRO 1yr / ENTERPRISE 7yr).
- **Layout**: a **tiers** section (`retention-tiers`) of preset cards (`tier-FREE|PRO|ENTERPRISE`) with **Apply** (`apply-tier-<TIER>`); a **current policies** list (`retention-policies`) — entity type → days.
- **States**: `retention-empty`, `retention-error`.
- **Design notes**: preset cards (days per tier) + one-click apply; per-entity overrides; run-now/schedule-daily controls are a future add.

## `/settings/sso` — Single sign-on (P9)

- **Purpose**: configure SAML/OIDC + JIT provisioning.
- **Layout**: form — **protocol** (`sso-protocol`: SAML/OIDC), IdP SSO URL (`sso-url`), IdP entity id (`sso-entity`), **JIT provisioning** toggle (`sso-jit`), **Active** toggle (`sso-active`); save (`sso-save`) → `sso-saved`. (Live SAML exchange is WorkOS-deferred; this configures it.)
- **States**: `sso-error`.
- **Design notes**: a "Test login" button + metadata/cert upload are planned; show the ACS/callback URLs to paste into the IdP.

## `/settings/scim` — SCIM provisioning tokens (P9)

- **Purpose**: mint/revoke the bearer token an IdP (Okta/Azure AD) uses at `/scim/v2`.
- **Layout**: heading; **mint** — label (`scim-label`) + **Mint token** (`scim-mint`) → **token shown once** (`scim-minted` / `scim-token-value`) with copy; a **token list** (`scim-token-list`) — each (`scim-token-<id>`): label, last used, revoke (`scim-revoke-<id>`).
- **States**: `scim-empty`, `scim-error`.
- **Design notes**: shown-once pattern; show the SCIM base URL to paste into the IdP; documentation link.

## `/settings/audit` — Audit log

- **Purpose**: searchable org audit trail.
- **Layout**: heading (`audit-heading`); **filters** (`audit-filters`): action (`filter-action`), entity type (`filter-entity-type`) + **Apply** (`audit-apply-filters`); a **list** (`audit-list`) — each entry: actor, **action badge** (`audit-action-badge`), entity, timestamp, metadata. Nav `nav-audit`.
- **States**: `audit-empty`, `audit-error`.
- **Design notes**: dense, filterable, exportable; complements `/activity` (this is the admin/forensic view).

> **Also planned (not yet built, but referenced in spec §12.7)**: `/settings/billing`,
> `/settings/custom-domain` (DNS TXT verify + cert), `/settings/security`, `/admin` (platform
> admin + impersonation), `/status` (health dashboard). Design these to slot into the same
> Settings shell when implemented.
