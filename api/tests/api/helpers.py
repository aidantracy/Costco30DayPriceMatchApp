"""Builders for invented test data."""

from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import PriceObservation, PriceSource
from app.domain.models import Channel


def receipt(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "channel": "warehouse",
        "purchase_date": "2026-09-20",
        "warehouse_number": "999",
        "receipt_id": "999-2-123-2026-09-20",
        "parser_version": "warehouse-receipt/1",
        "items": [
            {
                "line_no": 1,
                "item_number": "1111111",
                "description": "KS EXAMPLE A",
                "unit_price_cents": 499,
            },
            {
                "line_no": 2,
                "item_number": "2222222",
                "description": "EXAMPLE GADGET",
                "unit_price_cents": 1999,
                "discount_cents": 500,
            },
        ],
    }
    body.update(overrides)
    return body


def batch(*receipts: dict[str, Any], source: str = "sync") -> dict[str, Any]:
    return {"source": source, "receipts": list(receipts) or [receipt()]}


def automatic_price(
    session: Session,
    item: str,
    cents: int,
    seen_on: date,
    channel: Channel = Channel.WAREHOUSE,
    **kw: Any,
) -> PriceObservation:
    obs = PriceObservation(
        item_number=item,
        channel=channel,
        price_cents=cents,
        seen_on=seen_on,
        source=PriceSource.AUTOMATIC,
        **kw,
    )
    session.add(obs)
    session.flush()
    return obs
