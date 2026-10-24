"""Decide whether a recorded price makes a purchase claimable (FR-18)."""

from dataclasses import dataclass
from datetime import date

from app.domain.models import PriceObservation, Purchase
from app.domain.refund import eligible_quantity, refund_due_cents
from app.domain.window import claim_deadline, last_eligible_date


@dataclass(frozen=True, slots=True)
class FlagDecision:
    price_paid_cents: int
    new_price_cents: int
    eligible_quantity: int
    refund_due_cents: int
    claim_deadline: date


def evaluate(
    purchase: Purchase,
    observation: PriceObservation,
    today: date,
    window_days: int,
    excluded: bool = False,
) -> FlagDecision | None:
    """Return a flag if the observation is a claimable drop for this purchase, else None.

    A drop counts only when the item is not excluded (BR-6), the observation is for
    the same item and channel (BR-2, BR-3), it was seen within the purchase's window
    (BR-1), the price is lower than what was paid, and the claim deadline, which a
    promotion's end date can shorten (BR-5), has not passed.
    """
    if excluded:
        return None
    if observation.item_number != purchase.item_number:
        return None
    if observation.channel is not purchase.channel:
        return None
    last = last_eligible_date(purchase.purchase_date, window_days)
    if not purchase.purchase_date <= observation.seen_on <= last:
        return None
    if observation.price_cents >= purchase.unit_price_cents:
        return None
    deadline = claim_deadline(last, observation.promo_end)
    if today > deadline:
        return None
    return FlagDecision(
        price_paid_cents=purchase.unit_price_cents,
        new_price_cents=observation.price_cents,
        eligible_quantity=eligible_quantity(purchase.quantity, observation.quantity_limit),
        refund_due_cents=refund_due_cents(
            purchase.unit_price_cents,
            observation.price_cents,
            purchase.quantity,
            observation.quantity_limit,
        ),
        claim_deadline=deadline,
    )
