from datetime import date

import pytest

from app.domain.models import Channel, PriceObservation, Purchase


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("item_number", "12A", "digits"),
        ("quantity", 0, "quantity"),
        ("unit_price_cents", -1, "negative"),
    ],
)
def test_purchase_validation(field: str, value: object, message: str) -> None:
    kwargs: dict[str, object] = {
        "item_number": "1234567",
        "description": "EXAMPLE",
        "channel": Channel.WAREHOUSE,
        "quantity": 1,
        "unit_price_cents": 100,
        "purchase_date": date(2026, 1, 1),
    }
    kwargs[field] = value
    with pytest.raises(ValueError, match=message):
        Purchase(**kwargs)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("item_number", "", "digits"),
        ("price_cents", -5, "negative"),
        ("quantity_limit", 0, "quantity_limit"),
    ],
)
def test_observation_validation(field: str, value: object, message: str) -> None:
    kwargs: dict[str, object] = {
        "item_number": "1234567",
        "channel": Channel.ONLINE,
        "price_cents": 100,
        "seen_on": date(2026, 1, 1),
    }
    kwargs[field] = value
    with pytest.raises(ValueError, match=message):
        PriceObservation(**kwargs)  # type: ignore[arg-type]
