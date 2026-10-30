from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.clock import utcnow
from app.db.models import User
from app.db.session import get_session
from app.main import app


class Clock:
    def __init__(self) -> None:
        self.now = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def client(session: Session, clock: Clock) -> Iterator[TestClient]:
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[utcnow] = clock
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def auth(client: TestClient, owner: User) -> dict[str, str]:
    from tests.conftest import OWNER_PASSWORD

    r = client.post("/auth/login", json={"email": owner.email, "password": OWNER_PASSWORD})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def other_auth(session: Session, clock: Clock) -> dict[str, str]:
    """A second account, to prove records are scoped to their owner (FR-28)."""
    from datetime import timedelta

    from app.auth.tokens import create_access_token
    from app.config import get_settings

    other = User(email="other@example.com", password_hash="not-a-real-hash")
    session.add(other)
    session.flush()
    key = get_settings().token_signing_key.get_secret_value()
    token = create_access_token(other.id, clock.now, timedelta(minutes=15), key)
    return {"Authorization": f"Bearer {token}"}
