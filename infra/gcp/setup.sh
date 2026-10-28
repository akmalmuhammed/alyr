#!/usr/bin/env bash
# Set up ALYR on Google Cloud in Doha, me-central1 (D-060). Run on the founder's machine,
# signed in with `gcloud auth login` as an owner of the project. Steps in infra/gcp/README.md.
#
#   infra/gcp/setup.sh infra         network, database, registry, accounts, export bucket, budget
#   infra/gcp/setup.sh secrets       generate database passwords and the link secret; ask for the rest
#   infra/gcp/setup.sh env-secrets <.env>  or: copy the R2, Meta and Resend values from a .env file
#   infra/gcp/setup.sh set-secret <name>   replace one secret (typed, hidden) and restart the apps
#   infra/gcp/setup.sh meta-webhook <app id>  point Meta's WhatsApp webhook at api.alyr.qa
#   infra/gcp/setup.sh apps <tag>    migration job, API, worker, web app and the nightly export
#   infra/gcp/setup.sh first-admin <tag> <email> <name>  the first person who can sign in
#   infra/gcp/setup.sh github        let GitHub Actions deploy without a stored key; print its variables
#   infra/gcp/setup.sh monitoring    uptime checks on the health addresses, email alerts (ALYR_ALERT_EMAIL)
#   infra/gcp/setup.sh lock-backups  lock the export bucket's 35-day retention (cannot be undone)
#
# No secret is printed, written to a file, or passed to an agent. Passwords are generated
# here and go straight into Secret Manager, which keeps them in Doha only.
set -euo pipefail

PROJECT="${ALYR_GCP_PROJECT:-alyr-prod}"
REGION="me-central1"
NETWORK="alyr-net"
SUBNET="alyr-run"
SQL="alyr-db"
REPO="alyr"
EXPORTS="${ALYR_EXPORT_BUCKET:-$PROJECT-db-exports}"
BILLING="${ALYR_BILLING_ACCOUNT:-}"
GITHUB_REPO="${ALYR_GITHUB_REPO:-akmalmuhammed/alyr}"

# shellcheck source=infra/gcp/gcloud.sh
. "$(dirname "$0")/gcloud.sh"
g() { gcloud_run --project "$PROJECT" --quiet "$@"; }
value() { g "$@" | tr -d '\r'; }
need() { command -v "$1" >/dev/null || { echo "setup: $1 is not installed" >&2; exit 1; }; }
need openssl

number() { value projects describe "$PROJECT" --format='value(projectNumber)'; }
sa() { echo "$1@$PROJECT.iam.gserviceaccount.com"; }
# Cloud Run's fixed addresses: https://<service>-<project number>.<region>.run.app
url() { echo "https://$1-$(number).$REGION.run.app"; }
exists() { "$@" >/dev/null 2>&1; }

secret_exists() { exists g secrets describe "$1"; }
put_secret() { # name value  (the value is never echoed)
  secret_exists "$1" || g secrets create "$1" --replication-policy=user-managed --locations="$REGION" >/dev/null
  printf '%s' "$2" | g secrets versions add "$1" --data-file=- >/dev/null
}
read_secret() { value secrets versions access latest --secret="$1"; }
ask_secret() { # name prompt
  local value
  read -r -s -p "$2: " value; echo
  if [ -n "$value" ]; then put_secret "$1" "$value"; echo "  stored $1"; else echo "  skipped $1"; fi
}
# Hex only: no character needs escaping inside a database URL.
new_password() { openssl rand -hex 24; }

# Settings the API and the worker share (docs/hosting.md, "Production settings").
SECRETS=(
  ALYR_DATABASE_URL=database-url ALYR_MIGRATION_URL=migration-url ALYR_LINK_SECRET=link-secret
  ALYR_META_APP_SECRET=meta-app-secret ALYR_META_VERIFY_TOKEN=meta-verify-token
  ALYR_META_ACCESS_TOKEN=meta-access-token ALYR_META_PHONE_NUMBER_ID=meta-phone-number-id
  ALYR_META_WABA_ID=meta-waba-id ALYR_EMAIL_API_KEY=email-api-key
  ALYR_R2_ACCOUNT_ID=r2-account-id ALYR_R2_ACCESS_KEY_ID=r2-access-key-id
  ALYR_R2_SECRET_ACCESS_KEY=r2-secret-access-key
)
secrets_flag() { local IFS=,; local s=("${SECRETS[@]/%/:latest}"); echo "${s[*]}"; }
env_flag() {
  echo "ALYR_ENV=production,ALYR_JOBS_INLINE=false,ALYR_PUBLIC_WEB_URL=${ALYR_PUBLIC_WEB_URL:-https://app.alyr.qa},ALYR_R2_BUCKET=${ALYR_R2_BUCKET:-alyr-media},ALYR_MEDIA_BASE_URL=${ALYR_MEDIA_BASE_URL:-https://media.alyr.qa}"
}
private_net=(--network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only)

case "${1:-}" in
  infra)
    [ -n "$BILLING" ] || { echo "setup: set ALYR_BILLING_ACCOUNT (gcloud billing accounts list) for the budget" >&2; exit 1; }
    echo "Switching on the services ALYR uses..."
    g services enable run.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com \
      artifactregistry.googleapis.com cloudscheduler.googleapis.com compute.googleapis.com \
      servicenetworking.googleapis.com iamcredentials.googleapis.com iam.googleapis.com \
      sts.googleapis.com storage.googleapis.com billingbudgets.googleapis.com \
      logging.googleapis.com monitoring.googleapis.com

    # Google keeps logs in a "global" bucket unless told otherwise. The apps' logs carry
    # request paths and errors that can name a shop's customers, so they stay in Doha.
    # (The _Required bucket, Google's own audit trail of who changed what, cannot move.)
    echo "Logs kept in Doha for 30 days..."
    exists g logging buckets describe alyr-doha --location="$REGION" ||
      g logging buckets create alyr-doha --location="$REGION" --retention-days=30 \
        --description="ALYR logs, kept in Doha"
    g logging sinks update _Default \
      "logging.googleapis.com/projects/$PROJECT/locations/$REGION/buckets/alyr-doha" >/dev/null

    echo "Private network: one subnet for Cloud Run, one range for the database..."
    exists g compute networks describe "$NETWORK" || g compute networks create "$NETWORK" --subnet-mode=custom
    exists g compute networks subnets describe "$SUBNET" --region="$REGION" ||
      g compute networks subnets create "$SUBNET" --network="$NETWORK" --region="$REGION" --range=10.20.0.0/24
    exists g compute addresses describe alyr-psa --global ||
      g compute addresses create alyr-psa --global --purpose=VPC_PEERING --addresses=10.30.0.0 --prefix-length=20 --network="$NETWORK"
    g services vpc-peerings connect --service=servicenetworking.googleapis.com --ranges=alyr-psa --network="$NETWORK" ||
      g services vpc-peerings update --service=servicenetworking.googleapis.com --ranges=alyr-psa --network="$NETWORK" --force

    if ! exists g sql instances describe "$SQL"; then
      echo "Creating the database (PostgreSQL 16, private address only; about 10 minutes)..."
      postgres_pw="$(new_password)"
      # Backups at 23:00 UTC is 02:00 in Doha; maintenance early on Friday morning, Doha time.
      g sql instances create "$SQL" --database-version=POSTGRES_16 --edition=ENTERPRISE \
        --tier=db-g1-small --region="$REGION" --network="projects/$PROJECT/global/networks/$NETWORK" \
        --no-assign-ip --ssl-mode=ENCRYPTED_ONLY --storage-type=SSD --storage-size=10 \
        --storage-auto-increase --backup-start-time=23:00 --retained-backups-count=14 \
        --enable-point-in-time-recovery --retained-transaction-log-days=7 \
        --maintenance-window-day=FRI --maintenance-window-hour=0 --deletion-protection \
        --root-password="$postgres_pw"
      put_secret postgres-password "$postgres_pw"
      unset postgres_pw
    fi
    exists g sql databases describe alyr --instance="$SQL" || g sql databases create alyr --instance="$SQL"

    exists g artifacts repositories describe "$REPO" --location="$REGION" ||
      g artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" \
        --description="ALYR images"

    echo "Accounts the apps run as..."
    for a in alyr-run:"ALYR API, worker and migrations" alyr-web:"ALYR web app" \
             alyr-export:"ALYR nightly database export" alyr-deploy:"ALYR deploys from GitHub"; do
      exists g iam service-accounts describe "$(sa "${a%%:*}")" ||
        g iam service-accounts create "${a%%:*}" --display-name="${a#*:}"
    done
    g projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$(sa alyr-run)" \
      --role=roles/secretmanager.secretAccessor --condition=None >/dev/null
    # The export account may start an export of this instance and nothing else.
    exists g iam roles describe alyrSqlExporter ||
      g iam roles create alyrSqlExporter --title="ALYR SQL exporter" \
        --permissions=cloudsql.instances.export,cloudsql.instances.get
    g projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$(sa alyr-export)" \
      --role="projects/$PROJECT/roles/alyrSqlExporter" --condition=None >/dev/null

    echo "The export bucket (Doha, private, 35 days)..."
    if ! exists g storage buckets describe "gs://$EXPORTS"; then
      g storage buckets create "gs://$EXPORTS" --location="$REGION" --uniform-bucket-level-access \
        --public-access-prevention --retention-period=35d
      rules="$(mktemp)"
      printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":36}}]}' > "$rules"
      if command -v cygpath >/dev/null; then rules_arg="$(cygpath -w "$rules")"; else rules_arg="$rules"; fi
      g storage buckets update "gs://$EXPORTS" --lifecycle-file="$rules_arg"
      rm -f "$rules"
    fi
    # Cloud SQL writes the export as its own account. A new instance's account is refused
    # as "invalid" for a few minutes after creation, so this waits for it.
    sql_sa="$(value sql instances describe "$SQL" --format='value(serviceAccountEmailAddress)')"
    for attempt in 1 2 3 4 5 6 7 8 9 10; do
      if g storage buckets add-iam-policy-binding "gs://$EXPORTS" --member="serviceAccount:$sql_sa" \
           --role=roles/storage.objectCreator >/dev/null 2>&1; then break; fi
      [ "$attempt" = 10 ] && { echo "setup: Cloud SQL's account still refused; run 'infra' again in a few minutes" >&2; exit 1; }
      sleep 30
    done

    if ! value billing budgets list --billing-account="$BILLING" --format='value(displayName)' | grep -qx "ALYR monthly"; then
      g billing budgets create --billing-account="$BILLING" --display-name="ALYR monthly" \
        --budget-amount="${ALYR_BUDGET:-150}USD" --filter-projects="projects/$PROJECT" \
        --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 \
        --threshold-rule=percent=1.0,basis=forecasted-spend
    fi
    echo "Done. Next: infra/gcp/setup.sh secrets"
    ;;

  secrets)
    host="$(value sql instances describe "$SQL" --format='value(ipAddresses[0].ipAddress)')"
    secret_exists app-db-password || put_secret app-db-password "$(new_password)"
    # Signs customers' order and document links. Made once and never replaced: a new one
    # ends every link already sent.
    secret_exists link-secret || put_secret link-secret "$(openssl rand -hex 32)"
    put_secret migration-url "postgresql://postgres:$(read_secret postgres-password)@$host:5432/alyr?sslmode=require"
    put_secret database-url "postgresql://alyr_app:$(read_secret app-db-password)@$host:5432/alyr?sslmode=require"
    echo "Database addresses stored. Now the values only you have (Enter skips one):"
    echo "Product photos on Cloudflare R2 (the same three values as in apps/api/.env; required):"
    ask_secret r2-account-id "Cloudflare account ID"
    ask_secret r2-access-key-id "R2 access key ID (the alyr-media token)"
    ask_secret r2-secret-access-key "R2 secret access key"
    ask_secret meta-app-secret "Meta app secret"
    ask_secret meta-verify-token "Meta webhook verify phrase"
    ask_secret meta-access-token "Meta system-user access token"
    ask_secret meta-phone-number-id "Meta phone number ID"
    ask_secret meta-waba-id "Meta WhatsApp Business Account ID"
    ask_secret email-api-key "Resend API key"
    # Cloud Run refuses to start with a missing secret; "unset" keeps optional ones from
    # blocking a deploy. The API treats them as not configured.
    for s in meta-app-secret meta-verify-token meta-access-token meta-phone-number-id meta-waba-id email-api-key; do
      secret_exists "$s" || put_secret "$s" "unset"
    done
    echo "Done. Next: infra/gcp/push-images.sh <tag>, then infra/gcp/setup.sh apps <tag>"
    ;;

  set-secret)
    # Replace one secret, typed and hidden (for example a new Meta access token), then
    # start new copies of the API and the worker so they read it.
    name="${2:?usage: setup.sh set-secret <secret name, e.g. meta-access-token>}"
    secret_exists "$name" || { echo "setup: no secret called $name" >&2; exit 1; }
    read -r -s -p "New value for $name (paste once, then Enter): " value; echo
    value="$(printf '%s' "$value" | tr -d '[:space:]')"
    [ -n "$value" ] || { echo "Nothing typed; nothing changed."; exit 1; }
    if [ "$name" = meta-access-token ]; then
      # Ask Meta before storing. Only the result is shown: Meta's error text repeats the
      # token back, so it is never printed.
      verdict="$(curl -sS -H "Authorization: Bearer $value" "https://graph.facebook.com/v25.0/me" |
        python -c "import json, sys; e = json.load(sys.stdin).get('error'); print('refused, error code %s' % e.get('code') if e else 'accepted')")"
      echo "Meta: $verdict"
      [ "$verdict" = accepted ] || { unset value; echo "Not stored; nothing changed."; exit 1; }
    fi
    put_secret "$name" "$value"
    unset value
    echo "  stored $name"
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    g run services update alyr-api --region="$REGION" --update-env-vars="ALYR_SECRETS_AT=$stamp" >/dev/null 2>&1
    g run worker-pools update alyr-worker --region="$REGION" --update-env-vars="ALYR_SECRETS_AT=$stamp" >/dev/null 2>&1
    echo "The API and the worker restarted with the new $name."
    ;;

  meta-webhook)
    # Point the Meta app's WhatsApp webhook at the API (https://api.alyr.qa/webhooks/whatsapp),
    # with the app secret and verify phrase from Secret Manager, never shown. Meta checks the
    # address at once by calling it with the verify phrase, so the API must already be live.
    app_id="${2:?usage: setup.sh meta-webhook <Meta app ID> [callback URL]}"
    callback="${3:-https://api.alyr.qa/webhooks/whatsapp}"
    graph="https://graph.facebook.com/v25.0/$app_id/subscriptions"
    app_token="$app_id|$(read_secret meta-app-secret)"
    fields="$(curl -fsS -G "$graph" --data-urlencode "access_token=$app_token" | python -c "
import json, sys
for s in json.load(sys.stdin).get('data', []):
    if s.get('object') == 'whatsapp_business_account':
        print(','.join(f['name'] for f in s.get('fields', [])))")"
    fields="${fields:-messages}"
    curl -fsS -X POST "$graph" --data-urlencode "access_token=$app_token" \
      --data-urlencode "object=whatsapp_business_account" \
      --data-urlencode "callback_url=$callback" \
      --data-urlencode "verify_token=$(read_secret meta-verify-token)" \
      --data-urlencode "fields=$fields" >/dev/null
    unset app_token
    echo "Meta now sends WhatsApp events ($fields) to $callback"
    ;;

  env-secrets)
    # The founder's shortcut for `secrets`: copy the R2, Meta and Resend values already in
    # a local .env file straight into Secret Manager. Values are never shown; only the
    # names of what was stored. Database passwords and the link secret are not taken from
    # the file: `secrets` generates those.
    file="${2:?usage: setup.sh env-secrets <path to apps/api/.env>}"
    [ -r "$file" ] || { echo "setup: cannot read $file" >&2; exit 1; }
    stored=0
    for pair in "${SECRETS[@]}"; do
      key="${pair%%=*}"; name="${pair#*=}"
      case "$name" in database-url|migration-url|link-secret) continue ;; esac
      val="$(grep -E "^[[:space:]]*$key=" "$file" | tail -1 | cut -d= -f2- | tr -d '\r' |
             sed -E 's/^[[:space:]]+|[[:space:]]+$//g; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')"
      if [ -n "$val" ]; then put_secret "$name" "$val"; echo "  stored $name"; stored=$((stored + 1)); fi
      unset val
    done
    for s in meta-app-secret meta-verify-token meta-access-token meta-phone-number-id meta-waba-id email-api-key; do
      secret_exists "$s" || put_secret "$s" "unset"
    done
    echo "Stored $stored values from the file."
    for s in r2-account-id r2-access-key-id r2-secret-access-key; do
      secret_exists "$s" || echo "  missing $s: run 'setup.sh secrets' and type it" >&2
    done
    ;;

  apps)
    tag="${2:?usage: setup.sh apps <image tag>}"
    images="$REGION-docker.pkg.dev/$PROJECT/$REPO"
    # Without photo storage the API and worker refuse to start; say so before deploying.
    for s in r2-account-id r2-access-key-id r2-secret-access-key; do
      secret_exists "$s" || { echo "setup: $s is missing; run 'setup.sh secrets' and give the R2 values" >&2; exit 1; }
    done
    g iam service-accounts add-iam-policy-binding "$(sa alyr-run)" \
      --member="serviceAccount:$(sa alyr-deploy)" --role=roles/iam.serviceAccountUser >/dev/null
    g iam service-accounts add-iam-policy-binding "$(sa alyr-web)" \
      --member="serviceAccount:$(sa alyr-deploy)" --role=roles/iam.serviceAccountUser >/dev/null

    echo "Migrations first..."
    g run jobs deploy alyr-migrate --region="$REGION" --image="$images/alyr-api:$tag" \
      --args=python,-m,alyr.migrate --service-account="$(sa alyr-run)" "${private_net[@]}" \
      --set-env-vars=ALYR_ENV=production --set-secrets="ALYR_MIGRATION_URL=migration-url:latest,ALYR_DATABASE_URL=database-url:latest" \
      --cpu=1 --memory=1Gi --max-retries=0 --task-timeout=10m
    g run jobs execute alyr-migrate --region="$REGION" --wait

    echo "The API, the worker and the web app..."
    g run deploy alyr-api --region="$REGION" --image="$images/alyr-api:$tag" --args=api --port=8080 \
      --cpu=1 --memory=1Gi --min-instances=1 --max-instances=3 --concurrency=40 --cpu-boost \
      --service-account="$(sa alyr-run)" "${private_net[@]}" --allow-unauthenticated \
      --set-env-vars="$(env_flag)" --set-secrets="$(secrets_flag)"
    g run worker-pools deploy alyr-worker --region="$REGION" --image="$images/alyr-api:$tag" \
      --args=worker --instances=1 --cpu="${ALYR_WORKER_CPU:-1}" --memory="${ALYR_WORKER_MEMORY:-512Mi}" \
      --service-account="$(sa alyr-run)" "${private_net[@]}" \
      --set-env-vars="$(env_flag)" --set-secrets="$(secrets_flag)"
    g run deploy alyr-web --region="$REGION" --image="$images/alyr-web:$tag" --port=3000 \
      --cpu=1 --memory=512Mi --min-instances=1 --max-instances=3 --cpu-boost \
      --service-account="$(sa alyr-web)" --allow-unauthenticated \
      --set-env-vars="ALYR_API_URL=$(url alyr-api)"

    echo "The nightly export, 02:00 Doha time..."
    # Google's own gcloud image; it names each export by the time it ran. The script is
    # expanded inside the job, not here. `^@^` makes @ the list separator, because the
    # script itself is full of semicolons.
    # shellcheck disable=SC2016
    g run jobs deploy alyr-db-export --region="$REGION" \
      --image=gcr.io/google.com/cloudsdktool/google-cloud-cli:slim --command=bash \
      --args='^@^-c@set -e; f="gs://$BUCKET/alyr-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"; gcloud sql export sql "$INSTANCE" "$f" --database=alyr --project="$PROJECT" --quiet; echo "exported $f"' \
      --set-env-vars="BUCKET=$EXPORTS,INSTANCE=$SQL,PROJECT=$PROJECT" \
      --service-account="$(sa alyr-export)" --max-retries=1 --task-timeout=30m
    g run jobs add-iam-policy-binding alyr-db-export --region="$REGION" \
      --member="serviceAccount:$(sa alyr-export)" --role=roles/run.invoker >/dev/null
    run_url="https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/alyr-db-export:run"
    if exists g scheduler jobs describe alyr-db-export-nightly --location="$REGION"; then
      verb=update
    else
      verb=create
    fi
    g scheduler jobs "$verb" http alyr-db-export-nightly --location="$REGION" \
      --schedule="0 2 * * *" --time-zone="Asia/Qatar" --uri="$run_url" --http-method=POST \
      --oauth-service-account-email="$(sa alyr-export)" \
      --oauth-token-scope=https://www.googleapis.com/auth/cloud-platform

    echo "API:  $(url alyr-api)/health/ready"
    echo "      $(url alyr-api)/health/worker"
    echo "Web:  $(url alyr-web)/login"
    ;;

  first-admin)
    # The first person who can sign in, and ALYR's own business and WhatsApp number
    # (alyr/first_admin.py). Once per database; more staff come from the back office.
    tag="${2:?usage: setup.sh first-admin <image tag> <email> <name>}"
    email="${3:?usage: setup.sh first-admin <image tag> <email> <name>}"
    name="${4:?usage: setup.sh first-admin <image tag> <email> <name>}"
    # `^|^` makes | the list separator: an email address has an @ in it.
    g run jobs deploy alyr-first-admin --region="$REGION" \
      --image="$REGION-docker.pkg.dev/$PROJECT/$REPO/alyr-api:$tag" \
      --args="^|^python|-m|alyr.first_admin|--email|$email|--name|$name|--own-number" \
      --service-account="$(sa alyr-run)" "${private_net[@]}" --set-env-vars=ALYR_ENV=production \
      --set-secrets="ALYR_MIGRATION_URL=migration-url:latest,ALYR_DATABASE_URL=database-url:latest,ALYR_META_PHONE_NUMBER_ID=meta-phone-number-id:latest,ALYR_META_WABA_ID=meta-waba-id:latest" \
      --cpu=1 --memory=512Mi --max-retries=0 --task-timeout=5m
    g run jobs execute alyr-first-admin --region="$REGION" --wait
    echo "Sign in at https://app.alyr.qa/login with $email (a code is emailed)."
    ;;

  github)
    num="$(number)"
    exists g iam workload-identity-pools describe github --location=global ||
      g iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
    exists g iam workload-identity-pools providers describe alyr --location=global --workload-identity-pool=github ||
      g iam workload-identity-pools providers create-oidc alyr --location=global --workload-identity-pool=github \
        --issuer-uri=https://token.actions.githubusercontent.com \
        --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref \
        --attribute-condition="assertion.repository=='$GITHUB_REPO' && assertion.ref=='refs/heads/main'"
    g iam service-accounts add-iam-policy-binding "$(sa alyr-deploy)" --role=roles/iam.workloadIdentityUser \
      --member="principalSet://iam.googleapis.com/projects/$num/locations/global/workloadIdentityPools/github/attribute.repository/$GITHUB_REPO" >/dev/null
    for role in roles/run.developer roles/artifactregistry.writer; do
      g projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$(sa alyr-deploy)" \
        --role="$role" --condition=None >/dev/null
    done
    echo "Set these as repository variables (Settings > Secrets and variables > Actions > Variables),"
    echo "or with: gh variable set NAME --body VALUE. None of them is a secret."
    echo "GCP_PROJECT=$PROJECT"
    echo "GCP_REGION=$REGION"
    echo "GCP_WORKLOAD_IDENTITY_PROVIDER=projects/$num/locations/global/workloadIdentityPools/github/providers/alyr"
    echo "GCP_DEPLOY_SERVICE_ACCOUNT=$(sa alyr-deploy)"
    ;;

  monitoring)
    # Uptime checks every 5 minutes on the three health addresses, and one email alert
    # policy per check (ALY-121). The checkers call only /health addresses, which carry no
    # personal data, from Google's probe locations.
    email="${ALYR_ALERT_EMAIL:?set ALYR_ALERT_EMAIL to the address that gets alerts}"
    token="$(value auth print-access-token)"
    api="https://monitoring.googleapis.com/v3/projects/$PROJECT"
    call() { curl -fsS -H "Authorization: Bearer $token" -H "Content-Type: application/json" "$@"; }
    channel="$(call "$api/notificationChannels" | python -c "
import json, sys
for c in json.load(sys.stdin).get('notificationChannels', []):
    if c.get('labels', {}).get('email_address') == sys.argv[1]:
        print(c['name']); break" "$email")"
    if [ -z "$channel" ]; then
      channel="$(call -X POST "$api/notificationChannels" \
        -d "{\"type\":\"email\",\"displayName\":\"ALYR alerts\",\"labels\":{\"email_address\":\"$email\"}}" |
        python -c "import json,sys; print(json.load(sys.stdin)['name'])")"
    fi
    for check in "alyr-api|/health/ready|API cannot reach the database" \
                 "alyr-api|/health/worker|Worker stopped checking in (reminders are not going out)" \
                 "alyr-web|/login|Web app down (customer pages and workspace)"                  "alyr.qa|/|Public site down (alyr.qa)"                  "app.alyr.qa|/login|Workspace address down (app.alyr.qa, through Cloudflare)"                  "api.alyr.qa|/health/ready|API address down (api.alyr.qa, where WhatsApp messages arrive)"; do
      IFS='|' read -r service path title <<<"$check"
      # A Cloud Run service by name, or a public address. The public ones go through
      # Cloudflare (the alyr-edge and alyr-site Workers), which the run.app checks cannot see.
      case "$service" in
        *.*) host="$service" ;;
        *) host="${service}-$(number).$REGION.run.app" ;;
      esac
      if ! value monitoring uptime list-configs --format='value(displayName)' | grep -qx "$title"; then
        g monitoring uptime create "$title" --resource-type=uptime-url \
          --resource-labels="host=$host,project_id=$PROJECT" --path="$path" --protocol=https \
          --period=5 --timeout=10 >/dev/null
      fi
      check_id="$(value monitoring uptime list-configs --filter="displayName=\"$title\"" --format='value(name)' | sed 's#.*/##')"
      if ! call "$api/alertPolicies" | grep -q "\"displayName\": \"$title\""; then
        call -X POST "$api/alertPolicies" -d "{
          \"displayName\": \"$title\",
          \"combiner\": \"OR\",
          \"notificationChannels\": [\"$channel\"],
          \"conditions\": [{
            \"displayName\": \"$path failing from more than one place\",
            \"conditionThreshold\": {
              \"filter\": \"metric.type=\\\"monitoring.googleapis.com/uptime_check/check_passed\\\" AND resource.type=\\\"uptime_url\\\" AND metric.label.check_id=\\\"$check_id\\\"\",
              \"aggregations\": [{\"alignmentPeriod\": \"300s\", \"perSeriesAligner\": \"ALIGN_NEXT_OLDER\",
                                  \"crossSeriesReducer\": \"REDUCE_COUNT_FALSE\", \"groupByFields\": [\"resource.label.host\"]}],
              \"comparison\": \"COMPARISON_GT\", \"thresholdValue\": 1, \"duration\": \"300s\",
              \"trigger\": {\"count\": 1}
            }
          }]
        }" >/dev/null
      fi
      echo "  watching https://$host$path"
    done
    # Errors: a server error answered by the API or web app, a crash (traceback) or a job that
    # failed (a WhatsApp send, a reminder) in any of them. Google's Error Reporting cannot read
    # logs kept in Doha, so this is a log-based count with its own alert. Python's log lines
    # carry no severity on Cloud Run, hence the text match.
    errors="alyr-app-errors"
    if ! exists g logging metrics describe "$errors"; then
      g logging metrics create "$errors" \
        --description="ALYR: server errors, crashes and failed jobs" \
        --log-filter='(resource.type="cloud_run_revision" AND resource.labels.service_name=("alyr-api" OR "alyr-web") AND httpRequest.status>=500) OR ((resource.type="cloud_run_revision" OR resource.type="cloud_run_worker_pool" OR resource.type="cloud_run_job") AND (textPayload:"Traceback" OR textPayload:"ERROR:" OR textPayload:" failed: "))' \
        >/dev/null
    fi
    title="ALYR errors (server errors, crashes, failed jobs)"
    if ! call "$api/alertPolicies" | grep -q "\"displayName\": \"$title\""; then
      call -X POST "$api/alertPolicies" -d "{
        \"displayName\": \"$title\",
        \"combiner\": \"OR\",
        \"notificationChannels\": [\"$channel\"],
        \"alertStrategy\": {\"autoClose\": \"1800s\"},
        \"documentation\": {\"content\": \"Read the lines in Logs Explorer (project alyr-prod) with the filter of the log-based metric $errors.\", \"mimeType\": \"text/markdown\"},
        \"conditions\": [{
          \"displayName\": \"Any error in 5 minutes\",
          \"conditionThreshold\": {
            \"filter\": \"metric.type=\\\"logging.googleapis.com/user/$errors\\\" AND resource.type=one_of(\\\"cloud_run_revision\\\", \\\"cloud_run_job\\\", \\\"cloud_run_worker_pool\\\")\",
            \"aggregations\": [{\"alignmentPeriod\": \"300s\", \"perSeriesAligner\": \"ALIGN_SUM\",
                                \"crossSeriesReducer\": \"REDUCE_SUM\"}],
            \"comparison\": \"COMPARISON_GT\", \"thresholdValue\": 0, \"duration\": \"0s\",
            \"trigger\": {\"count\": 1}
          }
        }]
      }" >/dev/null
    fi
    echo "  watching errors (log-based metric $errors)"
    echo "Alerts go to $email (Google sends a confirmation email the first time)."
    ;;

  lock-backups)
    echo "This locks the 35-day retention on gs://$EXPORTS for good: nobody, including you,"
    echo "can delete an export early or shorten the period. Only after a restore has been tested."
    read -r -p "Type LOCK to continue: " answer
    [ "$answer" = "LOCK" ] || { echo "Not locked."; exit 1; }
    g storage buckets update "gs://$EXPORTS" --lock-retention-period
    ;;

  *)
    sed -n '2,18p' "$0"
    exit 1
    ;;
esac
