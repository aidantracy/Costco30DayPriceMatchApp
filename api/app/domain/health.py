"""Decide when automation needs the owner's attention (US-ALR-03, FR-21, NFR-19)."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum


class ErrorCode(StrEnum):
    SESSION_EXPIRED = "session_expired"
    CHALLENGE = "challenge"
    PARSE_ERROR = "parse_error"
    NETWORK = "network"
    OTHER = "other"


class Issue(StrEnum):
    RECONNECT = "reconnect"  # Costco session expired: sign in to Costco again
    BLOCKED = "blocked"  # bot check or verification challenge: automation stopped
    FAILING = "failing"  # repeated failures
    STALE = "stale"  # no successful run in the last day


@dataclass(frozen=True, slots=True)
class Run:
    succeeded: bool
    error_code: ErrorCode | None
    finished_at: datetime


def assess(runs: list[Run], now: datetime, failure_threshold: int) -> Issue | None:
    """Return the most urgent issue for one kind of run, newest run first in ``runs``."""
    if not runs:
        return None
    latest = runs[0]
    if not latest.succeeded and latest.error_code is ErrorCode.CHALLENGE:
        return Issue.BLOCKED
    if not latest.succeeded and latest.error_code is ErrorCode.SESSION_EXPIRED:
        return Issue.RECONNECT
    streak = 0
    for run in runs:
        if run.succeeded:
            break
        streak += 1
    if streak >= failure_threshold:
        return Issue.FAILING
    last_success = next((r.finished_at for r in runs if r.succeeded), None)
    if last_success is None or now - last_success > timedelta(hours=24):
        return Issue.STALE if streak else None
    return None
