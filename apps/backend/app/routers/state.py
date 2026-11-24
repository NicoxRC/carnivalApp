"""The parade, read by the public: snapshot, live stream and progress."""

import asyncio
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.sse import EventSourceResponse, ServerSentEvent

from app.domain.progress import waypoint_passes
from app.live import StateReader, StateReaderDep
from app.realtime import Broadcaster, BroadcasterDep
from app.repositories.courses import CourseDep
from app.repositories.parades import ParadeListDep, ParadesRepoDep, resolve_parade
from app.repositories.state import StateRepoDep
from app.routers.schedule import ParadeOut, parade_out
from app.schemas import Schema, to_ms
from app.schemas.state import ParadeStateOut, WaypointPass

router = APIRouter(prefix="/api", tags=["state"])

NO_PARADE = "No hay desfile."
# Keeps the connection alive through proxies and lets the client notice a cut.
HEARTBEAT_S = 20.0

ParadeQuery = Annotated[
    str | None, Query(alias="parade", description="Without it, the current parade.")
]


async def parade_to_follow(reader: StateReaderDep, parade: ParadeQuery = None) -> str:
    """The id of the parade a read is about; 404 if there is none."""
    parade_id = await reader.resolve(parade)
    if parade_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NO_PARADE)
    return parade_id


ParadeToFollow = Annotated[str, Depends(parade_to_follow)]


@router.get("/state")
async def read_state(
    parade_id: ParadeToFollow, reader: StateReaderDep, response: Response
) -> ParadeStateOut:
    """The full picture of the parade now.

    It is the first thing the screen paints and the fallback if the stream
    drops.
    """
    snapshot = await reader.snapshot(parade_id)
    if snapshot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NO_PARADE)
    # Every new position makes every phone ask for this at once: two seconds
    # of cache at the edge turn thousands of reads into one.
    response.headers["Cache-Control"] = "public, s-maxage=2, stale-while-revalidate=5"
    return snapshot


def _event(snapshot: ParadeStateOut) -> ServerSentEvent:
    return ServerSentEvent(raw_data=snapshot.model_dump_json(by_alias=True))


async def state_events(
    parade_id: str,
    reader: StateReader,
    broadcaster: Broadcaster,
    heartbeat_s: float = HEARTBEAT_S,
) -> AsyncIterator[ServerSentEvent]:
    """A snapshot right away, another on every change, a heartbeat in the silence."""
    # Subscribed before the first read: a change in between is not lost.
    async with broadcaster.subscribe(parade_id) as changed:
        while True:
            changed.clear()
            snapshot = await reader.snapshot(parade_id)
            if snapshot is None:
                # The parade was deleted: the stream ends and the client asks again.
                return
            yield _event(snapshot)
            while True:
                try:
                    await asyncio.wait_for(changed.wait(), heartbeat_s)
                    break
                except TimeoutError:
                    yield ServerSentEvent(comment="heartbeat")


@router.get("/state/stream", response_class=EventSourceResponse)
async def stream_state(
    parade_id: ParadeToFollow,
    reader: StateReaderDep,
    broadcaster: BroadcasterDep,
    response: Response,
) -> AsyncIterator[ServerSentEvent]:
    """The same snapshot, pushed over SSE every time it changes.

    The 404 for "no parade" is answered before the stream opens.
    """
    # nginx-style proxies would otherwise hold the events back.
    response.headers["X-Accel-Buffering"] = "no"
    async for event in state_events(parade_id, reader, broadcaster):
        yield event


class Progress(Schema):
    parade: ParadeOut
    passes: list[WaypointPass]


@router.get("/parades/{parade_id}/progress")
async def read_progress(
    parade_id: str,
    parades: ParadesRepoDep,
    parade_list: ParadeListDep,
    state: StateRepoDep,
    course: CourseDep,
    response: Response,
) -> Progress:
    """At what time the head went past each waypoint."""
    parade = await resolve_parade(parades, parade_list, parade_id)
    if parade is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ese desfile no existe.")
    passes = waypoint_passes(course, await state.read_progress(parade))
    response.headers["Cache-Control"] = "public, max-age=30, stale-while-revalidate=120"
    return Progress(
        parade=parade_out(parade),
        passes=[
            WaypointPass(
                waypoint_id=p.waypoint_id,
                name=p.name,
                metres=p.metres,
                ts=to_ms(p.ts) if p.ts else None,
            )
            for p in passes
        ],
    )
