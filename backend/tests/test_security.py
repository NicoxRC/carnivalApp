import pytest

from app.security import hash_password, validate_password, verify_password


def test_verify_password_ok() -> None:
    hashed = hash_password("correct horse battery")

    assert verify_password("correct horse battery", hashed)


def test_verify_password_fails() -> None:
    hashed = hash_password("correct horse battery")

    assert not verify_password("wrong horse battery", hashed)
    assert not verify_password("correct horse battery", "not-a-hash")


def test_same_text_gives_different_hashes() -> None:
    first = hash_password("correct horse battery")
    second = hash_password("correct horse battery")

    # The random salt: equal passwords do not give themselves away in the database.
    assert first != second
    assert verify_password("correct horse battery", first)
    assert verify_password("correct horse battery", second)


def test_validate_password_ok() -> None:
    validate_password("a" * 10)


def test_validate_password_fails() -> None:
    with pytest.raises(ValueError, match="al menos 10 caracteres"):
        validate_password("a" * 9)
