"""Request dependencies: the signed-in user for every protected route (FR-27, FR-28)."""

from datetime import datetime
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.tokens import InvalidTokenError, decode_access_token
from app.clock import utcnow
from app.config import Settings, get_settings
from app.db.models import User
from app.db.session import get_session

_bearer = HTTPBearer(auto_error=False)

SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
NowDep = Annotated[datetime, Depends(utcnow)]

UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not signed in",
    headers={"WWW-Authenticate": "Bearer"},
)


def current_user(
    session: SessionDep,
    settings: SettingsDep,
    now: NowDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise UNAUTHORIZED
    try:
        user_id = decode_access_token(
            credentials.credentials, now, settings.token_signing_key.get_secret_value()
        )
    except InvalidTokenError as exc:
        raise UNAUTHORIZED from exc
    user = session.get(User, user_id)
    if user is None:
        raise UNAUTHORIZED
    return user


CurrentUser = Annotated[User, Depends(current_user)]
