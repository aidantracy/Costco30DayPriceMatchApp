from datetime import UTC, datetime, timedelta

from app.domain.health import ErrorCode, Issue, Run, assess

NOW = datetime(2026, 10, 1, 12, tzinfo=UTC)


def ok(hours_ago: float) -> Run:
    return Run(True, None, NOW - timedelta(hours=hours_ago))


def fail(hours_ago: float, code: ErrorCode = ErrorCode.NETWORK) -> Run:
    return Run(False, code, NOW - timedelta(hours=hours_ago))


def test_no_runs_no_issue() -> None:
    assert assess([], NOW, 3) is None


def test_healthy() -> None:
    assert assess([ok(1), fail(2)], NOW, 3) is None


def test_challenge_blocks_immediately() -> None:
    assert assess([fail(1, ErrorCode.CHALLENGE), ok(2)], NOW, 3) is Issue.BLOCKED


def test_expired_session_asks_to_reconnect() -> None:
    assert assess([fail(1, ErrorCode.SESSION_EXPIRED)], NOW, 3) is Issue.RECONNECT


def test_repeated_failures() -> None:
    assert assess([fail(1), fail(2), ok(3)], NOW, 3) is None
    assert assess([fail(1), fail(2), fail(3), ok(4)], NOW, 3) is Issue.FAILING


def test_failing_without_recent_success_is_stale() -> None:
    assert assess([fail(1), ok(30)], NOW, 3) is Issue.STALE
    assert assess([fail(1)], NOW, 3) is Issue.STALE


def test_old_success_alone_is_not_an_issue() -> None:
    # The phone may simply not have opened the app; only failures raise a banner.
    assert assess([ok(30)], NOW, 3) is None
