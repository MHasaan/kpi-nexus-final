"""POST /forecast — naive linear forecast with confidence bands."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.forecast import forecast

router = APIRouter(tags=["forecast"])


class ForecastRequest(BaseModel):
    values: list[float]
    timestamps: Optional[list[str]] = None
    horizon: int = 30
    model: str = "naive"  # prophet/arima deferred → naive fallback


@router.post("/forecast")
def forecast_endpoint(req: ForecastRequest) -> dict[str, Any]:
    return forecast(req.values, horizon=req.horizon, model=req.model)
