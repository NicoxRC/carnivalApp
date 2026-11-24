from fastapi import APIRouter, Response

from app.domain.dates import today_in_pasto
from app.domain.parades import Parade, ParadeState, current_parade
from app.domain.schedule import Event, EventCategory
from app.repositories.events import EventsRepoDep
from app.repositories.parades import ParadeListDep, ParadesRepoDep
from app.schemas import Schema

router = APIRouter(prefix="/api", tags=["schedule"])


class ParadeOut(Schema):
    id: str
    name: str
    # YYYY-MM-DD, in Pasto time.
    date: str
    # HH:MM
    start_time: str
    state: ParadeState


class EventOut(Schema):
    """Web: `Evento`."""

    id: str
    date: str
    start_time: str
    end_time: str | None
    title: str
    description: str
    category: EventCategory
    place_name: str
    lat: float | None
    lng: float | None
    sponsored: bool


class Schedule(Schema):
    parades: list[ParadeOut]
    events: list[EventOut]
    today: str
    current_id: str | None


def parade_out(parade: Parade) -> ParadeOut:
    return ParadeOut(
        id=parade.id,
        name=parade.name,
        date=parade.date,
        start_time=parade.start_time,
        state=parade.state,
    )


def event_out(event: Event) -> EventOut:
    return EventOut(
        id=event.id,
        date=event.date,
        start_time=event.start_time,
        end_time=event.end_time,
        title=event.title,
        description=event.description,
        category=event.category,
        place_name=event.place_name,
        lat=event.lat,
        lng=event.lng,
        sponsored=event.sponsored,
    )


@router.get("/schedule")
async def read_schedule(
    parades: ParadesRepoDep, parade_list: ParadeListDep, events: EventsRepoDep, response: Response
) -> Schedule:
    """The whole schedule: the parade of each day, the other events and which
    parade is the current one.

    `today` travels from the server, in Pasto time, so a phone with the wrong
    date or time zone does not mark another day.
    """
    known = await parade_list.get(parades)
    today = today_in_pasto()
    current = current_parade(known, today)
    response.headers["Cache-Control"] = "public, max-age=30, stale-while-revalidate=300"
    return Schedule(
        parades=[parade_out(parade) for parade in known],
        events=[event_out(event) for event in await events.list()],
        today=today,
        current_id=current.id if current else None,
    )
