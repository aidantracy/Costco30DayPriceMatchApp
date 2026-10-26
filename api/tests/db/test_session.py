import pytest
from sqlalchemy import text

from app.config import get_settings
from app.db import session as db_session


def test_get_session_connects_with_configured_url(
    database_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    db_session.get_engine.cache_clear()
    try:
        gen = db_session.get_session()
        s = next(gen)
        assert s.execute(text("select 1")).scalar_one() == 1
        gen.close()
    finally:
        get_settings.cache_clear()
        db_session.get_engine.cache_clear()
