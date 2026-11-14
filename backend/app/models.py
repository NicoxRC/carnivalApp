"""Database tables (SQLAlchemy). All of them inherit from `Base`."""

import datetime as dt
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    MetaData,
    Text,
    Time,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
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


class Course(Base):
    """The physical route: a line in GeoJSON and the waypoints along it."""

    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    geojson: Mapped[dict[str, Any]] = mapped_column(JSONB)
    # A list of {id, name, short, kind, lat, lng}. Their metres are computed
    # when the course is loaded, not stored.
    waypoints: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, server_default=text("'[]'"))
    length_m: Mapped[float] = mapped_column(Float)
    official: Mapped[bool] = mapped_column(server_default=text("false"))
    # Shown to the user while the course is not the official one.
    warning: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class Parade(Base):
    """One day of parade: it walks a course, with a date, a time and a state."""

    __tablename__ = "parades"
    __table_args__ = (
        CheckConstraint("state in ('scheduled', 'in_progress', 'finished')", name="state_valid"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    # In Pasto time.
    date: Mapped[dt.date] = mapped_column(Date)
    start_time: Mapped[dt.time] = mapped_column(Time)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"))
    state: Mapped[str] = mapped_column(Text, server_default=text("'scheduled'"))
    # Since when positions count. Restarting moves it to now instead of
    # deleting rows: a restart by mistake cannot destroy data.
    run_started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
