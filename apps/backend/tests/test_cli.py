from collections.abc import Callable

import pytest

from app.cli import create_admin
from app.permissions import Role
from app.repositories.users import UsersMemory
from app.security import verify_password


def answers(*passwords: str) -> Callable[[str], str]:
    """Stands in for `getpass`: gives the passwords in order."""
    pending = iter(passwords)
    return lambda _prompt: next(pending)


async def test_create_admin_ok(capsys: pytest.CaptureFixture[str]) -> None:
    repo = UsersMemory()

    code = await create_admin(
        repo,
        email="Ana@Example.com",
        name=" Ana ",
        ask=answers("a long password", "a long password"),
    )

    assert code == 0
    user = await repo.by_email("ana@example.com")
    assert user is not None
    assert user.name == "Ana"
    assert user.roles == {Role.ADMIN}
    assert verify_password("a long password", user.password_hash)
    # The password never reaches the screen.
    output = capsys.readouterr()
    assert "a long password" not in output.out + output.err


async def test_create_admin_fails(capsys: pytest.CaptureFixture[str]) -> None:
    repo = UsersMemory()

    code = await create_admin(
        repo, email="ana@example.com", name="Ana", ask=answers("short", "short")
    )

    assert code == 1
    assert await repo.list() == []
    assert "al menos 10 caracteres" in capsys.readouterr().err


async def test_create_admin_passwords_differ_fails() -> None:
    repo = UsersMemory()

    code = await create_admin(
        repo,
        email="ana@example.com",
        name="Ana",
        ask=answers("a long password", "another long password"),
    )

    assert code == 1
    assert await repo.list() == []


async def test_create_admin_repeated_email_fails() -> None:
    repo = UsersMemory()
    ask = "a long password", "a long password"
    assert await create_admin(repo, email="ana@example.com", name="Ana", ask=answers(*ask)) == 0

    code = await create_admin(repo, email="ANA@example.com", name="Other", ask=answers(*ask))

    assert code == 1
    assert len(await repo.list()) == 1


async def test_create_admin_invalid_email_fails() -> None:
    repo = UsersMemory()

    # It fails before asking for the password: `answers()` has none to give.
    code = await create_admin(repo, email="not-an-email", name="Ana", ask=answers())

    assert code == 1
    assert await repo.list() == []
