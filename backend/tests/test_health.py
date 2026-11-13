from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.db import get_session
from app.main import app


class FakeSession:
    """Stands in for a database session: answers or fails, without Postgres."""

    def __init__(self, *, fails: bool = False) -> None:
        self.fails = fails

    async def execute(self, _query: object) -> None:
        if self.fails:
            raise ConnectionRefusedError("no database")


@pytest.fixture
def client() -> Iterator[TestClient]:
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_health_db_ok(client: TestClient) -> None:
    app.dependency_overrides[get_session] = lambda: FakeSession()

    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["db"] is True
    assert isinstance(body["time"], int)


def test_health_db_fails(client: TestClient) -> None:
    app.dependency_overrides[get_session] = lambda: FakeSession(fails=True)

    response = client.get("/api/health")

    assert response.status_code == 503
    body = response.json()
    assert body["ok"] is False
    assert body["db"] is False


def test_health_fails(client: TestClient) -> None:
    response = client.post("/api/health")

    assert response.status_code == 405
