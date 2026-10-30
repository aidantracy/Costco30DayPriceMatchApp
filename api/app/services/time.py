"""Calendar dates in the user's time zone (OQ-04)."""

from datetime import date, datetime
from zoneinfo import ZoneInfo


def local_today(now: datetime, time_zone: str) -> date:
    return now.astimezone(ZoneInfo(time_zone)).date()
