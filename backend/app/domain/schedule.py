"""What the team writes for everyone to read: announcements and events."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

AnnouncementLevel = Literal["info", "alert"]
EventCategory = Literal["tasca", "stage", "cultural", "kids"]
EVENT_CATEGORIES: tuple[EventCategory, ...] = ("tasca", "stage", "cultural", "kids")

MAX_ANNOUNCEMENT_TEXT = 160
DEFAULT_ANNOUNCEMENT = timedelta(minutes=60)
MIN_ANNOUNCEMENT = timedelta(minutes=5)
# An announcement with no end stays above the map until someone remembers to
# remove it: capped at 12 h.
MAX_ANNOUNCEMENT = timedelta(hours=12)

MAX_EVENT_TITLE = 100
MAX_EVENT_DESCRIPTION = 280
MAX_EVENT_PLACE = 100


@dataclass(frozen=True, slots=True)
class Announcement:
    id: str
    text: str
    level: AnnouncementLevel
    created_at: datetime
    # `None`: until someone removes it.
    expires_at: datetime | None

    def current(self, now: datetime) -> bool:
        return self.expires_at is None or self.expires_at > now


@dataclass(frozen=True, slots=True)
class Event:
    id: str
    # YYYY-MM-DD, in Pasto time.
    date: str
    # HH:MM
    start_time: str
    end_time: str | None
    title: str
    description: str
    category: EventCategory
    place_name: str
    lat: float | None
    lng: float | None
    sponsored: bool


def announcement_duration(minutes: float | None) -> timedelta:
    """How long an announcement lasts: what was asked, within 5 min and 12 h."""
    asked = timedelta(minutes=minutes) if minutes else DEFAULT_ANNOUNCEMENT
    return min(max(asked, MIN_ANNOUNCEMENT), MAX_ANNOUNCEMENT)
