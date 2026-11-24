"""Creates `push_subscriptions`: who asked to be told when the parade gets close.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-13 20:00:14.371128-05:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("parade_id", sa.Text(), nullable=False),
        sa.Column("course_m", sa.Float(), nullable=False),
        sa.Column("threshold_min", sa.Integer(), server_default=sa.text("10"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["parade_id"],
            ["parades.id"],
            name=op.f("fk_push_subscriptions_parade_id_parades"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("endpoint", name=op.f("pk_push_subscriptions")),
    )
    op.create_index(
        "ix_push_subscriptions_parade_id", "push_subscriptions", ["parade_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_push_subscriptions_parade_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
