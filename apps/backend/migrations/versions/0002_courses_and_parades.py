"""Creates `courses` and `parades`: the route and each day that walks it.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-13 19:31:27.899737-05:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "courses",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("geojson", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "waypoints",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'"),
            nullable=False,
        ),
        sa.Column("length_m", sa.Float(), nullable=False),
        sa.Column("official", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("warning", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_courses")),
    )
    op.create_table(
        "parades",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("course_id", sa.Text(), nullable=False),
        sa.Column("state", sa.Text(), server_default=sa.text("'scheduled'"), nullable=False),
        sa.Column(
            "run_started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "state in ('scheduled', 'in_progress', 'finished')", name=op.f("ck_parades_state_valid")
        ),
        sa.ForeignKeyConstraint(
            ["course_id"], ["courses.id"], name=op.f("fk_parades_course_id_courses")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_parades")),
    )


def downgrade() -> None:
    op.drop_table("parades")
    op.drop_table("courses")
