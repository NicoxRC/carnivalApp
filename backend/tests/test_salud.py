from fastapi.testclient import TestClient

from app.main import app

cliente = TestClient(app)


def test_salud_ok() -> None:
    respuesta = cliente.get("/api/salud")

    assert respuesta.status_code == 200
    assert respuesta.json() == {"ok": True}


def test_salud_falla() -> None:
    respuesta = cliente.post("/api/salud")

    assert respuesta.status_code == 405
