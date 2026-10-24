"""SQLAlchemy models for the server data model (docs/design/data-model.md).

Money is integer cents. Every user-owned table has a non-null ``user_id``.
Nothing here stores a Costco password, the Costco session, card digits or a
membership number (NFR-01 to NFR-03).
"""

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    MetaData,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.db.ids import uuid7
from app.domain.exclusions import MatchType
from app.domain.models import Channel, FlagStatus

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


class PurchaseSource(enum.StrEnum):
    SYNC = "sync"
    SCREENSHOT = "screenshot"
    MANUAL = "manual"


class PriceSource(enum.StrEnum):
    AUTOMATIC = "automatic"
    MANUAL = "manual"


class Platform(enum.StrEnum):
    IOS = "ios"
    ANDROID = "android"


class AlertKind(enum.StrEnum):
    PRICE_DROP = "price_drop"
    WINDOW_CLOSING = "window_closing"
    HEALTH = "health"
    REVIEW = "review"


class AlertChannel(enum.StrEnum):
    PUSH = "push"
    EMAIL = "email"


class ReviewResolution(enum.StrEnum):
    MANUAL_ENTRY = "manual_entry"
    DISMISSED = "dismissed"


class RunKind(enum.StrEnum):
    SYNC = "sync"
    PRICE_CHECK = "price_check"


class RunStatus(enum.StrEnum):
    SUCCESS = "success"
    FAILURE = "failure"


def pg_enum(enum_cls: type[enum.StrEnum], name: str) -> Enum:
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])


def created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    email: Mapped[str] = mapped_column(String(320))
    password_hash: Mapped[str] = mapped_column(Text)
    time_zone: Mapped[str] = mapped_column(String(64), default="America/Denver")
    automation_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at()

    __table_args__ = (Index("uq_users_email_lower", func.lower(email), unique=True),)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True)
    family_id: Mapped[uuid.UUID] = mapped_column(index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at()


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    platform: Mapped[Platform] = mapped_column(pg_enum(Platform, "platform"))
    push_token: Mapped[str] = mapped_column(Text, unique=True)
    last_seen_at: Mapped[datetime] = created_at()


class Warehouse(Base):
    __tablename__ = "warehouses"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    costco_number: Mapped[str] = mapped_column(String(8), unique=True)
    time_zone: Mapped[str] = mapped_column(String(64))


class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    source: Mapped[PurchaseSource] = mapped_column(pg_enum(PurchaseSource, "purchase_source"))
    channel: Mapped[Channel] = mapped_column(pg_enum(Channel, "channel"))
    item_number: Mapped[str] = mapped_column(String(12))
    description: Mapped[str] = mapped_column(String(200))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price_cents: Mapped[int] = mapped_column(Integer)
    discount_cents: Mapped[int] = mapped_column(Integer, default=0)
    purchase_date: Mapped[date] = mapped_column(Date)
    warehouse_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("warehouses.id"))
    order_number: Mapped[str | None] = mapped_column(String(40))
    receipt_id: Mapped[str | None] = mapped_column(String(40))
    line_no: Mapped[int | None] = mapped_column(Integer)
    excluded: Mapped[bool] = mapped_column(Boolean, default=False)
    exclusion_reason: Mapped[str | None] = mapped_column(String(200))
    parser_version: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = created_at()
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("quantity >= 1", name="quantity_positive"),
        CheckConstraint("unit_price_cents >= 0", name="price_not_negative"),
        CheckConstraint("discount_cents >= 0", name="discount_not_negative"),
        CheckConstraint("item_number ~ '^[0-9]+$'", name="item_number_digits"),
        CheckConstraint(
            "(channel = 'warehouse') = (warehouse_id IS NOT NULL)",
            name="warehouse_matches_channel",
        ),
        Index(
            "uq_purchases_order_line",
            "user_id",
            "order_number",
            "line_no",
            unique=True,
            postgresql_where=text("order_number IS NOT NULL"),
        ),
        Index(
            "uq_purchases_receipt_line",
            "user_id",
            "warehouse_id",
            "receipt_id",
            "line_no",
            unique=True,
            postgresql_where=text("receipt_id IS NOT NULL"),
        ),
        Index(
            "ix_purchases_open",
            "item_number",
            "channel",
            "purchase_date",
            postgresql_where=text("deleted_at IS NULL AND NOT excluded"),
        ),
    )


class PriceObservation(Base):
    __tablename__ = "price_observations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    item_number: Mapped[str] = mapped_column(String(12))
    channel: Mapped[Channel] = mapped_column(pg_enum(Channel, "channel"))
    warehouse_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("warehouses.id"))
    price_cents: Mapped[int] = mapped_column(Integer)
    seen_on: Mapped[date] = mapped_column(Date)
    promo_start: Mapped[date | None] = mapped_column(Date)
    promo_end: Mapped[date | None] = mapped_column(Date)
    quantity_limit: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[PriceSource] = mapped_column(pg_enum(PriceSource, "price_source"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    parser_version: Mapped[str | None] = mapped_column(String(40))
    first_seen_at: Mapped[datetime] = created_at()
    last_seen_at: Mapped[datetime] = created_at()

    __table_args__ = (
        CheckConstraint("price_cents >= 0", name="price_not_negative"),
        CheckConstraint("quantity_limit IS NULL OR quantity_limit >= 1", name="limit_positive"),
        CheckConstraint("(source = 'manual') = (user_id IS NOT NULL)", name="manual_has_owner"),
        Index("ix_price_observations_item", "item_number", "channel", "seen_on"),
    )


class Flag(Base):
    __tablename__ = "flags"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    purchase_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("purchases.id", ondelete="CASCADE"))
    price_observation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("price_observations.id"))
    price_paid_cents: Mapped[int] = mapped_column(Integer)
    new_price_cents: Mapped[int] = mapped_column(Integer)
    eligible_quantity: Mapped[int] = mapped_column(Integer)
    refund_due_cents: Mapped[int] = mapped_column(Integer)
    claim_deadline: Mapped[date] = mapped_column(Date)
    status: Mapped[FlagStatus] = mapped_column(
        pg_enum(FlagStatus, "flag_status"), default=FlagStatus.FLAGGED
    )
    refunded_cents: Mapped[int | None] = mapped_column(Integer)
    denial_reason: Mapped[str | None] = mapped_column(String(200))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at()

    __table_args__ = (
        CheckConstraint("new_price_cents < price_paid_cents", name="is_a_drop"),
        CheckConstraint("eligible_quantity >= 1", name="quantity_positive"),
        CheckConstraint("refund_due_cents > 0", name="refund_positive"),
        Index(
            "uq_flags_open_per_purchase",
            "purchase_id",
            unique=True,
            postgresql_where=text("status IN ('flagged', 'claimed')"),
        ),
    )


class FlagEvent(Base):
    __tablename__ = "flag_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    flag_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("flags.id", ondelete="CASCADE"), index=True
    )
    from_status: Mapped[FlagStatus | None] = mapped_column(pg_enum(FlagStatus, "flag_status"))
    to_status: Mapped[FlagStatus] = mapped_column(pg_enum(FlagStatus, "flag_status"))
    at: Mapped[datetime] = created_at()


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    flag_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("flags.id", ondelete="CASCADE"))
    kind: Mapped[AlertKind] = mapped_column(pg_enum(AlertKind, "alert_kind"))
    delivered_via: Mapped[AlertChannel] = mapped_column(pg_enum(AlertChannel, "alert_channel"))
    dedupe_key: Mapped[str] = mapped_column(String(120), unique=True)
    sent_at: Mapped[datetime] = created_at()


class ReviewItem(Base):
    __tablename__ = "review_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    source: Mapped[PurchaseSource] = mapped_column(pg_enum(PurchaseSource, "purchase_source"))
    reason: Mapped[str] = mapped_column(String(200))
    parser_version: Mapped[str | None] = mapped_column(String(40))
    resolution: Mapped[ReviewResolution | None] = mapped_column(
        pg_enum(ReviewResolution, "review_resolution")
    )
    received_at: Mapped[datetime] = created_at()
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AutomationRun(Base):
    __tablename__ = "automation_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[RunKind] = mapped_column(pg_enum(RunKind, "run_kind"))
    status: Mapped[RunStatus] = mapped_column(pg_enum(RunStatus, "run_status"))
    error_code: Mapped[str | None] = mapped_column(String(40))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Exclusion(Base):
    __tablename__ = "exclusions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    match_type: Mapped[MatchType] = mapped_column(pg_enum(MatchType, "match_type"))
    value: Mapped[str] = mapped_column(String(120))
    reason: Mapped[str] = mapped_column(String(200))

    __table_args__ = (UniqueConstraint("match_type", "value", name="uq_exclusions_rule"),)
