import uuid

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool

from app.permissions import Permission, Role, permissions_for
from app.rate_limits import LoginRateLimitDep, ip_of
from app.repositories.users import User, UsersRepoDep
from app.schemas import Schema, to_ms
from app.security import CurrentUserDep, create_token, filler_hash, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

WRONG_CREDENTIALS = "Correo o contraseña incorrectos."


class LoginBody(Schema):
    email: str
    password: str


class SessionUser(Schema):
    id: uuid.UUID
    email: str
    name: str
    roles: list[Role]
    permissions: list[Permission]
    post: str | None


class Session(Schema):
    token: str
    # Epoch milliseconds.
    expires_at: int
    user: SessionUser


def session_user(user: User) -> SessionUser:
    return SessionUser(
        id=user.id,
        email=user.email,
        name=user.name,
        roles=sorted(user.roles),
        permissions=sorted(permissions_for(user.roles)),
        post=user.post,
    )


@router.post("/login")
async def login(
    body: LoginBody, request: Request, users: UsersRepoDep, rate_limit: LoginRateLimitDep
) -> Session:
    """Exchanges email and password for a token to send as `Authorization: Bearer`."""
    ip = ip_of(request)
    await rate_limit.wait(ip)

    user = await users.by_email(body.email)
    # Argon2 is slow on purpose: off the event loop so other requests go on.
    # With an unknown email it still verifies, against a hash nobody matches.
    password_ok = await run_in_threadpool(
        verify_password, body.password, user.password_hash if user else filler_hash()
    )
    ok = user is not None and password_ok and user.active
    rate_limit.record(ip, ok)
    if user is None or not ok:
        # The same answer whatever failed: it does not tell which emails exist.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, WRONG_CREDENTIALS)

    token, expires_at = create_token(user.id)
    return Session(token=token, expires_at=to_ms(expires_at), user=session_user(user))


@router.get("/me")
async def read_me(user: CurrentUserDep) -> SessionUser:
    """Who the token belongs to. The web asks on opening: is my session still alive?"""
    return session_user(user)
