"""Database tables (SQLAlchemy). All of them inherit from `Base`."""

import datetime as dt
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Identity,
    Index,
    Integer,
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


class Position(Base):
    """Where each reporter was: the history, and the table that writes the most."""

    __tablename__ = "positions"
    __table_args__ = (
        CheckConstraint("post in ('head', 'middle', 'tail')", name="post_valid"),
        # The read that runs every few seconds: the latest of each post.
        Index("ix_positions_parade_id_post_ts", "parade_id", "post", text("ts DESC")),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    parade_id: Mapped[str] = mapped_column(ForeignKey("parades.id", ondelete="CASCADE"))
    # Empty for positions that did not come from a person (or whose user is gone).
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # Copied here on purpose: the read cannot afford a join.
    post: Mapped[str] = mapped_column(Text)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    # Metres from the start of the course, computed once on insert.
    course_m: Mapped[float] = mapped_column(Float)
    accuracy_m: Mapped[float | None] = mapped_column(Float)
    # The phone's clock: the latest position is the one with the highest `ts`.
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # The server's clock.
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class Presence(Base):
    """One row per phone of the public: the 100 m stretch it is in.

    It is overwritten on every report and never stores lat/lng.
    """

    __tablename__ = "presences"
    __table_args__ = (Index("ix_presences_parade_id_seen_at", "parade_id", text("seen_at DESC")),)

    parade_id: Mapped[str] = mapped_column(
        ForeignKey("parades.id", ondelete="CASCADE"), primary_key=True
    )
    device_id: Mapped[str] = mapped_column(Text, primary_key=True)
    bin: Mapped[int] = mapped_column(Integer)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class Announcement(Base):
    """A message from the team that shows above the map for everyone."""

    __tablename__ = "announcements"
    __table_args__ = (CheckConstraint("level in ('info', 'alert')", name="level_valid"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    level: Mapped[str] = mapped_column(Text, server_default=text("'info'"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    # Empty: until someone removes it.
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Last on purpose: from here down, `text` is this column and no longer
    # SQLAlchemy's `text()`.
    text: Mapped[str] = mapped_column(Text)


class Event(Base):
    """Something on the schedule that is not a parade: a stage, a tasca."""

    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint(
            "category in ('tasca', 'stage', 'cultural', 'kids')", name="category_valid"
        ),
        Index("ix_events_date_start_time", "date", "start_time"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    # In Pasto time.
    date: Mapped[dt.date] = mapped_column(Date)
    start_time: Mapped[dt.time] = mapped_column(Time)
    end_time: Mapped[dt.time | None] = mapped_column(Time)
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, server_default=text("''"))
    category: Mapped[str] = mapped_column(Text)
    place_name: Mapped[str] = mapped_column(Text, server_default=text("''"))
    # The point on the map, if it has one: both or neither.
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    sponsored: Mapped[bool] = mapped_column(server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class Business(Base):
    """A business or a service on the map. The panel manages them."""

    __tablename__ = "businesses"
    __table_args__ = (
        CheckConstraint(
            "category in ('restaurant', 'tasca', 'cafe', 'ice_cream', 'bakery', 'shop', 'bar', "
            "'pharmacy', 'toilet', 'water', 'first_aid', 'police', 'road_closure')",
            name="category_valid",
        ),
        CheckConstraint("plan in ('basic', 'featured')", name="plan_valid"),
        CheckConstraint("offer_timing in ('always', 'before', 'after')", name="offer_timing_valid"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, server_default=text("''"))
    address: Mapped[str] = mapped_column(Text, server_default=text("''"))
    hours: Mapped[str] = mapped_column(Text, server_default=text("''"))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    # Empty: on the map without having paid. Being there never depends on it.
    plan: Mapped[str | None] = mapped_column(Text)
    offer: Mapped[str | None] = mapped_column(Text)
    offer_timing: Mapped[str] = mapped_column(Text, server_default=text("'always'"))
    # A list of {name, price}.
    menu: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, server_default=text("'[]'"))
    whatsapp: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(Text)
    visible: Mapped[bool] = mapped_column(server_default=text("true"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class BusinessMetric(Base):
    """What the advertiser is told: a counter per business, day and type.

    Never who tapped, nor from where.
    """

    __tablename__ = "business_metrics"
    __table_args__ = (
        CheckConstraint(
            "type in ('card', 'map', 'menu', 'whatsapp', 'link', 'offer')", name="type_valid"
        ),
    )

    business_id: Mapped[str] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), primary_key=True
    )
    # In Pasto time.
    day: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    type: Mapped[str] = mapped_column(Text, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, server_default=text("0"))


class Photo(Base):
    """A photo the public uploaded. Nothing is published without moderation."""

    __tablename__ = "photos"
    __table_args__ = (
        CheckConstraint("state in ('pending', 'approved', 'rejected')", name="state_valid"),
        # The two reads: the approved ones for everyone, the queue for moderators.
        Index("ix_photos_state_created_at", "state", text("created_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    # The parade that was current when it was uploaded, if there was one.
    parade_id: Mapped[str | None] = mapped_column(ForeignKey("parades.id", ondelete="SET NULL"))
    # Where the file is in the storage (app/storage.py).
    storage_path: Mapped[str] = mapped_column(Text)
    # The stretch of the course it was taken on, if whoever uploaded it shared
    # their location. Never lat/lng, and never who.
    course_m: Mapped[float | None] = mapped_column(Float)
    state: Mapped[str] = mapped_column(Text, server_default=text("'pending'"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class PushSubscription(Base):
    """ "Tell me when the parade is close": where to send it and where they wait.

    One row per device, deleted once the notification goes out. It does not
    store who it is.
    """

    __tablename__ = "push_subscriptions"
    __table_args__ = (Index("ix_push_subscriptions_parade_id", "parade_id"),)

    # The address the browser's push service gave: it identifies the device.
    endpoint: Mapped[str] = mapped_column(Text, primary_key=True)
    p256dh: Mapped[str] = mapped_column(Text)
    auth: Mapped[str] = mapped_column(Text)
    parade_id: Mapped[str] = mapped_column(ForeignKey("parades.id", ondelete="CASCADE"))
    # Where the person waits, in metres along the course.
    course_m: Mapped[float] = mapped_column(Float)
    # With how many minutes to go they want to be told.
    threshold_min: Mapped[int] = mapped_column(Integer, server_default=text("10"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
