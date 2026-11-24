from fastapi.testclient import TestClient

from app.domain.dates import today_in_pasto
from app.repositories.courses import CoursesMemory
from app.repositories.parades import ParadesMemory
from tests.conftest import MakeUser, auth

URL = "/api/admin/parades"
BODY = {"name": " Desfile Magno ", "date": "2999-01-06", "startTime": "9:00"}


async def add(parades: ParadesMemory, id: str = "d6-1", date: str = "2999-01-06") -> None:
    await parades.save(id=id, name="Desfile Magno", date=date, start_time="10:00", course_id="c")


async def test_schedule_ok(client: TestClient, parades: ParadesMemory) -> None:
    await add(parades, "d6-1", "2999-01-06")
    await add(parades, "d2-1", "2999-01-02")

    response = client.get("/api/schedule")

    assert response.status_code == 200
    assert "max-age=30" in response.headers["Cache-Control"]
    body = response.json()
    assert body["today"] == today_in_pasto()
    assert body["events"] == []
    assert body["currentId"] == "d2-1"
    assert body["parades"] == [
        {
            "id": "d2-1",
            "name": "Desfile Magno",
            "date": "2999-01-02",
            "startTime": "10:00",
            "state": "scheduled",
        },
        {
            "id": "d6-1",
            "name": "Desfile Magno",
            "date": "2999-01-06",
            "startTime": "10:00",
            "state": "scheduled",
        },
    ]


def test_schedule_without_parades_ok(client: TestClient) -> None:
    body = client.get("/api/schedule").json()

    assert body["parades"] == []
    assert body["currentId"] is None


async def test_list_parades_ok(
    client: TestClient, parades: ParadesMemory, make_user: MakeUser
) -> None:
    await add(parades)
    # Whoever edits the schedule and whoever runs parade day both see the list.
    for role in ("editor", "coordinator"):
        response = client.get(URL, headers=auth(await make_user(role)))

        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "no-store"
        assert response.json()["currentId"] == "d6-1"
        assert [p["id"] for p in response.json()["parades"]] == ["d6-1"]


async def test_list_parades_fails(client: TestClient, make_user: MakeUser) -> None:
    assert client.get(URL).status_code == 401
    assert client.get(URL, headers=auth(await make_user("moderator"))).status_code == 403


async def test_save_parade_ok(
    client: TestClient, parades: ParadesMemory, make_user: MakeUser
) -> None:
    editor = await make_user("editor")

    created = client.put(f"{URL}/d6-1", json=BODY, headers=auth(editor))

    assert created.status_code == 200
    assert created.json() == {
        "id": "d6-1",
        "name": "Desfile Magno",
        "date": "2999-01-06",
        "startTime": "09:00",
        "state": "scheduled",
    }
    stored = await parades.by_id("d6-1")
    assert stored is not None
    assert stored.course_id == "provisional-pasto-course"

    # Again with the same id: it changes it, and the state is not touched.
    await parades.set_state("d6-1", "in_progress", new_run=False)
    changed = client.put(
        f"{URL}/d6-1", json={**BODY, "name": "Día de Blancos"}, headers=auth(editor)
    )
    assert changed.json()["name"] == "Día de Blancos"
    assert changed.json()["state"] == "in_progress"
    assert len(await parades.list()) == 1
    # And the public schedule sees it at once, not 2 s later.
    assert client.get("/api/schedule").json()["parades"][0]["name"] == "Día de Blancos"


async def test_save_parade_fails(
    client: TestClient, parades: ParadesMemory, courses: CoursesMemory, make_user: MakeUser
) -> None:
    editor = await make_user("editor")
    coordinator = await make_user("coordinator")
    headers = auth(editor)

    # Running parade day is not loading the schedule.
    assert client.put(f"{URL}/d6-1", json=BODY, headers=auth(coordinator)).status_code == 403
    assert client.put(f"{URL}/d6-1", json=BODY).status_code == 401
    for change, message in (
        ({"name": "  "}, "Falta el nombre."),
        ({"date": "6 de enero"}, "Falta la fecha."),
        ({"date": "2999-02-31"}, "Falta la fecha."),
        ({"startTime": "25:00"}, "Falta la hora de inicio."),
    ):
        response = client.put(f"{URL}/d6-1", json={**BODY, **change}, headers=headers)

        assert response.status_code == 400, change
        assert response.json() == {"error": message}
    assert client.put(f"{URL}/Not%20An%20Id", json=BODY, headers=headers).status_code == 400
    assert await parades.list() == []

    courses._records.clear()
    assert client.put(f"{URL}/d6-1", json=BODY, headers=headers).status_code == 503


async def test_parade_action_ok(
    client: TestClient, parades: ParadesMemory, make_user: MakeUser
) -> None:
    await add(parades)
    headers = auth(await make_user("coordinator"))

    for action, state in (
        ("start", "in_progress"),
        ("finish", "finished"),
        ("restart", "scheduled"),
    ):
        response = client.patch(f"{URL}/d6-1", json={"action": action}, headers=headers)

        assert response.status_code == 200
        assert response.json() == {"ok": True, "state": state}
        stored = await parades.by_id("d6-1")
        assert stored is not None and stored.state == state


async def test_parade_action_fails(
    client: TestClient, parades: ParadesMemory, make_user: MakeUser
) -> None:
    await add(parades)
    editor = await make_user("editor")
    coordinator = await make_user("coordinator")

    # Loading the schedule is not running parade day.
    response = client.patch(f"{URL}/d6-1", json={"action": "start"}, headers=auth(editor))

    assert response.status_code == 403
    stored = await parades.by_id("d6-1")
    assert stored is not None and stored.state == "scheduled"
    assert (
        client.patch(
            f"{URL}/d6-1", json={"action": "explode"}, headers=auth(coordinator)
        ).status_code
        == 400
    )
    # An id that does not exist is a 404; it is not created by asking for it.
    missing = client.patch(f"{URL}/nope", json={"action": "start"}, headers=auth(coordinator))
    assert missing.status_code == 404
    assert missing.json() == {"error": "No existe ese desfile."}
    assert await parades.by_id("nope") is None


async def test_restart_moves_run_started_at(
    client: TestClient, parades: ParadesMemory, make_user: MakeUser
) -> None:
    await add(parades)
    headers = auth(await make_user("coordinator"))
    before = await parades.by_id("d6-1")
    assert before is not None

    client.patch(f"{URL}/d6-1", json={"action": "start"}, headers=headers)
    client.patch(f"{URL}/d6-1", json={"action": "finish"}, headers=headers)
    unchanged = await parades.by_id("d6-1")
    assert unchanged is not None
    # Starting and finishing do not begin a new run...
    assert unchanged.run_started_at == before.run_started_at

    client.patch(f"{URL}/d6-1", json={"action": "restart"}, headers=headers)

    # ...restarting does: positions before this moment stop counting.
    after = await parades.by_id("d6-1")
    assert after is not None
    assert after.run_started_at > before.run_started_at


async def test_delete_parade_ok(
    client: TestClient, parades: ParadesMemory, make_user: MakeUser
) -> None:
    await add(parades)
    editor = await make_user("editor")

    assert client.delete(f"{URL}/d6-1", headers=auth(editor)).status_code == 204
    assert await parades.list() == []
    assert client.delete(f"{URL}/d6-1", headers=auth(editor)).status_code == 404


async def test_delete_parade_fails(
    client: TestClient, parades: ParadesMemory, make_user: MakeUser
) -> None:
    await add(parades)

    assert (
        client.delete(f"{URL}/d6-1", headers=auth(await make_user("coordinator"))).status_code
        == 403
    )
    assert len(await parades.list()) == 1
