"""At what time the head went past each waypoint."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from app.domain.course import Course


@dataclass(frozen=True, slots=True)
class Sample:
    """Where the head was at a moment."""

    metres: float
    ts: datetime


@dataclass(frozen=True, slots=True)
class Pass:
    waypoint_id: str
    name: str
    metres: float
    # When the head got there. `None` if it has not yet.
    ts: datetime | None


def waypoint_passes(course: Course, samples: Sequence[Sample]) -> list[Pass]:
    """One entry per waypoint, in the order of the course.

    The first sample in which the head was already level with the waypoint or
    further on is taken. It is a bound: with a report every 20 s the error is
    seconds, which is plenty for "it went past Cristo Rey at 10:42".
    """
    ordered = sorted(samples, key=lambda sample: sample.ts)
    return [
        Pass(
            waypoint_id=waypoint.id,
            name=waypoint.name,
            metres=waypoint.metres,
            ts=next((s.ts for s in ordered if s.metres >= waypoint.metres), None),
        )
        for waypoint in course.waypoints
    ]
