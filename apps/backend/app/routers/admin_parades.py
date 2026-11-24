"""Parades from the panel: who loads the schedule and who runs parade day."""

import re

from fastapi import APIRouter, HTTPException, Response, status

from app.domain.dates import IS_TIME, is_real_date, normalize_time, today_in_pasto
from app.domain.parades import STATE_AFTER, ParadeAction, ParadeState, current_parade
from app.permissions import Permission
from app.repositories.courses import CoursesRepoDep
from app.repositories.parades import ParadeListDep, ParadeNotFound, ParadesRepoDep
from app.routers.schedule import ParadeOut, parade_out
from app.schemas import Schema
from app.security import require, require_any

router = APIRouter(prefix="/api/admin/parades", tags=["admin: parades"])

NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, "No existe ese desfile.")
IS_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
MAX_NAME = 80


class AdminParades(Schema):
    parades: list[ParadeOut]
    current_id: str | None


class ParadeBody(Schema):
    """Checked by hand in the endpoint, to answer with the panel's own messages."""

    name: str = ""
    date: str = ""
    start_time: str = ""


class ActionBody(Schema):
    action: ParadeAction


class StateOut(Schema):
    ok: bool = True
    state: ParadeState


def bad_request(message: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, message)


@router.get("", dependencies=[require_any(Permission.PARADES_EDIT, Permission.PARADES_STATE)])
async def list_parades(parades: ParadesRepoDep, response: Response) -> AdminParades:
    # Straight from the database, not from the 2 s list: the panel has to see
    # what it has just changed.
    known = await parades.list()
    current = current_parade(known, today_in_pasto())
    response.headers["Cache-Control"] = "no-store"
    return AdminParades(
        parades=[parade_out(parade) for parade in known],
        current_id=current.id if current else None,
    )


@router.put("/{parade_id}", dependencies=[require(Permission.PARADES_EDIT)])
async def save_parade(
    parade_id: str,
    body: ParadeBody,
    parades: ParadesRepoDep,
    courses: CoursesRepoDep,
    parade_list: ParadeListDep,
) -> ParadeOut:
    """Creates the parade with that id or changes its name, date and time.

    The state is not touched here: that is `PATCH`, with another permission.
    """
    if not IS_ID.match(parade_id):
        raise bad_request("El id solo puede llevar minúsculas, números y guiones.")
    name = body.name.strip()[:MAX_NAME]
    date = body.date.strip()
    start_time = body.start_time.strip()
    if not name:
        raise bad_request("Falta el nombre.")
    if not is_real_date(date):
        raise bad_request("Falta la fecha.")
    if not IS_TIME.match(start_time):
        raise bad_request("Falta la hora de inicio.")

    course = await courses.current()
    if course is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "La senda no está cargada.")
    parade = await parades.save(
        id=parade_id,
        name=name,
        date=date,
        start_time=normalize_time(start_time),
        course_id=course.id,
    )
    parade_list.forget()
    return parade_out(parade)


@router.patch("/{parade_id}", dependencies=[require(Permission.PARADES_STATE)])
async def change_state(
    parade_id: str, body: ActionBody, parades: ParadesRepoDep, parade_list: ParadeListDep
) -> StateOut:
    """Starts, finishes or restarts the parade.

    Restarting takes it back to `scheduled` and starts a new run: the
    positions so far stay stored but are not shown any more.
    """
    try:
        parade = await parades.set_state(
            parade_id, STATE_AFTER[body.action], new_run=body.action == "restart"
        )
    except ParadeNotFound as error:
        raise NOT_FOUND from error
    parade_list.forget()
    return StateOut(state=parade.state)


@router.delete(
    "/{parade_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[require(Permission.PARADES_EDIT)],
)
async def delete_parade(
    parade_id: str, parades: ParadesRepoDep, parade_list: ParadeListDep
) -> None:
    try:
        await parades.delete(parade_id)
    except ParadeNotFound as error:
        raise NOT_FOUND from error
    parade_list.forget()
