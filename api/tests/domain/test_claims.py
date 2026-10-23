import pytest

from app.domain.claims import InvalidTransitionError, alert_accuracy, transition
from app.domain.models import FlagStatus as S


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (S.FLAGGED, S.CLAIMED),
        (S.FLAGGED, S.DISMISSED),
        (S.CLAIMED, S.REFUNDED),
        (S.CLAIMED, S.DENIED),
    ],
)
def test_allowed_moves(current: S, target: S) -> None:
    assert transition(current, target) is target


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (S.FLAGGED, S.REFUNDED),
        (S.FLAGGED, S.DENIED),
        (S.CLAIMED, S.FLAGGED),
        (S.REFUNDED, S.CLAIMED),
        (S.DENIED, S.REFUNDED),
        (S.DISMISSED, S.CLAIMED),
    ],
)
def test_disallowed_moves(current: S, target: S) -> None:
    with pytest.raises(InvalidTransitionError):
        transition(current, target)


def test_alert_accuracy() -> None:
    assert alert_accuracy(9, 1) == pytest.approx(0.9)


def test_alert_accuracy_is_undefined_without_decided_claims() -> None:
    assert alert_accuracy(0, 0) is None


def test_alert_accuracy_rejects_negative_counts() -> None:
    with pytest.raises(ValueError, match="negative"):
        alert_accuracy(-1, 0)
