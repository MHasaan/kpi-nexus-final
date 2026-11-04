"""POST /anomaly/detect — outlier detection over a numeric series."""

from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.anomaly import detect
from app.validation import Series, Timestamps

router = APIRouter(tags=["anomaly"])


class AnomalyRequest(BaseModel):
    values: Series
    timestamps: Optional[Timestamps] = None
    threshold: float = Field(default=3.0, gt=0, le=100)
    # An unknown method used to fall back to ensemble silently (BE-024).
    method: Literal["ensemble", "isolation_forest", "zscore", "ewma"] = "ensemble"


@router.post("/anomaly/detect")
def anomaly_detect(req: AnomalyRequest) -> dict[str, Any]:
    return detect(req.values, method=req.method, threshold=req.threshold)
