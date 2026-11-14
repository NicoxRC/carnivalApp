from fastapi import APIRouter, Response

from app.domain.dates import today_in_pasto
from app.domain.parades import Parade, ParadeState, current_parade
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


class Schedule(Schema):
    parades: list[ParadeOut]
    # They arrive with the events module; the key is already part of the contract.
    events: list[dict[str, object]]
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


@router.get("/schedule")
async def read_schedule(
    parades: ParadesRepoDep, parade_list: ParadeListDep, response: Response
) -> Schedule:
    """The whole schedule: the parade of each day and which one is the current one.

    `today` travels from the server, in Pasto time, so a phone with the wrong
    date or time zone does not mark another day.
    """
    known = await parade_list.get(parades)
    today = today_in_pasto()
    current = current_parade(known, today)
    response.headers["Cache-Control"] = "public, max-age=30, stale-while-revalidate=300"
    return Schedule(
        parades=[parade_out(parade) for parade in known],
        events=[],
        today=today,
        current_id=current.id if current else None,
    )
