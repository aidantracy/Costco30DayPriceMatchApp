"""In-memory push and email channels plus invented records for notification tests."""

from datetime import date, datetime

from sqlalchemy.orm import Session

from app.db.models import (
    Device,
    Flag,
    Platform,
    PriceObservation,
    PriceSource,
    Purchase,
    PurchaseSource,
    User,
)
from app.domain.models import Channel
from app.notify.push import PushMessage, PushResult
from app.notify.service import Notifier


class FakePush:
    def __init__(self, ok: bool = True, unregistered: frozenset[str] = frozenset()) -> None:
        self.ok, self.unregistered = ok, unregistered
        self.sent: list[PushMessage] = []

    def send(self, messages: list[PushMessage]) -> list[PushResult]:
        self.sent += messages
        return [
            PushResult(
                m.to,
                ok=self.ok and m.to not in self.unregistered,
                unregistered=m.to in self.unregistered,
            )
            for m in messages
        ]


class FakeEmail:
    def __init__(self, works: bool = True) -> None:
        self.works = works
        self.sent: list[tuple[str, str, str]] = []

    def send(self, to: str, subject: str, body: str) -> bool:
        if self.works:
            self.sent.append((to, subject, body))
        return self.works


def notifier(push: FakePush, email: FakeEmail) -> Notifier:
    return Notifier(push, email)  # type: ignore[arg-type]


def device(session: Session, user: User, token: str) -> Device:
    d = Device(user_id=user.id, platform=Platform.IOS, push_token=token)
    session.add(d)
    session.flush()
    return d


def purchase(
    session: Session, user: User, bought: date, item: str = "1111111", line: int = 1
) -> Purchase:
    p = Purchase(
        user_id=user.id,
        source=PurchaseSource.MANUAL,
        channel=Channel.ONLINE,
        item_number=item,
        description="EXAMPLE GADGET",
        unit_price_cents=1999,
        purchase_date=bought,
        order_number="ORDER-1",
        line_no=line,
    )
    session.add(p)
    session.flush()
    return p


def flag(session: Session, user: User, p: Purchase, deadline: date, seen: datetime) -> Flag:
    obs = PriceObservation(
        item_number=p.item_number,
        channel=p.channel,
        price_cents=1499,
        seen_on=seen.date(),
        source=PriceSource.AUTOMATIC,
    )
    session.add(obs)
    session.flush()
    f = Flag(
        user_id=user.id,
        purchase_id=p.id,
        price_observation_id=obs.id,
        price_paid_cents=1999,
        new_price_cents=1499,
        eligible_quantity=1,
        refund_due_cents=500,
        claim_deadline=deadline,
    )
    session.add(f)
    session.flush()
    return f
