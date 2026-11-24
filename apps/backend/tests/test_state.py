import asyncio
import json
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.domain.course import Course
from app.domain.progress import Sample, waypoint_passes
from app.live import RepoStateReader
from app.realtime import EVERY_PARADE, Broadcaster
from app.repositories.parades import ParadesMemory
from app.routers.state import state_events
from app.seed import SEED_DIR, read_course
from tests.conftest import MakeUser, auth

T0 = datetime(2027, 1, 6, 15, 0, tzinfo=UTC)


@pytest.fixture(scope="module")
def course() -> Course:
    return read_course(SEED_DIR).to_course()


async def add_parade(parades: ParadesMemory, id: str = "d6-1", date: str = "2999-01-06") -> None:
    await parades.save(id=id, name="Desfile Magno", date=date, start_time="10:00", course_id="c")


def point(course: Course, metres: float) -> dict[str, float]:
    lat, lng = course.point_at_metre(metres)
    return {"lat": lat, "lng": lng}


# --- GET /api/state --------------------------------------------------------


async def test_state_ok(
    client: TestClient, course: Course, parades: ParadesMemory, make_user: MakeUser
) -> None:
    await add_parade(parades)
    reporter = await make_user("reporter", post="head")
    before = datetime.now(UTC).timestamp() * 1000 - 1
    client.post("/api/positions", json=point(course, 700), headers=auth(reporter))

    response = client.get("/api/state")

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "public, s-maxage=2, stale-while-revalidate=5"
    body = response.json()
    assert body["paradeId"] == "d6-1"
    assert body["state"] == "in_progress"
    assert (body["date"], body["startTime"], body["courseId"]) == ("2999-01-06", "10:00", "c")
    assert set(body["positions"]) == {"head"}
    assert body["positions"]["head"]["metres"] == pytest.approx(700, abs=0.5)
    assert len(body["headHistory"]) == 1
    assert body["announcements"] == []
    assert body["serverTs"] >= before


async def test_state_of_a_named_parade_ok(client: TestClient, parades: ParadesMemory) -> None:
    await add_parade(parades, "d2-1", "2999-01-02")
    await add_parade(parades, "d6-1", "2999-01-06")

    assert client.get("/api/state").json()["paradeId"] == "d2-1"
    named = client.get("/api/state", params={"parade": "d6-1"}).json()
    assert named["paradeId"] == "d6-1"
    # Nobody has reported: no positions, and it is still scheduled.
    assert named["positions"] == {}
    assert named["state"] == "scheduled"


async def test_state_fails(client: TestClient, parades: ParadesMemory) -> None:
    response = client.get("/api/state")

    assert response.status_code == 404
    assert response.json() == {"error": "No hay desfile."}

    await add_parade(parades)
    # A parade that does not exist is not created by asking for it.
    assert client.get("/api/state", params={"parade": "nope"}).status_code == 404
    assert await parades.by_id("nope") is None


# --- GET /api/state/stream -------------------------------------------------


async def test_stream_ok(
    parades: ParadesMemory, reader: RepoStateReader, broadcaster: Broadcaster
) -> None:
    await add_parade(parades)
    events = state_events("d6-1", reader, broadcaster, heartbeat_s=0.05)

    first = await anext(events)

    # The first event is the snapshot, right away: the screen is never blank.
    assert first.raw_data is not None
    assert json.loads(first.raw_data)["paradeId"] == "d6-1"
    assert json.loads(first.raw_data)["state"] == "scheduled"
    assert broadcaster.subscribers() == 1

    # Nothing changes: a heartbeat keeps the connection alive.
    heartbeat = await anext(events)
    assert heartbeat.comment == "heartbeat"
    assert heartbeat.raw_data is None

    # Something changes: a new snapshot, with the change in it.
    await parades.set_state("d6-1", "in_progress", new_run=False)
    broadcaster.publish("d6-1")
    changed = await asyncio.wait_for(anext(events), 1)
    assert changed.raw_data is not None
    assert json.loads(changed.raw_data)["state"] == "in_progress"

    # What every parade shows wakes this one up too; another parade does not.
    broadcaster.publish("another-parade")
    assert (await anext(events)).comment == "heartbeat"
    broadcaster.publish(EVERY_PARADE)
    assert (await asyncio.wait_for(anext(events), 1)).raw_data is not None

    # The client leaves: nobody stays subscribed.
    await events.aclose()
    assert broadcaster.subscribers() == 0


async def test_stream_ends_when_the_parade_is_deleted(
    parades: ParadesMemory, reader: RepoStateReader, broadcaster: Broadcaster
) -> None:
    await add_parade(parades)
    events = state_events("d6-1", reader, broadcaster, heartbeat_s=0.05)
    await anext(events)

    await parades.delete("d6-1")
    broadcaster.publish("d6-1")

    with pytest.raises(StopAsyncIteration):
        await asyncio.wait_for(anext(events), 1)
    assert broadcaster.subscribers() == 0


async def test_several_changes_in_a_row_are_one_snapshot(
    parades: ParadesMemory, reader: RepoStateReader, broadcaster: Broadcaster
) -> None:
    await add_parade(parades)
    events = state_events("d6-1", reader, broadcaster, heartbeat_s=0.05)
    await anext(events)

    for _ in range(5):
        broadcaster.publish("d6-1")

    assert (await anext(events)).raw_data is not None
    # The five were answered with one: what follows is silence.
    assert (await anext(events)).comment == "heartbeat"
    await events.aclose()


def test_stream_fails(client: TestClient) -> None:
    # No parade: a plain 404 before any stream is opened.
    response = client.get("/api/state/stream")

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"error": "No hay desfile."}


# --- progress --------------------------------------------------------------


def sample(metres: float, minutes: float) -> Sample:
    return Sample(metres=metres, ts=T0 + timedelta(minutes=minutes))


def test_waypoint_passes_ok(course: Course) -> None:
    # Out of order, as they may be stored.
    samples = [sample(1700, 30), sample(0, 0), sample(850, 15), sample(820, 14)]

    passes = {p.waypoint_id: p for p in waypoint_passes(course, samples)}

    # One entry per waypoint, in the order of the course.
    assert list(passes) == [waypoint.id for waypoint in course.waypoints]
    # The first sample level with the waypoint (830 m) or further on.
    assert passes["w-colegio"].ts == T0 + timedelta(minutes=15)
    assert passes["w-cristorey"].ts == T0 + timedelta(minutes=30)
    assert passes["w-colegio"].name == "Colegio Champagnat"


def test_waypoint_passes_fails(course: Course) -> None:
    passes = waypoint_passes(course, [])

    # No history: nothing has been passed.
    assert len(passes) == len(course.waypoints)
    assert all(p.ts is None for p in passes)


def test_waypoint_not_reached_has_no_time(course: Course) -> None:
    passes = {p.waypoint_id: p for p in waypoint_passes(course, [sample(0, 0), sample(1000, 20)])}

    assert passes["w-colegio"].ts is not None
    # At 1000 m the head has not got to Cristo Rey (1690 m) or beyond.
    assert passes["w-cristorey"].ts is None
    assert passes["w-ingenio"].ts is None


async def test_progress_ok(
    client: TestClient, course: Course, parades: ParadesMemory, make_user: MakeUser
) -> None:
    await add_parade(parades)
    reporter = await make_user("reporter", post="head")
    client.post("/api/positions", json=point(course, 900), headers=auth(reporter))

    response = client.get("/api/parades/d6-1/progress")

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "public, max-age=30, stale-while-revalidate=120"
    body = response.json()
    assert body["parade"]["id"] == "d6-1"
    assert set(body["passes"][0]) == {"waypointId", "name", "metres", "ts"}
    passed = {p["waypointId"]: p["ts"] for p in body["passes"]}
    assert passed["w-colegio"] is not None
    assert passed["w-cristorey"] is None


def test_progress_fails(client: TestClient) -> None:
    response = client.get("/api/parades/nope/progress")

    assert response.status_code == 404
    assert response.json() == {"error": "Ese desfile no existe."}
