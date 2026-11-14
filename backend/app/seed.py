"""Loads the initial data from `backend/seed/` (see scripts/export-seed.ts).

Idempotent: running it twice leaves the same result. The state of a parade
that already exists is not touched, so seeding again on parade day does not
take a parade in progress back to scheduled.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.domain.businesses import Business, BusinessError, clean_business
from app.domain.dates import IS_TIME, is_real_date, normalize_time
from app.domain.schedule import EVENT_CATEGORIES, Event
from app.repositories.businesses import BusinessesRepo
from app.repositories.courses import CourseRecord, CoursesRepo
from app.repositories.events import EventsRepo
from app.repositories.parades import ParadesRepo

SEED_DIR = Path(__file__).resolve().parent.parent / "seed"


class SeedError(Exception):
    """The seed files are missing or do not have the expected shape."""


def _read(directory: Path, name: str) -> dict[str, Any]:
    path = directory / name
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise SeedError(f"{path} does not exist. Run `npm run seed:export`.") from error
    except json.JSONDecodeError as error:
        raise SeedError(f"{path} is not valid JSON: {error}") from error
    if not isinstance(data, dict):
        raise SeedError(f"{path} has to be a JSON object.")
    return data


def _field(data: dict[str, Any], key: str, where: str) -> Any:
    if key not in data or data[key] in (None, ""):
        raise SeedError(f"{where} is missing `{key}`.")
    return data[key]


def read_course(directory: Path) -> CourseRecord:
    data = _read(directory, "course.json")
    record = CourseRecord(
        id=str(_field(data, "id", "course.json")),
        name=str(_field(data, "name", "course.json")),
        geojson=_field(data, "geojson", "course.json"),
        waypoints=[
            {key: waypoint[key] for key in ("id", "name", "short", "kind", "lat", "lng")}
            for waypoint in data.get("waypoints", [])
        ],
        official=bool(data.get("official", False)),
        warning=data.get("warning"),
    )
    try:
        # Building it checks the line and projects every waypoint.
        record.to_course()
    except (ValueError, KeyError, TypeError) as error:
        raise SeedError(f"course.json: {error}") from error
    return record


def read_parades(directory: Path) -> list[dict[str, str]]:
    data = _read(directory, "parades.json")
    parades = []
    for index, raw in enumerate(_field(data, "parades", "parades.json")):
        where = f"parades.json, parade {index}"
        date = str(_field(raw, "date", where))
        start_time = str(_field(raw, "startTime", where))
        if not is_real_date(date):
            raise SeedError(f"{where}: `date` is not YYYY-MM-DD.")
        if not IS_TIME.match(start_time):
            raise SeedError(f"{where}: `startTime` is not HH:MM.")
        parades.append(
            {
                "id": str(_field(raw, "id", where)),
                "name": str(_field(raw, "name", where)),
                "date": date,
                "start_time": normalize_time(start_time),
            }
        )
    return parades


def read_events(directory: Path) -> list[Event]:
    data = _read(directory, "events.json")
    events = []
    for index, raw in enumerate(_field(data, "events", "events.json")):
        where = f"events.json, event {index}"
        date = str(_field(raw, "date", where))
        start_time = str(_field(raw, "startTime", where))
        end_time = raw.get("endTime")
        category = _field(raw, "category", where)
        if not is_real_date(date):
            raise SeedError(f"{where}: `date` is not YYYY-MM-DD.")
        if not IS_TIME.match(start_time) or (end_time and not IS_TIME.match(str(end_time))):
            raise SeedError(f"{where}: `startTime` or `endTime` is not HH:MM.")
        if category not in EVENT_CATEGORIES:
            raise SeedError(f"{where}: unknown `category` {category!r}.")
        events.append(
            Event(
                id=str(_field(raw, "id", where)),
                date=date,
                start_time=normalize_time(start_time),
                end_time=normalize_time(str(end_time)) if end_time else None,
                title=str(_field(raw, "title", where)),
                description=str(raw.get("description") or ""),
                category=category,
                place_name=str(raw.get("placeName") or ""),
                lat=raw.get("lat"),
                lng=raw.get("lng"),
                sponsored=bool(raw.get("sponsored", False)),
            )
        )
    return events


# The seed files use the JSON keys of the API; `clean_business` takes the
# Python names.
_BUSINESS_KEYS = {"offerTiming": "offer_timing"}


def read_businesses(directory: Path) -> list[Business]:
    data = _read(directory, "businesses.json")
    businesses = []
    for index, raw in enumerate(_field(data, "businesses", "businesses.json")):
        where = f"businesses.json, business {index}"
        fields = {_BUSINESS_KEYS.get(key, key): value for key, value in raw.items()}
        try:
            # The same rules as the panel: a seeded business is no exception.
            businesses.append(clean_business(fields, str(_field(raw, "id", where))))
        except BusinessError as error:
            raise SeedError(f"{where}: {error}") from error
    return businesses


@dataclass(frozen=True, slots=True)
class Seeded:
    course: CourseRecord
    parades: int
    events: int
    businesses: int


async def seed(
    courses: CoursesRepo,
    parades: ParadesRepo,
    events: EventsRepo,
    businesses: BusinessesRepo,
    directory: Path = SEED_DIR,
) -> Seeded:
    """Loads the course, the parades, the events and the businesses.

    A seeded event or business is put back as the file has it; one created
    from the panel is not touched.

    Everything is read and checked before the first write: a broken file
    leaves the database as it was.
    """
    course = read_course(directory)
    parades_to_save = read_parades(directory)
    events_to_save = read_events(directory)
    businesses_to_save = read_businesses(directory)

    await courses.save(course)
    for parade in parades_to_save:
        await parades.save(**parade, course_id=course.id)
    for event in events_to_save:
        await events.save(event)
    for business in businesses_to_save:
        await businesses.save(business)
    return Seeded(
        course=course,
        parades=len(parades_to_save),
        events=len(events_to_save),
        businesses=len(businesses_to_save),
    )
