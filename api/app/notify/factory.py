import httpx

from app.config import Settings
from app.notify.email import DisabledEmail, EmailSender, SmtpSender
from app.notify.push import ExpoPushClient
from app.notify.service import Notifier


def build_notifier(settings: Settings, http: httpx.Client) -> Notifier:
    token = settings.expo_access_token.get_secret_value() if settings.expo_access_token else None
    email: EmailSender = DisabledEmail()
    if settings.smtp_host:
        email = SmtpSender(
            settings.smtp_host,
            settings.smtp_port,
            settings.smtp_username,
            settings.smtp_password.get_secret_value() if settings.smtp_password else None,
            settings.alert_from_address,
        )
    return Notifier(ExpoPushClient(http, token), email)
