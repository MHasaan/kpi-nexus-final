"""HMAC request authentication for the ML sidecar.

The API signs each call with
`HMAC-SHA256(secret, "{timestampMs}.{tenantId}.{METHOD}.{path}.{sha256hex(body)}")`
sent as `X-Signature`, plus `X-Tenant-Id` and `X-Signature-Timestamp`. Binding
method, path and body means a captured request can't be replayed against
another endpoint or with a different payload (BE-024); the ±5-minute skew window
still bounds plain replays. The sidecar recomputes and compares in constant
time. All routes except `/health` are protected. The placeholder dev secret is
refused when ENV=production.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

DEV_SECRET = "dev-ml-shared-secret"
DEFAULT_SKEW_MS = 5 * 60 * 1000


def compute_signature(secret: str, tenant_id: str, ts_ms: int, method: str, path: str, body: bytes) -> str:
    """MUST match signMlRequest in apps/api/src/ml/ml-signature.ts byte for byte."""
    body_hash = hashlib.sha256(body).hexdigest()
    msg = f"{ts_ms}.{tenant_id}.{method.upper()}.{path}.{body_hash}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def verify(
    secret: str,
    tenant_id: str,
    ts_ms: object,
    signature: str,
    now_ms: int,
    method: str,
    path: str,
    body: bytes,
    skew_ms: int = DEFAULT_SKEW_MS,
) -> bool:
    """Constant-time verify of a signature + freshness check. Never raises."""
    try:
        ts_int = int(ts_ms)
    except (TypeError, ValueError):
        return False
    if abs(now_ms - ts_int) > skew_ms:
        return False
    expected = compute_signature(secret, tenant_id, ts_int, method, path, body)
    return hmac.compare_digest(expected, signature or "")


def _resolve_secret() -> str:
    secret = os.environ.get("ML_SIDECAR_HMAC_SECRET", DEV_SECRET)
    if secret == DEV_SECRET and os.environ.get("ENV") == "production":
        raise RuntimeError("ML_SIDECAR_HMAC_SECRET must not be the dev default in production")
    return secret


class HmacAuthMiddleware(BaseHTTPMiddleware):
    """Reject unsigned/invalid requests to any path other than /health."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        if request.url.path == "/health" or request.url.path.startswith("/health/"):
            return await call_next(request)

        secret = _resolve_secret()
        tenant = request.headers.get("X-Tenant-Id", "")
        ts = request.headers.get("X-Signature-Timestamp", "")
        sig = request.headers.get("X-Signature", "")
        if not tenant or not ts or not sig:
            return JSONResponse({"detail": "Missing signature headers"}, status_code=401)
        # Starlette caches the body, so the route can still read it after this.
        body = await request.body()
        if not verify(
            secret,
            tenant,
            ts,
            sig,
            now_ms=int(time.time() * 1000),
            method=request.method,
            path=request.url.path,
            body=body,
        ):
            return JSONResponse({"detail": "Invalid signature"}, status_code=401)
        return await call_next(request)
