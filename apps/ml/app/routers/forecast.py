"""POST /forecast — naive linear forecast with confidence bands."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.forecast import forecast
from app.validation import ModelName, Series, Timestamps

router = APIRouter(tags=["forecast"])


class ForecastRequest(BaseModel):
    values: Series
    timestamps: Optional[Timestamps] = None
    # Same bound as the API (analytics.controller.ts); 1e6 took 18 s of CPU (BE-024).
    horizon: int = Field(default=30, ge=1, le=365)
    model: ModelName = "naive"  # prophet/arima deferred → naive fallback


@router.post("/forecast")
def forecast_endpoint(req: ForecastRequest) -> dict[str, Any]:
    return forecast(req.values, horizon=req.horizon, model=req.model)
