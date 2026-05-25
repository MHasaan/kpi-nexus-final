from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_echo_returns_payload() -> None:
    response = client.post("/health/echo", json={"hello": "world"})
    assert response.status_code == 200
    assert response.json() == {"received": {"hello": "world"}}
