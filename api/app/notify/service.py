"""Build and deliver alerts. Text is kept minimal for lock screens (NFR-14)."""

import uuid
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import Alert, AlertChannel, AlertKind, Device, Flag, Purchase, User
from app.notify.email import EmailSender
from app.notify.push import ExpoPushClient, PushMessage


def dollars(cents: int) -> str:
    return f"${cents // 100:,}.{cents % 100:02d}"


def short_date(d: date) -> str:
    return f"{d:%b} {d.day}"


@dataclass(frozen=True)
class Notification:
    kind: AlertKind
    dedupe_key: str
    title: str
    body: str
    data: dict[str, str] = field(default_factory=dict)
    flag_id: uuid.UUID | None = None


class Notifier:
    def __init__(self, push: ExpoPushClient, email: EmailSender) -> None:
        self._push = push
        self._email = email

    def deliver(self, session: Session, user: User, note: Notification) -> AlertChannel | None:
        """Push to every registered phone, else email. Each dedupe key is delivered once."""
        if session.scalar(select(Alert.id).where(Alert.dedupe_key == note.dedupe_key)):
            return None
        devices = session.scalars(select(Device).where(Device.user_id == user.id)).all()
        results = self._push.send(
            [PushMessage(d.push_token, note.title, note.body, note.data) for d in devices]
        )
        dead = [r.token for r in results if r.unregistered]
        if dead:
            session.execute(delete(Device).where(Device.push_token.in_(dead)))
        channel: AlertChannel | None = None
        if any(r.ok for r in results):
            channel = AlertChannel.PUSH
        elif self._email.send(user.email, note.title, f"{note.body}\n\nOpen the app for details."):
            channel = AlertChannel.EMAIL
        if channel is not None:
            session.add(
                Alert(
                    user_id=user.id,
                    flag_id=note.flag_id,
                    kind=note.kind,
                    delivered_via=channel,
                    dedupe_key=note.dedupe_key,
                )
            )
        session.commit()
        return channel


def price_drop(flag: Flag, purchase: Purchase) -> Notification:
    """Item, amount saved and claim deadline only: no order or membership numbers (NFR-14)."""
    return Notification(
        kind=AlertKind.PRICE_DROP,
        dedupe_key=f"price_drop:{flag.id}",
        title="Price drop",
        body=(
            f"{purchase.description.title()}: save {dollars(flag.refund_due_cents)}. "
            f"Claim by {short_date(flag.claim_deadline)}."
        ),
        data={"screen": "claim-card", "flagId": str(flag.id)},
        flag_id=flag.id,
    )
