"""Server configuration, read from environment variables.

Whatever changes between a laptop and production does not live in the code.
Values arrive through the environment: locally `sops exec-env` sets them, on
Railway the service panel does. If a required variable is missing the server
does not start, and the error names it.
"""

from functools import lru_cache
from typing import Annotated, Literal

from fastapi import Depends
from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode


class Settings(BaseSettings):
    # Required.
    database_url: str = Field(min_length=1)
    jwt_secret: SecretStr = Field(min_length=32)

    jwt_hours: int = Field(default=20, gt=0)
    # Comma-separated: https://a.co,https://b.co
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    environment: Literal["dev", "prod"] = "dev"

    # Push notifications (B42, B43). Without keys the feature turns itself off.
    vapid_public_key: str | None = None
    vapid_private_key: SecretStr | None = None
    vapid_contact: str | None = None

    # Photos on S3 (B39). Without a bucket they are stored on disk.
    s3_endpoint: str | None = None
    s3_bucket: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: SecretStr | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_on_commas(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    """Settings are read once per process."""
    return Settings()


SettingsDep = Annotated[Settings, Depends(get_settings)]
