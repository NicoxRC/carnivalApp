"""Creates `announcements` and `events`: what the team writes for everyone to read.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-13 19:48:06.019422-05:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "announcements",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("level", sa.Text(), server_default=sa.text("'info'"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.CheckConstraint("level in ('info', 'alert')", name=op.f("ck_announcements_level_valid")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_announcements")),
    )
    op.create_table(
        "events",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("place_name", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lng", sa.Float(), nullable=True),
        sa.Column("sponsored", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "category in ('tasca', 'stage', 'cultural', 'kids')",
            name=op.f("ck_events_category_valid"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_events")),
    )
    op.create_index("ix_events_date_start_time", "events", ["date", "start_time"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_events_date_start_time", table_name="events")
    op.drop_table("events")
    op.drop_table("announcements")
