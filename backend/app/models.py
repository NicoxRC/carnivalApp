"""Database tables (SQLAlchemy). All of them inherit from `Base`."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, MetaData, Text, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Fixed names for indexes and constraints. Without this Postgres names them
# its own way and a later migration has no way to refer to them.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class User(Base):
    """A member of the team. The public never has a row here."""

    __tablename__ = "users"
    __table_args__ = (
        # Emails are compared as text, so they are stored in one single form.
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint("post in ('head', 'middle', 'tail')", name="post_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    email: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    # Never the password itself, only its hash.
    password_hash: Mapped[str] = mapped_column(Text)
    # Where a reporter walks in the parade. Empty for everyone else.
    post: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(server_default=text("true"))
    last_signal_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class UserRole(Base):
    """One row per role a user has: someone can be editor and moderator."""

    __tablename__ = "user_roles"
    __table_args__ = (
        CheckConstraint(
            "role in ('admin', 'coordinator', 'editor', 'moderator', 'reporter', 'ingest')",
            name="role_valid",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(Text, primary_key=True)
