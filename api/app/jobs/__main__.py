"""Run a scheduled job: ``python -m app.jobs daily|health|reminders|retention``.

``daily`` runs retention then reminders in one execution, so production needs only two
Cloud Scheduler entries (daily and health) and stays inside the free allowance.
"""

import argparse
import json
import logging
import sys

import httpx

from app.clock import utcnow
from app.config import get_settings
from app.db.session import get_session
from app.jobs import health, reminders, retention
from app.notify.factory import build_notifier


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.jobs")
    parser.add_argument("job", choices=["daily", "health", "reminders", "retention"])
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    settings = get_settings()
    session = next(get_session())
    now = utcnow()
    result: dict[str, object] = {}
    if args.job in ("daily", "retention"):
        result["retention"] = retention.run(session, now, settings)
    if args.job != "retention":
        with httpx.Client(timeout=15) as http:
            notifier = build_notifier(settings, http)
            if args.job in ("daily", "reminders"):
                result["reminders"] = {"sent": reminders.run(session, notifier, now, settings)}
            if args.job == "health":
                result["health"] = {"sent": health.run(session, notifier, now, settings)}
    logging.info(json.dumps({"job": args.job, "result": result}))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
