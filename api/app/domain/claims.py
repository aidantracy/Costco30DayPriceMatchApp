"""Claim status transitions (BR-8, FR-24)."""

from app.domain.models import FlagStatus

ALLOWED: dict[FlagStatus, frozenset[FlagStatus]] = {
    FlagStatus.FLAGGED: frozenset({FlagStatus.CLAIMED, FlagStatus.DISMISSED}),
    FlagStatus.CLAIMED: frozenset({FlagStatus.REFUNDED, FlagStatus.DENIED}),
    FlagStatus.REFUNDED: frozenset(),
    FlagStatus.DENIED: frozenset(),
    FlagStatus.DISMISSED: frozenset(),
}


class InvalidTransitionError(ValueError):
    pass


def transition(current: FlagStatus, target: FlagStatus) -> FlagStatus:
    if target not in ALLOWED[current]:
        raise InvalidTransitionError(f"cannot move a claim from {current} to {target}")
    return target


def alert_accuracy(refunded: int, denied: int) -> float | None:
    """Share of decided claims that were refunded (charter goal "Trustworthy alerts")."""
    if refunded < 0 or denied < 0:
        raise ValueError("counts must not be negative")
    decided = refunded + denied
    if decided == 0:
        return None
    return refunded / decided
