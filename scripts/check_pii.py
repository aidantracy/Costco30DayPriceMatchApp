#!/usr/bin/env python3
"""Fail if tracked files look like they contain personal data (NFR-12).

Checks every file tracked by git for:
- email addresses outside placeholder domains
- US-style phone numbers
- masked or full payment card numbers
- Costco receipt barcode numbers other than the invented examples

Add private, local-only terms (for example your own name or street) with the
PII_DENYLIST environment variable, comma separated. Never commit that list.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".lock", ".ttf", ".woff2"}
SKIP_NAMES = {"package-lock.json", "uv.lock"}

ALLOWED_EMAIL_DOMAINS = (
    "example.com",
    "example.org",
    "users.noreply.github.com",
    "anthropic.com",
)
INVENTED_BARCODES = {"21099900201232610011030"}

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}")
PHONE = re.compile(r"(?<!\d)\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}(?!\d)")
MASKED_CARD = re.compile(r"[Xx*]{4,}[ -]?(\d{4})(?!\d)")
DIGIT_RUN = re.compile(r"(?<!\d)\d{13,19}(?!\d)")
BARCODE = re.compile(r"(?<!\d)21\d{21}(?!\d)")


def luhn_ok(number: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(number)):
        d = int(ch)
        if i % 2:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def tracked_files() -> list[Path]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], check=True, capture_output=True, text=True
    ).stdout
    return [Path(p) for p in out.split("\0") if p]


def scan_text(text: str, denylist: list[str]) -> list[str]:
    problems: list[str] = []
    for m in EMAIL.finditer(text):
        if not m.group(0).lower().endswith(ALLOWED_EMAIL_DOMAINS):
            problems.append(f"email address: {m.group(0)}")
    for m in PHONE.finditer(text):
        problems.append(f"phone number: {m.group(0)}")
    for m in MASKED_CARD.finditer(text):
        if m.group(1) != "0000":
            problems.append("masked card number")
    for m in BARCODE.finditer(text):
        if m.group(0) not in INVENTED_BARCODES:
            problems.append("receipt barcode number")
    for m in DIGIT_RUN.finditer(text):
        if luhn_ok(m.group(0)) and m.group(0) not in INVENTED_BARCODES:
            problems.append("possible card number")
    lowered = text.lower()
    for term in denylist:
        if term and term in lowered:
            problems.append("term from PII_DENYLIST")
    return problems


def main() -> int:
    denylist = [t.strip().lower() for t in os.environ.get("PII_DENYLIST", "").split(",")]
    failures = 0
    for path in tracked_files():
        if path.suffix.lower() in SKIP_SUFFIXES or path.name in SKIP_NAMES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        for problem in scan_text(text, denylist):
            print(f"{path}: {problem}")
            failures += 1
    if failures:
        print(f"\n{failures} possible personal-data finding(s). Remove them before committing.")
        return 1
    print("No personal data patterns found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
