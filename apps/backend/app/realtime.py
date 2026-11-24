"""Tells the open streams that the state of a parade changed.

Two pieces:

- `Broadcaster`: inside the process. A stream subscribes to a parade and
  waits; `publish` wakes up every stream of that parade.
- `PostgresListener`: between processes. Whoever writes does
  `NOTIFY parade_changes, '<parade id>'` in the same transaction, and every
  server keeps one connection in `LISTEN` that forwards it to its
  broadcaster. It works the same with one replica or with several.

One channel with the parade id as the payload, and not one channel per
parade: a single `LISTEN` per process, whatever number of parades or streams.
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from functools import lru_cache
from typing import Annotated, Any

import asyncpg
from fastapi import Depends

log = logging.getLogger(__name__)

CHANNEL = "parade_changes"
# Payload for what every parade shows (an announcement): wakes everyone up.
EVERY_PARADE = "*"


class Broadcaster:
    def __init__(self) -> None:
        self._waiting: dict[str, set[asyncio.Event]] = {}

    @contextlib.asynccontextmanager
    async def subscribe(self, parade_id: str) -> AsyncIterator[asyncio.Event]:
        """An event that is set every time that parade changes.

        Several changes in a row set it once: the stream sends one snapshot,
        the latest, not one per change.
        """
        event = asyncio.Event()
        self._waiting.setdefault(parade_id, set()).add(event)
        try:
            yield event
        finally:
            listeners = self._waiting.get(parade_id, set())
            listeners.discard(event)
            if not listeners:
                self._waiting.pop(parade_id, None)

    def publish(self, parade_id: str) -> None:
        if parade_id == EVERY_PARADE:
            targets = [event for events in self._waiting.values() for event in events]
        else:
            targets = list(self._waiting.get(parade_id, ()))
        for event in targets:
            event.set()

    def subscribers(self) -> int:
        return sum(len(events) for events in self._waiting.values())


@lru_cache
def get_broadcaster() -> Broadcaster:
    return Broadcaster()


BroadcasterDep = Annotated[Broadcaster, Depends(get_broadcaster)]


class PostgresListener:
    """Keeps a connection in `LISTEN` and forwards what arrives.

    If the connection drops it connects again, and meanwhile wakes every
    stream up: a notification may have been lost, so they read again.
    """

    RETRY_S = 3.0

    def __init__(self, database_url: str, broadcaster: Broadcaster) -> None:
        # asyncpg does not know SQLAlchemy's "+asyncpg".
        self._dsn = database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
        self._broadcaster = broadcaster
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="postgres-listener")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        self._task = None

    def _forward(self, _connection: Any, _pid: int, _channel: str, payload: object) -> None:
        self._broadcaster.publish(str(payload) if payload else EVERY_PARADE)

    async def _run(self) -> None:
        while True:
            connection = None
            try:
                connection = await asyncpg.connect(self._dsn)
                await connection.add_listener(CHANNEL, self._forward)
                # Whatever happened while it was not listening.
                self._broadcaster.publish(EVERY_PARADE)
                closed: asyncio.Future[None] = asyncio.get_running_loop().create_future()
                connection.add_termination_listener(
                    lambda _c, closed=closed: closed.done() or closed.set_result(None)
                )
                await closed
                log.warning("The LISTEN connection dropped; connecting again")
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Cannot LISTEN to Postgres; retrying in %s s", self.RETRY_S)
            finally:
                if connection is not None and not connection.is_closed():
                    with contextlib.suppress(Exception):
                        await connection.close(timeout=2)
            await asyncio.sleep(self.RETRY_S)
