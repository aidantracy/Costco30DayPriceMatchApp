"""Delete data past its retention period (data model section 5, NFR-13)."""

from datetime import datetime, timedelta
from typing import cast

from sqlalchemy import CursorResult, Delete, delete, exists, or_, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    Alert,
    AutomationRun,
    Flag,
    PriceObservation,
    Purchase,
    RefreshToken,
    ReviewItem,
)


def run(session: Session, now: datetime, settings: Settings) -> dict[str, int]:
    window = settings.price_adjustment_window_days
    counts: dict[str, int] = {}

    def purge(name: str, stmt: Delete) -> None:
        result = cast(CursorResult[tuple[()]], session.execute(stmt))
        counts[name] = result.rowcount

    purge(
        "review_items",
        delete(ReviewItem).where(
            or_(
                ReviewItem.resolved_at.is_not(None),
                ReviewItem.received_at < now - timedelta(days=30),
            )
        ),
    )
    purge(
        "refresh_tokens",
        delete(RefreshToken).where(
            or_(
                RefreshToken.expires_at < now,
                RefreshToken.revoked_at < now - timedelta(days=1),
            )
        ),
    )
    purge("alerts", delete(Alert).where(Alert.sent_at < now - timedelta(days=90)))
    purge(
        "automation_runs",
        delete(AutomationRun).where(AutomationRun.started_at < now - timedelta(days=90)),
    )
    purge(
        "purchases",
        delete(Purchase).where(
            Purchase.purchase_date < (now - timedelta(days=window + 90)).date(),
            ~exists(select(Flag.id).where(Flag.purchase_id == Purchase.id)),
        ),
    )
    purge(
        "price_observations",
        delete(PriceObservation).where(
            PriceObservation.last_seen_at < now - timedelta(days=180),
            ~exists(select(Flag.id).where(Flag.price_observation_id == PriceObservation.id)),
        ),
    )
    session.commit()
    return counts
