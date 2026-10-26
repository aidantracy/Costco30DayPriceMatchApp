"""Tell the owner when sync or price checks stop working (US-ALR-03, FR-21, NFR-19)."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import AlertKind, User
from app.domain.health import Issue
from app.notify.service import Notification, Notifier
from app.services.health import user_issues
from app.services.time import local_today

MESSAGES = {
    Issue.RECONNECT: "Reconnect Costco: your sign-in expired, so receipt sync has stopped.",
    Issue.BLOCKED: (
        "Automatic checks paused: Costco asked for a verification. "
        "You can still add receipts and prices yourself."
    ),
    Issue.FAILING: "Automatic checks keep failing. You can add receipts and prices yourself.",
    Issue.STALE: "Automatic checks haven't worked in over a day.",
}


def run(session: Session, notifier: Notifier, now: datetime, settings: Settings) -> int:
    sent = 0
    for user in session.scalars(select(User)).all():
        today = local_today(now, user.time_zone).isoformat()
        for found in user_issues(session, user, now, settings.health_failure_threshold):
            note = Notification(
                kind=AlertKind.HEALTH,
                dedupe_key=f"health:{user.id}:{found.kind}:{found.issue}:{today}",
                title="Needs attention",
                body=MESSAGES[found.issue],
                data={"screen": "health"},
            )
            if notifier.deliver(session, user, note) is not None:
                sent += 1
    return sent
