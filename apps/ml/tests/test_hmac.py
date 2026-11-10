"""HMAC auth: pure signature verification + middleware enforcement."""

import json
import os
import time

import pytest
from fastapi.testclient import TestClient

from app.middleware.hmac_auth import compute_signature, verify

SECRET = "test-secret-key"
ORG = "org_123"
NOW = 1_700_000_000_000  # fixed unix-ms
BODY = b'{"values":[1,2,3]}'
PATH = "/anomaly/detect"


def _sig(**overrides: object) -> str:
    args = {"secret": SECRET, "tenant_id": ORG, "ts_ms": NOW, "method": "POST", "path": PATH, "body": BODY}
    args.update(overrides)
    return compute_signature(**args)  # type: ignore[arg-type]


def _verify(sig: str, **overrides: object) -> bool:
    args = {
        "secret": SECRET,
        "tenant_id": ORG,
        "ts_ms": NOW,
        "signature": sig,
        "now_ms": NOW,
        "method": "POST",
        "path": PATH,
        "body": BODY,
    }
    args.update(overrides)
    return verify(**args)  # type: ignore[arg-type]


def test_valid_signature_verifies() -> None:
    assert _verify(_sig()) is True


def test_reference_vector_matches_the_api_signer() -> None:
    # Same inputs + expected digest as apps/api/src/ml/ml-signature.spec.ts.
    sig = compute_signature("dev-ml-shared-secret", "org_test", 1700000000000, "POST", "/forecast", b'{"values":[1,2,3],"horizon":7}')
    assert sig == "6403642190ea8cf62b4db487df4d61ec79394b07c757b2002a39ba54fba3364d"


def test_wrong_secret_rejected() -> None:
    assert _verify(_sig(secret="other-secret")) is False


def test_tampered_tenant_rejected() -> None:
    assert _verify(_sig(), tenant_id="org_evil") is False


def test_swapped_body_rejected() -> None:
    # BE-024: the signature used to cover only "{ts}.{tenant}", so a captured
    # request could be replayed with any body for 5 minutes.
    assert _verify(_sig(), body=b'{"values":[9,9,9],"horizon":1000000}') is False


def test_swapped_path_or_method_rejected() -> None:
    assert _verify(_sig(), path="/forecast") is False
    assert _verify(_sig(), method="PUT") is False


def test_stale_timestamp_rejected() -> None:
    # 6 minutes later, default 5-min window → rejected.
    assert _verify(_sig(), now_ms=NOW + 6 * 60 * 1000) is False


def test_custom_skew_window_allows_within_bound() -> None:
    assert _verify(_sig(), now_ms=NOW + 6 * 60 * 1000, skew_ms=10 * 60 * 1000) is True


def test_non_numeric_timestamp_rejected() -> None:
    assert _verify(_sig(), ts_ms="not-a-number") is False


def _client() -> TestClient:
    os.environ["ML_SIDECAR_HMAC_SECRET"] = SECRET
    os.environ["ENV"] = "test"
    from app.main import app

    return TestClient(app)


def _signed_post(
    client: TestClient, path: str, payload: dict, signed_body: bytes | None = None, host: str | None = None
):
    body = json.dumps(payload).encode()
    ts = int(time.time() * 1000)
    sig = compute_signature(SECRET, ORG, ts, "POST", path, signed_body if signed_body is not None else body)
    return client.post(
        path,
        headers={
            "X-Tenant-Id": ORG,
            "X-Signature-Timestamp": str(ts),
            "X-Signature": sig,
            "content-type": "application/json",
            **({"Host": host} if host else {}),
        },
        content=body,
    )


def test_health_is_open_without_signature() -> None:
    assert _client().get("/health").status_code == 200


def test_protected_route_rejects_missing_signature() -> None:
    res = _client().post("/anomaly/detect", json={"values": [1, 2, 3]})
    assert res.status_code == 401


def test_protected_route_accepts_valid_signature() -> None:
    res = _signed_post(
        _client(),
        "/anomaly/detect",
        {"values": [10, 11, 9, 10, 12, 8, 10, 11, 9, 100, 10, 9], "method": "zscore"},
    )
    assert res.status_code == 200
    assert any(a["index"] == 9 for a in res.json()["anomalies"])


def test_protected_route_rejects_a_replayed_signature_with_a_different_body() -> None:
    original = json.dumps({"values": [1, 2, 3], "horizon": 7}).encode()
    res = _signed_post(_client(), "/forecast", {"values": [1, 2, 3], "horizon": 365}, signed_body=original)
    assert res.status_code == 401


# The health exemption and the signed path must come from the path the router
# dispatches on, not from request.url, which Starlette rebuilds from the
# untrusted Host header by appending the real path to it. A Host of "x/health"
# made every route look exempt; a trailing "?" turns the real path into a
# query string, so request.url.path can be set to any value.
ANALYTICS_CASES = [
    ("/forecast", {"values": [1, 2, 3, 4], "horizon": 2}),
    ("/anomaly/detect", {"values": [1, 1, 1, 10], "method": "zscore"}),
    ("/whatif", {"baseline": {"values": [1, 2, 3]}, "scenarios": [{"name": "up", "type": "percent", "value": 10}]}),
    ("/correlation", {"series": {"a": [1, 2, 3, 4], "b": [2, 4, 6, 8]}}),
    ("/seasonality", {"series": [1, 2] * 8, "period": 2}),
]


@pytest.mark.parametrize("host", ["testserver/health", "testserver/health?"])
@pytest.mark.parametrize(("path", "payload"), ANALYTICS_CASES)
def test_forged_host_cannot_make_a_protected_route_look_like_health(path: str, payload: dict, host: str) -> None:
    res = _client().post(path, json=payload, headers={"Host": host})
    assert res.status_code == 401


def test_forged_host_cannot_replay_a_signature_on_another_route() -> None:
    # Signed for /forecast, sent to /anomaly/detect with a Host that makes
    # request.url.path read /forecast (BE-024 path binding).
    payload = {"values": [1, 1, 1, 10], "method": "zscore"}
    body = json.dumps(payload).encode()
    ts = int(time.time() * 1000)
    res = _client().post(
        "/anomaly/detect",
        headers={
            "Host": "testserver/forecast?",
            "X-Tenant-Id": ORG,
            "X-Signature-Timestamp": str(ts),
            "X-Signature": compute_signature(SECRET, ORG, ts, "POST", "/forecast", body),
            "content-type": "application/json",
        },
        content=body,
    )
    assert res.status_code == 401


def test_valid_signature_still_verifies_when_host_is_unusual() -> None:
    res = _signed_post(_client(), "/forecast", {"values": [1, 2, 3, 4], "horizon": 2}, host="testserver/health")
    assert res.status_code == 200
