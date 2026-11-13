"""Passwords: only the hash is ever stored, never the password itself."""

from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

MIN_PASSWORD_LENGTH = 10

# Argon2 with the parameters pwdlib recommends. It is slow on purpose: whoever
# steals the database cannot try millions of passwords per second.
_hasher = PasswordHash.recommended()


def hash_password(text: str) -> str:
    """The hash to store. It carries a random salt, so it differs every time."""
    return _hasher.hash(text)


def verify_password(text: str, hashed: str) -> bool:
    """Whether `text` is the password `hashed` came from."""
    try:
        return _hasher.verify(text, hashed)
    except UnknownHashError:
        # A stored value that is not a hash is, for whoever logs in, a wrong password.
        return False


def validate_password(text: str) -> None:
    """Raises `ValueError`, with a message for the person, if it is too short."""
    if len(text) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.")
