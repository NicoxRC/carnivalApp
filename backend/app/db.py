"""Conexión a Postgres: un engine por proceso y una sesión por petición."""

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
    """El engine administra el pool de conexiones. No conecta hasta que se usa."""
    return create_async_engine(
        get_settings().database_url,
        # Verifica que la conexión siga viva antes de usarla: si Postgres se
        # reinició, la primera petición no falla.
        pool_pre_ping=True,
    )


@lru_cache
def get_fabrica_de_sesiones() -> async_sessionmaker[AsyncSession]:
    # expire_on_commit=False: los objetos siguen legibles después del commit,
    # sin una consulta extra (que en async no puede dispararse sola).
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_sesion() -> AsyncIterator[AsyncSession]:
    """Abre una sesión para la petición y la cierra al responder."""
    async with get_fabrica_de_sesiones()() as sesion:
        yield sesion


SesionDep = Annotated[AsyncSession, Depends(get_sesion)]
