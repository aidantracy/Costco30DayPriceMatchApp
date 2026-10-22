# ADR 0002: FastAPI (Python) for the backend API and jobs

**Status:** Accepted · **Date:** Oct 21, 2026

## Context

The backend stores purchases, prices, flags and claims; authenticates the single app account (FR-26 to FR-28); runs the daily price checks, reminders and health checks (FR-16, FR-20, FR-21); and sends notifications. The charter names Python as the likely backend language. Request and response shapes are shared with a TypeScript app, so a machine-readable API contract is valuable.

## Decision

Use FastAPI with Pydantic models, SQLAlchemy 2 and Alembic migrations, running on Python 3.12 or later. The same codebase provides the API service and the scheduled job entry points.

## Consequences

- Pydantic validates every request and response, which covers much of the input-validation work in ASVS Level 1 (NFR-07).
- FastAPI generates an OpenAPI document; the app's TypeScript API client is generated from it, keeping both sides in sync.
- Async request handling suits the price checker's outbound HTTP calls.
- Business rules live in a plain Python package with no web or database imports, so they can be unit-tested to the 90% branch-coverage target (NFR-24).

## Alternatives considered

- **Flask:** the developer's most familiar framework, but validation, API docs and async support all need add-ons.
- **Django:** batteries included, but heavier than a single-user API needs, and its admin and templates go unused.
