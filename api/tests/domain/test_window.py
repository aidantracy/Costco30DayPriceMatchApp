from datetime import date

import pytest

from app.domain.window import claim_deadline, days_left, is_open, last_eligible_date

BOUGHT = date(2026, 9, 7)


def test_day_30_is_the_last_eligible_day() -> None:
    assert last_eligible_date(BOUGHT, 30) == date(2026, 10, 7)


@pytest.mark.parametrize(
    ("today", "left", "open_"),
    [
        (date(2026, 9, 7), 30, True),
        (date(2026, 10, 6), 1, True),
        (date(2026, 10, 7), 0, True),
        (date(2026, 10, 8), -1, False),
    ],
)
def test_countdown_around_the_boundary(today: date, left: int, open_: bool) -> None:
    assert days_left(BOUGHT, today, 30) == left
    assert is_open(BOUGHT, today, 30) is open_


def test_window_crosses_month_and_year_ends() -> None:
    assert last_eligible_date(date(2026, 12, 15), 30) == date(2027, 1, 14)


def test_window_length_comes_from_configuration() -> None:
    assert last_eligible_date(BOUGHT, 14) == date(2026, 9, 21)


def test_rejects_non_positive_window() -> None:
    with pytest.raises(ValueError, match="window_days"):
        last_eligible_date(BOUGHT, 0)


def test_claim_deadline_without_promotion_is_window_end() -> None:
    assert claim_deadline(date(2026, 10, 7), None) == date(2026, 10, 7)


def test_promotion_ending_first_shortens_the_deadline() -> None:
    assert claim_deadline(date(2026, 10, 7), date(2026, 10, 1)) == date(2026, 10, 1)


def test_promotion_ending_later_does_not_extend_the_deadline() -> None:
    assert claim_deadline(date(2026, 10, 7), date(2026, 10, 20)) == date(2026, 10, 7)
