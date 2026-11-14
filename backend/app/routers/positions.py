from datetime import UTC, datetime
from typing import Annotated, cast

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from app.domain.positions import HANDOVER, BatchError, validate_batch
from app.permissions import Permission, permissions_for
from app.push import NotifyNearbyDep
from app.repositories.courses import CourseDep
from app.repositories.parades import (
    ParadeListDep,
    ParadeNotFound,
    ParadesRepoDep,
    resolve_parade,
)
from app.repositories.state import StateRepoDep
from app.repositories.users import User
from app.schemas import to_ms
from app.schemas.state import PositionInput, PositionsResult, Post
from app.security import require_any

router = APIRouter(prefix="/api", tags=["positions"])

Sender = Annotated[User, require_any(Permission.POSITIONS_OWN, Permission.POSITIONS_ANY)]

NO_PARADE = HTTPException(status.HTTP_404_NOT_FOUND, "Ese desfile no existe.")


@router.post("/positions")
async def receive_positions(
    body: PositionInput | list[PositionInput],
    user: Sender,
    parades: ParadesRepoDep,
    parade_list: ParadeListDep,
    state: StateRepoDep,
    course: CourseDep,
    notify_nearby: NotifyNearbyDep,
    background: BackgroundTasks,
) -> PositionsResult:
    """The only way in for positions: one, or a batch of those that were queued.

    The reporters' panel, the simulator and any tool come in through here. That
    it is the same door is deliberate: what is tested in October is what runs
    on the 31st.

    - With `positions:own` (a reporter) the server sets the post and the
      parade: their own post, the current parade.
    - With `positions:any` the body may name the parade, which has to exist,
      and the post.
    """
    items = body if isinstance(body, list) else [body]
    any_post = Permission.POSITIONS_ANY in permissions_for(user.roles)
    own_post = cast(Post | None, user.post)
    if not any_post and own_post is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tu usuario no tiene un puesto asignado.")

    asked = items[0].parade_id if any_post and items else None
    parade = await resolve_parade(parades, parade_list, asked)
    if parade is None:
        raise NO_PARADE

    now = datetime.now(UTC)
    try:
        entries, discarded = validate_batch(
            items,
            forced_post=None if any_post else own_post,
            default_post=own_post,
            parade_id=parade.id,
            now=now,
            course=course,
        )
    except BatchError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error

    # Handover: while another reporter of the same post keeps sending, this
    # one is the backup and their points do not go in. Two phones on the same
    # post, blocks apart, made the head jump from one side to the other.
    if not any_post and own_post is not None:
        holder = await state.last_sender(parade, own_post)
        if (
            holder is not None
            and holder.user_id is not None
            and holder.user_id != user.id
            and now - holder.ts < HANDOVER
        ):
            return PositionsResult(
                saved=0, discarded=discarded + len(entries), waiting=True, server_ts=to_ms(now)
            )

    try:
        await state.record_positions(entries, user.id)
    except ParadeNotFound as error:
        # Deleted between the 2 s list and the write.
        raise NO_PARADE from error
    if entries and parade.state == "scheduled":
        # The first report started it: the schedule has to show it at once.
        parade_list.forget()

    if any(entry.post == "head" for entry in entries):
        # After answering: whoever is waiting near the head is told it is
        # getting close. A failure there cannot bring ingestion down.
        background.add_task(notify_nearby, parade.id)

    return PositionsResult(
        saved=len(entries), discarded=discarded, waiting=False, server_ts=to_ms(now)
    )
