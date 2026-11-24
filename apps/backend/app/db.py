"""Postgres connection: one engine per process, one session per request."""

from collections.abc import AsyncIterator
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings


@lru_cache
def get_engine() -> AsyncEngine:
    """The engine manages the connection pool. It does not connect until used."""
    return create_async_engine(
        get_settings().database_url,
        # Checks the connection is still alive before using it: if Postgres
        # restarted, the first request does not fail.
        pool_pre_ping=True,
    )


@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    # expire_on_commit=False: objects stay readable after the commit without
    # an extra query (which cannot fire on its own in async code).
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """Opens a session for the request and closes it once it is answered."""
    async with get_session_factory()() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]
