import uuid

import pytest

from app.permissions import Role
from app.repositories.users import UserAlreadyExists, UserNotFound, UsersMemory


@pytest.fixture
def repo() -> UsersMemory:
    return UsersMemory()


async def create_ana(repo: UsersMemory, email: str = "ana@example.com") -> uuid.UUID:
    user = await repo.create(
        email=email,
        name="Ana",
        password_hash="a-hash",
        roles=["editor", "moderator"],
    )
    return user.id


async def test_create_user_ok(repo: UsersMemory) -> None:
    user = await repo.create(
        email="ana@example.com",
        name="Ana",
        password_hash="a-hash",
        roles=["reporter"],
        post="head",
    )

    assert user.active
    assert user.post == "head"
    assert user.roles == {Role.REPORTER}
    assert user.last_signal_at is None
    assert await repo.by_id(user.id) == user
    assert await repo.by_email("ana@example.com") == user
    assert await repo.list() == [user]


async def test_create_user_fails(repo: UsersMemory) -> None:
    await create_ana(repo)

    with pytest.raises(UserAlreadyExists):
        await create_ana(repo)
    with pytest.raises(ValueError):
        await repo.create(email="b@example.com", name="B", password_hash="h", roles=["emperor"])
    with pytest.raises(ValueError):
        await repo.create(
            email="c@example.com", name="C", password_hash="h", roles=["reporter"], post="front"
        )


async def test_email_is_case_insensitive(repo: UsersMemory) -> None:
    user_id = await create_ana(repo, email="Ana@Example.COM")

    found = await repo.by_email("ana@example.com")
    assert found is not None
    assert found.id == user_id
    assert found.email == "ana@example.com"
    assert await repo.by_email("ANA@EXAMPLE.COM") == found
    with pytest.raises(UserAlreadyExists):
        await create_ana(repo, email="ana@example.com")


async def test_by_id_and_by_email_fail(repo: UsersMemory) -> None:
    assert await repo.by_id(uuid.uuid4()) is None
    assert await repo.by_email("nobody@example.com") is None


async def test_update_user_ok(repo: UsersMemory) -> None:
    user_id = await create_ana(repo)

    updated = await repo.update(user_id, {"name": "Ana María", "active": False, "post": "tail"})

    assert updated.name == "Ana María"
    assert not updated.active
    assert updated.post == "tail"
    # What was not named stays as it was.
    assert updated.password_hash == "a-hash"
    assert updated.email == "ana@example.com"

    cleared = await repo.update(user_id, {"post": None})
    assert cleared.post is None
    assert cleared.name == "Ana María"


async def test_update_user_fails(repo: UsersMemory) -> None:
    with pytest.raises(UserNotFound):
        await repo.update(uuid.uuid4(), {"name": "Nobody"})


async def test_set_roles_ok(repo: UsersMemory) -> None:
    user_id = await create_ana(repo)

    updated = await repo.set_roles(user_id, ["coordinator"])

    # It replaces, it does not add.
    assert updated.roles == {Role.COORDINATOR}
    assert (await repo.set_roles(user_id, [])).roles == set()


async def test_set_roles_fails(repo: UsersMemory) -> None:
    user_id = await create_ana(repo)

    with pytest.raises(ValueError):
        await repo.set_roles(user_id, ["emperor"])
    with pytest.raises(UserNotFound):
        await repo.set_roles(uuid.uuid4(), ["editor"])


async def test_delete_user_ok(repo: UsersMemory) -> None:
    user_id = await create_ana(repo)

    await repo.delete(user_id)

    assert await repo.by_id(user_id) is None
    with pytest.raises(UserNotFound):
        await repo.delete(user_id)


async def test_mark_signal_ok(repo: UsersMemory) -> None:
    user_id = await create_ana(repo)

    await repo.mark_signal(user_id)

    user = await repo.by_id(user_id)
    assert user is not None
    assert user.last_signal_at is not None
    with pytest.raises(UserNotFound):
        await repo.mark_signal(uuid.uuid4())
