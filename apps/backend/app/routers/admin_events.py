"""The events of the schedule, loaded by whoever edits it."""

import math
import re

from fastapi import APIRouter, HTTPException, Response, status

from app.domain.dates import IS_TIME, is_real_date, normalize_time
from app.domain.schedule import (
    EVENT_CATEGORIES,
    MAX_EVENT_DESCRIPTION,
    MAX_EVENT_PLACE,
    MAX_EVENT_TITLE,
    Event,
)
from app.permissions import Permission
from app.repositories.events import EventNotFound, EventsRepoDep
from app.routers.schedule import EventOut, event_out
from app.schemas import Schema
from app.security import require

router = APIRouter(
    prefix="/api/admin/events",
    tags=["admin: events"],
    dependencies=[require(Permission.SCHEDULE_EDIT)],
)

IS_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")


class EventBody(Schema):
    """Checked by hand in the endpoint, to answer with the panel's own messages."""

    title: str = ""
    date: str = ""
    start_time: str = ""
    end_time: str | None = None
    category: str = ""
    description: str = ""
    place_name: str = ""
    lat: float | None = None
    lng: float | None = None
    sponsored: bool = False


class Events(Schema):
    events: list[EventOut]


def bad_request(message: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, message)


@router.get("")
async def list_events(events: EventsRepoDep, response: Response) -> Events:
    response.headers["Cache-Control"] = "no-store"
    return Events(events=[event_out(event) for event in await events.list()])


@router.put("/{event_id}")
async def save_event(event_id: str, body: EventBody, events: EventsRepoDep) -> EventOut:
    """Creates the event with that id or replaces it."""
    if not IS_ID.match(event_id):
        raise bad_request("El id solo puede llevar minúsculas, números y guiones.")
    title = body.title.strip()[:MAX_EVENT_TITLE]
    date = body.date.strip()
    start_time = body.start_time.strip()
    end_time = (body.end_time or "").strip()
    if not title:
        raise bad_request("Falta el título.")
    if not is_real_date(date):
        raise bad_request("Falta la fecha.")
    if not IS_TIME.match(start_time):
        raise bad_request("Falta la hora de inicio.")
    if end_time and not IS_TIME.match(end_time):
        raise bad_request("Hora de fin inválida.")
    if body.category not in EVENT_CATEGORIES:
        raise bad_request("Categoría inválida.")

    # A point is both coordinates or neither.
    has_point = body.lat is not None and body.lng is not None
    if has_point:
        assert body.lat is not None and body.lng is not None
        in_range = -90 <= body.lat <= 90 and -180 <= body.lng <= 180
        if not (math.isfinite(body.lat) and math.isfinite(body.lng) and in_range):
            raise bad_request("Punto inválido.")

    event = Event(
        id=event_id,
        date=date,
        start_time=normalize_time(start_time),
        end_time=normalize_time(end_time) if end_time else None,
        title=title,
        description=body.description.strip()[:MAX_EVENT_DESCRIPTION],
        category=body.category,
        place_name=body.place_name.strip()[:MAX_EVENT_PLACE],
        lat=body.lat if has_point else None,
        lng=body.lng if has_point else None,
        sponsored=body.sponsored,
    )
    await events.save(event)
    return event_out(event)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: str, events: EventsRepoDep) -> None:
    try:
        await events.delete(event_id)
    except EventNotFound as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No existe ese evento.") from error
