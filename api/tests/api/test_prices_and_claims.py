from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.api.helpers import automatic_price, batch

H = dict[str, str]


def price(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "item_number": "2222222",
        "channel": "warehouse",
        "price_cents": 1499,
        "seen_on": "2026-09-30",
    }
    body.update(overrides)
    return body


def setup_drop(client: TestClient, auth: H, **price_overrides: object) -> str:
    client.post("/purchases/batch", json=batch(), headers=auth)
    r = client.post("/prices", json=price(**price_overrides), headers=auth)
    assert r.status_code == 201
    return str(r.json()["flagged"][0]["id"])


def test_manual_price_flags_a_drop(client: TestClient, auth: H) -> None:
    client.post("/purchases/batch", json=batch(), headers=auth)
    r = client.post("/prices", json=price(), headers=auth).json()
    assert r["price"]["source"] == "manual"
    assert [f["refund_due_cents"] for f in r["flagged"]] == [500]


def test_same_price_other_channel_or_future_date_do_not_flag(client: TestClient, auth: H) -> None:
    client.post("/purchases/batch", json=batch(), headers=auth)
    assert (
        client.post("/prices", json=price(price_cents=1999), headers=auth).json()["flagged"] == []
    )
    online = client.post("/prices", json=price(channel="online"), headers=auth).json()
    assert online["flagged"] == []
    future = client.post("/prices", json=price(seen_on="2026-10-02"), headers=auth)
    assert future.status_code == 422


def test_lower_price_replaces_unclaimed_flag(client: TestClient, auth: H) -> None:
    first = setup_drop(client, auth)
    r = client.post("/prices", json=price(price_cents=1299), headers=auth).json()
    assert [f["refund_due_cents"] for f in r["flagged"]] == [700]
    flags = client.get("/flags", headers=auth).json()
    assert [f["refund_due_cents"] for f in flags] == [700]
    assert first not in {f["id"] for f in flags}


def test_claimed_flag_is_not_replaced(client: TestClient, auth: H) -> None:
    fid = setup_drop(client, auth)
    client.patch(f"/flags/{fid}", json={"status": "claimed"}, headers=auth)
    r = client.post("/prices", json=price(price_cents=1299), headers=auth).json()
    assert r["flagged"] == []


def test_higher_price_does_not_replace(client: TestClient, auth: H) -> None:
    setup_drop(client, auth)
    r = client.post("/prices", json=price(price_cents=1799), headers=auth).json()
    assert r["flagged"] == []


def test_price_history_shows_automatic_and_own_manual_only(
    client: TestClient, auth: H, other_auth: H, session: Session
) -> None:
    automatic_price(session, "2222222", 1599, date(2026, 9, 25))
    client.post("/prices", json=price(), headers=auth)
    client.post("/prices", json=price(price_cents=999), headers=other_auth)
    history = client.get("/items/2222222/prices", headers=auth).json()
    assert [(h["price_cents"], h["source"]) for h in history] == [
        (1499, "manual"),
        (1599, "automatic"),
    ]


def test_claim_card_for_a_warehouse_purchase(client: TestClient, auth: H) -> None:
    fid = setup_drop(client, auth, promo_end="2026-10-05", quantity_limit=1)
    card = client.get(f"/flags/{fid}/claim-card", headers=auth).json()
    assert card["warehouse_number"] == "999"
    assert card["claim_deadline"] == "2026-10-05"
    assert card["last_eligible_date"] == "2026-10-20"
    assert card["eligible_quantity"] == 1
    assert card["price_paid_cents"] == 1999 and card["current_price_cents"] == 1499
    assert "Returns counter at warehouse 999" in card["claim_path"]


def test_claim_card_for_an_online_order(client: TestClient, auth: H) -> None:
    from tests.api.helpers import receipt

    order = receipt(
        channel="online", warehouse_number=None, receipt_id=None, order_number="EXAMPLE-0001"
    )
    client.post("/purchases/batch", json=batch(order), headers=auth)
    fid = client.post("/prices", json=price(channel="online"), headers=auth).json()["flagged"][0][
        "id"
    ]
    card = client.get(f"/flags/{fid}/claim-card", headers=auth).json()
    assert card["warehouse_number"] is None
    assert "Request a Price Match" in card["claim_path"]


def test_unread_and_read(client: TestClient, auth: H) -> None:
    fid = setup_drop(client, auth)
    assert [f["id"] for f in client.get("/flags?unread=true", headers=auth).json()] == [fid]
    client.patch(f"/flags/{fid}", json={"read": True}, headers=auth)
    assert client.get("/flags?unread=true", headers=auth).json() == []
    assert client.get("/flags", headers=auth).json()[0]["unread"] is False


def test_claim_flow_and_savings(client: TestClient, auth: H) -> None:
    fid = setup_drop(client, auth)
    assert (
        client.patch(f"/flags/{fid}", json={"status": "refunded"}, headers=auth).status_code == 409
    )
    client.patch(f"/flags/{fid}", json={"status": "claimed"}, headers=auth)
    r = client.patch(f"/flags/{fid}", json={"status": "refunded"}, headers=auth)
    assert r.json()["status"] == "refunded"
    s = client.get("/savings", headers=auth).json()
    assert s["total_refunded_cents"] == 500
    assert s["by_month"] == {"2026-10": 500} or sum(s["by_month"].values()) == 500
    assert s["alert_accuracy"] == 1.0


def test_refund_amount_and_denial(client: TestClient, auth: H) -> None:
    fid = setup_drop(client, auth)
    client.patch(f"/flags/{fid}", json={"status": "claimed"}, headers=auth)
    client.patch(f"/flags/{fid}", json={"status": "refunded", "refunded_cents": 450}, headers=auth)
    assert client.get("/savings", headers=auth).json()["total_refunded_cents"] == 450

    client.post("/prices", json=price(item_number="1111111", price_cents=399), headers=auth)
    other = next(f for f in client.get("/flags", headers=auth).json() if f["status"] == "flagged")
    client.patch(f"/flags/{other['id']}", json={"status": "claimed"}, headers=auth)
    denied = client.patch(
        f"/flags/{other['id']}",
        json={"status": "denied", "denial_reason": "Sale ended"},
        headers=auth,
    )
    assert denied.json()["status"] == "denied"
    assert client.get("/savings", headers=auth).json()["alert_accuracy"] == 0.5


def test_empty_savings(client: TestClient, auth: H) -> None:
    s = client.get("/savings", headers=auth).json()
    assert s == {"total_refunded_cents": 0, "by_month": {}, "claims": [], "alert_accuracy": None}


def test_flags_are_scoped_to_their_owner(client: TestClient, auth: H, other_auth: H) -> None:
    fid = setup_drop(client, auth)
    assert client.get("/flags", headers=other_auth).json() == []
    assert client.get(f"/flags/{fid}/claim-card", headers=other_auth).status_code == 404
    assert client.patch(f"/flags/{fid}", json={"read": True}, headers=other_auth).status_code == 404


def test_endpoints_require_sign_in(client: TestClient) -> None:
    for method, path in [
        ("get", "/purchases"),
        ("post", "/purchases/batch"),
        ("post", "/prices"),
        ("get", "/flags"),
        ("get", "/savings"),
        ("get", "/items/1234567/prices"),
    ]:
        assert getattr(client, method)(path).status_code == 401, path
