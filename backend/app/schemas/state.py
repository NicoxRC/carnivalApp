"""The shapes of the live state, as they travel in JSON.

They mirror the web's types in `src/lib/tipos.ts`; each one notes which, so
the web's `api` adapter can map them.
"""

from typing import Literal, Self

from pydantic import Field, model_validator

from app.domain.parades import ParadeState as ParadeStateValue
from app.schemas import Schema

Post = Literal["head", "middle", "tail"]


class PositionInput(Schema):
    """What a reporter (or the simulator) sends. Web: `EntradaPosicion`.

    Either `lat` and `lng`, or `waypointId` when there is no GPS: the reporter
    says which waypoint they are at.
    """

    # Only for `positions:any`. A reporter always writes to the current parade.
    parade_id: str | None = None
    # Only for `positions:any`. A reporter's post is set by the server.
    post: Post | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    accuracy_m: float | None = None
    # Epoch milliseconds, the phone's clock. Without it, the server's.
    ts: int | None = None
    waypoint_id: str | None = None

    @model_validator(mode="after")
    def _has_a_point(self) -> Self:
        if self.waypoint_id is None and (self.lat is None or self.lng is None):
            raise ValueError("Falta lat y lng, o waypointId.")
        return self


class Position(Schema):
    """A position already projected onto the course. Web: `Posicion`."""

    post: Post
    lat: float
    lng: float
    # Metres from the start of the course. The only number that matters.
    metres: float
    accuracy_m: float | None
    # Epoch milliseconds.
    ts: int


class HistorySample(Schema):
    """Web: `MuestraHistorial`."""

    metres: float
    ts: int


class Announcement(Schema):
    """A message from the team to everyone. Web: `Aviso`."""

    id: str
    text: str
    level: Literal["info", "alert"]
    created_at: int
    # Empty: until someone removes it.
    expires_at: int | None


class ParadeStateOut(Schema):
    """The full snapshot the UI consumes. Web: `EstadoDesfile`."""

    parade_id: str
    name: str
    state: ParadeStateValue
    # YYYY-MM-DD, in Pasto time.
    date: str
    # HH:MM
    start_time: str
    course_id: str
    # Only the posts that have reported.
    positions: dict[Post, Position]
    # The last 16 min of the head: with it the web estimates speed and ETA.
    head_history: list[HistorySample]
    announcements: list[Announcement]
    # The server clock, to say "X min ago" without trusting the phone's.
    server_ts: int


class PositionsResult(Schema):
    ok: bool = True
    saved: int
    discarded: int
    # Another reporter holds this post right now: nothing was saved.
    waiting: bool
    server_ts: int


class WaypointPass(Schema):
    """Web: `PasoPorHito`."""

    waypoint_id: str
    name: str
    metres: float
    # When the head got there. Empty if it has not yet.
    ts: int | None
