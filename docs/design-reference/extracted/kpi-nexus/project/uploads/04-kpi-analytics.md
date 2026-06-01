# 04 — KPI Analytics (Anomalies, Forecast, What-if, Embed)

AI/ML-backed analytics for a single KPI. These are dedicated subroutes under a KPI and
should also be reachable as tabs/links from the KPI detail Overview (03). All require
`ANALYTICS_VIEW` (+ `KPI_VIEW` + visibility on the KPI). Results come from the Python ML
sidecar via the api; surface **model name, metrics, and (where relevant) confidence**.

---

## `/kpis/[id]/anomalies` — Anomaly detection

- **Purpose**: detect anomalous data points for the KPI and optionally persist them.
- **Layout**: controls — detection **method** (`anom-method`, e.g. z-score/IQR), **threshold** (`anom-threshold`), **Detect** button (`anom-detect`); results region (`anom-detected`) = the KPI trend chart with **anomaly markers** (anomaly chart variant: markers + tooltips) + a list of flagged points; **persist** toggle/button (`anom-detect-persist`) to save detections; saved confirmation (`anom-saved`).
- **Data/API**: analytics anomaly endpoint (api → ML sidecar). Persisted anomalies show a confirmed/unconfirmed state.
- **States**: `anom-error`; empty (no anomalies found) is a *positive* empty state ("No anomalies detected").
- **Design notes**: markers must be shape+color (not color-only); tooltip shows value, expected range, deviation. Confidence/score per anomaly.

## `/kpis/[id]/forecast` — Forecast

- **Purpose**: project the KPI forward N periods with confidence bands.
- **Layout**: controls — **model** (`fc-model`), **horizon** (`fc-horizon`), **Run** (`fc-run`); result = the **forecast chart variant** (historical line + `yhat` + 80/95% confidence bands) and a **fit metrics** panel (`fc-metrics`: RMSE, MAPE).
- **Data/API**: analytics forecast endpoint (api → ML). (Prophet/ARIMA are documented deferrals; the current model set is what the API returns — render whatever models it offers.)
- **States**: `fc-error`; loading shows the chart skeleton.
- **Design notes**: bands as translucent area fills behind the yhat line; clearly separate "actual" vs "forecast" (e.g., dashed forecast segment + a "today" divider). Metrics with plain-language tooltips.

## `/kpis/[id]/whatif` — What-if simulator

- **Purpose**: explore "if I change driver X by Δ, what happens to this KPI?"
- **Layout**: pick a **mechanic/driver** (`wi-mechanic`), set a **delta** (`wi-delta`) or **lift %** (`wi-lift-pct`), **Run** (`wi-run`); result panel (`wi-result`) shows projected impact (before/after, absolute + %).
- **Data/API**: analytics what-if endpoint (api → ML).
- **States**: `wi-error`.
- **Design notes**: sliders for deltas with live preview; show the causal assumption plainly ("assumes linear relationship"); before→after as a small bar/delta visual.

## `/kpis/[id]/embed` — Embed generator

- **Purpose**: generate a signed embed token + iframe snippet to embed this KPI card on an external page.
- **Layout**: heading (`embed-generator-heading`); **Generate** (`embed-generate-btn`) → token output (`embed-token-output` / `embed-token-value`) with a **copy token** button (`embed-copy-token-btn`); an **iframe snippet** (`embed-iframe-snippet`) with **copy iframe** (`embed-copy-iframe-btn`); a **live preview** iframe (`embed-preview-iframe`) rendering `/embed/kpi/[token]`.
- **Data/API**: embed-token endpoint (HMAC-signed). Token is shown once-ish; allow regenerate/revoke.
- **States**: `embed-generate-error`.
- **Design notes**: emphasize the security model (signed token, read-only, respects scope); copy buttons give toast confirmation. The rendered target is the chrome-less `/embed/kpi/[token]` (see 13).
