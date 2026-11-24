"""Passwords, session tokens and who may call each endpoint.

- Passwords: only the Argon2 hash is ever stored.
- Sessions: a JWT signed with `JWT_SECRET` that carries only the user id.
  Roles and `active` are read from the database on every request, so
  deactivating someone cuts their session instantly.
- Endpoints ask for a permission with `require(...)`, never for a role.
"""

import uuid
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

from app.config import get_settings
from app.permissions import Permission, permissions_for
from app.repositories.users import User, UsersRepoDep

MIN_PASSWORD_LENGTH = 10

# Argon2 with the parameters pwdlib recommends. It is slow on purpose: whoever
# steals the database cannot try millions of passwords per second.
_hasher = PasswordHash.recommended()


def hash_password(text: str) -> str:
    """The hash to store. It carries a random salt, so it differs every time."""
    return _hasher.hash(text)


def verify_password(text: str, hashed: str) -> bool:
    """Whether `text` is the password `hashed` came from."""
    try:
        return _hasher.verify(text, hashed)
    except UnknownHashError:
        # A stored value that is not a hash is, for whoever logs in, a wrong password.
        return False


def validate_password(text: str) -> None:
    """Raises `ValueError`, with a message for the person, if it is too short."""
    if len(text) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.")


@lru_cache
def filler_hash() -> str:
    """A hash nobody knows the password of.

    Login verifies against it when the email does not exist, so that answer
    takes as long as a wrong password and does not tell which emails exist.
    """
    return hash_password(uuid.uuid4().hex)


JWT_ALGORITHM = "HS256"


def create_token(user_id: uuid.UUID, *, now: datetime | None = None) -> tuple[str, datetime]:
    """A signed token for that user and the moment it stops being valid."""
    settings = get_settings()
    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + timedelta(hours=settings.jwt_hours)
    token = jwt.encode(
        {"sub": str(user_id), "iat": issued_at, "exp": expires_at},
        settings.jwt_secret.get_secret_value(),
        algorithm=JWT_ALGORITHM,
    )
    return token, expires_at


def read_token(token: str) -> uuid.UUID | None:
    """The user id of a token, or `None` if it is forged, expired or malformed."""
    try:
        payload = jwt.decode(
            token,
            get_settings().jwt_secret.get_secret_value(),
            # Only ours: a token that names another algorithm is rejected.
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp"]},
        )
        return uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, ValueError, TypeError):
        return None


# auto_error=False: without a token the answer is ours (401, in Spanish), not
# the framework's.
_bearer = HTTPBearer(auto_error=False, description="The `token` that `/api/auth/login` returns.")

NOT_LOGGED_IN = "Hace falta iniciar sesión."
FORBIDDEN = "No tenés permiso para esto."


async def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    users: UsersRepoDep,
) -> User:
    """The user of the request: valid token, the user exists and is active."""
    user_id = read_token(credentials.credentials) if credentials else None
    user = await users.by_id(user_id) if user_id else None
    if user is None or not user.active:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            NOT_LOGGED_IN,
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


CurrentUserDep = Annotated[User, Depends(current_user)]


def require(*permissions: Permission) -> Any:
    """Dependency that lets through only users with every permission named.

    On a whole router: `APIRouter(dependencies=[require(Permission.X)])`.
    To also get the user: `user: Annotated[User, require(Permission.X)]`.
    Without a session it is 401; with one but without the permission, 403.
    """

    async def user_with_permission(user: CurrentUserDep) -> User:
        if not set(permissions) <= permissions_for(user.roles):
            raise HTTPException(status.HTTP_403_FORBIDDEN, FORBIDDEN)
        return user

    return Depends(user_with_permission)
