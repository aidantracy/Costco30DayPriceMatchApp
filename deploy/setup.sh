#!/usr/bin/env bash
# One-time Google Cloud setup: APIs, image repository, service accounts and secrets.
# Safe to re-run. Usage: PROJECT_ID=my-project bash deploy/setup.sh
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID to your Google Cloud project id}"
REGION="${REGION:-us-central1}"
REPO="${REPO:-price-match}"
RUNTIME_SA="price-match-runtime"
SCHEDULER_SA="price-match-scheduler"

gcloud services enable --project "$PROJECT_ID" \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com secretmanager.googleapis.com

if ! gcloud artifacts repositories describe "$REPO" --project "$PROJECT_ID" \
  --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" --project "$PROJECT_ID" --location "$REGION" \
    --repository-format docker --description "Price match API images"
fi
# Keep only the 3 newest images so storage stays inside the 0.5 GB free allowance.
cat >/tmp/price-match-cleanup.json <<'JSON'
[{"name": "keep-recent", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 3}},
 {"name": "delete-old", "action": {"type": "Delete"}, "condition": {"tagState": "any", "olderThan": "1d"}}]
JSON
gcloud artifacts repositories set-cleanup-policies "$REPO" --project "$PROJECT_ID" \
  --location "$REGION" --policy /tmp/price-match-cleanup.json >/dev/null

# New projects build with the default compute service account, which may lack Cloud Build
# permissions; grant them so `gcloud builds submit` works.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
COMPUTE_SA="${PROJECT_NUMBER}-compute"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${COMPUTE_SA}@developer.gserviceaccount.com" \
  --role roles/cloudbuild.builds.builder --condition None >/dev/null

for sa in "$RUNTIME_SA" "$SCHEDULER_SA"; do
  if ! gcloud iam service-accounts describe "${sa}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$sa" --project "$PROJECT_ID" --display-name "$sa"
  fi
done

# Secrets: prompts for each value that doesn't exist yet. Values are read without echo
# and never written to disk or shell history.
create_secret() {
  local name="$1" prompt="$2" required="$3" value
  if gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "secret ${name}: exists"
  else
    read -rsp "${prompt}${required:+ (required)}: " value; echo
    if [[ -z "$value" ]]; then
      [[ -n "$required" ]] && { echo "${name} is required" >&2; exit 1; }
      echo "secret ${name}: skipped"; return
    fi
    printf '%s' "$value" | gcloud secrets create "$name" --project "$PROJECT_ID" \
      --replication-policy automatic --data-file=-
  fi
  gcloud secrets add-iam-policy-binding "$name" --project "$PROJECT_ID" \
    --member "serviceAccount:${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role roles/secretmanager.secretAccessor >/dev/null
}
create_secret database-url "Neon URL (postgresql+psycopg://...?sslmode=require)" yes
create_secret token-signing-key "Token signing key (leave blank to generate one)" ""
if ! gcloud secrets describe token-signing-key --project "$PROJECT_ID" >/dev/null 2>&1; then
  python3 -c "import secrets; print(secrets.token_urlsafe(48), end='')" |
    gcloud secrets create token-signing-key --project "$PROJECT_ID" \
      --replication-policy automatic --data-file=-
  gcloud secrets add-iam-policy-binding token-signing-key --project "$PROJECT_ID" \
    --member "serviceAccount:${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role roles/secretmanager.secretAccessor >/dev/null
fi
create_secret expo-access-token "Expo access token (optional)" ""
create_secret smtp-password "SMTP password (optional)" ""

echo "Setup complete. Next: PROJECT_ID=${PROJECT_ID} bash deploy/deploy.sh"
