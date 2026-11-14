import asyncio
import json
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.domain.schedule import Announcement, announcement_duration
from app.live import RepoStateReader
from app.realtime import Broadcaster
from app.repositories.announcements import AnnouncementsMemory
from app.repositories.events import EventsMemory
from app.repositories.parades import ParadesMemory
from app.routers.state import state_events
from tests.conftest import MakeUser, auth

ANNOUNCEMENTS = "/api/admin/announcements"
EVENTS = "/api/admin/events"
EVENT = {
    "title": " Tarima de cierre ",
    "date": "2999-01-06",
    "startTime": "9:00",
    "endTime": "20:00",
    "category": "stage",
    "description": "Artistas locales y nacionales.",
    "placeName": "Plaza del Ingenio",
    "lat": 1.2071,
    "lng": -77.2692,
    "sponsored": True,
}


async def add_parade(parades: ParadesMemory) -> None:
    await parades.save(
        id="d6-1", name="Desfile Magno", date="2999-01-06", start_time="10:00", course_id="c"
    )


# --- announcements ---------------------------------------------------------


async def test_publish_announcement_ok(
    client: TestClient, parades: ParadesMemory, make_user: MakeUser
) -> None:
    await add_parade(parades)
    headers = auth(await make_user("coordinator"))
    before = datetime.now(UTC).timestamp() * 1000 - 1

    response = client.post(
        ANNOUNCEMENTS,
        json={"text": " Arranca con 40 min de retraso ", "level": "alert"},
        headers=headers,
    )

    assert response.status_code == 201
    published = response.json()["announcement"]
    assert set(published) == {"id", "text", "level", "createdAt", "expiresAt"}
    assert published["text"] == "Arranca con 40 min de retraso"
    assert published["level"] == "alert"
    assert published["createdAt"] >= before
    # An hour, when no duration is asked for.
    assert published["expiresAt"] - published["createdAt"] == 60 * 60 * 1000
    # It shows in the panel and inside the state everyone reads.
    assert client.get(ANNOUNCEMENTS, headers=headers).json() == {"announcements": [published]}
    assert client.get("/api/state").json()["announcements"] == [published]


async def test_publish_announcement_fails(
    client: TestClient, announcements: AnnouncementsMemory, make_user: MakeUser
) -> None:
    coordinator = await make_user("coordinator")

    response = client.post(ANNOUNCEMENTS, json={"text": "   "}, headers=auth(coordinator))

    assert response.status_code == 400
    assert response.json() == {"error": "Escribí el mensaje."}
    # Loading the schedule is not talking to everyone.
    editor = await make_user("editor")
    assert (
        client.post(ANNOUNCEMENTS, json={"text": "Hola"}, headers=auth(editor)).status_code == 403
    )
    assert client.post(ANNOUNCEMENTS, json={"text": "Hola"}).status_code == 401
    assert client.get(ANNOUNCEMENTS, headers=auth(editor)).status_code == 403
    assert announcements.rows == {}


async def test_expired_announcement_is_not_in_the_state(
    client: TestClient,
    parades: ParadesMemory,
    announcements: AnnouncementsMemory,
    make_user: MakeUser,
) -> None:
    await add_parade(parades)
    now = datetime.now(UTC)
    await announcements.save(
        Announcement(
            id="a-old",
            text="Ya pasó",
            level="info",
            created_at=now - timedelta(hours=2),
            expires_at=now - timedelta(seconds=1),
        )
    )
    await announcements.save(
        Announcement(
            id="a-new",
            text="Vigente",
            level="info",
            created_at=now,
            expires_at=now + timedelta(hours=1),
        )
    )
    await announcements.save(
        Announcement(
            id="a-open", text="Sin vencimiento", level="info", created_at=now, expires_at=None
        )
    )

    in_state = client.get("/api/state").json()["announcements"]

    assert [a["id"] for a in in_state] == ["a-new", "a-open"]
    assert in_state[1]["expiresAt"] is None
    listed = client.get(ANNOUNCEMENTS, headers=auth(await make_user("coordinator"))).json()
    assert [a["id"] for a in listed["announcements"]] == ["a-new", "a-open"]


async def test_announcement_is_cleaned_up_and_capped(
    client: TestClient, make_user: MakeUser
) -> None:
    headers = auth(await make_user("admin"))

    long = client.post(
        ANNOUNCEMENTS,
        json={"text": "x" * 500, "durationMin": 99999, "level": "loud"},
        headers=headers,
    ).json()["announcement"]
    short = client.post(
        ANNOUNCEMENTS, json={"text": "Hola", "durationMin": 1}, headers=headers
    ).json()["announcement"]

    assert len(long["text"]) == 160
    # An unknown level is plain "info".
    assert long["level"] == "info"
    assert long["expiresAt"] - long["createdAt"] == 12 * 60 * 60 * 1000
    assert short["expiresAt"] - short["createdAt"] == 5 * 60 * 1000
    assert announcement_duration(None) == timedelta(minutes=60)
    assert announcement_duration(90) == timedelta(minutes=90)


async def test_delete_announcement_ok(
    client: TestClient, parades: ParadesMemory, make_user: MakeUser
) -> None:
    await add_parade(parades)
    headers = auth(await make_user("coordinator"))
    published = client.post(ANNOUNCEMENTS, json={"text": "Hola"}, headers=headers).json()[
        "announcement"
    ]

    assert client.delete(f"{ANNOUNCEMENTS}/{published['id']}", headers=headers).status_code == 204
    assert client.get("/api/state").json()["announcements"] == []
    missing = client.delete(f"{ANNOUNCEMENTS}/{published['id']}", headers=headers)
    assert missing.status_code == 404
    assert missing.json() == {"error": "No existe ese aviso."}


async def test_publishing_reaches_the_open_streams(
    parades: ParadesMemory,
    reader: RepoStateReader,
    broadcaster: Broadcaster,
    announcements: AnnouncementsMemory,
) -> None:
    await add_parade(parades)
    events = state_events("d6-1", reader, broadcaster, heartbeat_s=5)
    first = await anext(events)
    assert first.raw_data is not None
    assert json.loads(first.raw_data)["announcements"] == []
    now = datetime.now(UTC)

    await announcements.save(
        Announcement(id="a-1", text="Hola", level="info", created_at=now, expires_at=None)
    )

    # No waiting for a heartbeat: the announcement arrives at once.
    pushed = await asyncio.wait_for(anext(events), 1)
    assert pushed.raw_data is not None
    assert [a["text"] for a in json.loads(pushed.raw_data)["announcements"]] == ["Hola"]
    await events.aclose()


# --- events ----------------------------------------------------------------


async def test_save_event_ok(client: TestClient, events: EventsMemory, make_user: MakeUser) -> None:
    headers = auth(await make_user("editor"))

    response = client.put(f"{EVENTS}/ev-10", json=EVENT, headers=headers)

    assert response.status_code == 200
    saved = response.json()
    assert saved == {
        "id": "ev-10",
        "date": "2999-01-06",
        "startTime": "09:00",
        "endTime": "20:00",
        "title": "Tarima de cierre",
        "description": "Artistas locales y nacionales.",
        "category": "stage",
        "placeName": "Plaza del Ingenio",
        "lat": 1.2071,
        "lng": -77.2692,
        "sponsored": True,
    }
    # In the panel and in the public schedule.
    assert client.get(EVENTS, headers=headers).json() == {"events": [saved]}
    assert client.get("/api/schedule").json()["events"] == [saved]
    # Again with the same id: it replaces it.
    minimal = {"title": "Tasca", "date": "2999-01-05", "startTime": "12:00", "category": "tasca"}
    replaced = client.put(f"{EVENTS}/ev-10", json=minimal, headers=headers).json()
    assert (replaced["title"], replaced["endTime"], replaced["lat"], replaced["sponsored"]) == (
        "Tasca",
        None,
        None,
        False,
    )
    assert len(events.rows) == 1


async def test_save_event_fails(
    client: TestClient, events: EventsMemory, make_user: MakeUser
) -> None:
    headers = auth(await make_user("editor"))

    response = client.put(f"{EVENTS}/ev-10", json={**EVENT, "category": "party"}, headers=headers)

    assert response.status_code == 400
    assert response.json() == {"error": "Categoría inválida."}
    for change, message in (
        ({"title": " "}, "Falta el título."),
        ({"date": "mañana"}, "Falta la fecha."),
        ({"startTime": "24:00"}, "Falta la hora de inicio."),
        ({"endTime": "tarde"}, "Hora de fin inválida."),
        ({"lat": 200}, "Punto inválido."),
    ):
        response = client.put(f"{EVENTS}/ev-10", json={**EVENT, **change}, headers=headers)

        assert response.status_code == 400, change
        assert response.json() == {"error": message}
    assert client.put(f"{EVENTS}/Not%20An%20Id", json=EVENT, headers=headers).status_code == 400
    # Running parade day is not loading the schedule.
    coordinator = await make_user("coordinator")
    assert client.put(f"{EVENTS}/ev-10", json=EVENT, headers=auth(coordinator)).status_code == 403
    assert client.get(EVENTS).status_code == 401
    assert events.rows == {}


async def test_event_with_half_a_point_has_no_point(
    client: TestClient, make_user: MakeUser
) -> None:
    headers = auth(await make_user("editor"))

    saved = client.put(f"{EVENTS}/ev-10", json={**EVENT, "lng": None}, headers=headers).json()

    assert (saved["lat"], saved["lng"]) == (None, None)


async def test_delete_event_ok(
    client: TestClient, events: EventsMemory, make_user: MakeUser
) -> None:
    headers = auth(await make_user("editor"))
    client.put(f"{EVENTS}/ev-10", json=EVENT, headers=headers)

    assert client.delete(f"{EVENTS}/ev-10", headers=headers).status_code == 204
    assert events.rows == {}
    missing = client.delete(f"{EVENTS}/ev-10", headers=headers)
    assert missing.status_code == 404
    assert missing.json() == {"error": "No existe ese evento."}


async def test_schedule_lists_events_in_order(client: TestClient, make_user: MakeUser) -> None:
    headers = auth(await make_user("editor"))
    client.put(f"{EVENTS}/late", json={**EVENT, "startTime": "18:00"}, headers=headers)
    client.put(f"{EVENTS}/early", json={**EVENT, "startTime": "08:00"}, headers=headers)
    client.put(f"{EVENTS}/before", json={**EVENT, "date": "2999-01-05"}, headers=headers)

    assert [e["id"] for e in client.get("/api/schedule").json()["events"]] == [
        "before",
        "early",
        "late",
    ]
