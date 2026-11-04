"""POST /seasonality — seasonal decomposition via statsmodels."""

from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.seasonality import decompose
from app.validation import Series

router = APIRouter(tags=["seasonality"])


class SeasonalityRequest(BaseModel):
    series: Series
    period: Optional[int] = Field(default=None, ge=2, le=365)
    model: Literal["additive", "multiplicative"] = "additive"


@router.post("/seasonality")
def seasonality_endpoint(req: SeasonalityRequest) -> dict[str, Any]:
    try:
        return decompose(req.series, period=req.period, model=req.model)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
