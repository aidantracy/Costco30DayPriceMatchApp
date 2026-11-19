from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AutomationRun, PriceObservation, PriceSource, RunKind
from tests.api.conftest import Clock
from tests.api.helpers import batch

H = dict[str, str]
WHEN = {"started_at": "2026-10-01T18:00:00Z", "finished_at": "2026-10-01T18:01:00Z"}


def check(client: TestClient, auth: H, *results: dict[str, object]) -> dict[str, object]:
    r = client.post("/price-checks", json={**WHEN, "results": list(results)}, headers=auth)
    assert r.status_code == 200, r.text
    return r.json()  # type: ignore[no-any-return]


def later(client: TestClient, clock: Clock, days: int) -> H:
    """Move the clock forward and sign in again (access tokens last 15 minutes)."""
    from tests.conftest import OWNER_PASSWORD

    clock.now += timedelta(days=days)
    r = client.post("/auth/login", json={"email": "owner@example.com", "password": OWNER_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def due(client: TestClient, auth: H) -> list[str]:
    r = client.get("/price-checks/due", headers=auth)
    assert r.status_code == 200, r.text
    return r.json()["item_numbers"]  # type: ignore[no-any-return]


def test_open_purchases_are_due_until_checked_today(client: TestClient, auth: H) -> None:
    client.post("/purchases/batch", json=batch(), headers=auth)
    assert due(client, auth) == ["1111111", "2222222"]
    check(client, auth, {"item_number": "1111111", "found": True, "warehouse_price_cents": 499})
    assert due(client, auth) == ["2222222"]


def test_found_items_are_due_again_tomorrow(client: TestClient, auth: H, clock: Clock) -> None:
    client.post("/purchases/batch", json=batch(), headers=auth)
    check(client, auth, {"item_number": "1111111", "found": True, "warehouse_price_cents": 499})
    assert "1111111" in due(client, later(client, clock, 1))


def test_items_not_online_wait_a_week(client: TestClient, auth: H, clock: Clock) -> None:
    client.post("/purchases/batch", json=batch(), headers=auth)
    check(client, auth, {"item_number": "2222222", "found": False})
    assert "2222222" not in due(client, later(client, clock, 6))
    assert "2222222" in due(client, later(client, clock, 1))


def test_expired_excluded_and_deleted_purchases_are_not_due(
    client: TestClient, auth: H, clock: Clock
) -> None:
    client.post("/purchases/batch", json=batch(), headers=auth)
    listed = client.get("/purchases", headers=auth).json()
    gadget = next(p for p in listed if p["item_number"] == "2222222")
    client.delete(f"/purchases/{gadget['id']}", headers=auth)
    assert due(client, auth) == ["1111111"]
    assert due(client, later(client, clock, 60)) == []


def test_a_lower_warehouse_price_flags_a_drop(client: TestClient, auth: H) -> None:
    client.post("/purchases/batch", json=batch(), headers=auth)
    r = check(
        client,
        auth,
        {
            "item_number": "2222222",
            "found": True,
            "warehouse_price_cents": 1499,
            "online_price_cents": 1799,
            "promo_end": "2026-10-05",
        },
    )
    assert r["recorded"] == 2
    assert [
        (f["item_number"], f["refund_due_cents"], f["claim_deadline"]) for f in r["flagged"]
    ] == [  # type: ignore[union-attr]
        ("2222222", 500, "2026-10-05")
    ]


def test_same_price_seen_again_reuses_the_observation(
    client: TestClient, auth: H, session: Session
) -> None:
    client.post("/purchases/batch", json=batch(), headers=auth)
    result = {"item_number": "1111111", "found": True, "warehouse_price_cents": 499}
    check(client, auth, result)
    again = check(client, auth, result)
    assert again["flagged"] == []
    rows = session.scalars(
        select(PriceObservation).where(PriceObservation.source == PriceSource.AUTOMATIC)
    ).all()
    assert len(rows) == 1


def test_a_check_is_recorded_as_a_successful_run(
    client: TestClient, auth: H, session: Session
) -> None:
    check(client, auth)
    run = session.scalars(select(AutomationRun)).one()
    assert run.kind is RunKind.PRICE_CHECK and run.error_code is None


def test_failed_checks_are_reported_through_sync_runs(
    client: TestClient, auth: H, session: Session
) -> None:
    body = {**WHEN, "kind": "price_check", "status": "failure", "error_code": "challenge"}
    assert client.post("/sync-runs", json=body, headers=auth).status_code == 204
    health = client.get("/health", headers=auth).json()
    assert [(i["kind"], i["issue"]) for i in health["issues"]] == [("price_check", "blocked")]


def test_bad_reports_are_rejected(client: TestClient, auth: H) -> None:
    def post(body: dict[str, object]) -> int:
        return client.post("/price-checks", json=body, headers=auth).status_code

    not_found_with_price = {"item_number": "1111111", "found": False, "warehouse_price_cents": 1}
    assert post({**WHEN, "results": [not_found_with_price]}) == 422
    backwards = {"started_at": WHEN["finished_at"], "finished_at": WHEN["started_at"]}
    assert post({**backwards, "results": []}) == 422
    assert post({**WHEN, "results": [{"item_number": "abc", "found": False}]}) == 422


def test_results_are_scoped_to_the_owner(client: TestClient, auth: H, other_auth: H) -> None:
    client.post("/purchases/batch", json=batch(), headers=auth)
    assert due(client, other_auth) == []
    r = check(
        client, other_auth, {"item_number": "2222222", "found": True, "warehouse_price_cents": 1}
    )
    assert r["flagged"] == []
