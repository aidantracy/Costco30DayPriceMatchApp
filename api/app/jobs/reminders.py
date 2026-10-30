"""Daily digest of windows and claim deadlines closing soon (US-ALR-02, FR-20)."""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import AlertKind, Flag, Purchase, User
from app.domain.models import FlagStatus
from app.notify.service import Notification, Notifier, short_date
from app.services.time import local_today


def run(session: Session, notifier: Notifier, now: datetime, settings: Settings) -> int:
    sent = 0
    window = settings.price_adjustment_window_days
    lead = settings.reminder_lead_days
    for user in session.scalars(select(User)).all():
        today = local_today(now, user.time_zone)
        # Purchases whose last eligible day falls between today and today + lead.
        closing = session.scalars(
            select(Purchase).where(
                Purchase.user_id == user.id,
                Purchase.deleted_at.is_(None),
                Purchase.excluded.is_(False),
                Purchase.purchase_date >= today - timedelta(days=window),
                Purchase.purchase_date <= today - timedelta(days=window - lead),
            )
        ).all()
        deadlines = session.scalars(
            select(Flag).where(
                Flag.user_id == user.id,
                Flag.status == FlagStatus.FLAGGED,
                Flag.claim_deadline >= today,
                Flag.claim_deadline <= today + timedelta(days=lead),
            )
        ).all()
        if not closing and not deadlines:
            continue
        parts = []
        if deadlines:
            soonest = min(f.claim_deadline for f in deadlines)
            parts.append(
                f"{len(deadlines)} price drop{'s' if len(deadlines) > 1 else ''} to claim "
                f"by {short_date(soonest)}"
            )
        if closing:
            parts.append(
                f"{len(closing)} item{'s' if len(closing) > 1 else ''} reach their last day soon"
            )
        note = Notification(
            kind=AlertKind.WINDOW_CLOSING,
            dedupe_key=f"window_closing:{user.id}:{today.isoformat()}",
            title="Windows closing soon",
            body="; ".join(parts) + ".",
            data={"screen": "closing-soon"},
        )
        if notifier.deliver(session, user, note) is not None:
            sent += 1
    return sent
