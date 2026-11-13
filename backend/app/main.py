from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import get_engine
from app.errors import register_error_handlers
from app.routers import admin_users, auth, health

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
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
