"""Le dice a Alembic cómo conectarse y qué tablas existen.

La URL sale de DATABASE_URL (la misma configuración que la app) y las tablas
de `Base.metadata`: con eso `alembic revision --autogenerate` compara los
modelos contra la base y escribe la migración.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings
from app.modelos import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def correr_sin_conexion() -> None:
    """Modo offline (`--sql`): escribe el SQL en vez de ejecutarlo."""
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def aplicar(conexion: Connection) -> None:
    context.configure(connection=conexion, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def correr_con_conexion() -> None:
    # Sin pool: es un comando que abre una conexión, migra y termina.
    engine = create_async_engine(get_settings().database_url, poolclass=pool.NullPool)

    async with engine.connect() as conexion:
        await conexion.run_sync(aplicar)

    await engine.dispose()


if context.is_offline_mode():
    correr_sin_conexion()
else:
    asyncio.run(correr_con_conexion())
