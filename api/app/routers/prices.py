"""Manual price entry and price history (US-PRC-02, US-PRC-03)."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NowDep, SessionDep, SettingsDep
from app.db.models import PriceObservation, PriceSource, Purchase
from app.domain.models import Channel, FlagStatus
from app.routers.purchases import FlagSummary, flag_summary
from app.services import flagging
from app.services.time import local_today

router = APIRouter(tags=["prices"])


class PriceIn(BaseModel):
    item_number: str = Field(pattern=r"^\d{3,9}$")
    channel: Channel
    price_cents: int = Field(ge=0, le=10_000_000)
    seen_on: date
    promo_end: date | None = None
    quantity_limit: int | None = Field(default=None, ge=1, le=999)


class PriceOut(BaseModel):
    id: uuid.UUID
    item_number: str
    channel: Channel
    price_cents: int
    seen_on: date
    promo_end: date | None
    quantity_limit: int | None
    source: PriceSource


class PriceResult(BaseModel):
    price: PriceOut
    flagged: list[FlagSummary]


# A Warehouse Savings list rarely has more than a few hundred items.
MAX_PRICES_PER_BATCH = 500


class PriceBatchIn(BaseModel):
    prices: list[PriceIn] = Field(min_length=1, max_length=MAX_PRICES_PER_BATCH)


class PriceBatchOut(BaseModel):
    recorded: int
    duplicates: int
    flagged: list[FlagSummary]


def price_out(o: PriceObservation) -> PriceOut:
    return PriceOut(
        id=o.id,
        item_number=o.item_number,
        channel=o.channel,
        price_cents=o.price_cents,
        seen_on=o.seen_on,
        promo_end=o.promo_end,
        quantity_limit=o.quantity_limit,
        source=o.source,
    )


@router.post("/prices", status_code=status.HTTP_201_CREATED)
def record_price(
    body: PriceIn, user: CurrentUser, session: SessionDep, settings: SettingsDep, now: NowDep
) -> PriceResult:
    today = local_today(now, user.time_zone)
    if body.seen_on > today:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "seen_on is in the future")
    obs = PriceObservation(
        item_number=body.item_number,
        channel=body.channel,
        price_cents=body.price_cents,
        seen_on=body.seen_on,
        promo_end=body.promo_end,
        quantity_limit=body.quantity_limit,
        source=PriceSource.MANUAL,
        user_id=user.id,
    )
    session.add(obs)
    session.flush()
    flags = flagging.flag_purchases_for_observation(
        session, obs, user.id, today, settings.price_adjustment_window_days
    )
    summaries = [flag_summary(f, session.get_one(Purchase, f.purchase_id)) for f in flags]
    session.commit()
    return PriceResult(price=price_out(obs), flagged=summaries)


@router.post("/prices/batch", status_code=status.HTTP_201_CREATED)
def record_prices(
    body: PriceBatchIn, user: CurrentUser, session: SessionDep, settings: SettingsDep, now: NowDep
) -> PriceBatchOut:
    """Many manual prices at once, such as a Warehouse Savings list read on the phone.

    Prices this user already recorded (same item, channel, day and price) are skipped, so
    importing the same screenshots twice changes nothing.
    """
    today = local_today(now, user.time_zone)
    if any(p.seen_on > today for p in body.prices):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "seen_on is in the future")
    recorded = 0
    duplicates = 0
    flags = []
    seen: set[tuple[str, Channel, date, int]] = set()
    for p in body.prices:
        key = (p.item_number, p.channel, p.seen_on, p.price_cents)
        if key in seen or _has_manual_price(session, user.id, *key):
            duplicates += 1
            continue
        seen.add(key)
        obs = PriceObservation(
            item_number=p.item_number,
            channel=p.channel,
            price_cents=p.price_cents,
            seen_on=p.seen_on,
            promo_end=p.promo_end,
            quantity_limit=p.quantity_limit,
            source=PriceSource.MANUAL,
            user_id=user.id,
        )
        session.add(obs)
        session.flush()
        recorded += 1
        flags += flagging.flag_purchases_for_observation(
            session, obs, user.id, today, settings.price_adjustment_window_days
        )
    # A later, lower price in the same batch replaces an earlier flag; report only open ones.
    open_flags = [f for f in flags if f.status is FlagStatus.FLAGGED]
    summaries = [flag_summary(f, session.get_one(Purchase, f.purchase_id)) for f in open_flags]
    session.commit()
    return PriceBatchOut(recorded=recorded, duplicates=duplicates, flagged=summaries)


def _has_manual_price(
    session: Session, user_id: uuid.UUID, item: str, channel: Channel, seen_on: date, cents: int
) -> bool:
    return (
        session.scalar(
            select(PriceObservation.id).where(
                PriceObservation.user_id == user_id,
                PriceObservation.source == PriceSource.MANUAL,
                PriceObservation.item_number == item,
                PriceObservation.channel == channel,
                PriceObservation.seen_on == seen_on,
                PriceObservation.price_cents == cents,
            )
        )
        is not None
    )


@router.get("/items/{item_number}/prices")
def price_history(
    item_number: Annotated[str, Path(pattern=r"^\d{3,9}$")], user: CurrentUser, session: SessionDep
) -> list[PriceOut]:
    """Automatic prices plus this user's own manual entries, newest first."""
    rows = session.scalars(
        select(PriceObservation)
        .where(
            PriceObservation.item_number == item_number,
            or_(
                PriceObservation.source == PriceSource.AUTOMATIC,
                PriceObservation.user_id == user.id,
            ),
        )
        .order_by(PriceObservation.seen_on.desc(), PriceObservation.first_seen_at.desc())
    ).all()
    return [price_out(o) for o in rows]
