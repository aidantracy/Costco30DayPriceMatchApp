"""Engine and session factory. Sessions are request-scoped in the API."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


@lru_cache
def get_engine() -> Engine:
    url = get_settings().database_url.get_secret_value()
    return create_engine(url, pool_pre_ping=True)


def get_session() -> Iterator[Session]:
    factory = sessionmaker(bind=get_engine(), expire_on_commit=False)
    with factory() as session:
        yield session
