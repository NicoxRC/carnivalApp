import os

# The app reads its settings on import. Tests always use these values, never
# the environment of whoever runs them.
os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@localhost:5432/test"
os.environ["JWT_SECRET"] = "test-secret-only-for-the-test-suite"

from collections.abc import Awaitable, Callable, Iterator  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.rate_limits import LoginRateLimit, get_login_rate_limit  # noqa: E402
from app.repositories.users import User, UsersMemory, get_users_repo  # noqa: E402
from app.security import create_token, hash_password  # noqa: E402

PASSWORD = "a long password"
# Argon2 is slow on purpose: hashed once for the whole suite.
PASSWORD_HASH = hash_password(PASSWORD)


@pytest.fixture
def users() -> UsersMemory:
    return UsersMemory()


@pytest.fixture
def sleeps() -> list[float]:
    """The waits the login brake asked for, instead of really waiting."""
    return []


@pytest.fixture
def client(users: UsersMemory, sleeps: list[float]) -> Iterator[TestClient]:
    """The app with the repositories in memory and a brake that does not wait."""

    async def no_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    rate_limit = LoginRateLimit(sleep=no_sleep)
    app.dependency_overrides[get_users_repo] = lambda: users
    app.dependency_overrides[get_login_rate_limit] = lambda: rate_limit
    yield TestClient(app)
    app.dependency_overrides.clear()


MakeUser = Callable[..., Awaitable[User]]


@pytest.fixture
def make_user(users: UsersMemory) -> MakeUser:
    async def make(*roles: str, email: str | None = None, post: str | None = None) -> User:
        return await users.create(
            email=email or f"{'-'.join(roles) or 'nobody'}@example.com",
            name="Someone",
            password_hash=PASSWORD_HASH,
            roles=roles,
            post=post,
        )

    return make


def auth(user: User) -> dict[str, str]:
    """The header a logged-in client sends."""
    return {"Authorization": f"Bearer {create_token(user.id)[0]}"}
