"""Turn recorded prices into flags (FR-18, FR-32), using the pure rules in app.domain."""

import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Flag, FlagEvent, PriceObservation, PriceSource, Purchase
from app.domain import flagging
from app.domain import models as dm
from app.domain.models import FlagStatus


def _to_domain(p: Purchase) -> dm.Purchase:
    return dm.Purchase(
        item_number=p.item_number,
        description=p.description,
        channel=p.channel,
        quantity=p.quantity,
        unit_price_cents=p.unit_price_cents,
        purchase_date=p.purchase_date,
    )


def _obs_to_domain(o: PriceObservation) -> dm.PriceObservation:
    return dm.PriceObservation(
        item_number=o.item_number,
        channel=o.channel,
        price_cents=o.price_cents,
        seen_on=o.seen_on,
        promo_end=o.promo_end,
        quantity_limit=o.quantity_limit,
    )


def flag_if_cheaper(
    session: Session,
    purchase: Purchase,
    observation: PriceObservation,
    today: date,
    window_days: int,
) -> Flag | None:
    """Create a flag when the observation is a claimable drop that beats any open flag."""
    if purchase.deleted_at is not None:
        return None
    decision = flagging.evaluate(
        _to_domain(purchase), _obs_to_domain(observation), today, window_days, purchase.excluded
    )
    if decision is None:
        return None
    open_flag = session.scalar(
        select(Flag).where(
            Flag.purchase_id == purchase.id,
            Flag.status.in_([FlagStatus.FLAGGED, FlagStatus.CLAIMED]),
        )
    )
    if open_flag is not None:
        if (
            open_flag.status is FlagStatus.CLAIMED
            or open_flag.new_price_cents <= decision.new_price_cents
        ):
            return None
        # A lower price replaces an unclaimed flag, and alerts again (US-ALR-01).
        session.add(
            FlagEvent(
                flag_id=open_flag.id, from_status=open_flag.status, to_status=FlagStatus.DISMISSED
            )
        )
        open_flag.status = FlagStatus.DISMISSED
        session.flush()
    flag = Flag(
        user_id=purchase.user_id,
        purchase_id=purchase.id,
        price_observation_id=observation.id,
        price_paid_cents=decision.price_paid_cents,
        new_price_cents=decision.new_price_cents,
        eligible_quantity=decision.eligible_quantity,
        refund_due_cents=decision.refund_due_cents,
        claim_deadline=decision.claim_deadline,
    )
    session.add(flag)
    session.flush()
    session.add(FlagEvent(flag_id=flag.id, from_status=None, to_status=FlagStatus.FLAGGED))
    return flag


def flag_purchases_for_observation(
    session: Session,
    observation: PriceObservation,
    user_id: uuid.UUID,
    today: date,
    window_days: int,
) -> list[Flag]:
    """A new price: check every open purchase of that item and channel for one user."""
    purchases = session.scalars(
        select(Purchase).where(
            Purchase.user_id == user_id,
            Purchase.item_number == observation.item_number,
            Purchase.channel == observation.channel,
            Purchase.deleted_at.is_(None),
            Purchase.purchase_date >= today - timedelta(days=window_days),
        )
    ).all()
    flags = [flag_if_cheaper(session, p, observation, today, window_days) for p in purchases]
    return [f for f in flags if f is not None]


def flag_new_purchase(
    session: Session, purchase: Purchase, today: date, window_days: int
) -> Flag | None:
    """A new purchase: compare it with the lowest price already recorded in its window (FR-32)."""
    candidates = session.scalars(
        select(PriceObservation)
        .where(
            PriceObservation.item_number == purchase.item_number,
            PriceObservation.channel == purchase.channel,
            PriceObservation.seen_on >= purchase.purchase_date,
            (PriceObservation.source == PriceSource.AUTOMATIC)
            | (PriceObservation.user_id == purchase.user_id),
        )
        .order_by(PriceObservation.price_cents, PriceObservation.seen_on.desc())
    ).all()
    for obs in candidates:
        flag = flag_if_cheaper(session, purchase, obs, today, window_days)
        if flag is not None:
            return flag
    return None
