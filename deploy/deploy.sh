#!/usr/bin/env bash
# Build the API image and deploy the Cloud Run service, jobs and schedules.
# Safe to re-run: every step creates or updates. See deploy/README.md first.
#
#   PROJECT_ID=my-project bash deploy/deploy.sh            # everything
#   PROJECT_ID=my-project bash deploy/deploy.sh migrate    # build + run migrations only
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID to your Google Cloud project id}"
REGION="${REGION:-us-central1}"
TIME_ZONE="${TIME_ZONE:-America/Denver}"   # schedule times below are in this zone
REPO="${REPO:-price-match}"
SERVICE="${SERVICE:-price-match-api}"
RUNTIME_SA="price-match-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
SCHEDULER_SA="price-match-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
TAG="$(git rev-parse --short HEAD)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/api:${TAG}"

# Secret Manager secrets mounted as environment variables (create them first).
SECRETS="DATABASE_URL=database-url:latest,TOKEN_SIGNING_KEY=token-signing-key:latest"
OPTIONAL_SECRETS=(EXPO_ACCESS_TOKEN=expo-access-token SMTP_PASSWORD=smtp-password)
for pair in "${OPTIONAL_SECRETS[@]}"; do
  name="${pair#*=}"
  if gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    SECRETS+=",${pair}:latest"
  fi
done
ENV_VARS="APP_ENV=production${EXTRA_ENV:+,${EXTRA_ENV}}"   # e.g. EXTRA_ENV=SMTP_HOST=smtp.example.com

# name|command|schedule (cron, in TIME_ZONE)|max retries
JOBS=(
  "price-match-reminders|python,-m,app.jobs,reminders|7 8 * * *|1"
  "price-match-health|python,-m,app.jobs,health|13 */6 * * *|0"
  "price-match-retention|python,-m,app.jobs,retention|41 3 * * *|1"
)

build() {
  echo "==> Building ${IMAGE}"
  gcloud builds submit api --project "$PROJECT_ID" --region "$REGION" --tag "$IMAGE"
}

migrate() {
  echo "==> Running database migrations"
  gcloud run jobs deploy price-match-migrate --project "$PROJECT_ID" --region "$REGION" \
    --image "$IMAGE" --service-account "$RUNTIME_SA" \
    --command alembic --args upgrade,head \
    --set-secrets "$SECRETS" --set-env-vars "$ENV_VARS" \
    --max-retries 0 --task-timeout 300s --execute-now --wait
}

service() {
  echo "==> Deploying service ${SERVICE}"
  gcloud run deploy "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
    --image "$IMAGE" --service-account "$RUNTIME_SA" \
    --set-secrets "$SECRETS" --set-env-vars "$ENV_VARS" \
    --allow-unauthenticated --min-instances 0 --max-instances 2 \
    --cpu 1 --memory 512Mi --concurrency 40 --timeout 30s
}

jobs() {
  for spec in "${JOBS[@]}"; do
    IFS='|' read -r name args schedule retries <<<"$spec"
    echo "==> Deploying job ${name}"
    gcloud run jobs deploy "$name" --project "$PROJECT_ID" --region "$REGION" \
      --image "$IMAGE" --service-account "$RUNTIME_SA" \
      --command "${args%%,*}" --args "${args#*,}" \
      --set-secrets "$SECRETS" --set-env-vars "$ENV_VARS" \
      --max-retries "$retries" --task-timeout 600s
    gcloud run jobs add-iam-policy-binding "$name" --project "$PROJECT_ID" --region "$REGION" \
      --member "serviceAccount:${SCHEDULER_SA}" --role roles/run.invoker >/dev/null

    uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${name}:run"
    verb=create
    if gcloud scheduler jobs describe "$name" --project "$PROJECT_ID" --location "$REGION" \
      >/dev/null 2>&1; then
      verb=update
    fi
    gcloud scheduler jobs "$verb" http "$name" --project "$PROJECT_ID" --location "$REGION" \
      --schedule "$schedule" --time-zone "$TIME_ZONE" --uri "$uri" --http-method POST \
      --oauth-service-account-email "$SCHEDULER_SA"
  done
}

case "${1:-all}" in
  migrate) build; migrate ;;
  service) build; service ;;
  jobs) build; jobs ;;
  all) build; migrate; service; jobs ;;
  *) echo "usage: bash deploy/deploy.sh [all|migrate|service|jobs]" >&2; exit 2 ;;
esac
echo "==> Done. Image: ${IMAGE}"
