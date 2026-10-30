"""Apply the configured exclusions list to a purchase (BR-6, FR-14)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Exclusion, Purchase
from app.domain.exclusions import ExclusionRule, exclusion_reason


def load_rules(session: Session) -> list[ExclusionRule]:
    return [
        ExclusionRule(e.match_type, e.value, e.reason) for e in session.scalars(select(Exclusion))
    ]


def apply(purchase: Purchase, rules: list[ExclusionRule], department: str | None = None) -> None:
    reason = exclusion_reason(purchase.item_number, purchase.description, department, rules)
    if reason is not None:
        purchase.excluded = True
        purchase.exclusion_reason = reason
