from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.repositories.users import UsersMemory
from app.security import create_token, read_token
from tests.conftest import PASSWORD, MakeUser, auth


async def test_login_ok(client: TestClient, make_user: MakeUser) -> None:
    user = await make_user("editor", "moderator", email="ana@example.com")

    # The email in another case is the same account.
    response = client.post(
        "/api/auth/login", json={"email": "Ana@Example.com", "password": PASSWORD}
    )

    assert response.status_code == 200
    body = response.json()
    assert read_token(body["token"]) == user.id
    assert body["expiresAt"] > datetime.now(UTC).timestamp() * 1000
    assert body["user"] == {
        "id": str(user.id),
        "email": "ana@example.com",
        "name": "Someone",
        "roles": ["editor", "moderator"],
        "permissions": [
            "businesses:edit",
            "metrics:view",
            "parades:edit",
            "photos:moderate",
            "schedule:edit",
        ],
        "post": None,
    }


async def test_login_fails(client: TestClient, make_user: MakeUser) -> None:
    await make_user("editor", email="ana@example.com")

    wrong = client.post("/api/auth/login", json={"email": "ana@example.com", "password": "wrong"})
    unknown = client.post("/api/auth/login", json={"email": "no@example.com", "password": PASSWORD})

    assert wrong.status_code == 401
    assert wrong.json() == {"error": "Correo o contraseña incorrectos."}
    # An unknown email is told apart by nothing.
    assert unknown.status_code == 401
    assert unknown.json() == wrong.json()


async def test_login_deactivated_user_fails(
    client: TestClient, users: UsersMemory, make_user: MakeUser
) -> None:
    user = await make_user("editor", email="ana@example.com")
    await users.update(user.id, {"active": False})

    response = client.post(
        "/api/auth/login", json={"email": "ana@example.com", "password": PASSWORD}
    )

    assert response.status_code == 401
    assert response.json() == {"error": "Correo o contraseña incorrectos."}


def test_login_without_fields_fails(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"email": "ana@example.com"})

    assert response.status_code == 400
    assert response.json() == {"error": "password: falta."}


async def test_login_does_not_return_the_hash(client: TestClient, make_user: MakeUser) -> None:
    user = await make_user("admin")

    response = client.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})

    assert user.password_hash not in response.text
    assert "password" not in response.text.lower()


async def test_me_ok(client: TestClient, make_user: MakeUser) -> None:
    user = await make_user("reporter", post="head")

    response = client.get("/api/auth/me", headers=auth(user))

    assert response.status_code == 200
    assert response.json()["id"] == str(user.id)
    assert response.json()["post"] == "head"
    assert response.json()["permissions"] == ["positions:own"]


async def test_me_fails(client: TestClient, make_user: MakeUser) -> None:
    user = await make_user("editor")
    token = create_token(user.id)[0]
    expired = create_token(user.id, now=datetime.now(UTC) - timedelta(hours=21))[0]

    for headers in (
        {},
        {"Authorization": "Bearer not-a-token"},
        # One character of the signature changed.
        {"Authorization": f"Bearer {token[:-1]}{'A' if token[-1] != 'A' else 'B'}"},
        {"Authorization": f"Bearer {expired}"},
        {"Authorization": f"Basic {token}"},
    ):
        response = client.get("/api/auth/me", headers=headers)

        assert response.status_code == 401, headers
        assert response.json() == {"error": "Hace falta iniciar sesión."}
        assert response.headers["WWW-Authenticate"] == "Bearer"


async def test_deactivated_user_loses_the_session(
    client: TestClient, users: UsersMemory, make_user: MakeUser
) -> None:
    user = await make_user("editor")
    headers = auth(user)
    assert client.get("/api/auth/me", headers=headers).status_code == 200

    await users.update(user.id, {"active": False})

    # The token is still valid, but the user is read on every request.
    assert client.get("/api/auth/me", headers=headers).status_code == 401


async def test_deleted_user_loses_the_session(
    client: TestClient, users: UsersMemory, make_user: MakeUser
) -> None:
    user = await make_user("editor")
    headers = auth(user)

    await users.delete(user.id)

    assert client.get("/api/auth/me", headers=headers).status_code == 401


async def test_login_slows_down_after_failures(
    client: TestClient, make_user: MakeUser, sleeps: list[float]
) -> None:
    user = await make_user("editor")
    wrong = {"email": user.email, "password": "wrong"}

    for _ in range(3):
        client.post("/api/auth/login", json=wrong)
    assert sleeps == [0.5, 1.0]

    # It slows down, it does not block: the right password still gets in...
    response = client.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
    assert response.status_code == 200
    assert sleeps == [0.5, 1.0, 1.5]

    # ...and getting in clears the count.
    client.post("/api/auth/login", json=wrong)
    assert sleeps == [0.5, 1.0, 1.5]
