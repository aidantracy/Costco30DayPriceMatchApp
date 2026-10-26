"""Application settings, loaded from environment variables (see .env.example)."""

from functools import lru_cache

from pydantic import Field, SecretStr, model_validator
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

    expo_access_token: SecretStr | None = None
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    alert_from_address: str = "alerts@example.com"

    login_max_failures: int = Field(default=5, ge=1)
    login_lockout_minutes: int = Field(default=15, ge=1)

    @model_validator(mode="after")
    def _strong_key_outside_development(self) -> "Settings":
        key = self.token_signing_key.get_secret_value()
        if self.app_env != "development" and (key == "change-me" or len(key) < 32):
            raise ValueError("TOKEN_SIGNING_KEY must be at least 32 characters outside development")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
