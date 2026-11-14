from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pywebpush import WebPushException

from app.domain.eta import estimate_speed
from app.domain.parades import Parade
from app.domain.progress import Sample
from app.main import app
from app.push import NearbyNotifier, Notification, get_push_config, notification_for
from app.repositories.parades import ParadesMemory
from app.repositories.push_subscriptions import PushSubscription, PushSubscriptionsMemory
from app.repositories.state import LivePosition, LiveState
from tests.conftest import FakeSender, MakeUser, auth

NOW = datetime(2027, 1, 6, 15, 0, tzinfo=UTC)
URL = "/api/push-subscriptions"
BROWSER = {
    "endpoint": "https://push.example.com/abc",
    "keys": {"p256dh": "a-key", "auth": "a-secret"},
}
PARADE = Parade(
    id="d6-1",
    name="Desfile Magno",
    date="2027-01-06",
    start_time="10:00",
    state="in_progress",
    course_id="c",
    run_started_at=NOW - timedelta(hours=5),
)


def history(kmh: float, minutes: float, up_to_m: float) -> list[Sample]:
    """The head advancing at `kmh`, a point every 20 s, up to `up_to_m` at NOW."""
    ms = kmh / 3.6
    return [
        Sample(metres=up_to_m - ms * t, ts=NOW - timedelta(seconds=t))
        for t in range(int(minutes * 60), -1, -20)
    ]


def live(kmh: float, head_m: float, minutes: float = 8) -> LiveState:
    samples = history(kmh, minutes, head_m)
    head = LivePosition(post="head", lat=0, lng=0, course_m=head_m, accuracy_m=10, ts=NOW)
    return LiveState(positions={"head": head}, head_history=samples)


def waiting_at(metres: float, threshold_min: int = 10, name: str = "a") -> PushSubscription:
    return PushSubscription(
        endpoint=f"https://push.example.com/{name}",
        p256dh="k",
        auth="s",
        parade_id="d6-1",
        course_m=metres,
        threshold_min=threshold_min,
    )


# --- speed -----------------------------------------------------------------


def test_estimate_speed_ok() -> None:
    speed = estimate_speed(history(1.8, 8, 1000), NOW)

    assert speed.measured
    assert speed.kmh == pytest.approx(1.8, abs=0.05)
    assert not speed.stopped
    # Out of order gives the same.
    assert estimate_speed(list(reversed(history(1.8, 8, 1000))), NOW).kmh == pytest.approx(
        speed.kmh
    )


def test_estimate_speed_fails() -> None:
    # A minute of history is not enough to measure: the nominal 1.2 km/h.
    speed = estimate_speed(history(3, 1, 1000), NOW)

    assert not speed.measured
    assert speed.kmh == pytest.approx(1.2, abs=0.01)
    for few in ([], history(3, 0, 1000)):
        assert not estimate_speed(few, NOW).measured


def test_a_gps_jump_is_not_believed() -> None:
    jump = [Sample(metres=100, ts=NOW - timedelta(minutes=4)), Sample(metres=2800, ts=NOW)]

    speed = estimate_speed(jump, NOW)

    # 40 km/h is not a parade: the measurement is thrown away.
    assert not speed.measured
    assert speed.kmh == pytest.approx(1.2, abs=0.01)


def test_stopped_only_after_ten_minutes_without_advancing() -> None:
    def still(minutes: int) -> bool:
        samples = [
            Sample(metres=500 + (i % 2), ts=NOW - timedelta(seconds=minutes * 60 - i * 20))
            for i in range(minutes * 3 + 1)
        ]
        return estimate_speed(samples, NOW).stopped

    assert not still(6)
    assert still(11)


def test_a_crawling_parade_has_a_floor() -> None:
    # 0.1 km/h measured: the floor of 0.3 km/h keeps the ETA finite.
    speed = estimate_speed(history(0.1, 8, 1000), NOW)

    assert speed.measured
    assert speed.kmh == pytest.approx(0.3, abs=0.001)


# --- whom to tell ----------------------------------------------------------


async def test_notify_nearby_ok(sender: FakeSender, subscriptions: PushSubscriptionsMemory) -> None:
    notifier = NearbyNotifier(sender)
    # At 1.8 km/h (30 m/min): 240 m is 8 min away, 900 m is 30 min away.
    for subscription in (
        waiting_at(1240, name="close"),
        waiting_at(1900, name="far"),
        waiting_at(800, name="behind"),
        waiting_at(1030, name="here"),
    ):
        await subscriptions.save(subscription)

    sent = await notifier.notify(PARADE, live(1.8, 1000), subscriptions, NOW)

    assert sent == 2
    told = {
        subscription.endpoint.rsplit("/", 1)[1]: notification
        for subscription, notification in sender.sent
    }
    assert set(told) == {"close", "here"}
    assert told["close"] == Notification(
        title="Desfile Magno: ya viene", body="Le faltan unos 10 min para llegar a donde estás."
    )
    assert told["here"].body == "Ya casi llega a donde estás. ¡Alistá la cámara!"
    # One notification per request: told or already passed, the subscription is used up.
    assert [s.endpoint.rsplit("/", 1)[1] for s in await subscriptions.list("d6-1")] == ["far"]


async def test_stopped_parade_does_not_notify(
    sender: FakeSender, subscriptions: PushSubscriptionsMemory
) -> None:
    notifier = NearbyNotifier(sender)
    await subscriptions.save(waiting_at(1050))
    samples = [Sample(metres=1000, ts=NOW - timedelta(seconds=t)) for t in range(12 * 60, -1, -20)]
    head = LivePosition(post="head", lat=0, lng=0, course_m=1000, accuracy_m=10, ts=NOW)
    stopped = LiveState(positions={"head": head}, head_history=samples)

    sent = await notifier.notify(PARADE, stopped, subscriptions, NOW)

    # 50 m away, but stopped is not "about to arrive".
    assert sent == 0
    assert sender.sent == []
    # And the request is kept for when it moves again.
    assert len(await subscriptions.list("d6-1")) == 1


async def test_nothing_is_sent_without_a_head(
    sender: FakeSender, subscriptions: PushSubscriptionsMemory
) -> None:
    await subscriptions.save(waiting_at(1050))

    assert await NearbyNotifier(sender).notify(PARADE, LiveState(), subscriptions, NOW) == 0
    assert len(await subscriptions.list("d6-1")) == 1


async def test_a_failure_sending_does_not_raise(subscriptions: PushSubscriptionsMemory) -> None:
    class Broken:
        def __init__(self, error: Exception) -> None:
            self.error = error

        async def send(self, subscription: PushSubscription, notification: Notification) -> None:
            raise self.error

    for error in (WebPushException("410 Gone"), RuntimeError("no network")):
        await subscriptions.save(waiting_at(1100))

        sent = await NearbyNotifier(Broken(error)).notify(
            PARADE, live(1.8, 1000), subscriptions, NOW
        )

        assert sent == 0
        # It was already deleted: there is no retry.
        assert await subscriptions.list("d6-1") == []


def test_at_most_one_check_every_15_s_per_parade(sender: FakeSender) -> None:
    now = [100.0]
    notifier = NearbyNotifier(sender, clock=lambda: now[0])

    assert notifier.due("d6-1")
    assert not notifier.due("d6-1")
    # Another parade has its own count.
    assert notifier.due("d2-1")
    now[0] += 15
    assert notifier.due("d6-1")


def test_notification_rounds_to_five_minutes() -> None:
    def body(minutes: float) -> str:
        return notification_for(PARADE, minutes).body

    assert body(2.9) == "Ya casi llega a donde estás. ¡Alistá la cámara!"
    assert "unos 5 min" in body(3)
    assert "unos 10 min" in body(7.5)
    assert "unos 10 min" in body(12)
    assert "unos 15 min" in body(13)


# --- /api/push-subscriptions -----------------------------------------------


async def add_parade(parades: ParadesMemory) -> None:
    await parades.save(
        id="d6-1", name="Desfile Magno", date="2999-01-06", start_time="10:00", course_id="c"
    )


async def test_subscribe_ok(
    client: TestClient, parades: ParadesMemory, subscriptions: PushSubscriptionsMemory
) -> None:
    await add_parade(parades)

    response = client.post(URL, json={"subscription": BROWSER, "metres": 1500, "thresholdMin": 15})

    assert response.status_code == 200
    assert response.json() == {"ok": True, "thresholdMin": 15}
    assert await subscriptions.list("d6-1") == [
        PushSubscription(
            endpoint="https://push.example.com/abc",
            p256dh="a-key",
            auth="a-secret",
            parade_id="d6-1",
            course_m=1500,
            threshold_min=15,
        )
    ]
    # Asking again from the same device replaces the request.
    client.post(URL, json={"subscription": BROWSER, "metres": 2000})
    (only,) = await subscriptions.list("d6-1")
    assert (only.course_m, only.threshold_min) == (2000, 10)
    # The threshold is kept between 5 and 60.
    assert (
        client.post(URL, json={"subscription": BROWSER, "metres": 1, "thresholdMin": 1}).json()[
            "thresholdMin"
        ]
        == 5
    )
    assert (
        client.post(URL, json={"subscription": BROWSER, "metres": 1, "thresholdMin": 999}).json()[
            "thresholdMin"
        ]
        == 60
    )


async def test_subscribe_fails(
    client: TestClient, parades: ParadesMemory, subscriptions: PushSubscriptionsMemory
) -> None:
    await add_parade(parades)
    insecure = {**BROWSER, "endpoint": "http://push.example.com/abc"}

    response = client.post(URL, json={"subscription": insecure, "metres": 1500})

    assert response.status_code == 400
    assert response.json() == {"error": "Suscripción inválida."}
    for body in (
        {"subscription": BROWSER, "metres": 99999},
        {"subscription": BROWSER, "metres": -1},
        {"subscription": BROWSER},
        {"subscription": {"endpoint": BROWSER["endpoint"]}, "metres": 1500},
        {"subscription": {**BROWSER, "endpoint": "https://x/" + "a" * 1000}, "metres": 1500},
        {"subscription": "nonsense", "metres": 1500},
        {"metres": 1500},
    ):
        assert client.post(URL, json=body).status_code == 400, body
    assert subscriptions.rows == {}


def test_subscribe_without_a_parade_fails(client: TestClient) -> None:
    response = client.post(URL, json={"subscription": BROWSER, "metres": 1500})

    assert response.status_code == 404
    assert response.json() == {"error": "No hay desfile."}


async def test_push_status(client: TestClient, parades: ParadesMemory) -> None:
    await add_parade(parades)
    assert client.get(URL).json() == {"configured": True, "key": "a-public-key"}

    # A server without VAPID keys says so, and takes no subscriptions.
    app.dependency_overrides[get_push_config] = lambda: None

    assert client.get(URL).json() == {"configured": False, "key": None}
    response = client.post(URL, json={"subscription": BROWSER, "metres": 1500})
    assert response.status_code == 503
    assert response.json() == {"error": "Los avisos no están configurados en este servidor."}


async def test_unsubscribe(
    client: TestClient, parades: ParadesMemory, subscriptions: PushSubscriptionsMemory
) -> None:
    await add_parade(parades)
    client.post(URL, json={"subscription": BROWSER, "metres": 1500})

    response = client.request("DELETE", URL, json={"endpoint": BROWSER["endpoint"]})

    assert response.json() == {"ok": True}
    assert subscriptions.rows == {}
    # One that is not there is not an error; a body without the endpoint is.
    assert client.request("DELETE", URL, json={"endpoint": "https://gone"}).status_code == 200
    missing = client.request("DELETE", URL, json={})
    assert missing.status_code == 400
    assert missing.json() == {"error": "Falta el endpoint."}


# --- from POST /api/positions ----------------------------------------------


async def test_a_head_position_tells_whoever_is_close(
    client: TestClient,
    parades: ParadesMemory,
    subscriptions: PushSubscriptionsMemory,
    sender: FakeSender,
    make_user: MakeUser,
) -> None:
    await add_parade(parades)
    course = client.get("/api/course").json()
    head = await make_user("reporter", post="head", email="head@example.com")
    tail = await make_user("reporter", post="tail", email="tail@example.com")
    here = course["waypoints"][2]
    # Waiting 100 m past Cristo Rey: about 5 min at the nominal speed.
    client.post(URL, json={"subscription": BROWSER, "metres": here["metres"] + 100})

    # The tail does not trigger anything.
    client.post("/api/positions", json={"waypointId": here["id"]}, headers=auth(tail))
    assert sender.sent == []

    response = client.post("/api/positions", json={"waypointId": here["id"]}, headers=auth(head))

    assert response.status_code == 200
    ((subscription, notification),) = sender.sent
    assert subscription.endpoint == BROWSER["endpoint"]
    assert notification.title == "Desfile Magno: ya viene"
    assert subscriptions.rows == {}
