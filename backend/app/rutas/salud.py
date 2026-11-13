from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["salud"])


class Salud(BaseModel):
    ok: bool


@router.get("/salud")
async def leer_salud() -> Salud:
    """Para un monitor externo (Railway): ¿el servidor responde?"""
    return Salud(ok=True)
