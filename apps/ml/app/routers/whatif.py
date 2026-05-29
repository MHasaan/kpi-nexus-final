"""POST /whatif — scenario simulation over a baseline series."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.whatif import simulate

router = APIRouter(tags=["whatif"])


class Baseline(BaseModel):
    values: list[float]


class WhatIfRequest(BaseModel):
    baseline: Baseline
    scenarios: list[dict[str, Any]]


@router.post("/whatif")
def whatif_endpoint(req: WhatIfRequest) -> dict[str, Any]:
    return simulate(req.baseline.values, req.scenarios)
