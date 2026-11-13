import logging
import time

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from app.db import SesionDep

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["salud"])


class Salud(BaseModel):
    ok: bool
    db: bool
    hora: int


@router.get("/salud", responses={503: {"model": Salud}})
async def leer_salud(sesion: SesionDep, respuesta: Response) -> Salud:
    """Para un monitor externo (Railway): ¿el servidor responde y llega a su base?"""
    try:
        await sesion.execute(text("SELECT 1"))
        db = True
    except Exception:
        log.exception("La base no responde")
        db = False
        respuesta.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return Salud(ok=db, db=db, hora=int(time.time() * 1000))
