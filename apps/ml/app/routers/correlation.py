"""POST /correlation — pairwise correlation across named series."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field, model_validator

from app.services.correlation import correlate
from app.validation import Series

router = APIRouter(tags=["correlation"])


class CorrelationRequest(BaseModel):
    series: dict[str, Series] = Field(min_length=2, max_length=50)
    method: Literal["pearson", "spearman"] = "pearson"

    @model_validator(mode="after")
    def _equal_lengths(self) -> "CorrelationRequest":
        # Unequal series used to be silently truncated to the shortest (BE-024).
        if len({len(v) for v in self.series.values()}) > 1:
            raise ValueError("all series must have the same length")
        return self


@router.post("/correlation")
def correlation_endpoint(req: CorrelationRequest) -> dict[str, Any]:
    return correlate(req.series, method=req.method)
