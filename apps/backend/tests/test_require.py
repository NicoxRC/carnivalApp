from typing import Annotated

from fastapi import APIRouter
from fastapi.testclient import TestClient

from app.main import app
from app.permissions import Permission
from app.repositories.users import User
from app.security import require
from tests.conftest import MakeUser, auth

# Routes only for these tests: one asks for a permission, the other for two.
router = APIRouter(prefix="/test-require")


@router.get("/state", dependencies=[require(Permission.PARADES_STATE)])
async def needs_state() -> dict[str, bool]:
    return {"ok": True}


@router.get("/both")
async def needs_both(
    user: Annotated[User, require(Permission.PARADES_STATE, Permission.PHOTOS_MODERATE)],
) -> dict[str, str]:
    return {"email": user.email}


app.include_router(router)


async def test_require_ok(client: TestClient, make_user: MakeUser) -> None:
    coordinator = await make_user("coordinator")
    admin = await make_user("admin")

    assert client.get("/test-require/state", headers=auth(coordinator)).json() == {"ok": True}
    # The dependency also hands the user to the endpoint.
    assert client.get("/test-require/both", headers=auth(admin)).json() == {"email": admin.email}


async def test_require_fails(client: TestClient, make_user: MakeUser) -> None:
    moderator = await make_user("moderator")

    response = client.get("/test-require/state", headers=auth(moderator))

    assert response.status_code == 403
    assert response.json() == {"error": "No tenés permiso para esto."}


async def test_require_needs_every_permission(client: TestClient, make_user: MakeUser) -> None:
    # Has `parades:state` but not `photos:moderate`.
    coordinator = await make_user("coordinator")
    both = await make_user("coordinator", "moderator", email="both@example.com")

    assert client.get("/test-require/both", headers=auth(coordinator)).status_code == 403
    assert client.get("/test-require/both", headers=auth(both)).status_code == 200


def test_no_token_is_401_not_403(client: TestClient) -> None:
    response = client.get("/test-require/state")

    assert response.status_code == 401
    assert response.json() == {"error": "Hace falta iniciar sesión."}
