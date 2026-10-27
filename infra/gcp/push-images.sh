#!/usr/bin/env bash
# Build ALYR's two images on this machine and push them to Artifact Registry in Doha
# (D-060). For the first deploy, and whenever GitHub Actions cannot run; afterwards the
# deploy-gcp workflow does the same from GitHub.
#
#   infra/gcp/push-images.sh [tag]     tag defaults to the current commit
#
# Needs Docker and `gcloud auth login`. The web app is built with the API's Cloud Run
# address, because Next.js fixes its /api forwarding at build time.
set -euo pipefail

PROJECT="${ALYR_GCP_PROJECT:-alyr-prod}"
REGION="me-central1"
here="$(cd "$(dirname "$0")/../.." && pwd)"
tag="${1:-$(git -C "$here" rev-parse --short=12 HEAD)}"

if command -v gcloud.cmd >/dev/null 2>&1; then GCLOUD=gcloud.cmd; else GCLOUD=gcloud; fi
value() { "$GCLOUD" --project "$PROJECT" "$@" | tr -d '\r'; }

if [ -n "$(git -C "$here" status --porcelain)" ]; then
  echo "push-images: the working tree has uncommitted changes; commit first so the tag means something" >&2
  exit 1
fi

num="$(value projects describe "$PROJECT" --format='value(projectNumber)')"
registry="$REGION-docker.pkg.dev"
images="$registry/$PROJECT/alyr"
api_url="https://alyr-api-$num.$REGION.run.app"
web_url="${ALYR_PUBLIC_WEB_URL:-https://alyr-web-$num.$REGION.run.app}"

# A short-lived token, not a stored key.
value auth print-access-token | docker login -u oauth2accesstoken --password-stdin "https://$registry" >/dev/null

docker build -t "$images/alyr-api:$tag" "$here/apps/api"
docker build -t "$images/alyr-web:$tag" \
  --build-arg ALYR_API_URL="$api_url" \
  --build-arg NEXT_PUBLIC_ALYR_WORKSPACE_URL="$web_url" \
  "$here/apps/web"
docker push "$images/alyr-api:$tag"
docker push "$images/alyr-web:$tag"
echo "Pushed $images/alyr-api:$tag and alyr-web:$tag"
echo "Next: infra/gcp/setup.sh apps $tag"
