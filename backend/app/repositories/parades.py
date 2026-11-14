"""Parades repository, and how a request finds out which parade it is about."""

import datetime as dt
import time
from collections.abc import Callable, Sequence
from dataclasses import replace
from functools import lru_cache
from typing import Annotated, Protocol, cast

from fastapi import Depends
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionDep
from app.domain.dates import today_in_pasto
from app.domain.parades import Parade, ParadeState, current_parade
from app.models import Parade as ParadeRow


class ParadeNotFound(Exception):
    """No parade has that id."""


class ParadesRepo(Protocol):
    async def list(self) -> Sequence[Parade]:
        """Every parade, by date and time."""
        ...

    async def by_id(self, parade_id: str) -> Parade | None: ...

    async def save(
        self, *, id: str, name: str, date: str, start_time: str, course_id: str
    ) -> Parade:
        """Creates it (as `scheduled`) or changes name, date and time.

        The state of one that already exists is left alone.
        """
        ...

    async def set_state(self, parade_id: str, state: ParadeState, *, new_run: bool) -> Parade:
        """Raises `ParadeNotFound`. With `new_run`, positions so far stop counting."""
        ...

    async def delete(self, parade_id: str) -> None:
        """Raises `ParadeNotFound`."""
        ...


def _parade(row: ParadeRow) -> Parade:
    return Parade(
        id=row.id,
        name=row.name,
        date=row.date.isoformat(),
        start_time=row.start_time.strftime("%H:%M"),
        state=cast(ParadeState, row.state),
        course_id=row.course_id,
        run_started_at=row.run_started_at,
    )


class ParadesPostgres:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(self) -> Sequence[Parade]:
        rows = await self._session.scalars(
            select(ParadeRow).order_by(ParadeRow.date, ParadeRow.start_time, ParadeRow.id)
        )
        return [_parade(row) for row in rows]

    async def by_id(self, parade_id: str) -> Parade | None:
        row = await self._session.scalar(select(ParadeRow).where(ParadeRow.id == parade_id))
        return _parade(row) if row else None

    async def save(
        self, *, id: str, name: str, date: str, start_time: str, course_id: str
    ) -> Parade:
        values = {
            "name": name,
            "date": dt.date.fromisoformat(date),
            "start_time": dt.time.fromisoformat(start_time),
            "course_id": course_id,
        }
        row = await self._session.scalar(
            insert(ParadeRow)
            .values(id=id, **values)
            .on_conflict_do_update(index_elements=[ParadeRow.id], set_=values)
            .returning(ParadeRow),
            execution_options={"populate_existing": True},
        )
        assert row is not None
        await self._session.commit()
        return _parade(row)

    async def set_state(self, parade_id: str, state: ParadeState, *, new_run: bool) -> Parade:
        values: dict[str, object] = {"state": state}
        if new_run:
            values["run_started_at"] = func.now()
        row = await self._session.scalar(
            update(ParadeRow)
            .where(ParadeRow.id == parade_id)
            .values(**values)
            .returning(ParadeRow),
            execution_options={"populate_existing": True},
        )
        await self._session.commit()
        if row is None:
            raise ParadeNotFound(parade_id)
        return _parade(row)

    async def delete(self, parade_id: str) -> None:
        deleted = await self._session.scalar(
            delete(ParadeRow).where(ParadeRow.id == parade_id).returning(ParadeRow.id)
        )
        await self._session.commit()
        if deleted is None:
            raise ParadeNotFound(parade_id)


class ParadesMemory:
    def __init__(self) -> None:
        self._parades: dict[str, Parade] = {}

    async def list(self) -> Sequence[Parade]:
        return sorted(self._parades.values(), key=lambda p: (p.date, p.start_time, p.id))

    async def by_id(self, parade_id: str) -> Parade | None:
        return self._parades.get(parade_id)

    async def save(
        self, *, id: str, name: str, date: str, start_time: str, course_id: str
    ) -> Parade:
        existing = self._parades.get(id)
        self._parades[id] = Parade(
            id=id,
            name=name,
            date=date,
            start_time=start_time,
            course_id=course_id,
            state=existing.state if existing else "scheduled",
            run_started_at=existing.run_started_at if existing else dt.datetime.now(dt.UTC),
        )
        return self._parades[id]

    async def set_state(self, parade_id: str, state: ParadeState, *, new_run: bool) -> Parade:
        parade = self._parades.get(parade_id)
        if parade is None:
            raise ParadeNotFound(parade_id)
        parade = replace(parade, state=state)
        if new_run:
            parade = replace(parade, run_started_at=dt.datetime.now(dt.UTC))
        self._parades[parade_id] = parade
        return parade

    async def delete(self, parade_id: str) -> None:
        if self._parades.pop(parade_id, None) is None:
            raise ParadeNotFound(parade_id)


def get_parades_repo(session: SessionDep) -> ParadesRepo:
    return ParadesPostgres(session)


ParadesRepoDep = Annotated[ParadesRepo, Depends(get_parades_repo)]


class ParadeList:
    """The list of parades, remembered for 2 seconds.

    Every read of the live state needs it to know which parade is the current
    one, and it changes a few times a day: with thousands of phones asking,
    it is one query every 2 s instead of one per request.
    """

    SECONDS = 2.0

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._parades: Sequence[Parade] = ()
        self._until = 0.0

    async def get(self, parades: ParadesRepo) -> Sequence[Parade]:
        if self._until <= self._clock():
            self._parades = await parades.list()
            self._until = self._clock() + self.SECONDS
        return self._parades

    def forget(self) -> None:
        """After a change from the panel, so whoever made it sees it at once."""
        self._until = 0.0


@lru_cache
def get_parade_list() -> ParadeList:
    return ParadeList()


ParadeListDep = Annotated[ParadeList, Depends(get_parade_list)]


async def resolve_parade(
    parades: ParadesRepo, parade_list: ParadeList, parade_id: str | None = None
) -> Parade | None:
    """Which parade a request is about.

    With an id, that one (or `None` if it does not exist: a parade is never
    created by asking for it). Without one, the current parade.
    """
    known = await parade_list.get(parades)
    if parade_id:
        return next((parade for parade in known if parade.id == parade_id), None)
    return current_parade(known, today_in_pasto())
