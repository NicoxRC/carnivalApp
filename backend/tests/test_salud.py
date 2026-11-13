from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.db import get_sesion
from app.main import app


class SesionFalsa:
    """Hace de sesión de base de datos: responde o falla, sin Postgres."""

    def __init__(self, *, falla: bool = False) -> None:
        self.falla = falla

    async def execute(self, _consulta: object) -> None:
        if self.falla:
            raise ConnectionRefusedError("sin base")


@pytest.fixture
def cliente() -> Iterator[TestClient]:
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_salud_db_ok(cliente: TestClient) -> None:
    app.dependency_overrides[get_sesion] = lambda: SesionFalsa()

    respuesta = cliente.get("/api/salud")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["ok"] is True
    assert cuerpo["db"] is True
    assert isinstance(cuerpo["hora"], int)


def test_salud_db_falla(cliente: TestClient) -> None:
    app.dependency_overrides[get_sesion] = lambda: SesionFalsa(falla=True)

    respuesta = cliente.get("/api/salud")

    assert respuesta.status_code == 503
    cuerpo = respuesta.json()
    assert cuerpo["ok"] is False
    assert cuerpo["db"] is False


def test_salud_falla(cliente: TestClient) -> None:
    respuesta = cliente.post("/api/salud")

    assert respuesta.status_code == 405
