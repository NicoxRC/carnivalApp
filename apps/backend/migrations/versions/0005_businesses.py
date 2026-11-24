"""Creates `businesses` and `business_metrics`: the map's businesses and how much each is used.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-13 19:52:10.528684-05:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "businesses",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("address", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("hours", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("plan", sa.Text(), nullable=True),
        sa.Column("offer", sa.Text(), nullable=True),
        sa.Column("offer_timing", sa.Text(), server_default=sa.text("'always'"), nullable=False),
        sa.Column(
            "menu",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'"),
            nullable=False,
        ),
        sa.Column("whatsapp", sa.Text(), nullable=True),
        sa.Column("link", sa.Text(), nullable=True),
        sa.Column("visible", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "category in ('restaurant', 'tasca', 'cafe', 'ice_cream', 'bakery', 'shop', 'bar', "
            "'pharmacy', 'toilet', 'water', 'first_aid', 'police', 'road_closure')",
            name=op.f("ck_businesses_category_valid"),
        ),
        sa.CheckConstraint(
            "offer_timing in ('always', 'before', 'after')",
            name=op.f("ck_businesses_offer_timing_valid"),
        ),
        sa.CheckConstraint("plan in ('basic', 'featured')", name=op.f("ck_businesses_plan_valid")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_businesses")),
    )
    op.create_table(
        "business_metrics",
        sa.Column("business_id", sa.Text(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.CheckConstraint(
            "type in ('card', 'map', 'menu', 'whatsapp', 'link', 'offer')",
            name=op.f("ck_business_metrics_type_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_business_metrics_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("business_id", "day", "type", name=op.f("pk_business_metrics")),
    )


def downgrade() -> None:
    op.drop_table("business_metrics")
    op.drop_table("businesses")
