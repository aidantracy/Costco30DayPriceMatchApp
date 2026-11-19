"""Item checks: when the phone last looked an item up on costco.com (ADR 0007).

Revision ID: ca245af51b54
Revises: 86114698e2c1
Create Date: 2026-11-11 21:21:42.193074

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ca245af51b54"
down_revision: str | Sequence[str] | None = "86114698e2c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:

    op.create_table(
        "item_checks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("item_number", sa.String(length=12), nullable=False),
        sa.Column("checked_on", sa.Date(), nullable=False),
        sa.Column("found", sa.Boolean(), nullable=False),
        sa.CheckConstraint(
            "item_number ~ '^[0-9]+$'", name=op.f("ck_item_checks_item_number_digits")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_item_checks_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_item_checks")),
        sa.UniqueConstraint("user_id", "item_number", name="uq_item_checks_user_item"),
    )


def downgrade() -> None:

    op.drop_table("item_checks")
