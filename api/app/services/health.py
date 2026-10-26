"""Automation health for one user, shared by GET /health and the health job."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AutomationRun, RunKind, RunStatus, User
from app.domain.health import ErrorCode, Issue, Run, assess


@dataclass(frozen=True)
class UserIssue:
    kind: RunKind
    issue: Issue
    since: datetime


def user_issues(session: Session, user: User, now: datetime, threshold: int) -> list[UserIssue]:
    found: list[UserIssue] = []
    for kind in RunKind:
        rows = session.scalars(
            select(AutomationRun)
            .where(AutomationRun.user_id == user.id, AutomationRun.kind == kind)
            .order_by(
                AutomationRun.finished_at.desc().nulls_last(), AutomationRun.started_at.desc()
            )
            .limit(20)
        ).all()
        runs = [
            Run(
                succeeded=r.status is RunStatus.SUCCESS,
                error_code=ErrorCode(r.error_code) if r.error_code else None,
                finished_at=r.finished_at or r.started_at,
            )
            for r in rows
        ]
        issue = assess(runs, now, threshold)
        if issue is not None:
            found.append(UserIssue(kind, issue, runs[0].finished_at))
    return found
