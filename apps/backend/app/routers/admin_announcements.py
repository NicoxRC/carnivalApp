"""Messages from the team to everyone, published by whoever runs parade day."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response, status

from app.domain.schedule import (
    MAX_ANNOUNCEMENT_TEXT,
    Announcement,
    announcement_duration,
)
from app.live import announcement_out
from app.permissions import Permission
from app.repositories.announcements import AnnouncementNotFound, AnnouncementsRepoDep
from app.schemas import Schema
from app.schemas.state import Announcement as AnnouncementOut
from app.security import require

router = APIRouter(
    prefix="/api/admin/announcements",
    tags=["admin: announcements"],
    dependencies=[require(Permission.ANNOUNCEMENTS_MANAGE)],
)


class AnnouncementBody(Schema):
    text: str = ""
    # Anything other than "alert" is "info".
    level: str = "info"
    # Between 5 minutes and 12 hours; 60 if it does not come.
    duration_min: float | None = None


class Announcements(Schema):
    announcements: list[AnnouncementOut]


class Published(Schema):
    announcement: AnnouncementOut


@router.get("")
async def list_announcements(
    announcements: AnnouncementsRepoDep, response: Response
) -> Announcements:
    """The ones showing right now."""
    response.headers["Cache-Control"] = "no-store"
    return Announcements(announcements=[announcement_out(a) for a in await announcements.current()])


@router.post("", status_code=status.HTTP_201_CREATED)
async def publish_announcement(
    body: AnnouncementBody, announcements: AnnouncementsRepoDep
) -> Published:
    """Publishes a message for everyone. It shows above the map at once."""
    text = body.text.strip()[:MAX_ANNOUNCEMENT_TEXT]
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Escribí el mensaje.")
    now = datetime.now(UTC)
    announcement = Announcement(
        id=f"a-{uuid.uuid4().hex[:8]}",
        text=text,
        level="alert" if body.level == "alert" else "info",
        created_at=now,
        expires_at=now + announcement_duration(body.duration_min),
    )
    await announcements.save(announcement)
    return Published(announcement=announcement_out(announcement))


@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(announcement_id: str, announcements: AnnouncementsRepoDep) -> None:
    try:
        await announcements.delete(announcement_id)
    except AnnouncementNotFound as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No existe ese aviso.") from error
