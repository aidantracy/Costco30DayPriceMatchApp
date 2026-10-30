import json
import smtplib
from email.message import EmailMessage
from typing import Any, ClassVar

import httpx
import pytest
from pydantic import SecretStr

from app.config import Settings
from app.notify.email import DisabledEmail, SmtpSender
from app.notify.factory import build_notifier
from app.notify.push import EXPO_PUSH_URL, ExpoPushClient, PushMessage


def client_returning(handler: Any) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def msg(token: str, badge: int | None = None) -> PushMessage:
    return PushMessage(token, "Price drop", "Example: save $1.00.", {"screen": "x"}, badge)


def test_send_nothing_makes_no_request() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request expected")

    assert ExpoPushClient(client_returning(handler)).send([]) == []


def test_send_posts_payload_and_reads_tickets() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "data": [
                    {"status": "ok", "id": "a"},
                    {"status": "error", "details": {"error": "DeviceNotRegistered"}},
                    {"status": "error", "details": {"error": "MessageRateExceeded"}},
                ]
            },
        )

    push = ExpoPushClient(client_returning(handler), access_token="tok")
    results = push.send([msg("ExponentPushToken[a]", badge=2), msg("b"), msg("c")])

    assert seen["url"] == EXPO_PUSH_URL
    assert seen["auth"] == "Bearer tok"
    assert seen["body"][0]["badge"] == 2 and "badge" not in seen["body"][1]
    assert [(r.ok, r.unregistered) for r in results] == [
        (True, False),
        (False, True),
        (False, False),
    ]


def test_missing_tickets_count_as_failures() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert "authorization" not in request.headers
        return httpx.Response(200, json={"data": [{"status": "ok"}]})

    results = ExpoPushClient(client_returning(handler)).send([msg("a"), msg("b")])
    assert [r.ok for r in results] == [True, False]


@pytest.mark.parametrize(
    "response",
    [httpx.Response(500), httpx.Response(200, content=b"not json")],
)
def test_server_errors_fail_every_message(response: httpx.Response) -> None:
    results = ExpoPushClient(client_returning(lambda r: response)).send([msg("a"), msg("b")])
    assert [r.ok for r in results] == [False, False]


class FakeSMTP:
    sent: ClassVar[list[EmailMessage]] = []
    fail: ClassVar[bool] = False

    def __init__(self, host: str, port: int, timeout: int) -> None:
        self.logged_in: tuple[str, str] | None = None

    def __enter__(self) -> "FakeSMTP":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def starttls(self) -> None:
        if FakeSMTP.fail:
            raise smtplib.SMTPException("no tls")

    def login(self, user: str, password: str) -> None:
        self.logged_in = (user, password)

    def send_message(self, message: EmailMessage) -> None:
        FakeSMTP.sent.append(message)


def test_smtp_sender(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    FakeSMTP.sent, FakeSMTP.fail = [], False
    sender = SmtpSender("smtp.example.com", 587, "user", "pw", "alerts@example.com")

    assert sender.send("owner@example.com", "Price drop", "Body")
    assert FakeSMTP.sent[0]["To"] == "owner@example.com"
    assert FakeSMTP.sent[0]["From"] == "alerts@example.com"

    FakeSMTP.fail = True
    assert not sender.send("owner@example.com", "Price drop", "Body")


def test_disabled_email_never_sends() -> None:
    assert not DisabledEmail().send("owner@example.com", "s", "b")


def test_factory_picks_email_by_settings() -> None:
    http = httpx.Client()
    plain = build_notifier(Settings(), http)
    assert isinstance(plain._email, DisabledEmail)

    configured = build_notifier(
        Settings(
            smtp_host="smtp.example.com",
            smtp_password=SecretStr("pw"),
            expo_access_token=SecretStr("tok"),
        ),
        http,
    )
    assert isinstance(configured._email, SmtpSender)
    assert configured._push._headers["Authorization"] == "Bearer tok"
