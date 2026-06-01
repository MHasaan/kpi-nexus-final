# 13 — Public Pages & Embeds (no app shell, no auth)

These render **outside the app shell with no authentication** — reached via signed tokens.
They must look clean standalone and must **never leak** anything beyond what the token grants.

---

## `/share/[token]` — Public dashboard viewer

- **Access**: public; resolves a dashboard **share link** by token. May be password-protected and/or expired.
- **Purpose**: let an external viewer see a shared dashboard read-only.
- **Layout**:
  - If the link needs a password → a **password prompt** (`share-password-prompt`): input + **submit** (`share-password-submit`), error (`share-password-error`).
  - On success → the **public dashboard viewer** (`public-dashboard-viewer`): the dashboard's widgets (`share-widgets`) + KPI values (`share-kpi-values`), read-only, branded minimally.
  - Loading (`share-loading`); not-found (`share-not-found`); expired (`share-expired`); empty (`share-empty`).
- **Data/API**: public share resolve endpoint (token → dashboard); password verified via POST (not in URL).
- **States**: `share-error`, plus the explicit not-found/expired/password states above.
- **Design notes**: no nav, no user menu; a small "Powered by KPI Nexus" footer; respects the dashboard's data exactly as captured/shared; charts theme-aware (default light). Must be safe to send to anyone with the link.

## `/embed/kpi/[token]` — Chrome-less KPI embed

- **Access**: public; resolves a signed **embed token** for a single KPI (generated at `/kpis/[id]/embed`, see 04).
- **Purpose**: a tiny, self-contained KPI card to iframe into an external page (intranet, Notion, etc.).
- **Layout**: just the **KPI card** (`embed-kpi-card`) — name, current value (tabular), trend sparkline, target/status; no chrome, transparent-friendly background; sized to fit an iframe.
- **States**: `embed-kpi-error` (invalid/expired token) — a minimal, non-leaking error.
- **Design notes**: must render fast and standalone; honor the token's scope (read-only, single KPI); optional light/dark via a query param; the live preview at `/kpis/[id]/embed` renders this exact route.

## `/kpis/[id]/embed`

This is the **generator** (authenticated) — documented in [04-kpi-analytics.md](./04-kpi-analytics.md).
It produces the token + iframe snippet whose target is `/embed/kpi/[token]` above.

---

### Cross-cutting notes for public surfaces
- No `localStorage` tokens; no app-shell chrome; no permission-gated actions.
- Never render data the token doesn't explicitly cover; fail closed with a generic message.
- These are the only routes safe to share externally — keep their visual identity consistent and trustworthy (clear "shared/embedded view" affordance, minimal branding).
