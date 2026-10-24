"""Scenarios from the charter and requirements, with invented items and prices."""

from dataclasses import replace
from datetime import date

from app.domain.flagging import evaluate
from app.domain.models import Channel, PriceObservation, Purchase

WINDOW = 30
PURCHASE = Purchase(
    item_number="1234567",
    description="EXAMPLE DRINKS 24 PACK",
    channel=Channel.WAREHOUSE,
    quantity=1,
    unit_price_cents=1899,
    purchase_date=date(2026, 9, 7),
)
DROP = PriceObservation(
    item_number="1234567",
    channel=Channel.WAREHOUSE,
    price_cents=1499,
    seen_on=date(2026, 10, 1),
)


def test_charter_example_is_flagged_for_four_dollars() -> None:
    decision = evaluate(PURCHASE, DROP, today=date(2026, 10, 1), window_days=WINDOW)
    assert decision is not None
    assert decision.refund_due_cents == 400
    assert decision.claim_deadline == date(2026, 10, 7)


def test_promotion_end_sets_an_earlier_deadline() -> None:
    obs = replace(DROP, promo_end=date(2026, 10, 4))
    decision = evaluate(PURCHASE, obs, today=date(2026, 10, 1), window_days=WINDOW)
    assert decision is not None
    assert decision.claim_deadline == date(2026, 10, 4)


def test_not_flagged_after_promotion_ends() -> None:
    obs = replace(DROP, promo_end=date(2026, 10, 4))
    assert evaluate(PURCHASE, obs, today=date(2026, 10, 5), window_days=WINDOW) is None


def test_drop_seen_on_day_30_still_counts() -> None:
    obs = replace(DROP, seen_on=date(2026, 10, 7))
    assert evaluate(PURCHASE, obs, today=date(2026, 10, 7), window_days=WINDOW) is not None


def test_drop_seen_after_window_is_ignored() -> None:
    obs = replace(DROP, seen_on=date(2026, 10, 8))
    assert evaluate(PURCHASE, obs, today=date(2026, 10, 8), window_days=WINDOW) is None


def test_price_seen_before_purchase_is_ignored() -> None:
    obs = replace(DROP, seen_on=date(2026, 9, 1))
    assert evaluate(PURCHASE, obs, today=date(2026, 9, 7), window_days=WINDOW) is None


def test_other_channel_never_matches() -> None:
    obs = replace(DROP, channel=Channel.ONLINE)
    assert evaluate(PURCHASE, obs, today=date(2026, 10, 1), window_days=WINDOW) is None


def test_other_item_never_matches() -> None:
    obs = replace(DROP, item_number="7654321")
    assert evaluate(PURCHASE, obs, today=date(2026, 10, 1), window_days=WINDOW) is None


def test_same_or_higher_price_is_not_a_drop() -> None:
    obs = replace(DROP, price_cents=1899)
    assert evaluate(PURCHASE, obs, today=date(2026, 10, 1), window_days=WINDOW) is None


def test_excluded_item_is_never_flagged() -> None:
    result = evaluate(PURCHASE, DROP, today=date(2026, 10, 1), window_days=WINDOW, excluded=True)
    assert result is None


def test_quantity_limit_caps_the_refund() -> None:
    purchase = replace(PURCHASE, quantity=4)
    obs = replace(DROP, quantity_limit=2)
    decision = evaluate(purchase, obs, today=date(2026, 10, 1), window_days=WINDOW)
    assert decision is not None
    assert decision.eligible_quantity == 2
    assert decision.refund_due_cents == 800


def test_discounted_price_paid_is_what_gets_compared() -> None:
    # Bought at 24.99 with a 5.00 instant saving: price paid is 19.99.
    purchase = replace(PURCHASE, unit_price_cents=1999)
    obs = replace(DROP, price_cents=1999)
    assert evaluate(purchase, obs, today=date(2026, 10, 1), window_days=WINDOW) is None
