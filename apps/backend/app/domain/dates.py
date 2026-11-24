"""Dates and times in Pasto time.

The server clock on Railway is UTC: from 7 p.m. in Pasto it is already
"tomorrow" there. Everything that says "today" goes through here.
"""

import re
from datetime import UTC, date, datetime, timedelta, timezone

# Colombia has been UTC-5 all year round since 1993, so the offset is fixed
# here instead of depending on the time zone database of the machine.
PASTO = timezone(timedelta(hours=-5), "America/Bogota")

IS_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
IS_TIME = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d$")


def today_in_pasto(moment: datetime | None = None) -> str:
    """YYYY-MM-DD of today (or of `moment`) in Pasto."""
    moment = moment or datetime.now(UTC)
    if moment.tzinfo is None:
        raise ValueError("The moment needs a time zone.")
    return moment.astimezone(PASTO).date().isoformat()


def normalize_time(hhmm: str) -> str:
    """ "9:00" → "09:00", so sorting as text works."""
    hours, minutes = hhmm.split(":")
    return f"{hours.zfill(2)}:{minutes}"


def is_real_date(text: str) -> bool:
    """YYYY-MM-DD and a day that exists (not February 31)."""
    if not IS_DATE.match(text):
        return False
    try:
        date.fromisoformat(text)
    except ValueError:
        return False
    return True
