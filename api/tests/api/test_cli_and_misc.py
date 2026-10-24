from collections.abc import Iterator
from datetime import UTC

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import cli
from app.auth import service
from app.clock import utcnow
from app.db.models import RefreshToken, User
from tests.conftest import OWNER_PASSWORD


@pytest.fixture
def cli_session(session: Session, monkeypatch: pytest.MonkeyPatch) -> Session:
    def fake_get_session() -> Iterator[Session]:
        yield session

    monkeypatch.setattr(cli, "get_session", fake_get_session)
    return session


def answers(monkeypatch: pytest.MonkeyPatch, *values: str) -> None:
    it = iter(values)
    monkeypatch.setattr(cli.getpass, "getpass", lambda prompt="": next(it))


def test_cli_creates_the_owner(cli_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    answers(monkeypatch, "a long passphrase", "a long passphrase")
    assert cli.main(["create-owner", "--email", "owner@example.com"]) == 0
    assert cli_session.scalar(select(User.email)) == "owner@example.com"


def test_cli_rejects_mismatched_passwords(
    cli_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    answers(monkeypatch, "a long passphrase", "different passphrase")
    assert cli.main(["create-owner", "--email", "owner@example.com"]) == 1


def test_cli_rejects_short_password(cli_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    answers(monkeypatch, "short", "short")
    assert cli.main(["create-owner", "--email", "owner@example.com"]) == 1


def test_cli_refuses_a_second_account(
    cli_session: Session, owner: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    answers(monkeypatch, "a long passphrase", "a long passphrase")
    assert cli.main(["create-owner", "--email", "second@example.com"]) == 1


def test_cli_signs_out_everywhere(cli_session: Session, owner: User) -> None:
    now = utcnow()
    from app.config import get_settings

    service.login(cli_session, "owner@example.com", OWNER_PASSWORD, now, get_settings())
    service.login(cli_session, "owner@example.com", OWNER_PASSWORD, now, get_settings())
    assert cli.main(["sign-out-everywhere", "--email", "OWNER@example.com"]) == 0
    assert all(t.revoked_at for t in cli_session.scalars(select(RefreshToken)))
    assert cli.main(["sign-out-everywhere", "--email", "nobody@example.com"]) == 1


def test_clock_is_timezone_aware() -> None:
    assert utcnow().tzinfo is UTC


def test_password_is_rehashed_when_parameters_change(
    client: TestClient, owner: User, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    old_hash = owner.password_hash
    monkeypatch.setattr(service, "needs_rehash", lambda _h: True)
    r = client.post("/auth/login", json={"email": "owner@example.com", "password": OWNER_PASSWORD})
    assert r.status_code == 200
    session.refresh(owner)
    assert owner.password_hash != old_hash


def test_token_for_deleted_user_is_rejected(
    client: TestClient, owner: User, session: Session
) -> None:
    r = client.post("/auth/login", json={"email": "owner@example.com", "password": OWNER_PASSWORD})
    token = r.json()["access_token"]
    session.delete(owner)
    session.flush()
    assert client.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
