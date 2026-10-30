from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    Alert,
    AlertChannel,
    AlertKind,
    AutomationRun,
    Flag,
    PriceObservation,
    PriceSource,
    Purchase,
    PurchaseSource,
    RefreshToken,
    ReviewItem,
    RunKind,
    RunStatus,
    User,
)
from app.domain.models import Channel, FlagStatus
from app.jobs import health, reminders, retention
from tests.notify.fakes import FakeEmail, FakePush, device, flag, notifier, purchase

# 18:00 UTC is noon in the owner's default time zone (America/Denver, MDT).
NOW = datetime(2026, 10, 1, 18, tzinfo=UTC)
TODAY = date(2026, 10, 1)
SETTINGS = Settings()


def bodies(session: Session, kind: AlertKind) -> list[str]:
    return [a.dedupe_key for a in session.scalars(select(Alert).where(Alert.kind == kind))]


class TestReminders:
    def test_nothing_closing_sends_nothing(self, session: Session, owner: User) -> None:
        purchase(session, owner, TODAY - timedelta(days=10))
        push = FakePush()
        assert reminders.run(session, notifier(push, FakeEmail()), NOW, SETTINGS) == 0
        assert push.sent == []

    def test_one_digest_for_windows_and_deadlines(self, session: Session, owner: User) -> None:
        device(session, owner, "tok-a")
        # Day 28 and day 30 of the window are inside the 3-day lead; day 31 is past it.
        purchase(session, owner, TODAY - timedelta(days=28), line=1)
        purchase(session, owner, TODAY - timedelta(days=30), line=2)
        purchase(session, owner, TODAY - timedelta(days=31), line=3)
        p = purchase(session, owner, TODAY - timedelta(days=5), line=4)
        flag(session, owner, p, TODAY + timedelta(days=2), NOW)
        push = FakePush()

        assert reminders.run(session, notifier(push, FakeEmail()), NOW, SETTINGS) == 1
        assert (
            push.sent[0].body
            == "1 price drop to claim by Oct 3; 2 items reach their last day soon."
        )
        assert bodies(session, AlertKind.WINDOW_CLOSING) == [
            f"window_closing:{owner.id}:2026-10-01"
        ]
        # A second run the same day does not repeat the digest.
        assert reminders.run(session, notifier(push, FakeEmail()), NOW, SETTINGS) == 0

    def test_plural_deadlines_and_single_item(self, session: Session, owner: User) -> None:
        purchase(session, owner, TODAY - timedelta(days=29), line=1)
        for line in (2, 3):
            p = purchase(session, owner, TODAY - timedelta(days=5), line=line)
            flag(session, owner, p, TODAY + timedelta(days=line - 2), NOW)
        email = FakeEmail()

        assert reminders.run(session, notifier(FakePush(), email), NOW, SETTINGS) == 1
        assert email.sent[0][2].startswith(
            "2 price drops to claim by Oct 1; 1 item reach their last day soon."
        )

    def test_claimed_deleted_and_excluded_are_skipped(self, session: Session, owner: User) -> None:
        gone = purchase(session, owner, TODAY - timedelta(days=29), line=1)
        gone.deleted_at = NOW
        skipped = purchase(session, owner, TODAY - timedelta(days=29), line=2)
        skipped.excluded = True
        p = purchase(session, owner, TODAY - timedelta(days=5), line=3)
        f = flag(session, owner, p, TODAY + timedelta(days=1), NOW)
        f.status = FlagStatus.CLAIMED
        session.flush()

        assert reminders.run(session, notifier(FakePush(), FakeEmail()), NOW, SETTINGS) == 0

    def test_undelivered_digest_is_not_counted(self, session: Session, owner: User) -> None:
        purchase(session, owner, TODAY - timedelta(days=29))
        n = notifier(FakePush(), FakeEmail(works=False))
        assert reminders.run(session, n, NOW, SETTINGS) == 0


def automation_run(
    session: Session, user: User, kind: RunKind, ok: bool, at: datetime, code: str | None = None
) -> None:
    session.add(
        AutomationRun(
            user_id=user.id,
            kind=kind,
            status=RunStatus.SUCCESS if ok else RunStatus.FAILURE,
            error_code=code,
            started_at=at,
            finished_at=at,
        )
    )
    session.flush()


class TestHealth:
    def test_healthy_sends_nothing(self, session: Session, owner: User) -> None:
        automation_run(session, owner, RunKind.SYNC, True, NOW - timedelta(hours=1))
        assert health.run(session, notifier(FakePush(), FakeEmail()), NOW, SETTINGS) == 0

    def test_alerts_once_per_issue_per_day(self, session: Session, owner: User) -> None:
        device(session, owner, "tok-a")
        automation_run(
            session, owner, RunKind.SYNC, False, NOW - timedelta(hours=1), "session_expired"
        )
        automation_run(
            session, owner, RunKind.PRICE_CHECK, False, NOW - timedelta(hours=1), "challenge"
        )
        push = FakePush()

        assert health.run(session, notifier(push, FakeEmail()), NOW, SETTINGS) == 2
        assert {m.body for m in push.sent} == {
            health.MESSAGES[health.Issue.RECONNECT],
            health.MESSAGES[health.Issue.BLOCKED],
        }
        assert health.run(session, notifier(push, FakeEmail()), NOW, SETTINGS) == 0
        assert sorted(bodies(session, AlertKind.HEALTH)) == sorted(
            [
                f"health:{owner.id}:sync:reconnect:2026-10-01",
                f"health:{owner.id}:price_check:blocked:2026-10-01",
            ]
        )

    def test_undelivered_alert_is_not_counted(self, session: Session, owner: User) -> None:
        automation_run(session, owner, RunKind.SYNC, False, NOW, "session_expired")
        n = notifier(FakePush(), FakeEmail(works=False))
        assert health.run(session, n, NOW, SETTINGS) == 0


class TestRetention:
    def test_purges_only_expired_rows(self, session: Session, owner: User) -> None:
        old, recent = NOW - timedelta(days=200), NOW - timedelta(days=1)
        # Review items: resolved, stale, and fresh.
        for received, resolved in (
            (recent, recent),
            (NOW - timedelta(days=31), None),
            (recent, None),
        ):
            session.add(
                ReviewItem(
                    user_id=owner.id,
                    source=PurchaseSource.SCREENSHOT,
                    reason="example",
                    received_at=received,
                    resolved_at=resolved,
                )
            )
        # Refresh tokens: expired, revoked two days ago, and live.
        for expires, revoked in (
            (NOW - timedelta(hours=1), None),
            (NOW + timedelta(days=5), NOW - timedelta(days=2)),
            (NOW + timedelta(days=5), None),
        ):
            session.add(
                RefreshToken(
                    user_id=owner.id,
                    token_hash=bytes([len(session.new)]) * 32,
                    family_id=owner.id,
                    expires_at=expires,
                    revoked_at=revoked,
                )
            )
        session.add_all(
            [
                Alert(
                    user_id=owner.id,
                    kind=AlertKind.HEALTH,
                    delivered_via=AlertChannel.PUSH,
                    dedupe_key=f"a{i}",
                    sent_at=at,
                )
                for i, at in enumerate((NOW - timedelta(days=91), recent))
            ]
        )
        automation_run(session, owner, RunKind.SYNC, True, NOW - timedelta(days=91))
        automation_run(session, owner, RunKind.SYNC, True, recent)
        # Purchases: old and unflagged (purged), old but flagged (kept), recent (kept).
        purchase(session, owner, TODAY - timedelta(days=121), line=1)
        flagged = purchase(session, owner, TODAY - timedelta(days=121), line=2)
        flag(session, owner, flagged, TODAY - timedelta(days=90), old)
        purchase(session, owner, TODAY - timedelta(days=30), line=3)
        # Observations: the flagged one above is old but referenced; add an unreferenced one.
        session.add(
            PriceObservation(
                item_number="3333333",
                channel=Channel.ONLINE,
                price_cents=100,
                seen_on=old.date(),
                source=PriceSource.AUTOMATIC,
                last_seen_at=old,
            )
        )
        session.flush()
        session.execute(
            PriceObservation.__table__.update().values(last_seen_at=old)  # type: ignore[attr-defined]
        )

        counts = retention.run(session, NOW, SETTINGS)

        assert counts == {
            "review_items": 2,
            "refresh_tokens": 2,
            "alerts": 1,
            "automation_runs": 1,
            "purchases": 1,
            "price_observations": 1,
        }
        assert len(session.scalars(select(Purchase)).all()) == 2
        assert len(session.scalars(select(Flag)).all()) == 1


def test_cli_runs_each_job(monkeypatch: pytest.MonkeyPatch, session: Session) -> None:
    from app.jobs import __main__ as cli

    calls: list[str] = []

    def fake(name: str, result: Any) -> Any:
        def run(*args: Any) -> Any:
            calls.append(name)
            return result

        return run

    monkeypatch.setattr(cli, "get_session", lambda: iter([session]))
    monkeypatch.setattr(cli.retention, "run", fake("retention", {"alerts": 0}))
    monkeypatch.setattr(cli.reminders, "run", fake("reminders", 1))
    monkeypatch.setattr(cli.health, "run", fake("health", 0))

    for job in ("retention", "reminders", "health", "daily"):
        assert cli.main([job]) == 0
    assert calls == ["retention", "reminders", "health", "retention", "reminders"]
    with pytest.raises(SystemExit):
        cli.main(["nope"])
