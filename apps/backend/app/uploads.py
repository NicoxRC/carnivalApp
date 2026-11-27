"""Permission to upload one photo, signed by the server.

The phone uploads the file straight to the bucket. Before that it asks the
backend, which hands out this token with the photo id, the device, the exact
size and an expiry. When the phone says it is done, the token is all the
backend needs to know that upload was allowed: no table holds uploads that
were never finished.
"""

import base64
import hashlib
import hmac
import time
import uuid
from dataclasses import dataclass
from functools import lru_cache

from app.config import get_settings

MAX_TOKEN_LENGTH = 200


@dataclass(frozen=True, slots=True)
class UploadGrant:
    photo_id: uuid.UUID
    device_id: str
    size: int
    expires_at: int


@lru_cache
def _key() -> bytes:
    # A key of its own, derived from JWT_SECRET, as with device ids.
    secret = get_settings().jwt_secret.get_secret_value().encode()
    return hmac.new(secret, b"photo-uploads", hashlib.sha256).digest()


def _signature(payload: str) -> str:
    digest = hmac.new(_key(), f"upload:{payload}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def issue_upload(grant: UploadGrant) -> str:
    payload = f"{grant.photo_id}.{grant.device_id}.{grant.size}.{grant.expires_at}"
    return f"{payload}.{_signature(payload)}"


def read_upload(token: object, photo_id: uuid.UUID, now: float | None = None) -> UploadGrant | None:
    """The grant if this server issued it for that photo and it has not expired."""
    if not isinstance(token, str) or len(token) > MAX_TOKEN_LENGTH:
        return None
    payload, _, signature = token.rpartition(".")
    if not payload or not hmac.compare_digest(signature, _signature(payload)):
        return None
    parts = payload.split(".")
    if len(parts) != 4:
        return None
    raw_id, device_id, raw_size, raw_expiry = parts
    try:
        grant = UploadGrant(uuid.UUID(raw_id), device_id, int(raw_size), int(raw_expiry))
    except ValueError:
        return None
    if grant.photo_id != photo_id or grant.expires_at < (time.time() if now is None else now):
        return None
    return grant
