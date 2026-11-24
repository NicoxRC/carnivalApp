"""Users repository: routers talk to this, never to SQL.

`UsersRepo` is the interface. `UsersPostgres` is the real one and
`UsersMemory` the one tests use, so they are fast and need no database. Both
hand out the same plain `User`, with its roles already in it.
"""

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Annotated, Protocol, TypedDict

from fastapi import Depends
from sqlalchemy import ColumnElement, delete, func, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionDep
from app.models import User as UserRow
from app.models import UserRole as UserRoleRow
from app.permissions import Role

POSTS = frozenset({"head", "middle", "tail"})


class UserAlreadyExists(Exception):
    """There is already a user with that email."""


class UserNotFound(Exception):
    """No user has that id."""


@dataclass(frozen=True, slots=True)
class User:
    id: uuid.UUID
    email: str
    name: str
    password_hash: str
    post: str | None
    active: bool
    roles: frozenset[Role]
    last_signal_at: datetime | None
    created_at: datetime


class UserChanges(TypedDict, total=False):
    """What `update` may change. A key that is absent is left as it is."""

    name: str
    password_hash: str
    post: str | None
    active: bool


class UsersRepo(Protocol):
    async def create(
        self,
        *,
        email: str,
        name: str,
        password_hash: str,
        roles: Iterable[str],
        post: str | None = None,
    ) -> User:
        """Raises `UserAlreadyExists` if the email is taken."""
        ...

    async def by_email(self, email: str) -> User | None: ...

    async def by_id(self, user_id: uuid.UUID) -> User | None: ...

    async def list(self) -> Sequence[User]:
        """Every user, oldest first."""
        ...

    async def update(self, user_id: uuid.UUID, changes: UserChanges) -> User:
        """Raises `UserNotFound`. The email cannot be changed."""
        ...

    async def set_roles(self, user_id: uuid.UUID, roles: Iterable[str]) -> User:
        """Replaces all the roles of the user. Raises `UserNotFound`."""
        ...

    async def delete(self, user_id: uuid.UUID) -> None:
        """Raises `UserNotFound`."""
        ...

    async def mark_signal(self, user_id: uuid.UUID) -> None:
        """Notes that the user has just sent a position. Raises `UserNotFound`."""
        ...


def normalize_email(email: str) -> str:
    """`Ana@X.com` and `ana@x.com` are the same account."""
    return email.strip().lower()


def _roles(roles: Iterable[str]) -> frozenset[Role]:
    # `Role(...)` raises ValueError on a role that does not exist.
    return frozenset(Role(role) for role in roles)


def _post(post: str | None) -> str | None:
    if post is not None and post not in POSTS:
        raise ValueError(f"Unknown post: {post!r}")
    return post


class UsersPostgres:
    """Every write commits: each operation is complete on its own."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        *,
        email: str,
        name: str,
        password_hash: str,
        roles: Iterable[str],
        post: str | None = None,
    ) -> User:
        wanted = _roles(roles)
        row = UserRow(
            email=normalize_email(email),
            name=name,
            password_hash=password_hash,
            post=_post(post),
        )
        self._session.add(row)
        try:
            # The insert goes out here, so the unique email fails here too.
            await self._session.flush()
        except IntegrityError as error:
            await self._session.rollback()
            raise UserAlreadyExists(row.email) from error
        await self._insert_roles(row.id, wanted)
        await self._session.commit()
        return await self._require(row.id)

    async def by_email(self, email: str) -> User | None:
        found = await self._fetch(UserRow.email == normalize_email(email))
        return found[0] if found else None

    async def by_id(self, user_id: uuid.UUID) -> User | None:
        found = await self._fetch(UserRow.id == user_id)
        return found[0] if found else None

    async def list(self) -> Sequence[User]:
        return await self._fetch()

    async def update(self, user_id: uuid.UUID, changes: UserChanges) -> User:
        if "post" in changes:
            _post(changes["post"])
        if changes:
            await self._session.execute(
                update(UserRow).where(UserRow.id == user_id).values(**changes)
            )
            await self._session.commit()
        return await self._require(user_id)

    async def set_roles(self, user_id: uuid.UUID, roles: Iterable[str]) -> User:
        wanted = _roles(roles)
        await self._require(user_id)
        await self._session.execute(delete(UserRoleRow).where(UserRoleRow.user_id == user_id))
        await self._insert_roles(user_id, wanted)
        await self._session.commit()
        return await self._require(user_id)

    async def delete(self, user_id: uuid.UUID) -> None:
        # The roles go with it: the foreign key deletes in cascade.
        deleted = await self._session.scalar(
            delete(UserRow).where(UserRow.id == user_id).returning(UserRow.id)
        )
        await self._session.commit()
        if deleted is None:
            raise UserNotFound(user_id)

    async def mark_signal(self, user_id: uuid.UUID) -> None:
        marked = await self._session.scalar(
            update(UserRow)
            .where(UserRow.id == user_id)
            .values(last_signal_at=func.now())
            .returning(UserRow.id)
        )
        await self._session.commit()
        if marked is None:
            raise UserNotFound(user_id)

    async def _insert_roles(self, user_id: uuid.UUID, roles: frozenset[Role]) -> None:
        if roles:
            await self._session.execute(
                insert(UserRoleRow),
                [{"user_id": user_id, "role": role.value} for role in roles],
            )

    async def _require(self, user_id: uuid.UUID) -> User:
        user = await self.by_id(user_id)
        if user is None:
            raise UserNotFound(user_id)
        return user

    async def _fetch(self, *conditions: ColumnElement[bool]) -> Sequence[User]:
        """Users that match, with their roles, in two queries.

        `Sequence` and not `list`: inside this class `list` is the method.
        """
        query = select(
            UserRow.id,
            UserRow.email,
            UserRow.name,
            UserRow.password_hash,
            UserRow.post,
            UserRow.active,
            UserRow.last_signal_at,
            UserRow.created_at,
        ).order_by(UserRow.created_at, UserRow.email)
        rows = (await self._session.execute(query.where(*conditions))).all()
        if not rows:
            return []

        roles: dict[uuid.UUID, set[Role]] = {row.id: set() for row in rows}
        pairs = await self._session.execute(
            select(UserRoleRow.user_id, UserRoleRow.role).where(UserRoleRow.user_id.in_(roles))
        )
        for user_id, role in pairs:
            roles[user_id].add(Role(role))

        return [
            User(
                id=row.id,
                email=row.email,
                name=row.name,
                password_hash=row.password_hash,
                post=row.post,
                active=row.active,
                roles=frozenset(roles[row.id]),
                last_signal_at=row.last_signal_at,
                created_at=row.created_at,
            )
            for row in rows
        ]


class UsersMemory:
    """The fake for tests: a dictionary that behaves like the table."""

    def __init__(self) -> None:
        self._users: dict[uuid.UUID, User] = {}

    async def create(
        self,
        *,
        email: str,
        name: str,
        password_hash: str,
        roles: Iterable[str],
        post: str | None = None,
    ) -> User:
        email = normalize_email(email)
        if await self.by_email(email) is not None:
            raise UserAlreadyExists(email)
        user = User(
            id=uuid.uuid4(),
            email=email,
            name=name,
            password_hash=password_hash,
            post=_post(post),
            active=True,
            roles=_roles(roles),
            last_signal_at=None,
            created_at=datetime.now(UTC),
        )
        self._users[user.id] = user
        return user

    async def by_email(self, email: str) -> User | None:
        email = normalize_email(email)
        return next((user for user in self._users.values() if user.email == email), None)

    async def by_id(self, user_id: uuid.UUID) -> User | None:
        return self._users.get(user_id)

    async def list(self) -> Sequence[User]:
        return sorted(self._users.values(), key=lambda user: (user.created_at, user.email))

    async def update(self, user_id: uuid.UUID, changes: UserChanges) -> User:
        if "post" in changes:
            _post(changes["post"])
        return self._replace(user_id, **changes)

    async def set_roles(self, user_id: uuid.UUID, roles: Iterable[str]) -> User:
        return self._replace(user_id, roles=_roles(roles))

    async def delete(self, user_id: uuid.UUID) -> None:
        if self._users.pop(user_id, None) is None:
            raise UserNotFound(user_id)

    async def mark_signal(self, user_id: uuid.UUID) -> None:
        self._replace(user_id, last_signal_at=datetime.now(UTC))

    def _replace(self, user_id: uuid.UUID, **changes: object) -> User:
        user = self._users.get(user_id)
        if user is None:
            raise UserNotFound(user_id)
        self._users[user_id] = replace(user, **changes)  # type: ignore[arg-type]
        return self._users[user_id]


def get_users_repo(session: SessionDep) -> UsersRepo:
    return UsersPostgres(session)


UsersRepoDep = Annotated[UsersRepo, Depends(get_users_repo)]
