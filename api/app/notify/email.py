"""Plain SMTP email for the fallback channel. Any provider with SMTP works (spike S-5)."""

import smtplib
from email.message import EmailMessage
from typing import Protocol


class EmailSender(Protocol):
    def send(self, to: str, subject: str, body: str) -> bool: ...


class SmtpSender:
    def __init__(
        self, host: str, port: int, username: str | None, password: str | None, sender: str
    ) -> None:
        self._host, self._port = host, port
        self._username, self._password = username, password
        self._from = sender

    def send(self, to: str, subject: str, body: str) -> bool:
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = self._from, to, subject
        msg.set_content(body)
        try:
            with smtplib.SMTP(self._host, self._port, timeout=10) as smtp:
                smtp.starttls()
                if self._username and self._password:
                    smtp.login(self._username, self._password)
                smtp.send_message(msg)
        except (smtplib.SMTPException, OSError):
            return False
        return True


class DisabledEmail:
    """Used when no SMTP server is configured."""

    def send(self, to: str, subject: str, body: str) -> bool:
        return False
