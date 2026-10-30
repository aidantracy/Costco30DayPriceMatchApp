"""Expo push service client. Expo forwards to Apple (APNs) and Google (FCM)."""

from dataclasses import dataclass
from typing import Any

import httpx

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


@dataclass(frozen=True)
class PushMessage:
    to: str
    title: str
    body: str
    data: dict[str, str]
    badge: int | None = None


@dataclass(frozen=True)
class PushResult:
    token: str
    ok: bool
    unregistered: bool = False


class ExpoPushClient:
    def __init__(self, http: httpx.Client, access_token: str | None = None) -> None:
        self._http = http
        self._headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if access_token:
            self._headers["Authorization"] = f"Bearer {access_token}"

    def send(self, messages: list[PushMessage]) -> list[PushResult]:
        if not messages:
            return []
        payload: list[dict[str, Any]] = [
            {
                "to": m.to,
                "title": m.title,
                "body": m.body,
                "data": m.data,
                "sound": "default",
                **({"badge": m.badge} if m.badge is not None else {}),
            }
            for m in messages
        ]
        try:
            response = self._http.post(EXPO_PUSH_URL, json=payload, headers=self._headers)
            response.raise_for_status()
            tickets = response.json().get("data", [])
        except (httpx.HTTPError, ValueError):
            return [PushResult(m.to, ok=False) for m in messages]
        results = []
        for message, ticket in zip(messages, tickets, strict=False):
            ok = ticket.get("status") == "ok"
            error = (ticket.get("details") or {}).get("error")
            results.append(
                PushResult(message.to, ok=ok, unregistered=error == "DeviceNotRegistered")
            )
        results += [PushResult(m.to, ok=False) for m in messages[len(tickets) :]]
        return results
