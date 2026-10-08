"""Tests for /seasonality endpoint — seasonal_decompose via statsmodels."""

from __future__ import annotations

import math
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

from app.middleware.hmac_auth import compute_signature
from app.services.seasonality import decompose

# ---------------------------------------------------------------------------
# Helper to make HMAC-signed requests via the full FastAPI app
# ---------------------------------------------------------------------------

SECRET = "test-secret-key"
ORG = "org_test"


def _client() -> TestClient:
    os.environ["ML_SIDECAR_HMAC_SECRET"] = SECRET
    os.environ["ENV"] = "test"
    from app.main import app  # imported after env is set

    return TestClient(app)


def _signed_post(client: TestClient, payload: dict):
    """POST /seasonality signed over the exact bytes sent (method/path/body-bound HMAC)."""
    body = json.dumps(payload).encode()
    ts = int(time.time() * 1000)
    sig = compute_signature(SECRET, ORG, ts, "POST", "/seasonality", body)
    return client.post(
        "/seasonality",
        headers={
            "X-Tenant-Id": ORG,
            "X-Signature-Timestamp": str(ts),
            "X-Signature": sig,
            "content-type": "application/json",
        },
        content=body,
    )


# ---------------------------------------------------------------------------
# Pure-service unit tests
# ---------------------------------------------------------------------------


def _seasonal_series(period: int = 12, cycles: int = 4) -> list[float]:
    """Synthetic series: sine wave with trend, `period` points per cycle."""
    import math as _math

    n = period * cycles
    return [10.0 + 0.1 * i + 5.0 * _math.sin(2 * _math.pi * i / period) for i in range(n)]


def test_decompose_returns_expected_keys() -> None:
    series = _seasonal_series(period=12, cycles=4)
    result = decompose(series, period=12, model="additive")
    assert set(result.keys()) >= {"trend", "seasonal", "resid", "period", "model"}


def test_decompose_output_length_matches_input() -> None:
    series = _seasonal_series(period=12, cycles=4)
    result = decompose(series, period=12)
    n = len(series)
    assert len(result["trend"]) == n
    assert len(result["seasonal"]) == n
    assert len(result["resid"]) == n


def test_decompose_echoes_period_and_model() -> None:
    series = _seasonal_series(period=7, cycles=4)
    result = decompose(series, period=7, model="additive")
    assert result["period"] == 7
    assert result["model"] == "additive"


def test_decompose_nan_values_serialised_as_none() -> None:
    """NaNs produced by seasonal_decompose at the edges must be None (JSON-safe)."""
    series = _seasonal_series(period=12, cycles=4)
    result = decompose(series, period=12)
    # trend will have NaN at the edges; they must be None
    assert all(v is None or isinstance(v, float) for v in result["trend"])
    # Verify at least some Nones appear in trend (statsmodels pads with NaN)
    assert any(v is None for v in result["trend"])


def test_decompose_infers_period_when_none_given() -> None:
    """When period=None the service must pick a sensible default without crashing."""
    series = _seasonal_series(period=12, cycles=4)
    result = decompose(series, period=None)
    assert "period" in result
    assert result["period"] > 1


def test_decompose_too_short_series_raises() -> None:
    """Series shorter than 2*period must raise a ValueError."""
    with pytest.raises(ValueError, match="too short"):
        decompose([1.0, 2.0, 3.0], period=12)


def test_decompose_multiplicative_model() -> None:
    # Multiplicative requires all-positive values and enough length.
    series = [max(1.0, v) for v in _seasonal_series(period=4, cycles=4)]
    result = decompose(series, period=4, model="multiplicative")
    assert result["model"] == "multiplicative"
    assert len(result["seasonal"]) == len(series)


# ---------------------------------------------------------------------------
# HTTP integration tests (via TestClient + HMAC)
# ---------------------------------------------------------------------------


def test_seasonality_endpoint_returns_200_with_valid_signature() -> None:
    client = _client()
    series = _seasonal_series(period=12, cycles=4)
    res = _signed_post(client, {"series": series, "period": 12, "model": "additive"})
    assert res.status_code == 200
    body = res.json()
    assert {"trend", "seasonal", "resid", "period", "model"} <= set(body.keys())
    assert body["period"] == 12
    assert len(body["trend"]) == len(series)


def test_seasonality_endpoint_requires_hmac() -> None:
    """Without HMAC headers the endpoint must return 401."""
    client = _client()
    series = _seasonal_series(period=12, cycles=4)
    res = client.post("/seasonality", json={"series": series, "period": 12})
    assert res.status_code == 401


def test_seasonality_endpoint_too_short_returns_422() -> None:
    """Insufficient data for the requested period must return 422."""
    client = _client()
    res = _signed_post(client, {"series": [1.0, 2.0, 3.0], "period": 12})
    assert res.status_code == 422


def test_seasonality_endpoint_without_period_uses_default() -> None:
    """Omitting `period` is valid; sidecar picks a default."""
    client = _client()
    series = _seasonal_series(period=12, cycles=4)
    res = _signed_post(client, {"series": series})
    assert res.status_code == 200
    body = res.json()
    assert body["period"] > 1
