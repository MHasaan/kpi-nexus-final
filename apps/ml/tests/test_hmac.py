"""HMAC auth: pure signature verification + middleware enforcement."""

import os

from fastapi.testclient import TestClient

from app.middleware.hmac_auth import compute_signature, verify

SECRET = "test-secret-key"
ORG = "org_123"
NOW = 1_700_000_000_000  # fixed unix-ms


def test_valid_signature_verifies() -> None:
    sig = compute_signature(SECRET, ORG, NOW)
    assert verify(SECRET, ORG, NOW, sig, now_ms=NOW) is True


def test_wrong_secret_rejected() -> None:
    sig = compute_signature("other-secret", ORG, NOW)
    assert verify(SECRET, ORG, NOW, sig, now_ms=NOW) is False


def test_tampered_tenant_rejected() -> None:
    sig = compute_signature(SECRET, ORG, NOW)
    assert verify(SECRET, "org_evil", NOW, sig, now_ms=NOW) is False


def test_stale_timestamp_rejected() -> None:
    sig = compute_signature(SECRET, ORG, NOW)
    # 6 minutes later, default 5-min window → rejected.
    assert verify(SECRET, ORG, NOW, sig, now_ms=NOW + 6 * 60 * 1000) is False


def test_custom_skew_window_allows_within_bound() -> None:
    sig = compute_signature(SECRET, ORG, NOW)
    assert verify(SECRET, ORG, NOW, sig, now_ms=NOW + 6 * 60 * 1000, skew_ms=10 * 60 * 1000) is True


def test_non_numeric_timestamp_rejected() -> None:
    sig = compute_signature(SECRET, ORG, NOW)
    assert verify(SECRET, ORG, "not-a-number", sig, now_ms=NOW) is False


def _client() -> TestClient:
    os.environ["ML_SIDECAR_HMAC_SECRET"] = SECRET
    os.environ["ENV"] = "test"
    from app.main import app

    return TestClient(app)


def test_health_is_open_without_signature() -> None:
    assert _client().get("/health").status_code == 200


def test_protected_route_rejects_missing_signature() -> None:
    res = _client().post("/anomaly/detect", json={"values": [1, 2, 3]})
    assert res.status_code == 401


def test_protected_route_accepts_valid_signature() -> None:
    client = _client()
    import time

    ts = int(time.time() * 1000)
    sig = compute_signature(SECRET, ORG, ts)
    res = client.post(
        "/anomaly/detect",
        headers={"X-Tenant-Id": ORG, "X-Signature-Timestamp": str(ts), "X-Signature": sig},
        json={"values": [10, 11, 9, 10, 12, 8, 10, 11, 9, 100, 10, 9], "method": "zscore"},
    )
    assert res.status_code == 200
    body = res.json()
    assert any(a["index"] == 9 for a in body["anomalies"])
