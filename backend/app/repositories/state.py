"""The live state of a parade: positions come in, the snapshot goes out.

The rules live here:

- The latest position of each post is the one with the highest `ts` (the
  phone's clock), not the last one to arrive: a packet that was queued and
  arrives late does not overwrite a newer one.
- Positions older than the parade's `run_started_at` are not shown.
- The first report of a scheduled parade moves it to `in_progress`.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Annotated, Protocol, cast

from fastapi import Depends
from sqlalchemy import func, insert, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionDep
from app.domain.parades import Parade
from app.domain.positions import HISTORY_WINDOW, PositionEntry
from app.domain.progress import Sample
from app.models import Parade as ParadeRow
from app.models import Position as PositionRow
from app.models import User as UserRow
from app.realtime import CHANNEL, Broadcaster
from app.repositories.parades import ParadeNotFound, ParadesMemory
from app.repositories.users import UsersMemory
from app.schemas.state import Post

# The whole history of the head is at most this many samples (a parade of
# many hours at one report every 20 s is about a thousand).
MAX_PROGRESS = 5000


@dataclass(frozen=True, slots=True)
class LivePosition:
    post: Post
    lat: float
    lng: float
    course_m: float
    accuracy_m: float | None
    ts: datetime


@dataclass(frozen=True, slots=True)
class LiveState:
    # Only the posts that have reported in this run.
    positions: dict[Post, LivePosition] = field(default_factory=dict)
    # The head over the last `HISTORY_WINDOW`, oldest first.
    head_history: list[Sample] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class Sender:
    """Who holds a post: the user of its latest position."""

    user_id: uuid.UUID | None
    ts: datetime


class StateRepo(Protocol):
    async def record_positions(
        self, entries: Sequence[PositionEntry], user_id: uuid.UUID | None
    ) -> None:
        """Stores them (all of one parade). Raises `ParadeNotFound`."""
        ...

    async def read_state(self, parade: Parade) -> LiveState: ...

    async def last_sender(self, parade: Parade, post: Post) -> Sender | None: ...

    async def read_progress(self, parade: Parade) -> Sequence[Sample]:
        """The whole history of the head in this run, oldest first."""
        ...


class StatePostgres:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record_positions(
        self, entries: Sequence[PositionEntry], user_id: uuid.UUID | None
    ) -> None:
        if not entries:
            return
        parade_id = entries[0].parade_id
        exists = await self._session.scalar(select(ParadeRow.id).where(ParadeRow.id == parade_id))
        if exists is None:
            raise ParadeNotFound(parade_id)

        await self._session.execute(
            insert(PositionRow),
            [
                {
                    "parade_id": entry.parade_id,
                    "user_id": user_id,
                    "post": entry.post,
                    "lat": entry.lat,
                    "lng": entry.lng,
                    "course_m": entry.course_m,
                    "accuracy_m": entry.accuracy_m,
                    "ts": entry.ts,
                }
                for entry in entries
            ],
        )
        await self._session.execute(
            update(ParadeRow)
            .where(ParadeRow.id == parade_id, ParadeRow.state == "scheduled")
            .values(state="in_progress")
        )
        if user_id is not None:
            latest = max(entry.ts for entry in entries)
            await self._session.execute(
                update(UserRow)
                .where(UserRow.id == user_id)
                .values(last_signal_at=func.greatest(UserRow.last_signal_at, latest))
            )
        # In the same transaction: the streams hear it only if it was stored.
        await self._session.execute(
            text("select pg_notify(:channel, :parade)"), {"channel": CHANNEL, "parade": parade_id}
        )
        await self._session.commit()

    async def read_state(self, parade: Parade) -> LiveState:
        in_run = (PositionRow.parade_id == parade.id, PositionRow.ts >= parade.run_started_at)
        latest = await self._session.execute(
            select(
                PositionRow.post,
                PositionRow.lat,
                PositionRow.lng,
                PositionRow.course_m,
                PositionRow.accuracy_m,
                PositionRow.ts,
            )
            .where(*in_run)
            .distinct(PositionRow.post)
            .order_by(PositionRow.post, PositionRow.ts.desc(), PositionRow.id.desc())
        )
        positions = {
            cast(Post, row.post): LivePosition(
                post=cast(Post, row.post),
                lat=row.lat,
                lng=row.lng,
                course_m=row.course_m,
                accuracy_m=row.accuracy_m,
                ts=row.ts,
            )
            for row in latest
        }

        history: list[Sample] = []
        head = positions.get("head")
        if head is not None:
            rows = await self._session.execute(
                select(PositionRow.course_m, PositionRow.ts)
                .where(
                    *in_run,
                    PositionRow.post == "head",
                    PositionRow.ts >= head.ts - HISTORY_WINDOW,
                )
                .order_by(PositionRow.ts, PositionRow.id)
            )
            history = [Sample(metres=row.course_m, ts=row.ts) for row in rows]
        return LiveState(positions=positions, head_history=history)

    async def last_sender(self, parade: Parade, post: Post) -> Sender | None:
        row = (
            await self._session.execute(
                select(PositionRow.user_id, PositionRow.ts)
                .where(
                    PositionRow.parade_id == parade.id,
                    PositionRow.post == post,
                    PositionRow.ts >= parade.run_started_at,
                )
                .order_by(PositionRow.ts.desc(), PositionRow.id.desc())
                .limit(1)
            )
        ).first()
        return Sender(user_id=row.user_id, ts=row.ts) if row else None

    async def read_progress(self, parade: Parade) -> Sequence[Sample]:
        rows = await self._session.execute(
            select(PositionRow.course_m, PositionRow.ts)
            .where(
                PositionRow.parade_id == parade.id,
                PositionRow.post == "head",
                PositionRow.ts >= parade.run_started_at,
            )
            .order_by(PositionRow.ts.desc(), PositionRow.id.desc())
            .limit(MAX_PROGRESS)
        )
        return sorted((Sample(metres=row.course_m, ts=row.ts) for row in rows), key=lambda s: s.ts)


class StateMemory:
    """Keeps every position in a list and answers like the table would."""

    def __init__(
        self,
        parades: ParadesMemory,
        users: UsersMemory | None = None,
        broadcaster: Broadcaster | None = None,
    ) -> None:
        self._parades = parades
        self._users = users
        self._broadcaster = broadcaster
        self._rows: list[tuple[PositionEntry, uuid.UUID | None]] = []

    async def record_positions(
        self, entries: Sequence[PositionEntry], user_id: uuid.UUID | None
    ) -> None:
        if not entries:
            return
        parade_id = entries[0].parade_id
        parade = await self._parades.by_id(parade_id)
        if parade is None:
            raise ParadeNotFound(parade_id)
        self._rows.extend((entry, user_id) for entry in entries)
        if parade.state == "scheduled":
            await self._parades.set_state(parade_id, "in_progress", new_run=False)
        if user_id is not None and self._users is not None:
            await self._users.mark_signal(user_id)
        if self._broadcaster is not None:
            self._broadcaster.publish(parade_id)

    def _in_run(
        self, parade: Parade, post: Post | None = None
    ) -> list[tuple[PositionEntry, uuid.UUID | None]]:
        rows = [
            row
            for row in self._rows
            if row[0].parade_id == parade.id
            and row[0].ts >= parade.run_started_at
            and (post is None or row[0].post == post)
        ]
        # Stable: among equal `ts`, the last one stored wins, like `id desc`.
        return sorted(rows, key=lambda row: row[0].ts)

    async def read_state(self, parade: Parade) -> LiveState:
        positions: dict[Post, LivePosition] = {}
        for entry, _ in self._in_run(parade):
            positions[entry.post] = LivePosition(
                post=entry.post,
                lat=entry.lat,
                lng=entry.lng,
                course_m=entry.course_m,
                accuracy_m=entry.accuracy_m,
                ts=entry.ts,
            )
        history: list[Sample] = []
        head = positions.get("head")
        if head is not None:
            history = [
                Sample(metres=entry.course_m, ts=entry.ts)
                for entry, _ in self._in_run(parade, "head")
                if entry.ts >= head.ts - HISTORY_WINDOW
            ]
        return LiveState(positions=positions, head_history=history)

    async def last_sender(self, parade: Parade, post: Post) -> Sender | None:
        rows = self._in_run(parade, post)
        if not rows:
            return None
        entry, user_id = rows[-1]
        return Sender(user_id=user_id, ts=entry.ts)

    async def read_progress(self, parade: Parade) -> Sequence[Sample]:
        samples = [Sample(metres=e.course_m, ts=e.ts) for e, _ in self._in_run(parade, "head")]
        return samples[-MAX_PROGRESS:]


def get_state_repo(session: SessionDep) -> StateRepo:
    return StatePostgres(session)


StateRepoDep = Annotated[StateRepo, Depends(get_state_repo)]
