"""Admin commands. Usage:

uv run python -m app.cli create-owner --email you@example.com
uv run python -m app.cli sign-out-everywhere --email you@example.com
"""

import argparse
import getpass
import sys

from sqlalchemy import func, select

from app.auth import service
from app.clock import utcnow
from app.db.models import User
from app.db.session import get_session


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("create-owner", "sign-out-everywhere"):
        cmd = sub.add_parser(name)
        cmd.add_argument("--email", required=True)
    args = parser.parse_args(argv)

    session = next(get_session())
    if args.command == "create-owner":
        password = getpass.getpass("Password (12+ characters): ")
        if password != getpass.getpass("Repeat password: "):
            print("Passwords don't match.", file=sys.stderr)
            return 1
        try:
            service.create_owner(session, args.email, password)
        except service.OwnerExistsError:
            print("An account already exists. Phase 1 allows one.", file=sys.stderr)
            return 1
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        print("Account created.")
        return 0

    user = session.scalar(select(User).where(func.lower(User.email) == args.email.lower()))
    if user is None:
        print("No such account.", file=sys.stderr)
        return 1
    service.revoke_all(session, user.id, utcnow())
    print("Signed out on every device.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
