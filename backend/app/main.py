from fastapi import FastAPI

from app.rutas import salud

app = FastAPI(title="Sigue el Desfile")

app.include_router(salud.router)
