"""Announcements repository. Publishing or removing one wakes every stream up."""

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Annotated, Protocol, cast

from fastapi import Depends
from sqlalchemy import delete, or_, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionDep
from app.domain.schedule import Announcement, AnnouncementLevel
from app.models import Announcement as AnnouncementRow
from app.realtime import CHANNEL, EVERY_PARADE, Broadcaster


class AnnouncementNotFound(Exception):
    """No announcement has that id."""


class AnnouncementsRepo(Protocol):
    async def current(self) -> Sequence[Announcement]:
        """Those that have not expired, oldest first."""
        ...

    async def save(self, announcement: Announcement) -> None: ...

    async def delete(self, announcement_id: str) -> None:
        """Raises `AnnouncementNotFound`."""
        ...


class AnnouncementsPostgres:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def _notify(self) -> None:
        # An announcement travels inside the state of every parade.
        await self._session.execute(
            text("select pg_notify(:channel, :parade)"),
            {"channel": CHANNEL, "parade": EVERY_PARADE},
        )

    async def current(self) -> Sequence[Announcement]:
        rows = await self._session.scalars(
            select(AnnouncementRow)
            .where(
                or_(
                    AnnouncementRow.expires_at.is_(None),
                    AnnouncementRow.expires_at > datetime.now(UTC),
                )
            )
            .order_by(AnnouncementRow.created_at, AnnouncementRow.id)
        )
        return [
            Announcement(
                id=row.id,
                text=row.text,
                level=cast(AnnouncementLevel, row.level),
                created_at=row.created_at,
                expires_at=row.expires_at,
            )
            for row in rows
        ]

    async def save(self, announcement: Announcement) -> None:
        values = {
            "text": announcement.text,
            "level": announcement.level,
            "created_at": announcement.created_at,
            "expires_at": announcement.expires_at,
        }
        await self._session.execute(
            insert(AnnouncementRow)
            .values(id=announcement.id, **values)
            .on_conflict_do_update(index_elements=[AnnouncementRow.id], set_=values)
        )
        # The expired ones are of no use to anyone: cleared here, with no cron.
        await self._session.execute(
            delete(AnnouncementRow).where(AnnouncementRow.expires_at <= datetime.now(UTC))
        )
        await self._notify()
        await self._session.commit()

    async def delete(self, announcement_id: str) -> None:
        deleted = await self._session.scalar(
            delete(AnnouncementRow)
            .where(AnnouncementRow.id == announcement_id)
            .returning(AnnouncementRow.id)
        )
        await self._notify()
        await self._session.commit()
        if deleted is None:
            raise AnnouncementNotFound(announcement_id)


class AnnouncementsMemory:
    def __init__(self, broadcaster: Broadcaster | None = None) -> None:
        self._broadcaster = broadcaster
        self.rows: dict[str, Announcement] = {}

    def _notify(self) -> None:
        if self._broadcaster is not None:
            self._broadcaster.publish(EVERY_PARADE)

    async def current(self) -> Sequence[Announcement]:
        now = datetime.now(UTC)
        return sorted(
            (a for a in self.rows.values() if a.current(now)), key=lambda a: (a.created_at, a.id)
        )

    async def save(self, announcement: Announcement) -> None:
        now = datetime.now(UTC)
        self.rows = {k: a for k, a in self.rows.items() if a.current(now)}
        self.rows[announcement.id] = announcement
        self._notify()

    async def delete(self, announcement_id: str) -> None:
        if self.rows.pop(announcement_id, None) is None:
            raise AnnouncementNotFound(announcement_id)
        self._notify()


def get_announcements_repo(session: SessionDep) -> AnnouncementsRepo:
    return AnnouncementsPostgres(session)


AnnouncementsRepoDep = Annotated[AnnouncementsRepo, Depends(get_announcements_repo)]
