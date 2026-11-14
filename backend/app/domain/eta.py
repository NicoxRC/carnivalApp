"""How fast the head of the parade is going.

The ETA the user sees is computed on the phone (`src/lib/eta.ts`). The backend
only needs the speed, to know whom to send "the parade is getting close".
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.domain.constants import (
    MAX_SPEED_MS,
    MIN_PROGRESS_M,
    MIN_RELIABLE_WINDOW_S,
    MIN_SPEED_MS,
    NOMINAL_SPEED_MS,
    SPEED_WINDOW,
    STOPPED_AFTER,
)
from app.domain.progress import Sample


@dataclass(frozen=True, slots=True)
class Speed:
    # m/s, with the minimum floor already applied.
    ms: float
    # The progress really measured, with no floor.
    real_progress_m: float
    window_s: float
    # False: not enough history yet, the nominal speed is being used.
    measured: bool
    # For how long the head has not advanced appreciably.
    not_advancing: timedelta
    # True only past the hard threshold.
    stopped: bool

    @property
    def kmh(self) -> float:
        return self.ms * 3.6


def estimate_speed(history: Sequence[Sample], now: datetime) -> Speed:
    """Speed of the head: a plain average over the last 10 minutes.

    Simple on purpose: with three reporters and phone GPS, a finer model would
    only give false precision.
    """
    ordered = sorted(history, key=lambda sample: sample.ts)
    if len(ordered) < 2:
        return Speed(
            ms=NOMINAL_SPEED_MS,
            real_progress_m=0,
            window_s=0,
            measured=False,
            not_advancing=timedelta(0),
            stopped=False,
        )
    last = ordered[-1]

    # Speed: only the 10 minute window.
    window = [sample for sample in ordered if now - sample.ts <= SPEED_WINDOW]
    ms = NOMINAL_SPEED_MS
    measured = False
    real_progress_m = 0.0
    window_s = 0.0
    if len(window) >= 2:
        window_s = (window[-1].ts - window[0].ts).total_seconds()
        real_progress_m = window[-1].metres - window[0].metres
        if window_s >= MIN_RELIABLE_WINDOW_S:
            raw = real_progress_m / window_s
            if raw <= MAX_SPEED_MS:
                ms = max(raw, MIN_SPEED_MS)
                measured = True
            # Over the ceiling the nominal one stays and `measured` is False.

    # Stopped: the whole history is looked at, which is longer than the
    # window. The most recent sample since which the head DID advance.
    not_advancing = last.ts - ordered[0].ts
    for sample in reversed(ordered):
        if last.metres - sample.metres > MIN_PROGRESS_M:
            not_advancing = last.ts - sample.ts
            break

    return Speed(
        ms=ms,
        real_progress_m=real_progress_m,
        window_s=window_s,
        measured=measured,
        not_advancing=not_advancing,
        # Without enough history it cannot be said to be stopped: the first
        # report may have come two minutes ago and that is all.
        stopped=not_advancing >= STOPPED_AFTER,
    )
