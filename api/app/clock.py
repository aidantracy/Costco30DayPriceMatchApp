"""The current time, as a dependency so tests can control it."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)
