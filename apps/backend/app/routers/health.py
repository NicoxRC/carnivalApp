import logging
import time

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from app.db import SessionDep

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["health"])


class Health(BaseModel):
    ok: bool
    db: bool
    # Epoch milliseconds.
    time: int


@router.get("/health", responses={503: {"model": Health}})
async def read_health(session: SessionDep, response: Response) -> Health:
    """For an external monitor (Railway): is the server up and reaching its database?"""
    try:
        await session.execute(text("SELECT 1"))
        db = True
    except Exception:
        log.exception("The database is not responding")
        db = False
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return Health(ok=db, db=db, time=int(time.time() * 1000))
