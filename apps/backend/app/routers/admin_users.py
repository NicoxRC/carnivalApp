"""The team's accounts, managed by whoever has `users:manage`."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import EmailStr, Field

from app.permissions import Permission, Role
from app.repositories.users import (
    User,
    UserAlreadyExists,
    UserChanges,
    UserNotFound,
    UsersRepoDep,
)
from app.schemas import Schema, to_ms
from app.security import hash_password, require, validate_password

router = APIRouter(prefix="/api/admin/users", tags=["admin: users"])

Post = Literal["head", "middle", "tail"]
Viewer = Annotated[User, require(Permission.USERS_VIEW)]
Manager = Annotated[User, require(Permission.USERS_MANAGE)]

NOT_FOUND = "No existe ese usuario."


class UserOut(Schema):
    """Never the password hash."""

    id: uuid.UUID
    email: str
    name: str
    roles: list[Role]
    post: str | None
    active: bool
    # Epoch milliseconds. Empty until the user sends a position.
    last_signal_at: int | None
    created_at: int


class UserCreate(Schema):
    email: EmailStr
    name: str = Field(min_length=1)
    password: str
    roles: list[Role]
    post: Post | None = None


class UserUpdate(Schema):
    """Only the keys that come are changed. `post: null` clears the post."""

    name: str | None = Field(default=None, min_length=1)
    roles: list[Role] | None = None
    post: Post | None = None
    active: bool | None = None
    password: str | None = None


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        roles=sorted(user.roles),
        post=user.post,
        active=user.active,
        last_signal_at=to_ms(user.last_signal_at) if user.last_signal_at else None,
        created_at=to_ms(user.created_at),
    )


def bad_request(message: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, message)


def check_post(roles: frozenset[Role] | set[Role], post: str | None) -> None:
    # The server sets the post of a reporter's positions: it has to know it.
    if Role.REPORTER in roles and post is None:
        raise bad_request("Un reportero necesita un puesto (cabeza, mitad o cola).")


async def new_hash(password: str) -> str:
    try:
        validate_password(password)
    except ValueError as error:
        raise bad_request(str(error)) from error
    # Argon2 is slow on purpose: off the event loop.
    return await run_in_threadpool(hash_password, password)


@router.get("")
async def list_users(_: Viewer, users: UsersRepoDep) -> list[UserOut]:
    return [user_out(user) for user in await users.list()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_user(body: UserCreate, _: Manager, users: UsersRepoDep) -> UserOut:
    check_post(set(body.roles), body.post)
    try:
        user = await users.create(
            email=body.email,
            name=body.name.strip(),
            password_hash=await new_hash(body.password),
            roles=body.roles,
            post=body.post,
        )
    except UserAlreadyExists as error:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Ya existe un usuario con ese correo."
        ) from error
    return user_out(user)


@router.patch("/{user_id}")
async def update_user(
    user_id: uuid.UUID, body: UserUpdate, me: Manager, users: UsersRepoDep
) -> UserOut:
    user = await users.by_id(user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    sent = body.model_fields_set

    roles = frozenset(body.roles) if body.roles is not None else user.roles
    post = body.post if "post" in sent else user.post
    check_post(roles, post)
    if user.id == me.id:
        # Otherwise a slip leaves the system with nobody able to manage users.
        if Role.ADMIN in user.roles and Role.ADMIN not in roles:
            raise bad_request("No podés quitarte a vos mismo el rol de admin.")
        if body.active is False:
            raise bad_request("No podés desactivarte a vos mismo.")

    changes: UserChanges = {}
    if body.name is not None:
        changes["name"] = body.name.strip()
    if "post" in sent:
        changes["post"] = body.post
    if body.active is not None:
        changes["active"] = body.active
    if body.password is not None:
        changes["password_hash"] = await new_hash(body.password)

    try:
        user = await users.update(user_id, changes)
        if body.roles is not None:
            user = await users.set_roles(user_id, body.roles)
    except UserNotFound as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND) from error
    return user_out(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: uuid.UUID, me: Manager, users: UsersRepoDep) -> None:
    user = await users.by_id(user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    if user.id == me.id:
        raise bad_request("No podés borrarte a vos mismo.")
    if user.last_signal_at is not None:
        # Deleting would lose who reported what.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ese usuario ya envió posiciones: desactivalo en vez de borrarlo.",
        )
    await users.delete(user_id)
