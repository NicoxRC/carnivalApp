from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import get_engine
from app.errors import register_error_handlers
from app.realtime import PostgresListener, get_broadcaster
from app.routers import (
    admin_parades,
    admin_users,
    auth,
    course,
    density,
    health,
    positions,
    schedule,
    state,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # One connection that listens to what other processes write, so the open
    # streams hear it. It retries on its own: the server starts without it.
    listener = PostgresListener(settings.database_url, get_broadcaster())
    listener.start()
    yield
    await listener.stop()
    # On shutdown: hand the pool's connections back to Postgres.
    await get_engine().dispose()


app = FastAPI(title="Sigue el Desfile", lifespan=lifespan)

# The web app lives on another domain: the browser only lets it call the API
# if its origin is on the list. No credentials, because the session travels
# in `Authorization: Bearer`, not in cookies.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(admin_users.router)
app.include_router(course.router)
app.include_router(schedule.router)
app.include_router(admin_parades.router)
app.include_router(positions.router)
app.include_router(state.router)
app.include_router(density.router)
