"""POST /correlation — pairwise correlation across named series."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.correlation import correlate

router = APIRouter(tags=["correlation"])


class CorrelationRequest(BaseModel):
    series: dict[str, list[float]]
    method: str = "pearson"  # pearson | spearman


@router.post("/correlation")
def correlation_endpoint(req: CorrelationRequest) -> dict[str, Any]:
    return correlate(req.series, method=req.method)
