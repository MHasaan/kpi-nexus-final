# Audit — frontend (apps/web, 80 pages)

_Part 2 of the audit. Pre-loaded with findings seen so far._

## Findings

### FE-001 · High · Dashboard marks over-target "lower is better" KPIs as On track
- **Repro:** sign in as `admin@helios.io` → `/dashboard`.
- **Actual:** Gross Logo Churn 3.5 % (target ≤ 2.5 %) shows **On track**, next to an open HIGH alert saying it breached. Same for CAC / MTTR. Their >100 % ratios also inflate "Avg attainment".
- **Cause:** `deriveStatus()` / `attainmentPct()` in `apps/web/src/app/dashboard/page.tsx:149-162` use `latest / target ≥ 0.95` and ignore KPI direction and threshold bands.
- **Expected:** direction-aware status (ideally server-computed so web and API agree).
