import pytest
from pydantic import ValidationError

from app.config import Settings


def test_defaults_match_business_rules() -> None:
    settings = Settings()
    assert settings.price_adjustment_window_days == 30
    assert settings.price_check_allowed_hosts == ["www.costco.com"]


def test_secrets_are_not_printed() -> None:
    settings = Settings(token_signing_key="super-secret-value")
    assert "super-secret-value" not in repr(settings)


def test_rejects_invalid_window(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PRICE_ADJUSTMENT_WINDOW_DAYS", "0")
    with pytest.raises(ValidationError):
        Settings()
