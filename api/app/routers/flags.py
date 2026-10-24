"""Price drops, claim cards, claim status and the savings log (US-ALR-01, US-CLM-01 to 03)."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NowDep, SessionDep, SettingsDep
from app.db.models import Flag, FlagEvent, PriceObservation, Purchase, User, Warehouse
from app.domain.claims import InvalidTransitionError, alert_accuracy, transition
from app.domain.models import Channel, FlagStatus
from app.domain.window import last_eligible_date

router = APIRouter(tags=["claims"])

CLAIM_PATH = {
    Channel.WAREHOUSE: "Take this to the Returns counter at warehouse {warehouse}.",
    Channel.ONLINE: "Use the Request a Price Match form on Costco's customer service site.",
}


class FlagOut(BaseModel):
    id: uuid.UUID
    status: FlagStatus
    unread: bool
    item_number: str
    description: str
    refund_due_cents: int
    claim_deadline: date


class ClaimCard(BaseModel):
    flag_id: uuid.UUID
    status: FlagStatus
    item_number: str
    description: str
    channel: Channel
    purchase_date: date
    warehouse_number: str | None
    quantity: int
    eligible_quantity: int
    price_paid_cents: int
    current_price_cents: int
    refund_due_cents: int
    price_seen_on: date
    price_source: str
    promo_end: date | None
    last_eligible_date: date
    claim_deadline: date
    claim_path: str


class FlagUpdate(BaseModel):
    read: bool | None = None
    status: FlagStatus | None = None
    refunded_cents: int | None = Field(default=None, ge=0, le=10_000_000)
    denial_reason: str | None = Field(default=None, max_length=200)


class SavingsOut(BaseModel):
    total_refunded_cents: int
    by_month: dict[str, int]
    claims: list[FlagOut]
    alert_accuracy: float | None


def owned_flag(session: Session, user: User, flag_id: uuid.UUID) -> tuple[Flag, Purchase]:
    flag = session.get(Flag, flag_id)
    if flag is None or flag.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return flag, session.get_one(Purchase, flag.purchase_id)


def flag_out(f: Flag, p: Purchase) -> FlagOut:
    return FlagOut(
        id=f.id,
        status=f.status,
        unread=f.read_at is None,
        item_number=p.item_number,
        description=p.description,
        refund_due_cents=f.refund_due_cents,
        claim_deadline=f.claim_deadline,
    )


@router.get("/flags")
def list_flags(
    user: CurrentUser,
    session: SessionDep,
    unread: Annotated[bool, Query()] = False,
) -> list[FlagOut]:
    """Open price drops (flagged or claimed), newest first: the in-app "Price drops" list."""
    q = (
        select(Flag, Purchase)
        .join(Purchase, Purchase.id == Flag.purchase_id)
        .where(
            Flag.user_id == user.id,
            Flag.status.in_([FlagStatus.FLAGGED, FlagStatus.CLAIMED]),
            Purchase.deleted_at.is_(None),
        )
        .order_by(Flag.created_at.desc())
    )
    if unread:
        q = q.where(Flag.read_at.is_(None))
    return [flag_out(f, p) for f, p in session.execute(q)]


@router.get("/flags/{flag_id}/claim-card")
def claim_card(
    flag_id: uuid.UUID, user: CurrentUser, session: SessionDep, settings: SettingsDep
) -> ClaimCard:
    flag, p = owned_flag(session, user, flag_id)
    obs = session.get_one(PriceObservation, flag.price_observation_id)
    wh = session.get(Warehouse, p.warehouse_id) if p.warehouse_id else None
    number = wh.costco_number if wh else None
    return ClaimCard(
        flag_id=flag.id,
        status=flag.status,
        item_number=p.item_number,
        description=p.description,
        channel=p.channel,
        purchase_date=p.purchase_date,
        warehouse_number=number,
        quantity=p.quantity,
        eligible_quantity=flag.eligible_quantity,
        price_paid_cents=flag.price_paid_cents,
        current_price_cents=flag.new_price_cents,
        refund_due_cents=flag.refund_due_cents,
        price_seen_on=obs.seen_on,
        price_source=obs.source.value,
        promo_end=obs.promo_end,
        last_eligible_date=last_eligible_date(
            p.purchase_date, settings.price_adjustment_window_days
        ),
        claim_deadline=flag.claim_deadline,
        claim_path=CLAIM_PATH[p.channel].format(warehouse=number),
    )


@router.patch("/flags/{flag_id}")
def update_flag(
    flag_id: uuid.UUID, body: FlagUpdate, user: CurrentUser, session: SessionDep, now: NowDep
) -> FlagOut:
    flag, p = owned_flag(session, user, flag_id)
    if body.read:
        flag.read_at = flag.read_at or now
    if body.status is not None and body.status is not flag.status:
        try:
            transition(flag.status, body.status)
        except InvalidTransitionError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
        session.add(FlagEvent(flag_id=flag.id, from_status=flag.status, to_status=body.status))
        flag.status = body.status
        if body.status is FlagStatus.REFUNDED:
            flag.refunded_cents = (
                body.refunded_cents if body.refunded_cents is not None else flag.refund_due_cents
            )
        if body.status is FlagStatus.DENIED:
            flag.denial_reason = body.denial_reason
    session.commit()
    return flag_out(flag, p)


@router.get("/savings")
def savings(user: CurrentUser, session: SessionDep) -> SavingsOut:
    """Refunded claims with totals per month, and alert accuracy (US-CLM-03)."""
    rows = session.execute(
        select(Flag, Purchase)
        .join(Purchase, Purchase.id == Flag.purchase_id)
        .where(Flag.user_id == user.id, Flag.status.in_([FlagStatus.REFUNDED, FlagStatus.DENIED]))
        .order_by(Flag.created_at.desc())
    ).all()
    refunded = [(f, p) for f, p in rows if f.status is FlagStatus.REFUNDED]
    by_month: dict[str, int] = {}
    for f, _ in refunded:
        month = f.created_at.strftime("%Y-%m")
        by_month[month] = by_month.get(month, 0) + (f.refunded_cents or 0)
    return SavingsOut(
        total_refunded_cents=sum(f.refunded_cents or 0 for f, _ in refunded),
        by_month=dict(sorted(by_month.items())),
        claims=[flag_out(f, p) for f, p in refunded],
        alert_accuracy=alert_accuracy(len(refunded), len(rows) - len(refunded)),
    )
