"""Anonymous device ids, issued and signed by the server.

The crowd map and the photos count devices. If the phone made up its own id,
a script could send a thousand and paint a stretch "full". So the server
issues the id and signs it; a made-up one does not carry a valid signature.

The id says nothing about the person: only that this server handed it out.
"""

import base64
import hashlib
import hmac
import secrets
from functools import lru_cache

from app.config import get_settings

MAX_TOKEN_LENGTH = 64
SIGNATURE_LENGTH = 22


@lru_cache
def _key() -> bytes:
    # A key of its own, derived from JWT_SECRET: a device signature can never
    # be passed off as a session token, nor the other way round.
    secret = get_settings().jwt_secret.get_secret_value().encode()
    return hmac.new(secret, b"device-ids", hashlib.sha256).digest()


def _signature(device_id: str) -> str:
    digest = hmac.new(_key(), f"device:{device_id}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode()[:SIGNATURE_LENGTH]


def issue_device() -> str:
    """A new `<id>.<signature>`. The cap per IP is checked by the endpoint."""
    device_id = secrets.token_urlsafe(12)
    return f"{device_id}.{_signature(device_id)}"


def valid_device(token: object) -> str | None:
    """The id if this server issued the token; otherwise `None`."""
    if not isinstance(token, str) or len(token) > MAX_TOKEN_LENGTH:
        return None
    device_id, _, signature = token.partition(".")
    if not device_id or not signature:
        return None
    return device_id if hmac.compare_digest(signature, _signature(device_id)) else None
