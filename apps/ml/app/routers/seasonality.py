"""POST /seasonality — seasonal decomposition via statsmodels."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.seasonality import decompose

router = APIRouter(tags=["seasonality"])


class SeasonalityRequest(BaseModel):
    series: list[float]
    period: Optional[int] = None
    model: str = "additive"


@router.post("/seasonality")
def seasonality_endpoint(req: SeasonalityRequest) -> dict[str, Any]:
    try:
        return decompose(req.series, period=req.period, model=req.model)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
