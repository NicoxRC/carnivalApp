import uuid

from fastapi.testclient import TestClient

from app.permissions import Role
from app.repositories.users import UsersMemory
from app.security import verify_password
from tests.conftest import PASSWORD, MakeUser, auth

URL = "/api/admin/users"
NEW = {
    "email": "Rep@Example.com",
    "name": " Reporter One ",
    "password": "another long password",
    "roles": ["reporter"],
    "post": "head",
}


async def test_list_users_ok(client: TestClient, make_user: MakeUser) -> None:
    admin = await make_user("admin")
    # `users:view` is enough to read.
    coordinator = await make_user("coordinator")

    response = client.get(URL, headers=auth(coordinator))

    assert response.status_code == 200
    assert [user["email"] for user in response.json()] == [admin.email, coordinator.email]
    assert set(response.json()[0]) == {
        "id",
        "email",
        "name",
        "roles",
        "post",
        "active",
        "lastSignalAt",
        "createdAt",
    }
    assert admin.password_hash not in response.text


async def test_list_users_fails(client: TestClient, make_user: MakeUser) -> None:
    editor = await make_user("editor")

    assert client.get(URL).status_code == 401
    assert client.get(URL, headers=auth(editor)).status_code == 403


async def test_create_user_ok(client: TestClient, users: UsersMemory, make_user: MakeUser) -> None:
    admin = await make_user("admin")

    response = client.post(URL, json=NEW, headers=auth(admin))

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "rep@example.com"
    assert body["name"] == "Reporter One"
    assert body["roles"] == ["reporter"]
    assert body["post"] == "head"
    assert body["active"] is True
    assert body["lastSignalAt"] is None
    created = await users.by_email("rep@example.com")
    assert created is not None
    assert verify_password("another long password", created.password_hash)
    # And the new user can log in.
    login = client.post(
        "/api/auth/login", json={"email": "rep@example.com", "password": "another long password"}
    )
    assert login.status_code == 200


async def test_create_user_fails(
    client: TestClient, users: UsersMemory, make_user: MakeUser
) -> None:
    editor = await make_user("editor")
    # Sees users, does not manage them.
    coordinator = await make_user("coordinator")

    assert client.post(URL, json=NEW, headers=auth(editor)).status_code == 403
    assert client.post(URL, json=NEW, headers=auth(coordinator)).status_code == 403
    assert client.post(URL, json=NEW).status_code == 401
    assert await users.by_email("rep@example.com") is None


async def test_reporter_without_post_is_400(client: TestClient, make_user: MakeUser) -> None:
    admin = await make_user("admin")

    response = client.post(URL, json={**NEW, "post": None}, headers=auth(admin))

    assert response.status_code == 400
    assert response.json() == {"error": "Un reportero necesita un puesto (cabeza, mitad o cola)."}


async def test_create_user_invalid_data_fails(
    client: TestClient, users: UsersMemory, make_user: MakeUser
) -> None:
    admin = await make_user("admin")
    headers = auth(admin)

    for change in (
        {"password": "short"},
        {"email": "not-an-email"},
        {"roles": ["emperor"]},
        {"post": "front"},
        {"name": ""},
    ):
        response = client.post(URL, json={**NEW, **change}, headers=headers)

        assert response.status_code == 400, change
        assert set(response.json()) == {"error"}
    assert len(await users.list()) == 1


async def test_create_user_repeated_email_fails(client: TestClient, make_user: MakeUser) -> None:
    admin = await make_user("admin")
    assert client.post(URL, json=NEW, headers=auth(admin)).status_code == 201

    response = client.post(URL, json={**NEW, "email": "REP@example.com"}, headers=auth(admin))

    assert response.status_code == 409
    assert response.json() == {"error": "Ya existe un usuario con ese correo."}


async def test_update_user_ok(client: TestClient, users: UsersMemory, make_user: MakeUser) -> None:
    admin = await make_user("admin")
    user = await make_user("reporter", post="head")

    response = client.patch(
        f"{URL}/{user.id}",
        json={"name": "New Name", "roles": ["editor", "moderator"], "post": None, "active": False},
        headers=auth(admin),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "New Name"
    assert body["roles"] == ["editor", "moderator"]
    assert body["post"] is None
    assert body["active"] is False
    # What was not sent stays: the password still works.
    stored = await users.by_id(user.id)
    assert stored is not None
    assert verify_password(PASSWORD, stored.password_hash)


async def test_update_user_resets_the_password(
    client: TestClient, users: UsersMemory, make_user: MakeUser
) -> None:
    admin = await make_user("admin")
    user = await make_user("editor")

    response = client.patch(
        f"{URL}/{user.id}", json={"password": "a brand new password"}, headers=auth(admin)
    )

    assert response.status_code == 200
    stored = await users.by_id(user.id)
    assert stored is not None
    assert verify_password("a brand new password", stored.password_hash)
    assert not verify_password(PASSWORD, stored.password_hash)
    # Nothing else moved.
    assert stored.roles == {Role.EDITOR}


async def test_update_user_fails(client: TestClient, make_user: MakeUser) -> None:
    admin = await make_user("admin")
    editor = await make_user("editor")
    reporter = await make_user("reporter", post="tail")
    headers = auth(admin)

    assert (
        client.patch(f"{URL}/{uuid.uuid4()}", json={"name": "X"}, headers=headers).status_code
        == 404
    )
    assert client.patch(f"{URL}/not-a-uuid", json={"name": "X"}, headers=headers).status_code == 400
    assert (
        client.patch(f"{URL}/{admin.id}", json={"name": "X"}, headers=auth(editor)).status_code
        == 403
    )
    assert (
        client.patch(f"{URL}/{editor.id}", json={"password": "short"}, headers=headers).status_code
        == 400
    )
    # Clearing the post of a reporter, or making a reporter of someone without one.
    assert (
        client.patch(f"{URL}/{reporter.id}", json={"post": None}, headers=headers).status_code
        == 400
    )
    assert (
        client.patch(
            f"{URL}/{editor.id}", json={"roles": ["reporter"]}, headers=headers
        ).status_code
        == 400
    )


async def test_admin_cannot_lock_themselves_out(
    client: TestClient, users: UsersMemory, make_user: MakeUser
) -> None:
    admin = await make_user("admin")
    headers = auth(admin)

    no_role = client.patch(f"{URL}/{admin.id}", json={"roles": ["editor"]}, headers=headers)
    inactive = client.patch(f"{URL}/{admin.id}", json={"active": False}, headers=headers)
    deleted = client.delete(f"{URL}/{admin.id}", headers=headers)

    assert no_role.status_code == 400
    assert no_role.json() == {"error": "No podés quitarte a vos mismo el rol de admin."}
    assert inactive.status_code == 400
    assert deleted.status_code == 400
    stored = await users.by_id(admin.id)
    assert stored is not None
    assert stored.active
    assert stored.roles == {Role.ADMIN}
    # Adding roles to oneself, keeping admin, is fine.
    assert (
        client.patch(
            f"{URL}/{admin.id}", json={"roles": ["admin", "editor"]}, headers=headers
        ).status_code
        == 200
    )


async def test_delete_user_ok(client: TestClient, users: UsersMemory, make_user: MakeUser) -> None:
    admin = await make_user("admin")
    user = await make_user("editor")

    response = client.delete(f"{URL}/{user.id}", headers=auth(admin))

    assert response.status_code == 204
    assert await users.by_id(user.id) is None


async def test_delete_user_fails(
    client: TestClient, users: UsersMemory, make_user: MakeUser
) -> None:
    admin = await make_user("admin")
    editor = await make_user("editor")
    reporter = await make_user("reporter", post="head")
    await users.mark_signal(reporter.id)

    assert client.delete(f"{URL}/{uuid.uuid4()}", headers=auth(admin)).status_code == 404
    assert client.delete(f"{URL}/{reporter.id}", headers=auth(editor)).status_code == 403
    # Already reported: deleting would lose who reported what.
    response = client.delete(f"{URL}/{reporter.id}", headers=auth(admin))
    assert response.status_code == 409
    assert response.json() == {
        "error": "Ese usuario ya envió posiciones: desactivalo en vez de borrarlo."
    }
    assert await users.by_id(reporter.id) is not None
