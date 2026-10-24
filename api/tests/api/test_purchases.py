from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.api.helpers import automatic_price, batch, receipt

H = dict[str, str]


def test_batch_import_creates_purchases(client: TestClient, auth: H) -> None:
    r = client.post("/purchases/batch", json=batch(), headers=auth)
    assert r.status_code == 200
    assert r.json() == {"created": 2, "duplicates": 0, "already_cheaper": []}
    listed = client.get("/purchases", headers=auth).json()
    assert {p["item_number"] for p in listed} == {"1111111", "2222222"}
    gadget = next(p for p in listed if p["item_number"] == "2222222")
    assert gadget["discount_cents"] == 500
    assert gadget["last_eligible_date"] == "2026-10-20"
    assert gadget["days_left"] == 19


def test_reimport_is_idempotent_across_sources(client: TestClient, auth: H) -> None:
    client.post("/purchases/batch", json=batch(), headers=auth)
    again = client.post("/purchases/batch", json=batch(source="screenshot"), headers=auth)
    assert again.json()["created"] == 0
    assert again.json()["duplicates"] == 2


def test_deleted_purchase_is_not_recreated_by_sync(client: TestClient, auth: H) -> None:
    client.post("/purchases/batch", json=batch(), headers=auth)
    pid = client.get("/purchases", headers=auth).json()[0]["id"]
    assert client.delete(f"/purchases/{pid}", headers=auth).status_code == 204
    again = client.post("/purchases/batch", json=batch(), headers=auth)
    assert again.json() == {"created": 0, "duplicates": 2, "already_cheaper": []}
    assert len(client.get("/purchases", headers=auth).json()) == 1


def test_excluded_items_are_marked_on_import(client: TestClient, auth: H) -> None:
    item = {
        "line_no": 1,
        "item_number": "3333333",
        "description": "1 OZ GOLD BAR",
        "unit_price_cents": 250000,
    }
    client.post("/purchases/batch", json=batch(receipt(items=[item])), headers=auth)
    assert client.get("/purchases", headers=auth).json() == []
    excluded = client.get("/purchases?status=excluded", headers=auth).json()
    assert excluded[0]["exclusion_reason"] == "Precious metals are not eligible"


def test_import_shows_items_already_cheaper(client: TestClient, auth: H, session: Session) -> None:
    automatic_price(session, "2222222", 1499, date(2026, 9, 25))
    r = client.post("/purchases/batch", json=batch(), headers=auth).json()
    assert len(r["already_cheaper"]) == 1
    assert r["already_cheaper"][0]["refund_due_cents"] == 500


def test_older_price_does_not_flag_a_later_purchase(
    client: TestClient, auth: H, session: Session
) -> None:
    automatic_price(session, "2222222", 1499, date(2026, 9, 1))
    r = client.post("/purchases/batch", json=batch(), headers=auth).json()
    assert r["already_cheaper"] == []


def test_batch_validation(client: TestClient, auth: H) -> None:
    future = batch(receipt(purchase_date="2026-10-02"))
    assert client.post("/purchases/batch", json=future, headers=auth).status_code == 422
    no_receipt_id = batch(receipt(receipt_id=None))
    assert client.post("/purchases/batch", json=no_receipt_id, headers=auth).status_code == 422
    online_no_order = batch(receipt(channel="online", warehouse_number=None, receipt_id=None))
    assert client.post("/purchases/batch", json=online_no_order, headers=auth).status_code == 422


def test_online_order_import(client: TestClient, auth: H) -> None:
    order = receipt(
        channel="online", warehouse_number=None, receipt_id=None, order_number="EXAMPLE-0001"
    )
    r = client.post("/purchases/batch", json=batch(order), headers=auth)
    assert r.json()["created"] == 2


def manual(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "channel": "warehouse",
        "item_number": "4444444",
        "description": "EXAMPLE SNACK",
        "unit_price_cents": 949,
        "purchase_date": "2026-09-28",
        "warehouse_number": "999",
    }
    body.update(overrides)
    return body


def test_manual_entry_warns_on_duplicates(client: TestClient, auth: H) -> None:
    assert client.post("/purchases", json=manual(), headers=auth).status_code == 201
    assert client.post("/purchases", json=manual(), headers=auth).status_code == 409
    ok = client.post("/purchases", json=manual(confirm_duplicate=True), headers=auth)
    assert ok.status_code == 201


def test_manual_entry_validation(client: TestClient, auth: H) -> None:
    for bad in (
        manual(unit_price_cents=-1),
        manual(item_number="12AB"),
        manual(purchase_date="2026-10-02"),
        manual(channel="online"),
        manual(warehouse_number=None),
    ):
        assert client.post("/purchases", json=bad, headers=auth).status_code == 422, bad


def test_manual_entry_in_the_past_is_expired(client: TestClient, auth: H) -> None:
    r = client.post("/purchases", json=manual(purchase_date="2026-08-01"), headers=auth)
    assert r.json()["purchase"]["days_left"] < 0
    assert client.get("/purchases", headers=auth).json() == []
    assert len(client.get("/purchases?status=expired", headers=auth).json()) == 1
    assert len(client.get("/purchases?status=all", headers=auth).json()) == 1


def test_open_purchases_sorted_by_days_left(client: TestClient, auth: H) -> None:
    client.post("/purchases", json=manual(purchase_date="2026-09-28"), headers=auth)
    client.post(
        "/purchases", json=manual(item_number="5555555", purchase_date="2026-09-05"), headers=auth
    )
    days = [p["days_left"] for p in client.get("/purchases", headers=auth).json()]
    assert days == sorted(days)


def test_edit_price_reflags(client: TestClient, auth: H, session: Session) -> None:
    created = client.post("/purchases", json=manual(), headers=auth).json()
    automatic_price(session, "4444444", 899, date(2026, 9, 30))
    pid = created["purchase"]["id"]
    client.patch(f"/purchases/{pid}", json={"unit_price_cents": 999}, headers=auth)
    flags = client.get("/flags", headers=auth).json()
    assert [f["refund_due_cents"] for f in flags] == [100]


def test_excluding_by_hand_dismisses_flags(client: TestClient, auth: H, session: Session) -> None:
    automatic_price(session, "4444444", 899, date(2026, 9, 30))
    pid = client.post("/purchases", json=manual(), headers=auth).json()["purchase"]["id"]
    assert len(client.get("/flags", headers=auth).json()) == 1
    r = client.patch(f"/purchases/{pid}", json={"excluded": True}, headers=auth)
    assert r.json()["exclusion_reason"] == "Excluded by owner"
    assert client.get("/flags", headers=auth).json() == []
    back = client.patch(f"/purchases/{pid}", json={"excluded": False}, headers=auth).json()
    assert back["excluded"] is False


def test_edit_rejects_future_date(client: TestClient, auth: H) -> None:
    pid = client.post("/purchases", json=manual(), headers=auth).json()["purchase"]["id"]
    r = client.patch(f"/purchases/{pid}", json={"purchase_date": "2026-10-05"}, headers=auth)
    assert r.status_code == 422


def test_delete_with_claim_needs_confirmation(
    client: TestClient, auth: H, session: Session
) -> None:
    automatic_price(session, "4444444", 899, date(2026, 9, 30))
    created = client.post("/purchases", json=manual(), headers=auth).json()
    pid, fid = created["purchase"]["id"], created["already_cheaper"]["id"]
    client.patch(f"/flags/{fid}", json={"status": "claimed"}, headers=auth)
    assert client.delete(f"/purchases/{pid}", headers=auth).status_code == 409
    assert client.delete(f"/purchases/{pid}?confirm=true", headers=auth).status_code == 204


def test_other_users_purchases_are_invisible(client: TestClient, auth: H, other_auth: H) -> None:
    pid = client.post("/purchases", json=manual(), headers=auth).json()["purchase"]["id"]
    assert client.get("/purchases?status=all", headers=other_auth).json() == []
    edit = client.patch(f"/purchases/{pid}", json={"quantity": 2}, headers=other_auth)
    assert edit.status_code == 404
    assert client.delete(f"/purchases/{pid}", headers=other_auth).status_code == 404
