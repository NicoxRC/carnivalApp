"""Creates `positions` and `presences`: where the parade is and where the public is.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-13 19:38:34.172848-05:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "positions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("parade_id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("post", sa.Text(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("course_m", sa.Float(), nullable=False),
        sa.Column("accuracy_m", sa.Float(), nullable=True),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "post in ('head', 'middle', 'tail')", name=op.f("ck_positions_post_valid")
        ),
        sa.ForeignKeyConstraint(
            ["parade_id"],
            ["parades.id"],
            name=op.f("fk_positions_parade_id_parades"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_positions_user_id_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_positions")),
    )
    op.create_index(
        "ix_positions_parade_id_post_ts",
        "positions",
        ["parade_id", "post", sa.literal_column("ts DESC")],
        unique=False,
    )
    op.create_table(
        "presences",
        sa.Column("parade_id", sa.Text(), nullable=False),
        sa.Column("device_id", sa.Text(), nullable=False),
        sa.Column("bin", sa.Integer(), nullable=False),
        sa.Column(
            "seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["parade_id"],
            ["parades.id"],
            name=op.f("fk_presences_parade_id_parades"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("parade_id", "device_id", name=op.f("pk_presences")),
    )
    op.create_index(
        "ix_presences_parade_id_seen_at",
        "presences",
        ["parade_id", sa.literal_column("seen_at DESC")],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_presences_parade_id_seen_at", table_name="presences")
    op.drop_table("presences")
    op.drop_index("ix_positions_parade_id_post_ts", table_name="positions")
    op.drop_table("positions")
