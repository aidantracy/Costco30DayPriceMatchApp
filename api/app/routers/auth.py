"""Sign-in, token refresh, sign-out and account settings."""

from zoneinfo import available_timezones

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator

from app.auth import service
from app.auth.deps import CurrentUser, NowDep, SessionDep, SettingsDep

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=256)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105 (OAuth token type, not a secret)
    expires_in: int


class MeResponse(BaseModel):
    id: str
    email: str
    time_zone: str
    automation_enabled: bool


class MeUpdate(BaseModel):
    time_zone: str

    @field_validator("time_zone")
    @classmethod
    def _known_zone(cls, value: str) -> str:
        if value not in available_timezones():
            raise ValueError("unknown time zone")
        return value


BAD_CREDENTIALS = HTTPException(status.HTTP_401_UNAUTHORIZED, "Email or password is incorrect")
LOCKED = HTTPException(
    status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try again in a few minutes."
)


def _tokens(pair: service.TokenPair) -> TokenResponse:
    return TokenResponse(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        expires_in=pair.expires_in,
    )


@router.post("/auth/login")
def login(
    body: LoginRequest, session: SessionDep, settings: SettingsDep, now: NowDep
) -> TokenResponse:
    try:
        return _tokens(service.login(session, body.email, body.password, now, settings))
    except service.LockedError as exc:
        raise LOCKED from exc
    except service.AuthError as exc:
        raise BAD_CREDENTIALS from exc


@router.post("/auth/refresh")
def refresh(
    body: RefreshRequest, session: SessionDep, settings: SettingsDep, now: NowDep
) -> TokenResponse:
    try:
        return _tokens(service.refresh(session, body.refresh_token, now, settings))
    except service.AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in again") from exc


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: RefreshRequest, session: SessionDep, now: NowDep) -> Response:
    service.logout(session, body.refresh_token, now)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _me(user: CurrentUser) -> MeResponse:
    return MeResponse(
        id=str(user.id),
        email=user.email,
        time_zone=user.time_zone,
        automation_enabled=user.automation_enabled,
    )


@router.get("/me")
def get_me(user: CurrentUser) -> MeResponse:
    return _me(user)


@router.patch("/me")
def update_me(body: MeUpdate, user: CurrentUser, session: SessionDep) -> MeResponse:
    user.time_zone = body.time_zone
    session.commit()
    return _me(user)
