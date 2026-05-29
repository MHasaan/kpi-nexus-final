"""POST /anomaly/detect — outlier detection over a numeric series."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.anomaly import detect

router = APIRouter(tags=["anomaly"])


class AnomalyRequest(BaseModel):
    values: list[float]
    timestamps: Optional[list[str]] = None
    threshold: float = 3.0
    method: str = "ensemble"  # ensemble | isolation_forest | zscore | ewma


@router.post("/anomaly/detect")
def anomaly_detect(req: AnomalyRequest) -> dict[str, Any]:
    return detect(req.values, method=req.method, threshold=req.threshold)
