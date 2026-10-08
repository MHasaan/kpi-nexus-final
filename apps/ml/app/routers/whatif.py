"""POST /whatif — scenario simulation over a baseline series."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.whatif import simulate
from app.validation import Series

router = APIRouter(tags=["whatif"])


class Baseline(BaseModel):
    values: Series


class WhatIfRequest(BaseModel):
    baseline: Baseline
    scenarios: list[dict[str, Any]] = Field(max_length=50)


@router.post("/whatif")
def whatif_endpoint(req: WhatIfRequest) -> dict[str, Any]:
    return simulate(req.baseline.values, req.scenarios)
