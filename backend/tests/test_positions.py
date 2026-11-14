from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.domain.course import Course
from app.domain.positions import MAX_BATCH, BatchError, validate_batch
from app.repositories.parades import ParadeNotFound, ParadesMemory
from app.repositories.state import StateMemory
from app.repositories.users import UsersMemory
from app.schemas.state import ParadeStateOut, PositionInput
from app.seed import SEED_DIR, read_course
from tests.conftest import MakeUser, auth

NOW = datetime(2027, 1, 6, 15, 0, tzinfo=UTC)


def ms(moment: datetime) -> int:
    return int(moment.timestamp() * 1000)


@pytest.fixture(scope="module")
def course() -> Course:
    return read_course(SEED_DIR).to_course()


def at(course: Course, metres: float, **more: object) -> dict[str, object]:
    """A point on the course, as a reporter's phone would send it."""
    lat, lng = course.point_at_metre(metres)
    return {"lat": lat, "lng": lng, **more}


def batch(course: Course, *items: dict[str, object], post: str | None = "head"):  # type: ignore[no-untyped-def]
    return validate_batch(
        [PositionInput.model_validate(item) for item in items],
        forced_post=post,  # type: ignore[arg-type]
        parade_id="d6-1",
        now=NOW,
        course=course,
    )


async def add_parade(parades: ParadesMemory, id: str = "d6-1", date: str = "2999-01-06") -> None:
    await parades.save(id=id, name="Desfile Magno", date=date, start_time="10:00", course_id="c")


# --- schemas ---------------------------------------------------------------


def test_position_input_ok() -> None:
    by_gps = PositionInput.model_validate({"lat": 1.21, "lng": -77.28, "accuracyM": 12, "ts": 5})
    by_waypoint = PositionInput.model_validate({"waypointId": "w-cristorey"})

    assert by_gps.accuracy_m == 12
    assert by_waypoint.lat is None
    assert by_waypoint.waypoint_id == "w-cristorey"


def test_position_input_fails() -> None:
    for body in (
        {"lat": 1.21, "lng": -77.28, "post": "tail2"},
        {"lat": 200, "lng": -77.28},
        {"lat": 1.21, "lng": -181},
        {"lat": 1.21},
        {},
    ):
        with pytest.raises(ValidationError):
            PositionInput.model_validate(body)


def test_state_serializes_in_camelcase() -> None:
    state = ParadeStateOut.model_validate(
        {
            "parade_id": "d6-1",
            "name": "Desfile Magno",
            "state": "in_progress",
            "date": "2027-01-06",
            "start_time": "10:00",
            "course_id": "c",
            "positions": {
                "head": {
                    "post": "head",
                    "lat": 1,
                    "lng": 2,
                    "metres": 3,
                    "accuracy_m": None,
                    "ts": 4,
                }
            },
            "head_history": [{"metres": 3, "ts": 4}],
            "announcements": [],
            "server_ts": 5,
        }
    )

    body = state.model_dump(by_alias=True)

    assert set(body) == {
        "paradeId",
        "name",
        "state",
        "date",
        "startTime",
        "courseId",
        "positions",
        "headHistory",
        "announcements",
        "serverTs",
    }
    assert set(body["positions"]["head"]) == {"post", "lat", "lng", "metres", "accuracyM", "ts"}


# --- batches ---------------------------------------------------------------


def test_validate_batch_ok(course: Course) -> None:
    later = at(course, 900, ts=ms(NOW - timedelta(seconds=20)), accuracyM=8)
    earlier = at(course, 800, ts=ms(NOW - timedelta(seconds=40)))
    by_waypoint = {"waypointId": "w-cristorey", "ts": ms(NOW)}

    entries, discarded = batch(course, later, earlier, by_waypoint)

    assert discarded == 0
    # Sorted by time, whatever order they came in.
    assert [round(entry.course_m) for entry in entries] == [800, 900, 1690]
    assert {entry.post for entry in entries} == {"head"}
    assert {entry.parade_id for entry in entries} == {"d6-1"}
    assert entries[1].accuracy_m == 8
    # A waypoint is put on the course, with no accuracy to speak of.
    assert entries[2].accuracy_m is None
    # Without `ts`, the server's clock.
    (no_ts,), _ = batch(course, at(course, 100))
    assert no_ts.ts == NOW


def test_validate_batch_fails(course: Course) -> None:
    with pytest.raises(BatchError, match="Máximo 200"):
        batch(course, *[at(course, 100)] * (MAX_BATCH + 1))
    with pytest.raises(BatchError, match="waypointId desconocido"):
        batch(course, {"waypointId": "w-nowhere"})
    # Nobody set the post: neither the server nor the body.
    with pytest.raises(BatchError, match="post debe ser uno de"):
        batch(course, at(course, 100), post=None)
    # Exactly the maximum is fine.
    entries, _ = batch(course, *[at(course, 100)] * MAX_BATCH)
    assert len(entries) == MAX_BATCH


def test_point_with_bad_accuracy_is_discarded_without_failing_the_batch(course: Course) -> None:
    good = at(course, 500, accuracyM=20)

    entries, discarded = batch(
        course,
        good,
        at(course, 600, accuracyM=500),
        # A clock set wrong, and a point queued for too long.
        at(course, 700, ts=ms(NOW + timedelta(minutes=5))),
        at(course, 800, ts=ms(NOW - timedelta(hours=2))),
    )

    assert discarded == 3
    assert [round(entry.course_m) for entry in entries] == [500]
    # The limits themselves still go in.
    entries, discarded = batch(
        course,
        at(course, 500, accuracyM=150),
        at(course, 600, ts=ms(NOW + timedelta(minutes=2))),
        at(course, 700, ts=ms(NOW - timedelta(hours=1))),
    )
    assert (len(entries), discarded) == (3, 0)


def test_the_body_chooses_the_post_only_when_it_is_not_forced(course: Course) -> None:
    (forced,), _ = batch(course, at(course, 100, post="tail"), post="head")
    (free,), _ = batch(course, at(course, 100, post="tail"), post=None)

    assert forced.post == "head"
    assert free.post == "tail"


# --- repository ------------------------------------------------------------


async def test_record_positions_ok(
    course: Course,
    parades: ParadesMemory,
    users: UsersMemory,
    state: StateMemory,
    make_user: MakeUser,
) -> None:
    await add_parade(parades)
    reporter = await make_user("reporter", post="head")
    entries, _ = batch(
        course,
        at(course, 300, ts=ms(NOW - timedelta(minutes=20))),
        at(course, 800, ts=ms(NOW - timedelta(minutes=1))),
        at(course, 900, ts=ms(NOW)),
    )
    (tail,), _ = batch(course, at(course, 100, ts=ms(NOW)), post="tail")

    await state.record_positions(entries, reporter.id)
    await state.record_positions([tail], None)

    parade = await parades.by_id("d6-1")
    assert parade is not None
    # The first report of a scheduled parade starts it.
    assert parade.state == "in_progress"
    live = await state.read_state(parade)
    assert set(live.positions) == {"head", "tail"}
    assert live.positions["head"].course_m == pytest.approx(900, abs=0.1)
    # The history only goes back 16 min from the latest of the head.
    assert [round(sample.metres) for sample in live.head_history] == [800, 900]
    # The progress is the whole run.
    assert [round(s.metres) for s in await state.read_progress(parade)] == [300, 800, 900]
    stored = await users.by_id(reporter.id)
    assert stored is not None and stored.last_signal_at is not None
    sender = await state.last_sender(parade, "head")
    assert sender is not None and sender.user_id == reporter.id
    assert await state.last_sender(parade, "middle") is None


async def test_record_positions_fails(course: Course, state: StateMemory) -> None:
    entries, _ = batch(course, at(course, 300))

    with pytest.raises(ParadeNotFound):
        await state.record_positions(entries, None)


async def test_old_packet_does_not_overwrite_new(
    course: Course, parades: ParadesMemory, state: StateMemory
) -> None:
    await add_parade(parades)
    new, _ = batch(course, at(course, 900, ts=ms(NOW)))
    old, _ = batch(course, at(course, 400, ts=ms(NOW - timedelta(minutes=5))))

    await state.record_positions(new, None)
    # It was queued on the phone and arrives later.
    await state.record_positions(old, None)

    parade = await parades.by_id("d6-1")
    assert parade is not None
    live = await state.read_state(parade)
    assert live.positions["head"].course_m == pytest.approx(900, abs=0.1)
    # But it does count for the history, in its place.
    assert [round(sample.metres) for sample in live.head_history] == [400, 900]


async def test_a_restart_hides_the_previous_run(
    course: Course, parades: ParadesMemory, state: StateMemory
) -> None:
    await add_parade(parades)
    now = datetime.now(UTC)
    before = validate_batch(
        [PositionInput.model_validate(at(course, 900))],
        forced_post="head",
        parade_id="d6-1",
        now=now,
        course=course,
    )[0]
    await state.record_positions(before, None)
    running = await parades.by_id("d6-1")
    assert running is not None
    assert set((await state.read_state(running)).positions) == {"head"}

    parade = await parades.set_state("d6-1", "scheduled", new_run=True)

    live = await state.read_state(parade)
    assert live.positions == {}
    assert live.head_history == []
    assert await state.read_progress(parade) == []
    assert await state.last_sender(parade, "head") is None
    # Nothing was deleted: it is only not shown.
    assert len(state._rows) == 1


# --- POST /api/positions ---------------------------------------------------


async def test_positions_ok(
    client: TestClient,
    course: Course,
    parades: ParadesMemory,
    state: StateMemory,
    make_user: MakeUser,
) -> None:
    await add_parade(parades)
    reporter = await make_user("reporter", post="middle")

    # The body asks for another post and another parade: the server decides.
    response = client.post(
        "/api/positions",
        json=at(course, 1200, post="head", paradeId="other", accuracyM=10),
        headers=auth(reporter),
    )

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"ok", "saved", "discarded", "waiting", "serverTs"}
    assert (body["ok"], body["saved"], body["discarded"], body["waiting"]) == (True, 1, 0, False)
    parade = await parades.by_id("d6-1")
    assert parade is not None and parade.state == "in_progress"
    live = await state.read_state(parade)
    assert set(live.positions) == {"middle"}
    assert live.positions["middle"].course_m == pytest.approx(1200, abs=0.5)
    # And the public schedule shows it started, without waiting for the 2 s list.
    assert client.get("/api/schedule").json()["parades"][0]["state"] == "in_progress"


async def test_positions_batch_ok(
    client: TestClient, course: Course, parades: ParadesMemory, make_user: MakeUser
) -> None:
    await add_parade(parades)
    reporter = await make_user("reporter", post="head")
    now = datetime.now(UTC)

    response = client.post(
        "/api/positions",
        json=[
            at(course, 500, ts=ms(now - timedelta(seconds=40))),
            at(course, 600, ts=ms(now - timedelta(seconds=20)), accuracyM=900),
            {"waypointId": "w-cristorey", "ts": ms(now)},
        ],
        headers=auth(reporter),
    )

    assert response.status_code == 200
    assert (response.json()["saved"], response.json()["discarded"]) == (2, 1)


async def test_positions_fails(
    client: TestClient,
    course: Course,
    parades: ParadesMemory,
    state: StateMemory,
    make_user: MakeUser,
) -> None:
    await add_parade(parades)
    point = at(course, 500)

    no_token = client.post("/api/positions", json=point)

    assert no_token.status_code == 401
    assert no_token.json() == {"error": "Hace falta iniciar sesión."}
    # Logged in, but it is not their job.
    assert (
        client.post(
            "/api/positions", json=point, headers=auth(await make_user("editor"))
        ).status_code
        == 403
    )
    reporter = await make_user("reporter", post="head")
    for body in (
        {"lat": 200, "lng": -77.28},
        {"lat": 1.21},
        {"waypointId": "w-nowhere"},
        "nonsense",
    ):
        response = client.post("/api/positions", json=body, headers=auth(reporter))

        assert response.status_code == 400, body
        assert set(response.json()) == {"error"}
    too_many = client.post("/api/positions", json=[point] * 201, headers=auth(reporter))
    assert too_many.json() == {"error": "Máximo 200 posiciones por envío."}
    assert state._rows == []


async def test_positions_without_a_parade_fails(
    client: TestClient, course: Course, make_user: MakeUser
) -> None:
    reporter = await make_user("reporter", post="head")

    response = client.post("/api/positions", json=at(course, 500), headers=auth(reporter))

    assert response.status_code == 404
    assert response.json() == {"error": "Ese desfile no existe."}


async def test_ingest_names_the_parade_and_the_post(
    client: TestClient,
    course: Course,
    parades: ParadesMemory,
    state: StateMemory,
    make_user: MakeUser,
) -> None:
    await add_parade(parades, "d2-1", "2999-01-02")
    await add_parade(parades, "d6-1", "2999-01-06")
    ingest = await make_user("ingest")

    response = client.post(
        "/api/positions",
        json=[at(course, 500, paradeId="d6-1", post="head"), at(course, 100, post="tail")],
        headers=auth(ingest),
    )

    assert response.json()["saved"] == 2
    # Not the current one (d2-1): the one it named.
    named = await parades.by_id("d6-1")
    assert named is not None
    assert set((await state.read_state(named)).positions) == {"head", "tail"}
    # A parade is never created by naming it, and the post is not guessed.
    missing = client.post(
        "/api/positions", json=at(course, 500, paradeId="nope", post="head"), headers=auth(ingest)
    )
    assert missing.status_code == 404
    assert await parades.by_id("nope") is None
    no_post = client.post("/api/positions", json=at(course, 500), headers=auth(ingest))
    assert no_post.status_code == 400
    assert no_post.json() == {"error": "post debe ser uno de: head, middle, tail."}


async def test_second_reporter_on_the_same_post_waits(
    client: TestClient,
    course: Course,
    parades: ParadesMemory,
    state: StateMemory,
    make_user: MakeUser,
) -> None:
    await add_parade(parades)
    holder = await make_user("reporter", post="head", email="holder@example.com")
    backup = await make_user("reporter", post="head", email="backup@example.com")
    tail = await make_user("reporter", post="tail", email="tail@example.com")
    assert (
        client.post("/api/positions", json=at(course, 900), headers=auth(holder)).json()["saved"]
        == 1
    )

    # Blocks behind the holder, on the same post.
    response = client.post(
        "/api/positions", json=[at(course, 200), at(course, 210)], headers=auth(backup)
    )

    assert response.status_code == 200
    assert response.json()["waiting"] is True
    assert (response.json()["saved"], response.json()["discarded"]) == (0, 2)
    parade = await parades.by_id("d6-1")
    assert parade is not None
    assert (await state.read_state(parade)).positions["head"].course_m == pytest.approx(
        900, abs=0.5
    )
    # The holder keeps going, and another post is nobody's backup.
    assert (
        client.post("/api/positions", json=at(course, 950), headers=auth(holder)).json()["waiting"]
        is False
    )
    assert (
        client.post("/api/positions", json=at(course, 100), headers=auth(tail)).json()["waiting"]
        is False
    )


async def test_backup_takes_over_when_the_holder_goes_silent(
    client: TestClient,
    course: Course,
    parades: ParadesMemory,
    state: StateMemory,
    make_user: MakeUser,
) -> None:
    await add_parade(parades)
    holder = await make_user("reporter", post="head", email="holder@example.com")
    backup = await make_user("reporter", post="head", email="backup@example.com")
    silent_for = datetime.now(UTC) - timedelta(seconds=90)
    client.post("/api/positions", json=at(course, 900, ts=ms(silent_for)), headers=auth(holder))

    response = client.post("/api/positions", json=at(course, 1000), headers=auth(backup))

    assert response.json()["waiting"] is False
    assert response.json()["saved"] == 1
    # Now the backup holds the post, and the old holder is the one who waits.
    assert (
        client.post("/api/positions", json=at(course, 300), headers=auth(holder)).json()["waiting"]
        is True
    )


async def test_reporter_without_a_post_fails(
    client: TestClient,
    course: Course,
    parades: ParadesMemory,
    users: UsersMemory,
    make_user: MakeUser,
) -> None:
    await add_parade(parades)
    reporter = await make_user("reporter", post="head")
    await users.update(reporter.id, {"post": None})

    response = client.post("/api/positions", json=at(course, 500), headers=auth(reporter))

    assert response.status_code == 400
    assert response.json() == {"error": "Tu usuario no tiene un puesto asignado."}
