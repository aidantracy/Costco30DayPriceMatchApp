"""Postgres fixtures. Uses TEST_DATABASE_URL when set (local runs); otherwise starts a
throwaway Postgres container with testcontainers (CI runners have Docker)."""

import os
from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.db.models import User

# A strong key for tests; settings are read lazily, so this is set before first use.
os.environ.setdefault("TOKEN_SIGNING_KEY", "test-signing-key-" + "x" * 32)


@pytest.fixture(scope="session")
def database_url() -> Iterator[str]:
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        yield url
        return
    from testcontainers.postgres import PostgresContainer

    with PostgresContainer("postgres:17", driver="psycopg") as pg:
        yield pg.get_connection_url()


@pytest.fixture(scope="session")
def migrated_engine(database_url: str) -> Iterator[Engine]:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    engine = create_engine(database_url)
    yield engine
    engine.dispose()


@pytest.fixture
def session(migrated_engine: Engine) -> Iterator[Session]:
    """A session whose work is rolled back after each test."""
    with migrated_engine.connect() as conn:
        outer = conn.begin()
        with Session(bind=conn, join_transaction_mode="create_savepoint") as s:
            yield s
        outer.rollback()


@pytest.fixture
def owner(session: Session) -> User:
    from app.auth.service import create_owner

    return create_owner(session, "owner@example.com", OWNER_PASSWORD)


OWNER_PASSWORD = "correct horse battery staple"
