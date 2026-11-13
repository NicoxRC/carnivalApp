"""Every error goes out as `{"error": "<message in Spanish>"}`.

The key is English like the rest of the contract; the message is text for
people, so it is Spanish. FastAPI answers `{"detail": ...}` in English by
default; these handlers intercept each error before it leaves and rewrite it,
so no endpoint has to remember to.
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

# Errors raised by the framework itself, which come with English text.
HTTP_MESSAGES = {
    status.HTTP_404_NOT_FOUND: "No existe.",
    status.HTTP_405_METHOD_NOT_ALLOWED: "Método no permitido.",
}
GENERIC_HTTP_MESSAGE = "No se pudo completar la petición."
INTERNAL_MESSAGE = "Error interno."

# The most common Pydantic error types. Anything missing here goes out as
# «valor inválido.». The {} placeholders come from the error's `ctx`.
VALIDATION_MESSAGES = {
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
GENERIC_VALIDATION_MESSAGE = "valor inválido."


def _response(code: int, message: str, headers: Mapping[str, str] | None = None) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=code, headers=headers)


def _http_message(error: HTTPException) -> str:
    detail = error.detail
    # With no detail of its own, Starlette fills in the standard English phrase.
    if isinstance(detail, str) and detail != HTTPStatus(error.status_code).phrase:
        return detail
    return HTTP_MESSAGES.get(error.status_code, GENERIC_HTTP_MESSAGE)


def _validation_message(errors: Sequence[Any]) -> str:
    """A single sentence: clients show one text, so the first error is enough."""
    first = errors[0]
    if first.get("type") == "json_invalid":
        return "JSON inválido."

    template = VALIDATION_MESSAGES.get(first.get("type", ""), GENERIC_VALIDATION_MESSAGE)
    try:
        reason = template.format(**first.get("ctx", {}))
    except (KeyError, IndexError):
        reason = GENERIC_VALIDATION_MESSAGE

    # `loc` is ("query", "limit") or ("body", "positions", 0, "lat"): the
    # first element says where the value came from, the rest is the field.
    field = ".".join(str(part) for part in first.get("loc", ())[1:])
    return f"{field}: {reason}" if field else f"Datos inválidos: {reason}"


async def handle_http_error(_: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, HTTPException)
    # Headers are kept: a 401 carries `WWW-Authenticate`.
    return _response(error.status_code, _http_message(error), error.headers)


async def handle_validation_error(_: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, RequestValidationError)
    # 400 rather than FastAPI's 422: it is what the web app answers today.
    return _response(status.HTTP_400_BAD_REQUEST, _validation_message(error.errors()))


async def handle_unexpected_error(request: Request, error: Exception) -> JSONResponse:
    # It has to reach the server logs: otherwise a failure on parade day is
    # only seen by whoever had the app open. The client does not get the
    # detail, which may carry data from the database or the code.
    log.error("Unexpected error on %s %s", request.method, request.url.path, exc_info=error)
    return _response(status.HTTP_500_INTERNAL_SERVER_ERROR, INTERNAL_MESSAGE)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(HTTPException, handle_http_error)
    app.add_exception_handler(RequestValidationError, handle_validation_error)
    app.add_exception_handler(Exception, handle_unexpected_error)
