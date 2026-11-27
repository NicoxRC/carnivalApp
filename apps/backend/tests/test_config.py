import pytest
from pydantic import ValidationError

from app.config import Settings


def test_config_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@localhost:5432/parade")
    monkeypatch.setenv("JWT_SECRET", "x" * 32)
    monkeypatch.setenv("CORS_ORIGINS", "https://a.co, https://b.co")

    settings = Settings()

    assert settings.database_url == "postgresql+asyncpg://u:p@localhost:5432/parade"
    assert settings.jwt_secret.get_secret_value() == "x" * 32
    assert settings.jwt_hours == 20
    assert settings.cors_origins == ["https://a.co", "https://b.co"]
    assert settings.environment == "dev"


def test_config_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL")

    with pytest.raises(ValidationError) as error:
        Settings()

    assert "database_url" in str(error.value)


@pytest.mark.parametrize(
    "given",
    [
        "postgres://u:p@db.railway.internal:5432/railway",
        "postgresql://u:p@db.railway.internal:5432/railway",
        "postgresql+asyncpg://u:p@db.railway.internal:5432/railway",
    ],
)
def test_database_url_always_uses_the_async_driver(
    monkeypatch: pytest.MonkeyPatch, given: str
) -> None:
    # What Railway's Postgres hands out works as it is.
    monkeypatch.setenv("DATABASE_URL", given)
    monkeypatch.setenv("JWT_SECRET", "x" * 32)

    assert Settings().database_url == "postgresql+asyncpg://u:p@db.railway.internal:5432/railway"
