"""The price adjustment window and claim deadline (BR-1, BR-5)."""

from datetime import date, timedelta


def last_eligible_date(purchase_date: date, window_days: int) -> date:
    """Last day a drop can be claimed. Day N itself counts (OQ-04)."""
    if window_days < 1:
        raise ValueError("window_days must be at least 1")
    return purchase_date + timedelta(days=window_days)


def days_left(purchase_date: date, today: date, window_days: int) -> int:
    """Days remaining including today's; 0 means today is the last day, negative means expired."""
    return (last_eligible_date(purchase_date, window_days) - today).days


def is_open(purchase_date: date, today: date, window_days: int) -> bool:
    return days_left(purchase_date, today, window_days) >= 0


def claim_deadline(last_eligible: date, promo_end: date | None) -> date:
    """A promotional price must be claimed within the promotion as well as the window (BR-5)."""
    if promo_end is None:
        return last_eligible
    return min(last_eligible, promo_end)
