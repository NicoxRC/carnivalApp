"""Crowd map.

The course is 1D, so the crowd is too: it is counted by 100 m stretches along
the route, not by coordinates. What is stored of a user is a stretch number,
not their position.

The real problem here is not painting it, it is not lying:

- With few users, "0 people on this stretch" means "0 users of the app",
  which at 9 in the morning is the whole map. So there is a global threshold:
  below `MIN_USERS_GLOBAL` the answer is "not enough data yet", not an empty
  course.
- A stretch with no samples is not painted "calm": it is left without data.
  Knowing it is empty is not the same as knowing nothing.
"""

import math
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

from app.domain.constants import (
    BIN_M,
    BUSY_FROM,
    DENSITY_WINDOW,
    FULL_FROM,
    MIN_SAMPLES_BIN,
    MIN_USERS_GLOBAL,
)

CrowdLevel = Literal["calm", "busy", "full"]


@dataclass(frozen=True, slots=True)
class DensityBin:
    bin: int
    from_m: float
    to_m: float
    count: int
    level: CrowdLevel


@dataclass(frozen=True, slots=True)
class Density:
    # Only the stretches with enough samples. The rest do not exist on purpose.
    bins: list[DensityBin]
    # Distinct devices that reported in the window.
    total: int
    # False: there is no sample to say anything, and the UI has to say so.
    enough: bool
    window_min: int


def total_bins(length_m: float) -> int:
    return math.ceil(length_m / BIN_M)


def bin_of_metres(metres: float, length_m: float) -> int:
    clamped = min(max(metres, 0.0), length_m - 1)
    return int(clamped // BIN_M)


def classify(counts: Mapping[int, int], total: int, length_m: float) -> Density:
    """Classifies each stretch relative to the fullest one of the window.

    Relative on purpose: we do not know how many people fit in a block of
    Pasto, but we can say where there are more and where fewer.
    """
    window_min = round(DENSITY_WINDOW.total_seconds() / 60)
    nothing = Density(bins=[], total=total, enough=False, window_min=window_min)
    if total < MIN_USERS_GLOBAL:
        return nothing
    fullest = max(counts.values(), default=0)
    if fullest < MIN_SAMPLES_BIN:
        return nothing

    bins: list[DensityBin] = []
    for bin_number, count in sorted(counts.items()):
        if count < MIN_SAMPLES_BIN:
            # No data is not the same as empty.
            continue
        share = count / fullest
        level: CrowdLevel = (
            "full" if share >= FULL_FROM else "busy" if share >= BUSY_FROM else "calm"
        )
        bins.append(
            DensityBin(
                bin=bin_number,
                from_m=bin_number * BIN_M,
                to_m=min((bin_number + 1) * BIN_M, length_m),
                count=count,
                level=level,
            )
        )
    return Density(bins=bins, total=total, enough=True, window_min=window_min)
