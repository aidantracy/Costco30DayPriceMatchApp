"""Purchases: import batches, manual entry, list, edit and delete (US-IMP-02 to US-IMP-07)."""

import uuid
from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NowDep, SessionDep, SettingsDep
from app.db.models import Flag, Purchase, PurchaseSource, User
from app.domain.models import Channel, FlagStatus
from app.domain.window import last_eligible_date
from app.services import exclusions, flagging, warehouses
from app.services.time import local_today

router = APIRouter(prefix="/purchases", tags=["purchases"])

ItemNumber = Annotated[str, Field(pattern=r"^\d{3,9}$")]
Cents = Annotated[int, Field(ge=0, le=10_000_000)]


class FlagSummary(BaseModel):
    id: uuid.UUID
    purchase_id: uuid.UUID
    item_number: str
    description: str
    refund_due_cents: int
    claim_deadline: date


class PurchaseOut(BaseModel):
    id: uuid.UUID
    source: PurchaseSource
    channel: Channel
    item_number: str
    description: str
    quantity: int
    unit_price_cents: int
    discount_cents: int
    purchase_date: date
    last_eligible_date: date
    days_left: int
    excluded: bool
    exclusion_reason: str | None


def purchase_out(p: Purchase, today: date, window_days: int) -> PurchaseOut:
    last = last_eligible_date(p.purchase_date, window_days)
    return PurchaseOut(
        id=p.id,
        source=p.source,
        channel=p.channel,
        item_number=p.item_number,
        description=p.description,
        quantity=p.quantity,
        unit_price_cents=p.unit_price_cents,
        discount_cents=p.discount_cents,
        purchase_date=p.purchase_date,
        last_eligible_date=last,
        days_left=(last - today).days,
        excluded=p.excluded,
        exclusion_reason=p.exclusion_reason,
    )


def flag_summary(f: Flag, p: Purchase) -> FlagSummary:
    return FlagSummary(
        id=f.id,
        purchase_id=p.id,
        item_number=p.item_number,
        description=p.description,
        refund_due_cents=f.refund_due_cents,
        claim_deadline=f.claim_deadline,
    )


# ---------- batch import (sync and screenshots) ----------


class LineIn(BaseModel):
    line_no: int = Field(ge=1, le=500)
    item_number: ItemNumber
    description: str = Field(min_length=1, max_length=200)
    quantity: int = Field(default=1, ge=1, le=999)
    unit_price_cents: Cents
    discount_cents: Cents = 0


class ReceiptIn(BaseModel):
    channel: Channel
    purchase_date: date
    warehouse_number: str | None = Field(default=None, pattern=r"^\d{1,4}$")
    receipt_id: str | None = Field(default=None, max_length=40)
    order_number: str | None = Field(default=None, max_length=40)
    parser_version: str = Field(max_length=40)
    items: list[LineIn] = Field(min_length=1, max_length=300)

    @model_validator(mode="after")
    def _identified(self) -> "ReceiptIn":
        if self.channel is Channel.WAREHOUSE and not (self.warehouse_number and self.receipt_id):
            raise ValueError("warehouse receipts need warehouse_number and receipt_id")
        if self.channel is Channel.ONLINE and not self.order_number:
            raise ValueError("online orders need order_number")
        return self


class BatchIn(BaseModel):
    source: Literal["sync", "screenshot"]
    receipts: list[ReceiptIn] = Field(min_length=1, max_length=50)


class BatchOut(BaseModel):
    created: int
    duplicates: int
    already_cheaper: list[FlagSummary]


@router.post("/batch")
def import_batch(
    body: BatchIn, user: CurrentUser, session: SessionDep, settings: SettingsDep, now: NowDep
) -> BatchOut:
    """Idempotent: lines already stored, or deleted by the owner, are skipped (FR-08, FR-11)."""
    today = local_today(now, user.time_zone)
    rules = exclusions.load_rules(session)
    created = duplicates = 0
    flags: list[FlagSummary] = []
    for receipt in body.receipts:
        if receipt.purchase_date > today:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "purchase date is in the future"
            )
        wh_id = (
            warehouses.get_or_create(session, receipt.warehouse_number, user.time_zone)
            if receipt.warehouse_number and receipt.channel is Channel.WAREHOUSE
            else None
        )
        for line in receipt.items:
            probe = Purchase(item_number=line.item_number, description=line.description)
            exclusions.apply(probe, rules)
            stmt = (
                insert(Purchase)
                .values(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    source=PurchaseSource(body.source),
                    channel=receipt.channel,
                    item_number=line.item_number,
                    description=line.description,
                    quantity=line.quantity,
                    unit_price_cents=line.unit_price_cents,
                    discount_cents=line.discount_cents,
                    purchase_date=receipt.purchase_date,
                    warehouse_id=wh_id,
                    order_number=receipt.order_number
                    if receipt.channel is Channel.ONLINE
                    else None,
                    receipt_id=receipt.receipt_id if receipt.channel is Channel.WAREHOUSE else None,
                    line_no=line.line_no,
                    excluded=bool(probe.excluded),
                    exclusion_reason=probe.exclusion_reason,
                    parser_version=receipt.parser_version,
                )
                .on_conflict_do_nothing()
                .returning(Purchase.id)
            )
            new_id = session.scalar(stmt)
            if new_id is None:
                duplicates += 1
                continue
            created += 1
            purchase = session.get_one(Purchase, new_id)
            flag = flagging.flag_new_purchase(
                session, purchase, today, settings.price_adjustment_window_days
            )
            if flag is not None:
                flags.append(flag_summary(flag, purchase))
    session.commit()
    return BatchOut(created=created, duplicates=duplicates, already_cheaper=flags)


# ---------- manual entry ----------


class ManualIn(BaseModel):
    channel: Channel
    item_number: ItemNumber
    description: str = Field(min_length=1, max_length=200)
    quantity: int = Field(default=1, ge=1, le=999)
    unit_price_cents: Cents
    purchase_date: date
    warehouse_number: str | None = Field(default=None, pattern=r"^\d{1,4}$")
    confirm_duplicate: bool = False

    @model_validator(mode="after")
    def _warehouse(self) -> "ManualIn":
        if (self.channel is Channel.WAREHOUSE) != (self.warehouse_number is not None):
            raise ValueError("warehouse_number is required for warehouse purchases only")
        return self


class ManualOut(BaseModel):
    purchase: PurchaseOut
    already_cheaper: FlagSummary | None


@router.post("", status_code=status.HTTP_201_CREATED)
def create_manual(
    body: ManualIn, user: CurrentUser, session: SessionDep, settings: SettingsDep, now: NowDep
) -> ManualOut:
    today = local_today(now, user.time_zone)
    if body.purchase_date > today:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "purchase date is in the future")
    if not body.confirm_duplicate and session.scalar(
        select(Purchase.id).where(
            Purchase.user_id == user.id,
            Purchase.item_number == body.item_number,
            Purchase.purchase_date == body.purchase_date,
            Purchase.unit_price_cents == body.unit_price_cents,
            Purchase.channel == body.channel,
            Purchase.deleted_at.is_(None),
        )
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This looks like a purchase you already have. "
            "Send confirm_duplicate to save it anyway.",
        )
    purchase = Purchase(
        user_id=user.id,
        source=PurchaseSource.MANUAL,
        channel=body.channel,
        item_number=body.item_number,
        description=body.description,
        quantity=body.quantity,
        unit_price_cents=body.unit_price_cents,
        purchase_date=body.purchase_date,
        warehouse_id=warehouses.get_or_create(session, body.warehouse_number, user.time_zone)
        if body.warehouse_number
        else None,
    )
    exclusions.apply(purchase, exclusions.load_rules(session))
    session.add(purchase)
    session.flush()
    flag = flagging.flag_new_purchase(
        session, purchase, today, settings.price_adjustment_window_days
    )
    session.commit()
    window = settings.price_adjustment_window_days
    return ManualOut(
        purchase=purchase_out(purchase, today, window),
        already_cheaper=flag_summary(flag, purchase) if flag else None,
    )


# ---------- list, edit, delete ----------


@router.get("")
def list_purchases(
    user: CurrentUser,
    session: SessionDep,
    settings: SettingsDep,
    now: NowDep,
    status_: Annotated[
        Literal["open", "expired", "excluded", "all"], Query(alias="status")
    ] = "open",
) -> list[PurchaseOut]:
    """Open purchases sorted by fewest days left first (US-TRK-04)."""
    today = local_today(now, user.time_zone)
    window = settings.price_adjustment_window_days
    cutoff = today - timedelta(days=window)
    q = select(Purchase).where(Purchase.user_id == user.id, Purchase.deleted_at.is_(None))
    if status_ == "open":
        q = q.where(Purchase.purchase_date >= cutoff, Purchase.excluded.is_(False))
    elif status_ == "expired":
        q = q.where(Purchase.purchase_date < cutoff)
    elif status_ == "excluded":
        q = q.where(Purchase.excluded.is_(True))
    rows = session.scalars(q.order_by(Purchase.purchase_date, Purchase.line_no)).all()
    return [purchase_out(p, today, window) for p in rows]


def owned_purchase(session: Session, user: User, purchase_id: uuid.UUID) -> Purchase:
    p = session.get(Purchase, purchase_id)
    if p is None or p.user_id != user.id or p.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return p


class PurchaseEdit(BaseModel):
    quantity: int | None = Field(default=None, ge=1, le=999)
    unit_price_cents: Cents | None = None
    purchase_date: date | None = None
    excluded: bool | None = None
    exclusion_reason: str | None = Field(default=None, max_length=200)


@router.patch("/{purchase_id}")
def edit_purchase(
    purchase_id: uuid.UUID,
    body: PurchaseEdit,
    user: CurrentUser,
    session: SessionDep,
    settings: SettingsDep,
    now: NowDep,
) -> PurchaseOut:
    p = owned_purchase(session, user, purchase_id)
    today = local_today(now, user.time_zone)
    if body.purchase_date is not None and body.purchase_date > today:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "purchase date is in the future")
    for field in ("quantity", "unit_price_cents", "purchase_date"):
        value = getattr(body, field)
        if value is not None:
            setattr(p, field, value)
    if body.excluded is not None:
        p.excluded = body.excluded
        p.exclusion_reason = (
            (body.exclusion_reason or "Excluded by owner") if body.excluded else None
        )
    _dismiss_unclaimed_flags(session, p)
    session.flush()
    flagging.flag_new_purchase(session, p, today, settings.price_adjustment_window_days)
    session.commit()
    return purchase_out(p, today, settings.price_adjustment_window_days)


def _dismiss_unclaimed_flags(session: Session, p: Purchase) -> None:
    """Edits change the numbers a flag was based on, so unclaimed flags are recalculated."""
    for f in session.scalars(
        select(Flag).where(Flag.purchase_id == p.id, Flag.status == FlagStatus.FLAGGED)
    ):
        f.status = FlagStatus.DISMISSED


@router.delete("/{purchase_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_purchase(
    purchase_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
    now: NowDep,
    confirm: bool = False,
) -> Response:
    """Soft delete, so a later sync doesn't bring the line back (FR-11)."""
    p = owned_purchase(session, user, purchase_id)
    in_progress = session.scalar(
        select(Flag.id).where(
            Flag.purchase_id == p.id,
            Flag.status.in_([FlagStatus.CLAIMED, FlagStatus.REFUNDED]),
        )
    )
    if in_progress and not confirm:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This purchase has a claim. Send confirm=true to delete it; the savings log keeps it.",
        )
    _dismiss_unclaimed_flags(session, p)
    p.deleted_at = now
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
