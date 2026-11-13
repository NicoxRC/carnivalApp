"""Configuración del servidor, leída de variables de entorno.

Lo que cambia entre una máquina y producción no vive en el código. Los valores
llegan por el entorno: en local los pone `sops exec-env` y en Railway el panel
del servicio. Si falta una variable obligatoria, el servidor no arranca y el
error dice cuál.
"""

from functools import lru_cache
from typing import Annotated, Literal

from fastapi import Depends
from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode


class Settings(BaseSettings):
    # Obligatorias.
    database_url: str = Field(min_length=1)
    jwt_secreto: SecretStr = Field(min_length=32)

    jwt_horas: int = Field(default=20, gt=0)
    # Separados por comas: https://a.co,https://b.co
    cors_origenes: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    entorno: Literal["dev", "prod"] = "dev"

    # Avisos push (B42, B43). Sin llaves, la función se apaga sola.
    vapid_publica: str | None = None
    vapid_privada: SecretStr | None = None
    vapid_contacto: str | None = None

    # Fotos en S3 (B39). Sin bucket se guardan en disco.
    s3_endpoint: str | None = None
    s3_bucket: str | None = None
    s3_llave: str | None = None
    s3_secreto: SecretStr | None = None

    @field_validator("cors_origenes", mode="before")
    @classmethod
    def _separar_por_comas(cls, valor: object) -> object:
        if isinstance(valor, str):
            return [origen.strip() for origen in valor.split(",") if origen.strip()]
        return valor


@lru_cache
def get_settings() -> Settings:
    """La configuración se lee una sola vez por proceso."""
    return Settings()


SettingsDep = Annotated[Settings, Depends(get_settings)]
