"""Builds the snapshot of a parade, for the endpoint and for the stream.

The stream cannot use the session of its request: a session keeps a database
connection, and a stream stays open for hours. `StateReader` opens a short
session for each read instead.
"""

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Annotated, Protocol

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session_factory
from app.domain.parades import Parade
from app.domain.schedule import Announcement as AnnouncementValue
from app.repositories.announcements import AnnouncementsPostgres, AnnouncementsRepo
from app.repositories.parades import (
    ParadeList,
    ParadesPostgres,
    ParadesRepo,
    get_parade_list,
    resolve_parade,
)
from app.repositories.state import LiveState, StatePostgres, StateRepo
from app.schemas import to_ms
from app.schemas.state import Announcement, HistorySample, ParadeStateOut, Position


def announcement_out(announcement: AnnouncementValue) -> Announcement:
    return Announcement(
        id=announcement.id,
        text=announcement.text,
        level=announcement.level,
        created_at=to_ms(announcement.created_at),
        expires_at=to_ms(announcement.expires_at) if announcement.expires_at else None,
    )


def state_out(
    parade: Parade,
    live: LiveState,
    announcements: Sequence[AnnouncementValue] = (),
    now: datetime | None = None,
) -> ParadeStateOut:
    return ParadeStateOut(
        parade_id=parade.id,
        name=parade.name,
        state=parade.state,
        date=parade.date,
        start_time=parade.start_time,
        course_id=parade.course_id,
        positions={
            post: Position(
                post=post,
                lat=position.lat,
                lng=position.lng,
                metres=position.course_m,
                accuracy_m=position.accuracy_m,
                ts=to_ms(position.ts),
            )
            for post, position in live.positions.items()
        },
        head_history=[
            HistorySample(metres=sample.metres, ts=to_ms(sample.ts)) for sample in live.head_history
        ],
        announcements=[announcement_out(announcement) for announcement in announcements],
        server_ts=to_ms(now or datetime.now(UTC)),
    )


class StateReader(Protocol):
    async def resolve(self, parade_id: str | None) -> str | None:
        """The id of the parade asked for, or of the current one. `None`: there is none."""
        ...

    async def snapshot(self, parade_id: str) -> ParadeStateOut | None:
        """The state of that parade right now. `None` if it no longer exists."""
        ...


class RepoStateReader:
    """Reads through repositories it is given. Tests use it with the in-memory ones."""

    def __init__(
        self,
        parades: ParadesRepo,
        state: StateRepo,
        parade_list: ParadeList,
        announcements: AnnouncementsRepo,
    ) -> None:
        self._parades = parades
        self._state = state
        self._parade_list = parade_list
        self._announcements = announcements

    async def resolve(self, parade_id: str | None) -> str | None:
        parade = await resolve_parade(self._parades, self._parade_list, parade_id)
        return parade.id if parade else None

    async def snapshot(self, parade_id: str) -> ParadeStateOut | None:
        # Read by id and not from the 2 s list: the state has to be the fresh one.
        parade = await self._parades.by_id(parade_id)
        if parade is None:
            return None
        return state_out(
            parade, await self._state.read_state(parade), await self._announcements.current()
        )


class PostgresStateReader:
    """Opens a session for each read and closes it right after."""

    async def resolve(self, parade_id: str | None) -> str | None:
        async with get_session_factory()() as session:
            return await self._reader(session).resolve(parade_id)

    async def snapshot(self, parade_id: str) -> ParadeStateOut | None:
        async with get_session_factory()() as session:
            return await self._reader(session).snapshot(parade_id)

    @staticmethod
    def _reader(session: AsyncSession) -> RepoStateReader:
        return RepoStateReader(
            ParadesPostgres(session),
            StatePostgres(session),
            get_parade_list(),
            AnnouncementsPostgres(session),
        )


def get_state_reader() -> StateReader:
    return PostgresStateReader()


StateReaderDep = Annotated[StateReader, Depends(get_state_reader)]
