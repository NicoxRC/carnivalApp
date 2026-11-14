import pytest
from fastapi.testclient import TestClient

from app.domain.businesses import BusinessError, clean_business
from app.repositories.businesses import BusinessesMemory
from tests.conftest import MakeUser, auth

ADMIN = "/api/admin/businesses"
BUSINESS = {
    "name": " Asadero El Fogón ",
    "category": "restaurant",
    "description": "Cuy asado, gallina y fritanga.",
    "address": "A media cuadra de Cristo Rey",
    "hours": "10:00 a. m. – 11:00 p. m.",
    "lat": 1.22235,
    "lng": -77.28545,
    "plan": "featured",
    "offer": "Segundo jugo gratis",
    "offerTiming": "before",
    "menu": [{"name": "Cuy", "price": "$60.000"}, {"name": "  ", "price": "x"}, "junk"],
    "whatsapp": "300 123 4567",
    "link": "instagram.com/elfogon",
}


def fields(**changes: object) -> dict[str, object]:
    """The body as `clean_business` gets it: Python names."""
    raw = {**BUSINESS, **changes}
    raw["offer_timing"] = raw.pop("offerTiming")
    return raw


# --- the rules -------------------------------------------------------------


def test_clean_business_ok() -> None:
    business = clean_business(fields(), "c-01")

    assert business.name == "Asadero El Fogón"
    assert business.plan == "featured"
    assert business.offer == "Segundo jugo gratis"
    assert business.offer_timing == "before"
    # Items without a name and things that are not items are dropped.
    assert [(item.name, item.price) for item in business.menu] == [("Cuy", "$60.000")]
    # A 10-digit Colombian mobile gets its country code.
    assert business.whatsapp == "573001234567"
    assert business.link == "https://instagram.com/elfogon"
    assert business.visible


def test_clean_business_fails() -> None:
    for changes, message in (
        ({"name": "  "}, "Falta el nombre."),
        ({"category": "casino"}, "Categoría inválida."),
        ({"lat": 91}, "Falta marcar el punto en el mapa."),
        ({"lng": None}, "Falta marcar el punto en el mapa."),
        ({"lat": float("nan")}, "Falta marcar el punto en el mapa."),
    ):
        with pytest.raises(BusinessError, match=message):
            clean_business(fields(**changes), "c-01")


def test_service_never_has_plan_or_offer() -> None:
    toilet = clean_business(fields(category="toilet"), "s-01")

    # A service is never advertising, whatever the panel sends.
    assert toilet.plan is None
    assert toilet.offer is None
    assert toilet.offer_timing == "always"
    assert toilet.menu == []
    assert toilet.whatsapp is None
    assert toilet.link is None
    # It is still on the map, with what helps to find it.
    assert toilet.address == "A media cuadra de Cristo Rey"


def test_without_a_plan_there_is_nothing_to_sell() -> None:
    for plan in (None, "gold"):
        business = clean_business(fields(plan=plan), "c-01")

        assert business.plan is None
        assert (business.offer, business.menu, business.whatsapp, business.link) == (
            None,
            [],
            None,
            None,
        )


def test_links_and_whatsapp_are_cleaned() -> None:
    def link(value: object) -> str | None:
        return clean_business(fields(link=value), "c-01").link

    assert link("https://example.com/menu") == "https://example.com/menu"
    assert link("HTTP://example.com") == "HTTP://example.com"
    assert link("example.com:8080/menu") == "https://example.com:8080/menu"
    # Only http(s): anything else would end up in a link the public taps.
    assert link("javascript:alert(1)") is None
    assert link("data:text/html,x") is None
    assert link("") is None

    def whatsapp(value: object) -> str | None:
        return clean_business(fields(whatsapp=value), "c-01").whatsapp

    assert whatsapp("+57 300 123 4567") == "573001234567"
    assert whatsapp("12345") is None
    assert whatsapp(None) is None


# --- the panel -------------------------------------------------------------


async def test_save_business_ok(
    client: TestClient, businesses: BusinessesMemory, make_user: MakeUser
) -> None:
    headers = auth(await make_user("editor"))

    response = client.put(f"{ADMIN}/c-01", json=BUSINESS, headers=headers)

    assert response.status_code == 200
    saved = response.json()
    assert saved == {
        "id": "c-01",
        "name": "Asadero El Fogón",
        "category": "restaurant",
        "description": "Cuy asado, gallina y fritanga.",
        "address": "A media cuadra de Cristo Rey",
        "hours": "10:00 a. m. – 11:00 p. m.",
        "lat": 1.22235,
        "lng": -77.28545,
        "plan": "featured",
        "offer": "Segundo jugo gratis",
        "offerTiming": "before",
        "menu": [{"name": "Cuy", "price": "$60.000"}],
        "whatsapp": "573001234567",
        "link": "https://instagram.com/elfogon",
        "visible": True,
    }
    assert client.get(ADMIN, headers=headers).json() == {"businesses": [saved], "metrics": {}}
    # Again with the same id: it replaces it.
    client.put(f"{ADMIN}/c-01", json={**BUSINESS, "name": "Otro nombre"}, headers=headers)
    assert [b.name for b in await businesses.list()] == ["Otro nombre"]


async def test_save_business_fails(
    client: TestClient, businesses: BusinessesMemory, make_user: MakeUser
) -> None:
    headers = auth(await make_user("editor"))

    response = client.put(f"{ADMIN}/c-01", json={**BUSINESS, "lat": 91}, headers=headers)

    assert response.status_code == 400
    assert response.json() == {"error": "Falta marcar el punto en el mapa."}
    assert client.put(
        f"{ADMIN}/c-01", json={**BUSINESS, "category": "casino"}, headers=headers
    ).json() == {"error": "Categoría inválida."}
    assert client.put(f"{ADMIN}/Not%20An%20Id", json=BUSINESS, headers=headers).status_code == 400
    moderator = await make_user("moderator")
    assert client.put(f"{ADMIN}/c-01", json=BUSINESS, headers=auth(moderator)).status_code == 403
    assert client.get(ADMIN, headers=auth(moderator)).status_code == 403
    assert client.get(ADMIN).status_code == 401
    assert businesses.rows == {}


async def test_the_public_sees_only_the_visible_ones(
    client: TestClient, make_user: MakeUser
) -> None:
    headers = auth(await make_user("editor"))
    client.put(f"{ADMIN}/c-01", json=BUSINESS, headers=headers)
    client.put(
        f"{ADMIN}/c-02", json={**BUSINESS, "name": "Cerrado hoy", "visible": False}, headers=headers
    )

    response = client.get("/api/businesses")

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "public, max-age=60, stale-while-revalidate=600"
    assert [b["id"] for b in response.json()["businesses"]] == ["c-01"]
    # The panel sees them all.
    assert len(client.get(ADMIN, headers=headers).json()["businesses"]) == 2


async def test_delete_business_ok(
    client: TestClient, businesses: BusinessesMemory, make_user: MakeUser
) -> None:
    headers = auth(await make_user("editor"))
    client.put(f"{ADMIN}/c-01", json=BUSINESS, headers=headers)
    client.post("/api/businesses/event", json={"id": "c-01", "type": "card"})

    assert client.delete(f"{ADMIN}/c-01", headers=headers).status_code == 204
    assert businesses.rows == {}
    # Its counters go with it.
    assert businesses.counters == {}
    missing = client.delete(f"{ADMIN}/c-01", headers=headers)
    assert missing.status_code == 404
    assert missing.json() == {"error": "No existe ese comercio."}


# --- metrics ---------------------------------------------------------------


async def test_add_metric_ok(client: TestClient, make_user: MakeUser) -> None:
    headers = auth(await make_user("editor"))
    client.put(f"{ADMIN}/c-01", json=BUSINESS, headers=headers)

    # Anonymous: no token, nothing about who taps.
    for kind in ("card", "card", "whatsapp"):
        response = client.post("/api/businesses/event", json={"id": "c-01", "type": kind})

        assert response.status_code == 200
        assert response.json() == {"ok": True}

    assert client.get(ADMIN, headers=headers).json()["metrics"] == {
        "c-01": {"card": 2, "whatsapp": 1}
    }
    # A business that does not exist is not counted, and nobody is told.
    assert client.post("/api/businesses/event", json={"id": "c-99", "type": "card"}).json() == {
        "ok": True
    }
    assert "c-99" not in client.get(ADMIN, headers=headers).json()["metrics"]


def test_add_metric_fails(client: TestClient) -> None:
    for body in (
        {"id": "c-01", "type": "share"},
        {"id": "x" * 65, "type": "card"},
        {"type": "card"},
        {},
    ):
        response = client.post("/api/businesses/event", json=body)

        assert response.status_code == 400, body
        assert response.json() == {"error": "Datos inválidos."}


async def test_a_counter_that_fails_does_not_break_the_map(
    client: TestClient, businesses: BusinessesMemory
) -> None:
    async def broken(business_id: str, type: str) -> None:
        raise RuntimeError("the database is down")

    businesses.add_metric = broken  # type: ignore[method-assign, assignment]

    response = client.post("/api/businesses/event", json={"id": "c-01", "type": "card"})

    assert response.status_code == 200
    assert response.json() == {"ok": True}


async def test_metrics_need_their_own_permission(
    client: TestClient,
    businesses: BusinessesMemory,
    make_user: MakeUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app import permissions

    headers = auth(await make_user("editor"))
    client.put(f"{ADMIN}/c-01", json=BUSINESS, headers=headers)
    client.post("/api/businesses/event", json={"id": "c-01", "type": "card"})
    assert client.get(ADMIN, headers=headers).json()["metrics"] == {"c-01": {"card": 1}}

    # An editor who edits businesses but may not see the numbers.
    without = permissions.PERMISSIONS_BY_ROLE[permissions.Role.EDITOR] - {
        permissions.Permission.METRICS_VIEW
    }
    monkeypatch.setitem(permissions.PERMISSIONS_BY_ROLE, permissions.Role.EDITOR, without)

    body = client.get(ADMIN, headers=headers).json()
    assert len(body["businesses"]) == 1
    assert body["metrics"] == {}
