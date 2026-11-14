import json
import shutil
from pathlib import Path

import pytest

from app.repositories.courses import CoursesMemory
from app.repositories.events import EventsMemory
from app.repositories.parades import ParadesMemory
from app.seed import SEED_DIR, SeedError, seed


@pytest.fixture
def directory(tmp_path: Path) -> Path:
    """A copy of `backend/seed/` that a test may break."""
    for name in ("course.json", "parades.json", "events.json"):
        shutil.copy(SEED_DIR / name, tmp_path / name)
    return tmp_path


def edit(directory: Path, name: str, **changes: object) -> None:
    data = json.loads((directory / name).read_text(encoding="utf-8"))
    for key, value in changes.items():
        if value is None:
            data.pop(key, None)
        else:
            data[key] = value
    (directory / name).write_text(json.dumps(data), encoding="utf-8")


async def test_seed_ok() -> None:
    courses, parades, events = CoursesMemory(), ParadesMemory(), EventsMemory()

    seeded = await seed(courses, parades, events)

    stored = await courses.current()
    assert stored == seeded.course
    assert stored is not None
    assert len(stored.waypoints) == 9
    # Only what the table stores: the metres are computed on loading.
    assert set(stored.waypoints[0]) == {"id", "name", "short", "kind", "lat", "lng"}
    listed = await parades.list()
    assert seeded.parades == len(listed) == 6
    assert listed[0].id == "d31-1"
    assert listed[0].state == "scheduled"
    assert listed[1].start_time == "09:00"
    assert {parade.course_id for parade in listed} == {seeded.course.id}
    stored_events = await events.list()
    assert seeded.events == len(stored_events) == 14
    assert stored_events[0].id == "d31-2"
    assert {event.category for event in stored_events} == {"tasca", "stage", "cultural", "kids"}


async def test_seed_fails(directory: Path) -> None:
    courses, parades, events = CoursesMemory(), ParadesMemory(), EventsMemory()
    edit(directory, "course.json", geojson=None)

    with pytest.raises(SeedError, match="course.json is missing `geojson`"):
        await seed(courses, parades, events, directory)

    # Nothing was written.
    assert await courses.current() is None
    assert await parades.list() == []
    assert await events.list() == []


async def test_seed_with_broken_files_fails(directory: Path, tmp_path: Path) -> None:
    courses, parades, events = CoursesMemory(), ParadesMemory(), EventsMemory()

    with pytest.raises(SeedError, match="does not exist"):
        await seed(courses, parades, events, tmp_path / "nowhere")

    edit(
        directory,
        "parades.json",
        parades=[{"id": "x", "name": "X", "date": "2027-02-31", "startTime": "10:00"}],
    )
    with pytest.raises(SeedError, match="`date` is not YYYY-MM-DD"):
        await seed(courses, parades, events, directory)
    # The course was fine, but nothing is written until everything is.
    assert await courses.current() is None

    shutil.copy(SEED_DIR / "parades.json", directory / "parades.json")
    edit(
        directory,
        "events.json",
        events=[
            {
                "id": "e",
                "title": "E",
                "date": "2027-01-06",
                "startTime": "10:00",
                "category": "party",
            }
        ],
    )
    with pytest.raises(SeedError, match="unknown `category`"):
        await seed(courses, parades, events, directory)
    assert await parades.list() == []

    edit(directory, "course.json", geojson={"type": "Point", "coordinates": [0, 0]})
    with pytest.raises(SeedError, match="LineString"):
        await seed(courses, parades, events, directory)


async def test_seeding_twice_does_not_duplicate() -> None:
    courses, parades, events = CoursesMemory(), ParadesMemory(), EventsMemory()
    await seed(courses, parades, events)
    first = await parades.list()

    await seed(courses, parades, events)

    assert await parades.list() == first
    assert len(courses._records) == 1
    assert len(await events.list()) == 14


async def test_seeding_again_keeps_the_state() -> None:
    courses, parades, events = CoursesMemory(), ParadesMemory(), EventsMemory()
    await seed(courses, parades, events)
    await parades.set_state("d31-1", "in_progress", new_run=False)

    await seed(courses, parades, events)

    # Seeding on parade day does not take a parade in progress back.
    live = await parades.by_id("d31-1")
    assert live is not None
    assert live.state == "in_progress"
