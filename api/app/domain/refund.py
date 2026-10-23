"""Refund amounts, capped by promotional quantity limits (BR-9)."""


def eligible_quantity(quantity: int, quantity_limit: int | None) -> int:
    if quantity < 1:
        raise ValueError("quantity must be at least 1")
    if quantity_limit is None:
        return quantity
    if quantity_limit < 1:
        raise ValueError("quantity_limit must be at least 1 when set")
    return min(quantity, quantity_limit)


def refund_due_cents(
    price_paid_cents: int, new_price_cents: int, quantity: int, quantity_limit: int | None
) -> int:
    """(price paid - new price) x eligible units; zero when the price didn't drop."""
    if price_paid_cents < 0 or new_price_cents < 0:
        raise ValueError("prices must not be negative")
    drop = price_paid_cents - new_price_cents
    if drop <= 0:
        return 0
    return drop * eligible_quantity(quantity, quantity_limit)
