"""KPI Nexus ML sidecar.

Stateless analytics endpoints called by the API over HMAC-authenticated HTTP:
  - /anomaly/detect   outlier detection (zscore/ewma/isolation_forest/ensemble)
  - /forecast         naive / Prophet / ARIMA forecast + confidence bands
  - /whatif           scenario simulation
  - /correlation      pairwise Pearson/Spearman
  - /seasonality      seasonal decomposition (trend/seasonal/resid via statsmodels)
All routes except /health require a valid HMAC signature (see HmacAuthMiddleware).
"""

from fastapi import FastAPI

from app.middleware.hmac_auth import HmacAuthMiddleware
from app.routers import anomaly, correlation, forecast, health, seasonality, whatif

app = FastAPI(title="KPI Nexus ML Sidecar", version="0.1.0")
app.add_middleware(HmacAuthMiddleware)

app.include_router(health.router)
app.include_router(anomaly.router)
app.include_router(forecast.router)
app.include_router(whatif.router)
app.include_router(correlation.router)
app.include_router(seasonality.router)
