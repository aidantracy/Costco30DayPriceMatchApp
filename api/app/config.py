"""Application settings, loaded from environment variables (see .env.example)."""

from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: SecretStr = SecretStr(
        "postgresql+psycopg://app:change-me@localhost:5432/pricematch"
    )
    token_signing_key: SecretStr = SecretStr("change-me")
    access_token_ttl_minutes: int = Field(default=15, ge=1)
    refresh_token_ttl_days: int = Field(default=30, ge=1)

    price_adjustment_window_days: int = Field(default=30, ge=1)
    reminder_lead_days: int = Field(default=3, ge=0)
    health_failure_threshold: int = Field(default=3, ge=1)
    sync_min_interval_minutes: int = Field(default=60, ge=1)
    price_check_max_per_item_per_day: int = Field(default=1, ge=1)
    price_check_allowed_hosts: list[str] = ["www.costco.com"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
