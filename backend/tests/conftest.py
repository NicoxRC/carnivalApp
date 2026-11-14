import os

# The app reads its settings on import. Tests always use these values, never
# the environment of whoever runs them.
os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@localhost:5432/test"
os.environ["JWT_SECRET"] = "test-secret-only-for-the-test-suite"

from collections.abc import Awaitable, Callable, Iterator  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.live import RepoStateReader, get_state_reader  # noqa: E402
from app.main import app  # noqa: E402
from app.rate_limits import (  # noqa: E402
    DeviceIssueLimit,
    LoginRateLimit,
    get_device_issue_limit,
    get_login_rate_limit,
)
from app.realtime import Broadcaster, get_broadcaster  # noqa: E402
from app.repositories.announcements import (  # noqa: E402
    AnnouncementsMemory,
    get_announcements_repo,
)
from app.repositories.businesses import BusinessesMemory, get_businesses_repo  # noqa: E402
from app.repositories.courses import (  # noqa: E402
    CoursesMemory,
    forget_course,
    get_courses_repo,
)
from app.repositories.events import EventsMemory, get_events_repo  # noqa: E402
from app.repositories.parades import (  # noqa: E402
    ParadeList,
    ParadesMemory,
    get_parade_list,
    get_parades_repo,
)
from app.repositories.presences import PresencesMemory, get_presences_repo  # noqa: E402
from app.repositories.state import StateMemory, get_state_repo  # noqa: E402
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
def parade_list() -> ParadeList:
    return ParadeList()


@pytest.fixture
def broadcaster() -> Broadcaster:
    return Broadcaster()


@pytest.fixture
def state(parades: ParadesMemory, users: UsersMemory, broadcaster: Broadcaster) -> StateMemory:
    return StateMemory(parades, users, broadcaster)


@pytest.fixture
def announcements(broadcaster: Broadcaster) -> AnnouncementsMemory:
    return AnnouncementsMemory(broadcaster)


@pytest.fixture
def events() -> EventsMemory:
    return EventsMemory()


@pytest.fixture
def businesses() -> BusinessesMemory:
    return BusinessesMemory()


@pytest.fixture
def reader(
    parades: ParadesMemory,
    state: StateMemory,
    parade_list: ParadeList,
    announcements: AnnouncementsMemory,
) -> RepoStateReader:
    return RepoStateReader(parades, state, parade_list, announcements)


@pytest.fixture
def presences() -> PresencesMemory:
    return PresencesMemory()


@pytest.fixture
def sleeps() -> list[float]:
    """The waits the login brake asked for, instead of really waiting."""
    return []


@pytest.fixture
def client(
    users: UsersMemory,
    courses: CoursesMemory,
    parades: ParadesMemory,
    parade_list: ParadeList,
    state: StateMemory,
    reader: RepoStateReader,
    broadcaster: Broadcaster,
    presences: PresencesMemory,
    announcements: AnnouncementsMemory,
    events: EventsMemory,
    businesses: BusinessesMemory,
    sleeps: list[float],
) -> Iterator[TestClient]:
    """The app with the repositories in memory and a brake that does not wait."""

    async def no_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    rate_limit = LoginRateLimit(sleep=no_sleep)
    device_limit = DeviceIssueLimit()
    forget_course()
    app.dependency_overrides[get_users_repo] = lambda: users
    app.dependency_overrides[get_courses_repo] = lambda: courses
    app.dependency_overrides[get_parades_repo] = lambda: parades
    app.dependency_overrides[get_parade_list] = lambda: parade_list
    app.dependency_overrides[get_state_repo] = lambda: state
    app.dependency_overrides[get_state_reader] = lambda: reader
    app.dependency_overrides[get_broadcaster] = lambda: broadcaster
    app.dependency_overrides[get_presences_repo] = lambda: presences
    app.dependency_overrides[get_announcements_repo] = lambda: announcements
    app.dependency_overrides[get_events_repo] = lambda: events
    app.dependency_overrides[get_businesses_repo] = lambda: businesses
    app.dependency_overrides[get_device_issue_limit] = lambda: device_limit
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
