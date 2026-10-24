from fastapi.testclient import TestClient

from app.main import app


def test_healthz_reports_ok() -> None:
    client = TestClient(app)
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_healthz_exposes_no_secrets() -> None:
    client = TestClient(app)
    body = client.get("/healthz").text
    assert "change-me" not in body
    assert "postgresql" not in body
