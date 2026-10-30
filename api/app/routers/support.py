"""Devices, review queue, automation health and rules (FR-09, FR-10, FR-21, FR-29, NFR-22)."""

import uuid
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select

from app.auth.deps import CurrentUser, NowDep, SessionDep, SettingsDep
from app.db.models import (
    AutomationRun,
    Device,
    Exclusion,
    Platform,
    PurchaseSource,
    ReviewItem,
    ReviewResolution,
    RunKind,
    RunStatus,
)
from app.domain.health import ErrorCode, Issue
from app.services.health import user_issues

router = APIRouter(tags=["support"])


# ---------- devices (push registration) ----------


class DeviceIn(BaseModel):
    platform: Platform
    push_token: str = Field(min_length=10, max_length=300)


class DeviceOut(BaseModel):
    id: uuid.UUID
    platform: Platform


@router.post("/devices", status_code=status.HTTP_201_CREATED)
def register_device(
    body: DeviceIn, user: CurrentUser, session: SessionDep, now: NowDep
) -> DeviceOut:
    """Register or refresh this phone's push token. A token moves to whoever signed in last."""
    device = session.scalar(select(Device).where(Device.push_token == body.push_token))
    if device is None:
        device = Device(user_id=user.id, platform=body.platform, push_token=body.push_token)
        session.add(device)
    device.user_id = user.id
    device.platform = body.platform
    device.last_seen_at = now
    session.commit()
    return DeviceOut(id=device.id, platform=device.platform)


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_device(device_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> Response:
    """Called on sign-out so a signed-out phone gets no more alerts (FR-29, FR-30)."""
    device = session.get(Device, device_id)
    if device is None or device.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    session.delete(device)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- review queue ----------


class ReviewIn(BaseModel):
    source: Literal["sync", "screenshot"]
    reason: str = Field(min_length=1, max_length=200)
    parser_version: str | None = Field(default=None, max_length=40)


class ReviewOut(BaseModel):
    id: uuid.UUID
    source: PurchaseSource
    reason: str
    parser_version: str | None
    received_at: datetime


class ReviewResolve(BaseModel):
    resolution: ReviewResolution


def review_out(r: ReviewItem) -> ReviewOut:
    return ReviewOut(
        id=r.id,
        source=r.source,
        reason=r.reason,
        parser_version=r.parser_version,
        received_at=r.received_at,
    )


@router.post("/review-items", status_code=status.HTTP_201_CREATED)
def add_review_item(body: ReviewIn, user: CurrentUser, session: SessionDep) -> ReviewOut:
    """A receipt the phone couldn't fully read. Only the reason is stored, never the receipt."""
    item = ReviewItem(
        user_id=user.id,
        source=PurchaseSource(body.source),
        reason=body.reason,
        parser_version=body.parser_version,
    )
    session.add(item)
    session.commit()
    return review_out(item)


@router.get("/review-items")
def list_review_items(user: CurrentUser, session: SessionDep) -> list[ReviewOut]:
    rows = session.scalars(
        select(ReviewItem)
        .where(ReviewItem.user_id == user.id, ReviewItem.resolved_at.is_(None))
        .order_by(ReviewItem.received_at)
    )
    return [review_out(r) for r in rows]


@router.patch("/review-items/{item_id}")
def resolve_review_item(
    item_id: uuid.UUID, body: ReviewResolve, user: CurrentUser, session: SessionDep, now: NowDep
) -> ReviewOut:
    item = session.get(ReviewItem, item_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    if item.resolved_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already resolved")
    item.resolution = body.resolution
    item.resolved_at = now
    session.commit()
    return review_out(item)


# ---------- automation health ----------


class SyncRunIn(BaseModel):
    status: RunStatus
    error_code: ErrorCode | None = None
    started_at: datetime
    finished_at: datetime

    @model_validator(mode="after")
    def _consistent(self) -> "SyncRunIn":
        if (self.status is RunStatus.FAILURE) != (self.error_code is not None):
            raise ValueError("failures need an error_code; successes must not have one")
        if self.finished_at < self.started_at:
            raise ValueError("finished_at is before started_at")
        return self


class HealthItem(BaseModel):
    kind: RunKind
    issue: Issue
    since: datetime


class HealthOut(BaseModel):
    issues: list[HealthItem]
    unresolved_reviews: int


@router.post("/sync-runs", status_code=status.HTTP_204_NO_CONTENT)
def report_sync_run(body: SyncRunIn, user: CurrentUser, session: SessionDep) -> Response:
    """The phone reports each receipt sync. Error codes only, never page content (NFR-04)."""
    session.add(
        AutomationRun(
            user_id=user.id,
            kind=RunKind.SYNC,
            status=body.status,
            error_code=body.error_code.value if body.error_code else None,
            started_at=body.started_at,
            finished_at=body.finished_at,
        )
    )
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/health")
def health(user: CurrentUser, session: SessionDep, settings: SettingsDep, now: NowDep) -> HealthOut:
    """Banners for the home screen: reconnect Costco, automation blocked, failing or stale."""
    issues = [
        HealthItem(kind=i.kind, issue=i.issue, since=i.since)
        for i in user_issues(session, user, now, settings.health_failure_threshold)
    ]
    unresolved = len(
        session.scalars(
            select(ReviewItem.id).where(
                ReviewItem.user_id == user.id, ReviewItem.resolved_at.is_(None)
            )
        ).all()
    )
    return HealthOut(issues=issues, unresolved_reviews=unresolved)


# ---------- rules ----------


class ExclusionOut(BaseModel):
    match_type: str
    value: str
    reason: str


class RulesOut(BaseModel):
    window_days: int
    reminder_lead_days: int
    exclusions: list[ExclusionOut]
    as_of: date


@router.get("/rules")
def rules(user: CurrentUser, session: SessionDep, settings: SettingsDep, now: NowDep) -> RulesOut:
    """Configured rules, for display and the offline cache on the phone (NFR-22)."""
    return RulesOut(
        window_days=settings.price_adjustment_window_days,
        reminder_lead_days=settings.reminder_lead_days,
        exclusions=[
            ExclusionOut(match_type=e.match_type.value, value=e.value, reason=e.reason)
            for e in session.scalars(select(Exclusion).order_by(Exclusion.value))
        ],
        as_of=now.date(),
    )
