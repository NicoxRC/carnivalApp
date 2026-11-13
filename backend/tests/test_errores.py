from typing import Annotated

from fastapi import FastAPI, Query
from fastapi.testclient import TestClient

from app.errores import registrar_errores

# Una app mínima con los manejadores puestos: la real todavía no tiene
# ningún endpoint con parámetros que validar.
app = FastAPI()
registrar_errores(app)


@app.get("/cosas")
def listar_cosas(limite: Annotated[int, Query(ge=1)]) -> dict[str, int]:
    return {"limite": limite}


cliente = TestClient(app)


def test_error_http_ok() -> None:
    respuesta = cliente.get("/no-existe")

    assert respuesta.status_code == 404
    assert respuesta.json() == {"error": "No existe."}


def test_error_validacion_falla() -> None:
    respuesta = cliente.get("/cosas", params={"limite": "muchas"})

    assert respuesta.status_code == 400
    cuerpo = respuesta.json()
    assert cuerpo == {"error": "limite: debe ser un número entero."}
    assert "detail" not in cuerpo
