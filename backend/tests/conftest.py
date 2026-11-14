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
from app.repositories.courses import (  # noqa: E402
    CoursesMemory,
    forget_course,
    get_courses_repo,
)
from app.repositories.parades import (  # noqa: E402
    ParadeList,
    ParadesMemory,
    get_parade_list,
    get_parades_repo,
)
from app.repositories.users import User, UsersMemory, get_users_repo  # noqa: E402
from app.security import create_token, hash_password  # noqa: E402
from app.seed import SEED_DIR, read_course  # noqa: E402

PASSWORD = "a long password"
# Argon2 is slow on purpose: hashed once for the whole suite.
PASSWORD_HASH = hash_password(PASSWORD)


@pytest.fixture
def users() -> UsersMemory:
    return UsersMemory()


@pytest.fixture
async def courses() -> CoursesMemory:
    """With the sample course of `backend/seed/` already loaded."""
    repo = CoursesMemory()
    await repo.save(read_course(SEED_DIR))
    return repo


@pytest.fixture
def parades() -> ParadesMemory:
    return ParadesMemory()


@pytest.fixture
def sleeps() -> list[float]:
    """The waits the login brake asked for, instead of really waiting."""
    return []


@pytest.fixture
def client(
    users: UsersMemory, courses: CoursesMemory, parades: ParadesMemory, sleeps: list[float]
) -> Iterator[TestClient]:
    """The app with the repositories in memory and a brake that does not wait."""

    async def no_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    rate_limit = LoginRateLimit(sleep=no_sleep)
    parade_list = ParadeList()
    forget_course()
    app.dependency_overrides[get_users_repo] = lambda: users
    app.dependency_overrides[get_courses_repo] = lambda: courses
    app.dependency_overrides[get_parades_repo] = lambda: parades
    app.dependency_overrides[get_parade_list] = lambda: parade_list
    app.dependency_overrides[get_login_rate_limit] = lambda: rate_limit
    yield TestClient(app)
    app.dependency_overrides.clear()
    forget_course()


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
