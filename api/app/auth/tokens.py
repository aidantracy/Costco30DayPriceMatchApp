"""Short-lived access tokens (JWT) and opaque, rotating refresh tokens (NFR-08)."""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta

import jwt

ALGORITHM = "HS256"
ACCESS_TYPE = "access"


class InvalidTokenError(Exception):
    pass


def create_access_token(user_id: uuid.UUID, now: datetime, ttl: timedelta, key: str) -> str:
    claims = {
        "sub": str(user_id),
        "typ": ACCESS_TYPE,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(claims, key, algorithm=ALGORITHM)


def decode_access_token(token: str, now: datetime, key: str) -> uuid.UUID:
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[ALGORITHM],
            options={"require": ["sub", "typ", "exp"], "verify_exp": False},
        )
    except jwt.PyJWTError as exc:
        raise InvalidTokenError from exc
    if claims.get("typ") != ACCESS_TYPE or int(claims["exp"]) <= int(now.timestamp()):
        raise InvalidTokenError
    try:
        return uuid.UUID(claims["sub"])
    except ValueError as exc:
        raise InvalidTokenError from exc


def new_refresh_token() -> tuple[str, bytes]:
    """Return the token to give the phone and the hash to store."""
    token = secrets.token_urlsafe(32)
    return token, hash_refresh_token(token)


def hash_refresh_token(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()
