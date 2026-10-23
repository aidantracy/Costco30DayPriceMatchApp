"""Value types shared by the business rules. Money is integer cents throughout."""

from dataclasses import dataclass
from datetime import date
from enum import StrEnum


class Channel(StrEnum):
    """Where an item was bought or priced (BR-3)."""

    WAREHOUSE = "warehouse"
    ONLINE = "online"


class FlagStatus(StrEnum):
    """Claim status for a price drop (BR-8, FR-24)."""

    FLAGGED = "flagged"
    CLAIMED = "claimed"
    REFUNDED = "refunded"
    DENIED = "denied"
    DISMISSED = "dismissed"


@dataclass(frozen=True, slots=True)
class Purchase:
    item_number: str
    description: str
    channel: Channel
    quantity: int
    unit_price_cents: int
    purchase_date: date
    department: str | None = None

    def __post_init__(self) -> None:
        if not self.item_number.isdigit():
            raise ValueError("item_number must contain digits only")
        if self.quantity < 1:
            raise ValueError("quantity must be at least 1")
        if self.unit_price_cents < 0:
            raise ValueError("unit_price_cents must not be negative")


@dataclass(frozen=True, slots=True)
class PriceObservation:
    item_number: str
    channel: Channel
    price_cents: int
    seen_on: date
    promo_end: date | None = None
    quantity_limit: int | None = None

    def __post_init__(self) -> None:
        if not self.item_number.isdigit():
            raise ValueError("item_number must contain digits only")
        if self.price_cents < 0:
            raise ValueError("price_cents must not be negative")
        if self.quantity_limit is not None and self.quantity_limit < 1:
            raise ValueError("quantity_limit must be at least 1 when set")
