import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.auth import service
from app.auth.passwords import hash_password, needs_rehash, verify_password
from app.auth.tokens import InvalidTokenError, create_access_token, decode_access_token
from app.config import Settings

KEY = "k" * 32
NOW = datetime(2026, 10, 1, tzinfo=UTC)


def test_password_hash_round_trip() -> None:
    h = hash_password("a long passphrase")
    assert h.startswith("$argon2id$")
    assert verify_password(h, "a long passphrase")
    assert not verify_password(h, "wrong")
    assert not verify_password(None, "anything")
    assert not verify_password("not-a-hash", "anything")
    assert not needs_rehash(h)


def test_access_token_round_trip() -> None:
    uid = uuid.uuid4()
    token = create_access_token(uid, NOW, timedelta(minutes=15), KEY)
    assert decode_access_token(token, NOW + timedelta(minutes=14), KEY) == uid


@pytest.mark.parametrize(
    "token",
    [
        create_access_token(uuid.uuid4(), NOW, timedelta(minutes=15), "x" * 32),  # wrong key
        jwt.encode({"sub": "1", "typ": "access", "exp": 9999999999}, KEY, algorithm="HS256"),
        jwt.encode(
            {"sub": str(uuid.uuid4()), "typ": "refresh", "exp": 9999999999}, KEY, algorithm="HS256"
        ),
        jwt.encode({"sub": str(uuid.uuid4()), "typ": "access", "exp": 9999999999}, KEY, "HS512"),
        "not.a.token",
    ],
)
def test_rejects_bad_access_tokens(token: str) -> None:
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, NOW, KEY)


def test_rejects_expired_access_token() -> None:
    token = create_access_token(uuid.uuid4(), NOW, timedelta(minutes=15), KEY)
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, NOW + timedelta(minutes=15), KEY)


def test_weak_signing_key_rejected_outside_development(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("TOKEN_SIGNING_KEY", raising=False)
    with pytest.raises(ValidationError, match="TOKEN_SIGNING_KEY"):
        Settings()
    monkeypatch.setenv("TOKEN_SIGNING_KEY", "s" * 40)
    assert Settings().app_env == "production"


def test_only_one_owner_account(session: Session) -> None:
    service.create_owner(session, "owner@example.com", "a long passphrase")
    with pytest.raises(service.OwnerExistsError):
        service.create_owner(session, "second@example.com", "a long passphrase")


def test_owner_password_minimum_length(session: Session) -> None:
    with pytest.raises(ValueError, match="12 characters"):
        service.create_owner(session, "owner@example.com", "short")
