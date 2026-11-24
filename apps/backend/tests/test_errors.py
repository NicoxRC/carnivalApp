from typing import Annotated

from fastapi import FastAPI, Query
from fastapi.testclient import TestClient

from app.errors import register_error_handlers

# A minimal app with the handlers installed: the real one has no endpoint
# with parameters to validate yet.
app = FastAPI()
register_error_handlers(app)


@app.get("/things")
def list_things(limit: Annotated[int, Query(ge=1)]) -> dict[str, int]:
    return {"limit": limit}


client = TestClient(app)


def test_http_error_ok() -> None:
    response = client.get("/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"error": "No existe."}


def test_validation_error_fails() -> None:
    response = client.get("/things", params={"limit": "many"})

    assert response.status_code == 400
    body = response.json()
    assert body == {"error": "limit: debe ser un número entero."}
    assert "detail" not in body
