from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import RefreshToken, User
from tests.api.conftest import Clock
from tests.conftest import OWNER_PASSWORD


def login(client: TestClient, password: str = OWNER_PASSWORD, email: str = "owner@example.com"):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_login_returns_tokens(client: TestClient, owner: User) -> None:
    r = login(client)
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 15 * 60
    assert body["access_token"] and body["refresh_token"]


def test_email_match_ignores_case_and_spaces(client: TestClient, owner: User) -> None:
    assert login(client, email="  OWNER@example.com ").status_code == 200


def test_wrong_password_and_unknown_email_look_the_same(client: TestClient, owner: User) -> None:
    wrong = login(client, password="nope")
    unknown = login(client, email="nobody@example.com")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_lockout_after_five_failures(client: TestClient, owner: User, clock: Clock) -> None:
    for _ in range(5):
        assert login(client, password="nope").status_code == 401
    assert login(client).status_code == 429  # locked even with the right password
    clock.now += timedelta(minutes=16)
    assert login(client).status_code == 200


def test_success_resets_failure_count(client: TestClient, owner: User, session: Session) -> None:
    for _ in range(4):
        login(client, password="nope")
    assert login(client).status_code == 200
    session.refresh(owner)
    assert owner.failed_logins == 0


def test_me_requires_a_valid_token(client: TestClient, owner: User, clock: Clock) -> None:
    assert client.get("/me").status_code == 401
    assert client.get("/me", headers={"Authorization": "Bearer junk"}).status_code == 401
    token = login(client).json()["access_token"]
    me = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "owner@example.com"
    clock.now += timedelta(minutes=15)
    assert client.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_refresh_token_cannot_be_used_as_access_token(client: TestClient, owner: User) -> None:
    refresh = login(client).json()["refresh_token"]
    assert client.get("/me", headers={"Authorization": f"Bearer {refresh}"}).status_code == 401


def test_refresh_rotates_tokens(client: TestClient, owner: User) -> None:
    first = login(client).json()
    second = client.post("/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert second.status_code == 200
    assert second.json()["refresh_token"] != first["refresh_token"]


def test_reused_refresh_token_ends_the_whole_sign_in(client: TestClient, owner: User) -> None:
    first = login(client).json()["refresh_token"]
    second = client.post("/auth/refresh", json={"refresh_token": first}).json()["refresh_token"]
    # The old token comes back, as if stolen: both it and its successor stop working.
    assert client.post("/auth/refresh", json={"refresh_token": first}).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": second}).status_code == 401


def test_expired_refresh_token_is_rejected(client: TestClient, owner: User, clock: Clock) -> None:
    refresh = login(client).json()["refresh_token"]
    clock.now += timedelta(days=31)
    assert client.post("/auth/refresh", json={"refresh_token": refresh}).status_code == 401


def test_unknown_refresh_token_is_rejected(client: TestClient, owner: User) -> None:
    assert client.post("/auth/refresh", json={"refresh_token": "made-up"}).status_code == 401


def test_logout_revokes_the_session(client: TestClient, owner: User, session: Session) -> None:
    refresh = login(client).json()["refresh_token"]
    assert client.post("/auth/logout", json={"refresh_token": refresh}).status_code == 204
    assert client.post("/auth/refresh", json={"refresh_token": refresh}).status_code == 401
    assert all(t.revoked_at for t in session.scalars(select(RefreshToken)))


def test_logout_with_unknown_token_is_harmless(client: TestClient) -> None:
    assert client.post("/auth/logout", json={"refresh_token": "made-up"}).status_code == 204


def test_refresh_tokens_are_stored_hashed(
    client: TestClient, owner: User, session: Session
) -> None:
    refresh = login(client).json()["refresh_token"]
    stored = session.scalars(select(RefreshToken.token_hash)).all()
    assert refresh.encode() not in stored
    assert all(len(h) == 32 for h in stored)


def test_update_time_zone(client: TestClient, owner: User) -> None:
    token = login(client).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    ok = client.patch("/me", json={"time_zone": "America/Chicago"}, headers=headers)
    assert ok.status_code == 200 and ok.json()["time_zone"] == "America/Chicago"
    bad = client.patch("/me", json={"time_zone": "Mars/Olympus"}, headers=headers)
    assert bad.status_code == 422
