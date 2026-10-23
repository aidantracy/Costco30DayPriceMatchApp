import pytest

from app.domain.refund import eligible_quantity, refund_due_cents


def test_single_unit_refund_is_the_difference() -> None:
    assert refund_due_cents(1899, 1499, 1, None) == 400


def test_multiple_units_without_limit() -> None:
    assert refund_due_cents(1899, 1499, 3, None) == 1200


def test_promotional_limit_caps_units() -> None:
    assert eligible_quantity(5, 2) == 2
    assert refund_due_cents(1000, 800, 5, 2) == 400


def test_limit_above_quantity_has_no_effect() -> None:
    assert eligible_quantity(2, 5) == 2


@pytest.mark.parametrize("new_price", [1899, 1999])
def test_no_refund_when_price_did_not_drop(new_price: int) -> None:
    assert refund_due_cents(1899, new_price, 1, None) == 0


def test_rejects_negative_prices() -> None:
    with pytest.raises(ValueError, match="negative"):
        refund_due_cents(-1, 0, 1, None)


@pytest.mark.parametrize(("quantity", "limit"), [(0, None), (1, 0)])
def test_rejects_invalid_quantities(quantity: int, limit: int | None) -> None:
    with pytest.raises(ValueError, match="at least 1"):
        eligible_quantity(quantity, limit)
