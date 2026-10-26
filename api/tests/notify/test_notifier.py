from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Alert, AlertChannel, AlertKind, Device, User
from app.notify.service import Notification, dollars, price_drop, short_date
from tests.notify.fakes import FakeEmail, FakePush, device, flag, notifier, purchase

NOW = datetime(2026, 10, 1, 12, tzinfo=UTC)


def note(key: str = "k1") -> Notification:
    return Notification(AlertKind.HEALTH, key, "Needs attention", "Example body.")


def alerts(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(Alert)) or 0


def test_formatting_helpers() -> None:
    assert dollars(123456) == "$1,234.56"
    assert dollars(5) == "$0.05"
    assert short_date(date(2026, 10, 3)) == "Oct 3"


def test_pushes_to_every_device_and_records_alert(session: Session, owner: User) -> None:
    device(session, owner, "tok-a")
    device(session, owner, "tok-b")
    push, email = FakePush(), FakeEmail()

    assert notifier(push, email).deliver(session, owner, note()) is AlertChannel.PUSH
    assert sorted(m.to for m in push.sent) == ["tok-a", "tok-b"]
    assert email.sent == []
    alert = session.scalars(select(Alert)).one()
    assert alert.delivered_via is AlertChannel.PUSH and alert.dedupe_key == "k1"


def test_same_key_is_delivered_once(session: Session, owner: User) -> None:
    device(session, owner, "tok-a")
    push = FakePush()
    n = notifier(push, FakeEmail())
    n.deliver(session, owner, note())

    assert n.deliver(session, owner, note()) is None
    assert len(push.sent) == 1 and alerts(session) == 1


def test_unregistered_devices_are_removed(session: Session, owner: User) -> None:
    device(session, owner, "tok-live")
    device(session, owner, "tok-dead")
    n = notifier(FakePush(unregistered=frozenset({"tok-dead"})), FakeEmail())

    assert n.deliver(session, owner, note()) is AlertChannel.PUSH
    tokens = session.scalars(select(Device.push_token)).all()
    assert tokens == ["tok-live"]


def test_falls_back_to_email_without_devices(session: Session, owner: User) -> None:
    email = FakeEmail()
    assert notifier(FakePush(), email).deliver(session, owner, note()) is AlertChannel.EMAIL
    assert email.sent[0][0] == owner.email
    assert "Open the app" in email.sent[0][2]


def test_falls_back_to_email_when_push_fails(session: Session, owner: User) -> None:
    device(session, owner, "tok-a")
    n = notifier(FakePush(ok=False), FakeEmail())
    assert n.deliver(session, owner, note()) is AlertChannel.EMAIL


def test_nothing_recorded_when_every_channel_fails(session: Session, owner: User) -> None:
    n = notifier(FakePush(ok=False), FakeEmail(works=False))
    assert n.deliver(session, owner, note()) is None
    assert alerts(session) == 0


def test_price_drop_text_is_minimal(session: Session, owner: User) -> None:
    p = purchase(session, owner, date(2026, 9, 20))
    f = flag(session, owner, p, date(2026, 10, 20), NOW)

    n = price_drop(f, p)
    assert n.body == "Example Gadget: save $5.00. Claim by Oct 20."
    assert n.dedupe_key == f"price_drop:{f.id}"
    assert n.data == {"screen": "claim-card", "flagId": str(f.id)}
    assert "ORDER" not in n.body
