"""Where the public's phones are: one stretch per device, nothing else."""

from datetime import UTC, datetime
from typing import Annotated, Protocol

from fastapi import Depends
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionDep
from app.domain.constants import DENSITY_WINDOW
from app.models import Presence as PresenceRow


class PresencesRepo(Protocol):
    async def record(self, parade_id: str, device_id: str, bin: int) -> None:
        """One row per device: reporting more often does not inflate the count.

        It also drops the presences that fell out of the window, so no timer
        is needed.
        """
        ...

    async def counts(self, parade_id: str) -> tuple[dict[int, int], int]:
        """Devices per stretch within the window, and how many in all."""
        ...


class PresencesPostgres:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record(self, parade_id: str, device_id: str, bin: int) -> None:
        await self._session.execute(
            insert(PresenceRow)
            .values(parade_id=parade_id, device_id=device_id, bin=bin)
            .on_conflict_do_update(
                index_elements=[PresenceRow.parade_id, PresenceRow.device_id],
                set_={"bin": bin, "seen_at": func.now()},
            )
        )
        await self._session.execute(
            delete(PresenceRow).where(PresenceRow.seen_at < func.now() - DENSITY_WINDOW)
        )
        await self._session.commit()

    async def counts(self, parade_id: str) -> tuple[dict[int, int], int]:
        rows = await self._session.execute(
            select(PresenceRow.bin, func.count())
            .where(
                PresenceRow.parade_id == parade_id,
                PresenceRow.seen_at >= func.now() - DENSITY_WINDOW,
            )
            .group_by(PresenceRow.bin)
        )
        counts = {bin_number: count for bin_number, count in rows}
        return counts, sum(counts.values())


class PresencesMemory:
    def __init__(self) -> None:
        # (parade, device) -> (bin, seen at)
        self.rows: dict[tuple[str, str], tuple[int, datetime]] = {}

    async def record(self, parade_id: str, device_id: str, bin: int) -> None:
        now = datetime.now(UTC)
        self.rows[(parade_id, device_id)] = (bin, now)
        self.rows = {k: v for k, v in self.rows.items() if v[1] >= now - DENSITY_WINDOW}

    async def counts(self, parade_id: str) -> tuple[dict[int, int], int]:
        cutoff = datetime.now(UTC) - DENSITY_WINDOW
        counts: dict[int, int] = {}
        for (parade, _device), (bin_number, seen_at) in self.rows.items():
            if parade == parade_id and seen_at >= cutoff:
                counts[bin_number] = counts.get(bin_number, 0) + 1
        return counts, sum(counts.values())


def get_presences_repo(session: SessionDep) -> PresencesRepo:
    return PresencesPostgres(session)


PresencesRepoDep = Annotated[PresencesRepo, Depends(get_presences_repo)]
