"""Sign-in, token refresh with reuse detection, and sign-out."""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.auth.passwords import hash_password, needs_rehash, verify_password
from app.auth.tokens import create_access_token, hash_refresh_token, new_refresh_token
from app.config import Settings
from app.db.ids import uuid7
from app.db.models import RefreshToken, User


class AuthError(Exception):
    """Wrong email or password, or an unusable refresh token. Deliberately vague."""


class LockedError(Exception):
    """Too many failed sign-ins; try again later."""


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int


def _issue(
    session: Session, user: User, family_id: uuid.UUID, now: datetime, settings: Settings
) -> TokenPair:
    ttl = timedelta(minutes=settings.access_token_ttl_minutes)
    refresh, refresh_hash = new_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=refresh_hash,
            family_id=family_id,
            expires_at=now + timedelta(days=settings.refresh_token_ttl_days),
        )
    )
    access = create_access_token(user.id, now, ttl, settings.token_signing_key.get_secret_value())
    return TokenPair(access, refresh, int(ttl.total_seconds()))


def login(
    session: Session, email: str, password: str, now: datetime, settings: Settings
) -> TokenPair:
    user = session.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))
    if user is not None and user.locked_until is not None and user.locked_until > now:
        raise LockedError
    if user is None or not verify_password(user.password_hash if user else None, password):
        if user is not None:
            user.failed_logins += 1
            if user.failed_logins >= settings.login_max_failures:
                user.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
                user.failed_logins = 0
            session.commit()
        else:
            verify_password(None, password)  # equal timing for unknown emails
        raise AuthError
    user.failed_logins = 0
    user.locked_until = None
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    pair = _issue(session, user, uuid7(), now, settings)
    session.commit()
    return pair


def refresh(session: Session, token: str, now: datetime, settings: Settings) -> TokenPair:
    row = session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(token))
    )
    if row is None:
        raise AuthError
    if row.revoked_at is not None:
        # A used token came back: assume theft and end the whole sign-in (T-04).
        _revoke_family(session, row.family_id, now)
        session.commit()
        raise AuthError
    if row.expires_at <= now:
        raise AuthError
    user = session.get_one(User, row.user_id)  # tokens are deleted with their user
    row.revoked_at = now
    pair = _issue(session, user, row.family_id, now, settings)
    session.commit()
    return pair


def logout(session: Session, token: str, now: datetime) -> None:
    row = session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(token))
    )
    if row is not None:
        _revoke_family(session, row.family_id, now)
        session.commit()


def revoke_all(session: Session, user_id: uuid.UUID, now: datetime) -> None:
    """Sign out every device, e.g. after a lost phone (threat model abuse case)."""
    session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    session.commit()


def _revoke_family(session: Session, family_id: uuid.UUID, now: datetime) -> None:
    session.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )


class OwnerExistsError(Exception):
    pass


def create_owner(session: Session, email: str, password: str) -> User:
    """One-time setup of the single Phase 1 account; there is no public sign-up (FR-26)."""
    if session.scalar(select(func.count()).select_from(User)):
        raise OwnerExistsError
    if len(password) < 12:
        raise ValueError("password must be at least 12 characters")
    user = User(email=email.strip(), password_hash=hash_password(password), automation_enabled=True)
    session.add(user)
    session.commit()
    return user
