# Deploying to Google Cloud

The API and every scheduled job run from one container image ([api/Dockerfile](../api/Dockerfile)).
Production data lives in Neon Postgres (ADR 0003). Secrets live in Secret Manager and are
mounted as environment variables; nothing secret is stored in the repository or the image.

| Piece | What it runs | When |
| --- | --- | --- |
| Cloud Run service `price-match-api` | `uvicorn app.main:app` | On request; scales to zero |
| Cloud Run job `price-match-migrate` | `alembic upgrade head` | Every deploy, before the service |
| Cloud Run job `price-match-reminders` | `python -m app.jobs reminders` | Daily 08:07 |
| Cloud Run job `price-match-health` | `python -m app.jobs health` | Every 6 hours |
| Cloud Run job `price-match-retention` | `python -m app.jobs retention` | Daily 03:41 |

Times are in `TIME_ZONE` (default `America/Denver`). The price-check job is added once spike S-2 is done.

## Before the first deploy

1. Create a Google Cloud project with billing enabled, and set a budget alert (Billing → Budgets & alerts) at the project's monthly ceiling.
2. Create a Neon project and copy its connection string. Change the scheme to `postgresql+psycopg://` and keep `?sslmode=require`.
3. Install the Google Cloud CLI and sign in: `gcloud auth login`.
4. From the repository root, run the one-time setup. It enables the APIs, creates the image repository and two service accounts, and prompts for each secret without echoing it:

   ```bash
   PROJECT_ID=my-project bash deploy/setup.sh
   ```

   | Secret | Required | Notes |
   | --- | --- | --- |
   | `database-url` | Yes | Neon connection string |
   | `token-signing-key` | Yes | Generated if left blank; 32+ characters |
   | `expo-access-token` | No | Only if Expo push security is turned on |
   | `smtp-password` | No | Email fallback; also set `SMTP_HOST` etc. through `EXTRA_ENV` |

## Deploy

```bash
PROJECT_ID=my-project bash deploy/deploy.sh            # build, migrate, service, jobs + schedules
PROJECT_ID=my-project bash deploy/deploy.sh service    # build and redeploy only the API
```

Each run builds the image tagged with the current commit, so deploy from a clean checkout of `main`.
Email settings that aren't secret go in `EXTRA_ENV`, for example
`EXTRA_ENV=SMTP_HOST=smtp.example.com,SMTP_USERNAME=alerts,ALERT_FROM_ADDRESS=alerts@example.com`.

Then create the single account against production (Phase 1 has no sign-up):

```bash
gcloud run jobs execute price-match-migrate --region us-central1 --wait   # if not just run
# Run the CLI once with production settings from a trusted machine:
DATABASE_URL='<neon url>' APP_ENV=production TOKEN_SIGNING_KEY='<key>' \
  uv run --directory api python -m app.cli create-owner --email you@example.com
```

## Operating it

- **Logs:** Cloud Run → service or job → Logs. Jobs log one JSON line with their result counts.
- **Run a job now:** `gcloud run jobs execute price-match-health --region us-central1 --wait`.
- **Roll back:** Cloud Run → service → Revisions → route traffic to the previous revision. Migrations only move forward; write a new migration to undo a schema change.
- **Rotate the signing key:** add a new version of `token-signing-key`, redeploy, then run `python -m app.cli sign-out-everywhere`. Every phone signs in again.
- **Lost phone:** `sign-out-everywhere` revokes every refresh token.

## Cost

Sized to stay under the project ceiling (under $10 a month): the service scales to zero with at
most 2 instances, jobs run a few minutes a day, Artifact Registry keeps only the 5 newest
images, and Neon's free plan covers the database. Cloud Scheduler bills per job beyond the
free allowance, so the fourth schedule (price checks) may add a few cents a month. Check
current Google Cloud and Neon pricing before relying on these numbers.
