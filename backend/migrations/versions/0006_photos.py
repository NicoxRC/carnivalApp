"""Creates `photos`: what the public uploads, pending until someone moderates it.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-13 19:56:17.862284-05:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "photos",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("parade_id", sa.Text(), nullable=True),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("course_m", sa.Float(), nullable=True),
        sa.Column("state", sa.Text(), server_default=sa.text("'pending'"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "state in ('pending', 'approved', 'rejected')", name=op.f("ck_photos_state_valid")
        ),
        sa.ForeignKeyConstraint(
            ["parade_id"],
            ["parades.id"],
            name=op.f("fk_photos_parade_id_parades"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_photos")),
    )
    op.create_index(
        "ix_photos_state_created_at",
        "photos",
        ["state", sa.literal_column("created_at DESC")],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_photos_state_created_at", table_name="photos")
    op.drop_table("photos")
