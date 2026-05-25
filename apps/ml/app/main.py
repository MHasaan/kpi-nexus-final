"""KPI Nexus ML sidecar.

P0 ships only /health and /health/echo. Real endpoints (anomaly/forecast/whatif/
correlation/seasonality) land in P5 — see docs/superpowers/plans/P5-ai-layer.md.
"""

from fastapi import FastAPI

from app.routers import health

app = FastAPI(title="KPI Nexus ML Sidecar", version="0.1.0")
app.include_router(health.router)
