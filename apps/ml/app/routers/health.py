"""Liveness + smoke endpoints for the ML sidecar."""

from typing import Any

from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def health() -> dict[str, bool]:
    return {"ok": True}


@router.post("/echo")
def echo(payload: dict[str, Any]) -> dict[str, Any]:
    return {"received": payload}
