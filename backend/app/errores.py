"""Todos los errores salen como `{"error": "<mensaje en español>"}`.

Es el formato que la web ya sabe leer (`src/app/api/`). FastAPI por defecto
responde `{"detail": ...}` y en inglés; estos manejadores interceptan cada
error antes de que salga y lo reescriben, para que ningún endpoint tenga que
acordarse de hacerlo.
"""

import logging
from collections.abc import Mapping, Sequence
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

log = logging.getLogger(__name__)

# Errores que lanza el propio framework, con su texto en inglés.
MENSAJES_HTTP = {
    status.HTTP_404_NOT_FOUND: "No existe.",
    status.HTTP_405_METHOD_NOT_ALLOWED: "Método no permitido.",
}
MENSAJE_HTTP_GENERICO = "No se pudo completar la petición."
MENSAJE_INTERNO = "Error interno."

# Tipos de error de Pydantic más comunes. Lo que no esté aquí sale como
# «valor inválido.». Las llaves entre {} salen del `ctx` del error.
MENSAJES_VALIDACION = {
    "missing": "falta.",
    "int_parsing": "debe ser un número entero.",
    "int_type": "debe ser un número entero.",
    "int_from_float": "debe ser un número entero.",
    "float_parsing": "debe ser un número.",
    "float_type": "debe ser un número.",
    "bool_parsing": "debe ser verdadero o falso.",
    "bool_type": "debe ser verdadero o falso.",
    "string_type": "debe ser texto.",
    "string_too_short": "debe tener al menos {min_length} caracteres.",
    "string_too_long": "debe tener máximo {max_length} caracteres.",
    "greater_than": "debe ser mayor que {gt}.",
    "greater_than_equal": "debe ser mayor o igual que {ge}.",
    "less_than": "debe ser menor que {lt}.",
    "less_than_equal": "debe ser menor o igual que {le}.",
    "extra_forbidden": "no se reconoce.",
}
MENSAJE_VALIDACION_GENERICO = "valor inválido."


def _respuesta(
    codigo: int, mensaje: str, cabeceras: Mapping[str, str] | None = None
) -> JSONResponse:
    return JSONResponse({"error": mensaje}, status_code=codigo, headers=cabeceras)


def _mensaje_http(error: HTTPException) -> str:
    detalle = error.detail
    # Sin detalle propio, Starlette pone la frase estándar en inglés.
    if isinstance(detalle, str) and detalle != HTTPStatus(error.status_code).phrase:
        return detalle
    return MENSAJES_HTTP.get(error.status_code, MENSAJE_HTTP_GENERICO)


def _mensaje_validacion(errores: Sequence[Any]) -> str:
    """Una sola frase: la web muestra un texto, así que basta el primer error."""
    primero = errores[0]
    if primero.get("type") == "json_invalid":
        return "JSON inválido."

    plantilla = MENSAJES_VALIDACION.get(primero.get("type", ""), MENSAJE_VALIDACION_GENERICO)
    try:
        motivo = plantilla.format(**primero.get("ctx", {}))
    except (KeyError, IndexError):
        motivo = MENSAJE_VALIDACION_GENERICO

    # `loc` es ("query", "limite") o ("body", "posiciones", 0, "lat"): el
    # primer elemento dice de dónde vino el dato, el resto es el campo.
    campo = ".".join(str(parte) for parte in primero.get("loc", ())[1:])
    return f"{campo}: {motivo}" if campo else f"Datos inválidos: {motivo}"


async def manejar_http(_: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, HTTPException)
    # Se conservan las cabeceras: un 401 lleva `WWW-Authenticate`.
    return _respuesta(error.status_code, _mensaje_http(error), error.headers)


async def manejar_validacion(_: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, RequestValidationError)
    # 400 y no el 422 de FastAPI: es lo que responde la web de hoy.
    return _respuesta(status.HTTP_400_BAD_REQUEST, _mensaje_validacion(error.errors()))


async def manejar_inesperado(peticion: Request, error: Exception) -> JSONResponse:
    # Que quede en los registros del servidor: si no, un fallo el día del
    # desfile solo lo vería quien tuviera la app abierta. Al cliente no se le
    # manda el detalle, que puede traer datos de la base o del código.
    log.error("Error inesperado en %s %s", peticion.method, peticion.url.path, exc_info=error)
    return _respuesta(status.HTTP_500_INTERNAL_SERVER_ERROR, MENSAJE_INTERNO)


def registrar_errores(app: FastAPI) -> None:
    app.add_exception_handler(HTTPException, manejar_http)
    app.add_exception_handler(RequestValidationError, manejar_validacion)
    app.add_exception_handler(Exception, manejar_inesperado)
