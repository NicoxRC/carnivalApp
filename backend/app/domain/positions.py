"""Checks a batch of positions before it is stored. No database, no HTTP.

The reporter's phone keeps the sends that fail and sends them later as a
batch. One bad point cannot bring the whole batch down (the queue would get
stuck retrying the same thing): it is discarded and counted.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.domain.course import Course
from app.schemas.state import PositionInput, Post

POSTS: tuple[Post, ...] = ("head", "middle", "tail")

# A batch cannot bring more than this (about 1 h of queue at one every 20 s).
MAX_BATCH = 200
# A point with its time in the future is a clock set wrong, not a datum.
FUTURE_MARGIN = timedelta(minutes=2)
# After an hour a queued point is of no use and would only dirty the history.
MAX_AGE = timedelta(hours=1)
# With a GPS worse than this the point may land blocks away from the course
# and the head would "jump" on the map.
MAX_ACCURACY_M = 150

# While the holder of a post keeps sending, another reporter of that post is
# ignored; if the holder goes silent longer than this, the next one takes over.
HANDOVER = timedelta(seconds=60)
# How far back the head's history goes in the snapshot. The web needs more
# than 10 min to be able to say "it has been stopped for over 10 minutes".
HISTORY_WINDOW = timedelta(minutes=16)


class BatchError(Exception):
    """The whole batch is rejected. The message is for the person."""


@dataclass(frozen=True, slots=True)
class PositionEntry:
    """A position ready to store, already projected onto the course."""

    parade_id: str
    post: Post
    lat: float
    lng: float
    course_m: float
    accuracy_m: float | None
    ts: datetime


def validate_batch(
    items: Sequence[PositionInput],
    *,
    forced_post: Post | None,
    default_post: Post | None = None,
    parade_id: str,
    now: datetime,
    course: Course,
) -> tuple[list[PositionEntry], int]:
    """The entries to store, sorted by time, and how many points were discarded.

    With `forced_post` the body cannot choose the post (a reporter). Raises
    `BatchError` when the batch as a whole cannot be accepted.
    """
    if len(items) > MAX_BATCH:
        raise BatchError(f"Máximo {MAX_BATCH} posiciones por envío.")

    entries: list[PositionEntry] = []
    discarded = 0

    for item in items:
        post = forced_post or item.post or default_post
        if post is None:
            raise BatchError(f"post debe ser uno de: {', '.join(POSTS)}.")

        accuracy_m: float | None
        if item.waypoint_id is not None:
            # No GPS: the reporter says which waypoint they are at. It is put
            # on the point of the course it belongs to.
            waypoint = course.waypoint_by_id(item.waypoint_id)
            if waypoint is None:
                raise BatchError("waypointId desconocido.")
            lat, lng = course.point_at_metre(waypoint.metres)
            accuracy_m = None
        else:
            assert item.lat is not None and item.lng is not None
            lat, lng, accuracy_m = item.lat, item.lng, item.accuracy_m

        try:
            ts = now if item.ts is None else datetime.fromtimestamp(item.ts / 1000, UTC)
        except (OverflowError, OSError, ValueError) as error:
            raise BatchError("ts inválido.") from error

        if (
            ts > now + FUTURE_MARGIN
            or ts < now - MAX_AGE
            or (accuracy_m is not None and accuracy_m > MAX_ACCURACY_M)
        ):
            discarded += 1
            continue

        entries.append(
            PositionEntry(
                parade_id=parade_id,
                post=post,
                lat=lat,
                lng=lng,
                course_m=course.course_metres(lat, lng).metres,
                accuracy_m=accuracy_m,
                ts=ts,
            )
        )

    # In order of time: if they arrive out of order, the last one written has
    # to be the most recent.
    entries.sort(key=lambda entry: entry.ts)
    return entries, discarded
