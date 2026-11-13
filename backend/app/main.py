from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import get_engine
from app.rutas import salud

config = get_settings()


@asynccontextmanager
async def ciclo_de_vida(_: FastAPI) -> AsyncIterator[None]:
    yield
    # Al apagar: devuelve las conexiones del pool a Postgres.
    await get_engine().dispose()


app = FastAPI(title="Sigue el Desfile", lifespan=ciclo_de_vida)

# La web vive en otro dominio: el navegador solo la deja llamar a la API si
# su origen está en la lista. Sin credenciales porque la sesión va en
# `Authorization: Bearer`, no en cookies.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origenes,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(salud.router)
