"""The parades of the carnival and which one the app follows now."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

ParadeState = Literal["scheduled", "in_progress", "finished"]
ParadeAction = Literal["start", "finish", "restart"]

# The state is changed by a person, never by the code.
STATE_AFTER: dict[ParadeAction, ParadeState] = {
    "start": "in_progress",
    "finish": "finished",
    "restart": "scheduled",
}


@dataclass(frozen=True, slots=True)
class Parade:
    id: str
    name: str
    # YYYY-MM-DD, in Pasto time.
    date: str
    # HH:MM
    start_time: str
    state: ParadeState
    course_id: str
    # Positions older than this are not shown: restarting moves it to "now"
    # instead of deleting them.
    run_started_at: datetime


def current_parade(parades: Sequence[Parade], today: str) -> Parade | None:
    """Which parade the app follows now.

    The Carnival has one parade a day. The app does not ask the user which
    one to watch: it shows the one happening, or the next one.

      1. The one in progress (if several, the most recent).
      2. The one scheduled for today.
      3. The next one scheduled.
      4. The last one there was (to see how it ended).
    """
    if not parades:
        return None
    ordered = sorted(parades, key=lambda parade: parade.date + parade.start_time)
    in_progress = [parade for parade in ordered if parade.state == "in_progress"]
    if in_progress:
        return in_progress[-1]
    for parade in ordered:
        if parade.date == today and parade.state == "scheduled":
            return parade
    for parade in ordered:
        if parade.date > today and parade.state == "scheduled":
            return parade
    past = [parade for parade in ordered if parade.date <= today]
    return past[-1] if past else ordered[0]
