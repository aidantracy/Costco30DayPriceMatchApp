from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AutomationRun, Device, RunKind, RunStatus, User
from tests.api.conftest import Clock

H = dict[str, str]
TOKEN = "ExponentPushToken[example-0000000000]"


def test_register_device_is_idempotent(client: TestClient, auth: H, session: Session) -> None:
    first = client.post("/devices", json={"platform": "android", "push_token": TOKEN}, headers=auth)
    again = client.post("/devices", json={"platform": "android", "push_token": TOKEN}, headers=auth)
    assert first.status_code == again.status_code == 201
    assert first.json()["id"] == again.json()["id"]
    assert len(session.scalars(select(Device)).all()) == 1


def test_token_moves_to_whoever_signed_in_last(
    client: TestClient, auth: H, other_auth: H, session: Session
) -> None:
    client.post("/devices", json={"platform": "ios", "push_token": TOKEN}, headers=auth)
    client.post("/devices", json={"platform": "ios", "push_token": TOKEN}, headers=other_auth)
    device = session.scalars(select(Device)).one()
    other = session.scalar(select(User).where(User.email == "other@example.com"))
    assert other is not None and device.user_id == other.id


def test_remove_device(client: TestClient, auth: H, other_auth: H) -> None:
    did = client.post(
        "/devices", json={"platform": "ios", "push_token": TOKEN}, headers=auth
    ).json()["id"]
    assert client.delete(f"/devices/{did}", headers=other_auth).status_code == 404
    assert client.delete(f"/devices/{did}", headers=auth).status_code == 204
    assert client.delete(f"/devices/{did}", headers=auth).status_code == 404


def test_device_validation(client: TestClient, auth: H) -> None:
    bad = client.post("/devices", json={"platform": "windows", "push_token": TOKEN}, headers=auth)
    assert bad.status_code == 422


def test_review_queue_flow(client: TestClient, auth: H, other_auth: H) -> None:
    body = {"source": "screenshot", "reason": "subtotal check failed", "parser_version": "v1"}
    rid = client.post("/review-items", json=body, headers=auth).json()["id"]
    assert [r["id"] for r in client.get("/review-items", headers=auth).json()] == [rid]
    assert client.get("/review-items", headers=other_auth).json() == []
    resolve = {"resolution": "manual_entry"}
    assert client.patch(f"/review-items/{rid}", json=resolve, headers=other_auth).status_code == 404
    assert client.patch(f"/review-items/{rid}", json=resolve, headers=auth).status_code == 200
    assert client.patch(f"/review-items/{rid}", json=resolve, headers=auth).status_code == 409
    assert client.get("/review-items", headers=auth).json() == []


def run(clock: Clock, status: str, code: str | None = None, hours_ago: int = 0) -> dict:
    t = clock.now - timedelta(hours=hours_ago)
    return {
        "status": status,
        "error_code": code,
        "started_at": (t - timedelta(minutes=1)).isoformat(),
        "finished_at": t.isoformat(),
    }


def test_health_reports_reconnect(client: TestClient, auth: H, clock: Clock) -> None:
    assert client.get("/health", headers=auth).json() == {"issues": [], "unresolved_reviews": 0}
    client.post("/sync-runs", json=run(clock, "success", hours_ago=2), headers=auth)
    assert client.get("/health", headers=auth).json()["issues"] == []
    client.post("/sync-runs", json=run(clock, "failure", "session_expired"), headers=auth)
    issues = client.get("/health", headers=auth).json()["issues"]
    assert [(i["kind"], i["issue"]) for i in issues] == [("sync", "reconnect")]


def test_health_counts_open_reviews(client: TestClient, auth: H) -> None:
    client.post("/review-items", json={"source": "sync", "reason": "x"}, headers=auth)
    assert client.get("/health", headers=auth).json()["unresolved_reviews"] == 1


def test_health_includes_price_check_runs(
    client: TestClient, auth: H, owner: User, session: Session, clock: Clock
) -> None:
    session.add(
        AutomationRun(
            user_id=owner.id,
            kind=RunKind.PRICE_CHECK,
            status=RunStatus.FAILURE,
            error_code="challenge",
            started_at=clock.now,
            finished_at=None,
        )
    )
    session.flush()
    issues = client.get("/health", headers=auth).json()["issues"]
    assert [(i["kind"], i["issue"]) for i in issues] == [("price_check", "blocked")]


def test_sync_run_validation(client: TestClient, auth: H, clock: Clock) -> None:
    assert client.post("/sync-runs", json=run(clock, "failure"), headers=auth).status_code == 422
    assert (
        client.post("/sync-runs", json=run(clock, "success", "network"), headers=auth).status_code
        == 422
    )
    backwards = run(clock, "success")
    backwards["started_at"], backwards["finished_at"] = (
        backwards["finished_at"],
        backwards["started_at"],
    )
    assert client.post("/sync-runs", json=backwards, headers=auth).status_code == 422
    unknown = run(clock, "failure", "page dump with receipt contents")
    assert client.post("/sync-runs", json=unknown, headers=auth).status_code == 422


def test_rules(client: TestClient, auth: H) -> None:
    r = client.get("/rules", headers=auth).json()
    assert r["window_days"] == 30 and r["reminder_lead_days"] == 3
    assert any(e["value"] == "gold bar" for e in r["exclusions"])


def test_support_routes_require_sign_in(client: TestClient) -> None:
    for path in ("/review-items", "/health", "/rules"):
        assert client.get(path).status_code == 401
