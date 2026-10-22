# ADR 0004: Run automatic price checks on the server

**Status:** Accepted · **Date:** Oct 21, 2026 · **Resolves:** OQ-08

## Context

Every open, non-excluded purchase must be price-checked at least once every 24 hours (FR-16, NFR-18). The product pages and the in-warehouse savings listing are public and need no Costco sign-in. Phones run background work only when the operating system allows it (OQ-11), so checks on the phone can be late or skipped.

## Decision

Run the price check as a daily Cloud Run job. It builds the list of distinct item numbers and channels across open purchases, fetches the matching Costco pages at personal-use rates (NFR-21), records each result as a price observation, and flags purchases whose price paid is higher (FR-18).

## Consequences

- Reliable daily timing, independent of the phone.
- Costco traffic for price checks comes from Google Cloud addresses rather than the owner's phone, which may be more likely to meet bot checks. The job stops on any challenge and raises a health alert (FR-21); it never retries around one.
- The job only requests hosts on an allowlist and builds URLs from validated item numbers, which closes off server-side request forgery (see the threat model).
- Receipt sync stays on the phone, because it needs the owner's Costco session (ADR 0005).

## Alternatives considered

- **On the phone:** keeps all Costco traffic on the owner's connection, but background limits make the 24-hour target unreliable.
