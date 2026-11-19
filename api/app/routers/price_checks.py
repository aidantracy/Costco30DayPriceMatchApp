"""Price checks run on the owner's phone (ADR 0007).

Costco's bot protection refuses requests from cloud servers, so the phone looks items up on
costco.com while the app is open and reports what it read. The server decides which items are
due, records the prices as automatic observations and flags drops with the usual rules.
"""

from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NowDep, SessionDep, SettingsDep
from app.db.models import (
    AutomationRun,
    ItemCheck,
    PriceObservation,
    PriceSource,
    Purchase,
    RunKind,
    RunStatus,
)
from app.domain.models import Channel
from app.routers.purchases import FlagSummary, flag_summary
from app.services import flagging
from app.services.time import local_today

router = APIRouter(prefix="/price-checks", tags=["prices"])

# Items that aren't sold online are looked up again after this many days (NFR-21).
NOT_ONLINE_RECHECK_DAYS = 7
MAX_ITEMS_PER_CHECK = 60


class DueOut(BaseModel):
    item_numbers: list[str]


class CheckResultIn(BaseModel):
    item_number: str = Field(pattern=r"^\d{3,9}$")
    found: bool
    warehouse_price_cents: int | None = Field(default=None, ge=0, le=10_000_000)
    online_price_cents: int | None = Field(default=None, ge=0, le=10_000_000)
    promo_end: date | None = None

    @model_validator(mode="after")
    def _prices_only_when_found(self) -> "CheckResultIn":
        has_price = self.warehouse_price_cents is not None or self.online_price_cents is not None
        if has_price and not self.found:
            raise ValueError("an item that wasn't found can't have a price")
        return self


class CheckIn(BaseModel):
    started_at: datetime
    finished_at: datetime
    results: list[CheckResultIn] = Field(max_length=MAX_ITEMS_PER_CHECK)


class CheckOut(BaseModel):
    recorded: int
    flagged: list[FlagSummary]


@router.get("/due")
def due_items(user: CurrentUser, session: SessionDep, settings: SettingsDep, now: NowDep) -> DueOut:
    """Item numbers of open purchases that haven't been looked up today."""
    today = local_today(now, user.time_zone)
    cutoff = today - timedelta(days=settings.price_adjustment_window_days)
    open_items = session.scalars(
        select(Purchase.item_number)
        .where(
            Purchase.user_id == user.id,
            Purchase.deleted_at.is_(None),
            Purchase.excluded.is_(False),
            Purchase.purchase_date >= cutoff,
        )
        .distinct()
        .order_by(Purchase.item_number)
    ).all()
    checks = {
        c.item_number: c
        for c in session.scalars(select(ItemCheck).where(ItemCheck.user_id == user.id))
    }

    def is_due(item: str) -> bool:
        c = checks.get(item)
        if c is None:
            return True
        if c.found:
            return c.checked_on < today
        return c.checked_on <= today - timedelta(days=NOT_ONLINE_RECHECK_DAYS)

    return DueOut(item_numbers=[i for i in open_items if is_due(i)][:MAX_ITEMS_PER_CHECK])


@router.post("")
def report_check(
    body: CheckIn, user: CurrentUser, session: SessionDep, settings: SettingsDep, now: NowDep
) -> CheckOut:
    """Record what the phone read. Prices only: no page content is sent (NFR-04)."""
    if body.finished_at < body.started_at:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "finished_at is before started_at"
        )
    today = local_today(now, user.time_zone)
    window = settings.price_adjustment_window_days
    recorded = 0
    flags = []
    for r in body.results:
        session.execute(
            insert(ItemCheck)
            .values(user_id=user.id, item_number=r.item_number, checked_on=today, found=r.found)
            .on_conflict_do_update(
                constraint="uq_item_checks_user_item",
                set_={"checked_on": today, "found": r.found},
            )
        )
        for channel, cents in (
            (Channel.WAREHOUSE, r.warehouse_price_cents),
            (Channel.ONLINE, r.online_price_cents),
        ):
            if cents is None:
                continue
            obs = _observe(session, r.item_number, channel, cents, today, r.promo_end, now)
            recorded += 1
            flags += flagging.flag_purchases_for_observation(session, obs, user.id, today, window)
    session.add(
        AutomationRun(
            user_id=user.id,
            kind=RunKind.PRICE_CHECK,
            status=RunStatus.SUCCESS,
            started_at=body.started_at,
            finished_at=body.finished_at,
        )
    )
    summaries = [flag_summary(f, session.get_one(Purchase, f.purchase_id)) for f in flags]
    session.commit()
    return CheckOut(recorded=recorded, flagged=summaries)


def _observe(
    session: Session,
    item: str,
    channel: Channel,
    cents: int,
    today: date,
    promo_end: date | None,
    now: datetime,
) -> PriceObservation:
    """Today's automatic price for an item, reusing the row when the same price is seen again."""
    existing = session.scalar(
        select(PriceObservation).where(
            PriceObservation.item_number == item,
            PriceObservation.channel == channel,
            PriceObservation.source == PriceSource.AUTOMATIC,
            PriceObservation.seen_on == today,
            PriceObservation.price_cents == cents,
        )
    )
    if existing is not None:
        existing.last_seen_at = now
        existing.promo_end = promo_end
        return existing
    obs = PriceObservation(
        item_number=item,
        channel=channel,
        price_cents=cents,
        seen_on=today,
        promo_end=promo_end,
        source=PriceSource.AUTOMATIC,
    )
    session.add(obs)
    session.flush()
    return obs
