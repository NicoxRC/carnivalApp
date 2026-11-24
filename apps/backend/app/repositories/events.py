"""Events repository: what is on the schedule besides the parades."""

import datetime as dt
from collections.abc import Sequence
from typing import Annotated, Protocol, cast

from fastapi import Depends
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionDep
from app.domain.schedule import Event, EventCategory
from app.models import Event as EventRow


class EventNotFound(Exception):
    """No event has that id."""


class EventsRepo(Protocol):
    async def list(self) -> Sequence[Event]:
        """Every event, by date and time."""
        ...

    async def save(self, event: Event) -> None:
        """Creates it or replaces the one with the same id."""
        ...

    async def delete(self, event_id: str) -> None:
        """Raises `EventNotFound`."""
        ...


def _time(value: dt.time | None) -> str | None:
    return value.strftime("%H:%M") if value else None


class EventsPostgres:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(self) -> Sequence[Event]:
        rows = await self._session.scalars(
            select(EventRow).order_by(EventRow.date, EventRow.start_time, EventRow.id)
        )
        return [
            Event(
                id=row.id,
                date=row.date.isoformat(),
                start_time=row.start_time.strftime("%H:%M"),
                end_time=_time(row.end_time),
                title=row.title,
                description=row.description,
                category=cast(EventCategory, row.category),
                place_name=row.place_name,
                lat=row.lat,
                lng=row.lng,
                sponsored=row.sponsored,
            )
            for row in rows
        ]

    async def save(self, event: Event) -> None:
        values = {
            "date": dt.date.fromisoformat(event.date),
            "start_time": dt.time.fromisoformat(event.start_time),
            "end_time": dt.time.fromisoformat(event.end_time) if event.end_time else None,
            "title": event.title,
            "description": event.description,
            "category": event.category,
            "place_name": event.place_name,
            "lat": event.lat,
            "lng": event.lng,
            "sponsored": event.sponsored,
        }
        await self._session.execute(
            insert(EventRow)
            .values(id=event.id, **values)
            .on_conflict_do_update(index_elements=[EventRow.id], set_=values)
        )
        await self._session.commit()

    async def delete(self, event_id: str) -> None:
        deleted = await self._session.scalar(
            delete(EventRow).where(EventRow.id == event_id).returning(EventRow.id)
        )
        await self._session.commit()
        if deleted is None:
            raise EventNotFound(event_id)


class EventsMemory:
    def __init__(self) -> None:
        self.rows: dict[str, Event] = {}

    async def list(self) -> Sequence[Event]:
        return sorted(self.rows.values(), key=lambda e: (e.date, e.start_time, e.id))

    async def save(self, event: Event) -> None:
        self.rows[event.id] = event

    async def delete(self, event_id: str) -> None:
        if self.rows.pop(event_id, None) is None:
            raise EventNotFound(event_id)


def get_events_repo(session: SessionDep) -> EventsRepo:
    return EventsPostgres(session)


EventsRepoDep = Annotated[EventsRepo, Depends(get_events_repo)]
