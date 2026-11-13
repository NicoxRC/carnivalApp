import pytest
from pydantic import ValidationError

from app.config import Settings


def test_config_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:c@localhost:5432/desfile")
    monkeypatch.setenv("JWT_SECRETO", "x" * 32)
    monkeypatch.setenv("CORS_ORIGENES", "https://a.co, https://b.co")

    config = Settings()

    assert config.database_url == "postgresql+asyncpg://u:c@localhost:5432/desfile"
    assert config.jwt_secreto.get_secret_value() == "x" * 32
    assert config.jwt_horas == 20
    assert config.cors_origenes == ["https://a.co", "https://b.co"]
    assert config.entorno == "dev"


def test_config_falla(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL")

    with pytest.raises(ValidationError) as error:
        Settings()

    assert "database_url" in str(error.value)
