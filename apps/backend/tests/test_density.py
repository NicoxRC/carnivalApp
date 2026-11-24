from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.devices import issue_device, valid_device
from app.domain.constants import DENSITY_WINDOW, DEVICES_PER_IP_PER_HOUR
from app.domain.density import bin_of_metres, classify, total_bins
from app.rate_limits import DeviceIssueLimit
from app.repositories.parades import ParadesMemory
from app.repositories.presences import PresencesMemory

LENGTH = 4106.24


async def add_parade(parades: ParadesMemory) -> None:
    await parades.save(
        id="d6-1", name="Desfile Magno", date="2999-01-06", start_time="10:00", course_id="c"
    )


# --- the calculation -------------------------------------------------------


def test_classify_ok() -> None:
    # 60 users: 30 on one stretch, 20 on another, 10 on a third.
    density = classify({5: 30, 6: 20, 12: 10}, 60, LENGTH)

    assert density.enough
    assert density.total == 60
    assert density.window_min == 5
    assert [(b.bin, b.count, b.level) for b in density.bins] == [
        (5, 30, "full"),
        (6, 20, "full"),
        (12, 10, "busy"),
    ]
    assert (density.bins[0].from_m, density.bins[0].to_m) == (500, 600)


def test_classify_fails() -> None:
    density = classify({5: 30, 6: 10}, 40, LENGTH)

    # 40 users stand for nothing: the layer is off, it is not an empty course.
    assert not density.enough
    assert density.bins == []
    assert density.total == 40


def test_stretch_with_few_samples_does_not_appear() -> None:
    density = classify({5: 40, 6: 9, 7: 2, 8: 1}, 52, LENGTH)

    # 2 and 1 reports say nothing about a stretch: no data is not "calm".
    assert [b.bin for b in density.bins] == [5, 6]
    assert density.bins[1].level == "calm"


def test_classify_edges() -> None:
    # Enough users, but nobody together: nothing can be said either.
    spread = classify({n: 2 for n in range(30)}, 60, LENGTH)
    assert not spread.enough
    # Exactly the thresholds.
    exact = classify({1: 47, 2: 3}, 50, LENGTH)
    assert exact.enough
    assert [b.bin for b in exact.bins] == [1, 2]
    # The last stretch ends where the course does.
    last = classify({41: 50}, 50, LENGTH)
    assert last.bins[0].to_m == LENGTH


def test_bins_of_the_course() -> None:
    assert total_bins(LENGTH) == 42
    assert bin_of_metres(0, LENGTH) == 0
    assert bin_of_metres(250, LENGTH) == 2
    # Clamped to the course at both ends.
    assert bin_of_metres(-50, LENGTH) == 0
    assert bin_of_metres(99999, LENGTH) == 41


# --- device ids ------------------------------------------------------------


def test_valid_device_ok() -> None:
    token = issue_device()

    device_id = valid_device(token)

    assert device_id is not None
    assert token.startswith(f"{device_id}.")
    assert len(token) <= 64
    # Each one is different.
    assert issue_device() != token


def test_valid_device_fails() -> None:
    token = issue_device()
    device_id, signature = token.split(".")
    tampered = f"{device_id}.{'A' if signature[0] != 'A' else 'B'}{signature[1:]}"

    assert valid_device(tampered) is None
    # Someone else's signature on a made-up id.
    assert valid_device(f"made-up-id.{signature}") is None
    for junk in ("", "no-dot", ".only-signature", "only-id.", "x" * 65, None, 42):
        assert valid_device(junk) is None


def test_issuing_301_from_the_same_ip_is_429(client: TestClient) -> None:
    for _ in range(DEVICES_PER_IP_PER_HOUR):
        assert client.post("/api/device").status_code == 200

    response = client.post("/api/device")

    assert response.status_code == 429
    assert response.json() == {"error": "Demasiados dispositivos desde esta red."}
    # Another network is not affected.
    other = client.post("/api/device", headers={"X-Real-IP": "203.0.113.7"})
    assert other.status_code == 200
    assert valid_device(other.json()["device"]) is not None


def test_device_limit_forgets_after_an_hour() -> None:
    now = [0.0]
    limit = DeviceIssueLimit(limit=2, clock=lambda: now[0])

    assert [limit.allow("1.1.1.1") for _ in range(3)] == [True, True, False]
    now[0] += DeviceIssueLimit.WINDOW_S + 1
    assert limit.allow("1.1.1.1")


# --- /api/density ----------------------------------------------------------


async def test_density_post_ok(
    client: TestClient, parades: ParadesMemory, presences: PresencesMemory
) -> None:
    await add_parade(parades)
    device = client.post("/api/device").json()["device"]

    response = client.post("/api/density", json={"device": device, "bin": 7})

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    # What is stored: the stretch, and the id without its signature.
    assert list(presences.rows) == [("d6-1", device.split(".")[0])]
    assert presences.rows[("d6-1", device.split(".")[0])][0] == 7


async def test_density_post_fails(
    client: TestClient, parades: ParadesMemory, presences: PresencesMemory
) -> None:
    await add_parade(parades)
    device = issue_device()

    for bin_number in (42, -1, 999):
        response = client.post("/api/density", json={"device": device, "bin": bin_number})

        assert response.status_code == 400
        assert response.json() == {"error": "bin fuera de la senda."}
    # A made-up device is a 401: the client asks for a new one.
    unknown = client.post("/api/density", json={"device": "made-up.signature", "bin": 7})
    assert unknown.status_code == 401
    assert unknown.json() == {"error": "Dispositivo no reconocido."}
    assert client.post("/api/density", json={"bin": 7}).status_code == 401
    assert client.post("/api/density", json={"device": device}).status_code == 400
    assert presences.rows == {}


def test_density_without_a_parade_fails(client: TestClient) -> None:
    assert client.post("/api/density", json={"device": issue_device(), "bin": 7}).status_code == 404
    response = client.get("/api/density")
    assert response.status_code == 404
    assert response.json() == {"error": "No hay desfile."}


async def test_same_device_counts_once(
    client: TestClient, parades: ParadesMemory, presences: PresencesMemory
) -> None:
    await add_parade(parades)
    device = issue_device()

    for bin_number in (7, 7, 8):
        client.post("/api/density", json={"device": device, "bin": bin_number})

    # Reporting again moves the device, it does not add another.
    assert await presences.counts("d6-1") == ({8: 1}, 1)


async def test_density_get_ok(client: TestClient, parades: ParadesMemory) -> None:
    await add_parade(parades)
    for bin_number, devices in ((5, 30), (6, 20), (12, 2)):
        for _ in range(devices):
            client.post("/api/density", json={"device": issue_device(), "bin": bin_number})

    response = client.get("/api/density")

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    body = response.json()
    assert set(body) == {"bins", "total", "enough", "windowMin", "serverTs"}
    assert (body["total"], body["enough"], body["windowMin"]) == (52, True, 5)
    assert body["bins"] == [
        {"bin": 5, "fromM": 500, "toM": 600, "count": 30, "level": "full"},
        {"bin": 6, "fromM": 600, "toM": 700, "count": 20, "level": "full"},
    ]
    # Only the aggregate leaves: no device id anywhere.
    assert "device" not in response.text


async def test_density_get_with_few_users_says_so(
    client: TestClient, parades: ParadesMemory
) -> None:
    await add_parade(parades)
    for _ in range(10):
        client.post("/api/density", json={"device": issue_device(), "bin": 5})

    body = client.get("/api/density").json()

    assert (body["total"], body["enough"], body["bins"]) == (10, False, [])


async def test_old_presences_fall_out_of_the_window(presences: PresencesMemory) -> None:
    await presences.record("d6-1", "old", 3)
    presences.rows[("d6-1", "old")] = (3, datetime.now(UTC) - DENSITY_WINDOW - timedelta(seconds=1))

    # It no longer counts...
    assert await presences.counts("d6-1") == ({}, 0)
    # ...and the next report from anyone clears it out.
    await presences.record("d6-1", "new", 4)
    assert list(presences.rows) == [("d6-1", "new")]
