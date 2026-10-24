"""Schema rules that protect data integrity (docs/design/data-model.md)."""

import uuid
from datetime import date

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.ids import uuid7
from app.db.models import (
    Exclusion,
    Flag,
    PriceObservation,
    PriceSource,
    Purchase,
    PurchaseSource,
    User,
    Warehouse,
)
from app.domain.models import Channel, FlagStatus


def make_user(session: Session, email: str = "owner@example.com") -> User:
    user = User(email=email, password_hash="not-a-real-hash")
    session.add(user)
    session.flush()
    return user


def make_warehouse(session: Session) -> Warehouse:
    wh = Warehouse(costco_number="999", time_zone="America/Denver")
    session.add(wh)
    session.flush()
    return wh


def receipt_line(user: User, wh: Warehouse, line_no: int = 1, **kw: object) -> Purchase:
    values: dict[str, object] = {
        "user_id": user.id,
        "source": PurchaseSource.SYNC,
        "channel": Channel.WAREHOUSE,
        "item_number": "1234567",
        "description": "EXAMPLE ITEM",
        "unit_price_cents": 1899,
        "purchase_date": date(2026, 10, 1),
        "warehouse_id": wh.id,
        "receipt_id": "999-2-123-2026-10-01",
        "line_no": line_no,
    }
    values.update(kw)
    return Purchase(**values)


def test_migrations_round_trip(database_url: str, migrated_engine: Engine) -> None:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


def test_exclusions_are_seeded(session: Session) -> None:
    count = session.scalar(select(func.count()).select_from(Exclusion))
    assert count is not None and count >= 7


def test_same_receipt_line_cannot_be_imported_twice(session: Session) -> None:
    user, wh = make_user(session), make_warehouse(session)
    session.add(receipt_line(user, wh))
    session.flush()
    session.add(receipt_line(user, wh, source=PurchaseSource.SCREENSHOT))
    with pytest.raises(IntegrityError, match="uq_purchases_receipt_line"):
        session.flush()


def test_same_receipt_line_is_allowed_for_another_user(session: Session) -> None:
    wh = make_warehouse(session)
    a, b = make_user(session, "a@example.com"), make_user(session, "b@example.com")
    session.add_all([receipt_line(a, wh), receipt_line(b, wh)])
    session.flush()


def test_emails_are_unique_ignoring_case(session: Session) -> None:
    make_user(session, "Owner@Example.com")
    with pytest.raises(IntegrityError, match="uq_users_email_lower"):
        make_user(session, "owner@example.com")


@pytest.mark.parametrize(
    ("overrides", "constraint"),
    [
        ({"quantity": 0}, "quantity_positive"),
        ({"unit_price_cents": -1}, "price_not_negative"),
        ({"item_number": "12A4"}, "item_number_digits"),
        ({"warehouse_id": None}, "warehouse_matches_channel"),
    ],
)
def test_purchase_checks(session: Session, overrides: dict[str, object], constraint: str) -> None:
    user, wh = make_user(session), make_warehouse(session)
    session.add(receipt_line(user, wh, **overrides))
    with pytest.raises(IntegrityError, match=constraint):
        session.flush()


def test_online_purchase_has_no_warehouse(session: Session) -> None:
    user = make_user(session)
    session.add(
        Purchase(
            user_id=user.id,
            source=PurchaseSource.MANUAL,
            channel=Channel.ONLINE,
            item_number="7654321",
            description="EXAMPLE ONLINE ITEM",
            unit_price_cents=4999,
            purchase_date=date(2026, 10, 1),
            order_number="EXAMPLE-0001",
            line_no=1,
        )
    )
    session.flush()


def test_manual_price_must_have_an_owner(session: Session) -> None:
    session.add(
        PriceObservation(
            item_number="1234567",
            channel=Channel.WAREHOUSE,
            price_cents=1499,
            seen_on=date(2026, 10, 2),
            source=PriceSource.MANUAL,
        )
    )
    with pytest.raises(IntegrityError, match="manual_has_owner"):
        session.flush()


def test_only_one_open_flag_per_purchase(session: Session) -> None:
    user, wh = make_user(session), make_warehouse(session)
    purchase = receipt_line(user, wh)
    obs = PriceObservation(
        item_number="1234567",
        channel=Channel.WAREHOUSE,
        price_cents=1499,
        seen_on=date(2026, 10, 2),
        source=PriceSource.AUTOMATIC,
    )
    session.add_all([purchase, obs])
    session.flush()

    def flag(status: FlagStatus) -> Flag:
        return Flag(
            user_id=user.id,
            purchase_id=purchase.id,
            price_observation_id=obs.id,
            price_paid_cents=1899,
            new_price_cents=1499,
            eligible_quantity=1,
            refund_due_cents=400,
            claim_deadline=date(2026, 10, 31),
            status=status,
        )

    session.add(flag(FlagStatus.DISMISSED))
    session.add(flag(FlagStatus.FLAGGED))
    session.flush()
    session.add(flag(FlagStatus.CLAIMED))
    with pytest.raises(IntegrityError, match="uq_flags_open_per_purchase"):
        session.flush()


def test_uuid7_sorts_by_creation_time() -> None:
    ids = [uuid7() for _ in range(50)]
    assert all(i.version == 7 for i in ids)
    assert [i.bytes[:6] for i in ids] == sorted(i.bytes[:6] for i in ids)
    assert len(set(ids)) == 50
    assert isinstance(ids[0], uuid.UUID)
