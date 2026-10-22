# ADR 0003: Google Cloud Run and Neon Postgres for hosting

**Status:** Accepted · **Date:** Oct 21, 2026

## Context

Phase 1 running costs must stay under $10 a month, excluding app store fees (NFR-28, OQ-07). The workload is tiny: one user, a few API calls a day, and a few short scheduled jobs. Data must be encrypted at rest (NFR-11), backed up (NFR-20), and secrets kept out of code (NFR-06).

## Decision

- **API:** a container on Google Cloud Run (request-based billing, scale to zero), in a US region.
- **Jobs:** Cloud Run jobs, triggered by Cloud Scheduler, for the price check, reminders, health checks and data retention.
- **Database:** Neon serverless Postgres (free plan, scales to zero).
- **Secrets:** Google Secret Manager, injected into Cloud Run as environment variables.
- **Deployment:** GitHub Actions builds the container, runs tests and scans, and deploys to Cloud Run.

## Consequences

- At Phase 1 volumes, usage is expected to stay inside the free allowances, as listed in October 2026: Cloud Run includes 2 million requests and 180,000 vCPU-seconds a month for request-billed services, and its free tier also covers jobs; Neon's free plan includes 1 GB of storage and 100 compute-hours a month per project. A Google Cloud budget alert at $5 a month catches surprises.
- Both scale to zero, so the first request after idle has a cold start of a second or two. Acceptable for this app.
- Neon's free plan keeps point-in-time restore for a short window only, so a daily logical backup (`pg_dump`) to a Cloud Storage bucket is added to meet NFR-20.
- Two vendors instead of one, each with its own account and credentials.

## Alternatives considered

- **Supabase:** database, auth and functions in one, but free projects pause after a week of inactivity and its functions are not Python.
- **A small VPS:** predictable cost and full control, but the developer would patch the OS, run the database and manage backups.
