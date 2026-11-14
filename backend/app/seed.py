"""Loads the initial data from `backend/seed/` (see scripts/export-seed.ts).

Idempotent: running it twice leaves the same result. The state of a parade
that already exists is not touched, so seeding again on parade day does not
take a parade in progress back to scheduled.
"""

import json
from pathlib import Path
from typing import Any

from app.domain.dates import IS_TIME, is_real_date, normalize_time
from app.repositories.courses import CourseRecord, CoursesRepo
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


async def seed(
    courses: CoursesRepo, parades: ParadesRepo, directory: Path = SEED_DIR
) -> tuple[CourseRecord, int]:
    """Loads the course and the parades. Returns the course and how many parades.

    Everything is read and checked before the first write: a broken file
    leaves the database as it was.
    """
    course = read_course(directory)
    to_save = read_parades(directory)

    await courses.save(course)
    for parade in to_save:
        await parades.save(**parade, course_id=course.id)
    return course, len(to_save)
