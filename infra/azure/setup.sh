#!/usr/bin/env bash
# Set up ALYR on Azure Qatar Central (D-036). Run by the founder, on his own machine,
# signed in with `az login` as an Owner of the subscription. See infra/azure/README.md.
#
#   infra/azure/setup.sh infra       pass 1: network, database, Key Vault, registry, environment, budget
#   infra/azure/setup.sh secrets     ask for each secret and store it in Key Vault (typed, never shown)
#   infra/azure/setup.sh apps <tag>  pass 2: create the apps and jobs at an image tag the workflow pushed
#   infra/azure/setup.sh github      print the four non-secret values GitHub's deploy workflow needs
#
# No secret is printed, written to a file, or passed to an agent. Database passwords are
# generated here and go straight into Key Vault.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
RG="${ALYR_RESOURCE_GROUP:-alyr-prod}"
LOCATION="qatarcentral"
ALERT_EMAIL="${ALYR_ALERT_EMAIL:-}"

need() { command -v "$1" >/dev/null || { echo "setup: $1 is not installed" >&2; exit 1; }; }
need az
need openssl

out() { az deployment group show -g "$RG" -n alyr-infra --query "properties.outputs.$1.value" -o tsv; }
vault() { out keyVaultName; }
secret_exists() { az keyvault secret show --vault-name "$(vault)" -n "$1" --query id -o tsv >/dev/null 2>&1; }
put_secret() { # name value  (value is never echoed)
  az keyvault secret set --vault-name "$(vault)" -n "$1" --value "$2" --output none
}
ask_secret() { # name prompt
  local value
  read -r -s -p "$2: " value; echo
  if [ -n "$value" ]; then put_secret "$1" "$value"; echo "  stored $1"; else echo "  skipped $1"; fi
}
# Generated passwords are hex: no character needs escaping inside a database URL.
new_password() { openssl rand -hex 24; }

deploy() { # extra parameters...
  local admin_pw
  admin_pw="$(az keyvault secret show --vault-name "$(vault)" -n postgres-admin-password --query value -o tsv 2>/dev/null || true)"
  [ -n "$admin_pw" ] || admin_pw="${FIRST_ADMIN_PASSWORD:?}"
  az deployment group create -g "$RG" -n alyr-infra -f "$here/main.bicep" --output none \
    -p operatorObjectId="$(az ad signed-in-user show --query id -o tsv)" \
       alertEmail="$ALERT_EMAIL" postgresAdminPassword="$admin_pw" "$@"
}

case "${1:-}" in
  infra)
    [ -n "$ALERT_EMAIL" ] || { echo "setup: set ALYR_ALERT_EMAIL to the address for budget alerts" >&2; exit 1; }
    echo "Checking the subscription can use what ALYR needs in Qatar Central..."
    for ns in Microsoft.App Microsoft.DBforPostgreSQL Microsoft.ContainerRegistry Microsoft.KeyVault \
              Microsoft.OperationalInsights Microsoft.Network Microsoft.ManagedIdentity Microsoft.Consumption; do
      az provider register --namespace "$ns" --wait --output none
    done
    if ! az postgres flexible-server list-skus -l "$LOCATION" --query "[].supportedServerEditions[?name=='Burstable'].supportedServerSkus[].name" -o tsv 2>/dev/null | grep -qx Standard_B1ms; then
      echo "setup: this subscription cannot create the B1ms database in Qatar Central yet." >&2
      echo "       File a region access request (docs: https://learn.microsoft.com/troubleshoot/azure/general/region-access-request-process)." >&2
      exit 1
    fi
    az group create -n "$RG" -l "$LOCATION" --tags app=alyr decision=D-036 --output none
    FIRST_ADMIN_PASSWORD="$(new_password)"
    export FIRST_ADMIN_PASSWORD
    echo "Creating the network, database, Key Vault, registry and environment (about 10 to 15 minutes)..."
    deploy deployApps=false
    put_secret postgres-admin-password "$FIRST_ADMIN_PASSWORD"
    unset FIRST_ADMIN_PASSWORD
    echo "Done. Next: infra/azure/setup.sh secrets"
    ;;

  secrets)
    host="$(out postgresHost)"
    admin_pw="$(az keyvault secret show --vault-name "$(vault)" -n postgres-admin-password --query value -o tsv)"
    # The app and backup roles get their own generated passwords; migrations create the
    # roles with them on the first deploy.
    for role in app backup; do
      if ! secret_exists "${role}-db-password"; then put_secret "${role}-db-password" "$(new_password)"; fi
    done
    # Signs customers' order and document links. Made once and never replaced: a new one
    # ends every link already sent.
    if ! secret_exists link-secret; then put_secret link-secret "$(openssl rand -hex 32)"; fi
    app_pw="$(az keyvault secret show --vault-name "$(vault)" -n app-db-password --query value -o tsv)"
    backup_pw="$(az keyvault secret show --vault-name "$(vault)" -n backup-db-password --query value -o tsv)"
    put_secret migration-url "postgresql://alyradmin:${admin_pw}@${host}:5432/alyr?sslmode=require"
    put_secret database-url "postgresql://alyr_app:${app_pw}@${host}:5432/alyr?sslmode=require"
    put_secret backup-url "postgresql://alyr_backup:${backup_pw}@${host}:5432/alyr?sslmode=require"
    unset admin_pw app_pw backup_pw
    echo "Database addresses stored. Now the values only you have (press Enter to skip one):"
    ask_secret meta-app-secret "Meta app secret"
    ask_secret meta-verify-token "Meta webhook verify phrase"
    ask_secret meta-access-token "Meta system-user access token"
    ask_secret meta-phone-number-id "Meta phone number ID"
    ask_secret meta-waba-id "Meta WhatsApp Business Account ID"
    ask_secret email-api-key "Resend API key"
    echo "Product photos on Cloudflare R2 (the same three values as in apps/api/.env; required):"
    ask_secret r2-account-id "Cloudflare account ID"
    ask_secret r2-access-key-id "R2 access key ID (the alyr-media app token)"
    ask_secret r2-secret-access-key "R2 secret access key"
    echo "Backup settings (skip until the Google and Cloudflare buckets exist, infra/gcp/README.md):"
    ask_secret backup-age-recipient "Backup public key (age1...)"
    ask_secret backup-gcs-access-key-id "Google Cloud Storage HMAC access key ID"
    ask_secret backup-gcs-secret-access-key "Google Cloud Storage HMAC secret"
    ask_secret backup-r2-endpoint "Cloudflare R2 endpoint (https://<account>.eu.r2.cloudflarestorage.com)"
    ask_secret backup-r2-access-key-id "Cloudflare R2 access key ID"
    ask_secret backup-r2-secret-access-key "Cloudflare R2 secret"
    # Container Apps refuses to start if a referenced secret is missing; empty
    # placeholders keep optional ones from blocking the first deploy.
    for s in meta-app-secret meta-verify-token meta-access-token meta-phone-number-id meta-waba-id email-api-key              backup-age-recipient backup-gcs-access-key-id backup-gcs-secret-access-key              backup-r2-endpoint backup-r2-access-key-id backup-r2-secret-access-key; do
      secret_exists "$s" || put_secret "$s" "unset"
    done
    echo "Done. Next: run the GitHub workflow 'deploy-azure' with deploy=false, then infra/azure/setup.sh apps <tag>"
    ;;

  apps)
    tag="${2:?usage: setup.sh apps <image tag>}"
    # Without photo storage the API and worker refuse to start; say so before deploying.
    for s in r2-account-id r2-access-key-id r2-secret-access-key; do
      secret_exists "$s" || { echo "setup: $s is missing; run 'setup.sh secrets' and give the R2 values" >&2; exit 1; }
    done
    # The nightly backup goes only where its keys were given; no key, no destination.
    is_set() { [ "$(az keyvault secret show --vault-name "$(vault)" -n "$1" --query value -o tsv 2>/dev/null)" != "unset" ] && secret_exists "$1"; }
    destinations=""
    if is_set backup-gcs-access-key-id; then destinations="gcs:alyr-db-doha"; fi
    if is_set backup-r2-access-key-id; then destinations="$destinations r2:alyr-db-eu"; fi
    backup_job=false
    if is_set backup-age-recipient && [ -n "$destinations" ]; then backup_job=true; fi
    echo "Creating the apps and jobs at $tag (backup job: $backup_job${destinations:+, to$destinations})..."
    deploy deployApps=true imageTag="$tag" deployBackupJob="$backup_job"       backupDestinations="${destinations# }"
    echo "Running migrations once..."
    az containerapp job start -g "$RG" -n alyr-migrate --output none
    echo "API:  $(out apiUrl)/health/ready"
    echo "Web:  $(out webUrl)/login"
    ;;

  github)
    echo "Set these as repository variables (Settings > Secrets and variables > Actions > Variables),"
    echo "or with: gh variable set NAME --body VALUE. None of them is a secret."
    echo "AZURE_CLIENT_ID=$(out deployClientId)"
    echo "AZURE_TENANT_ID=$(out tenantId)"
    echo "AZURE_SUBSCRIPTION_ID=$(out subscriptionId)"
    echo "AZURE_RESOURCE_GROUP=$RG"
    echo "AZURE_REGISTRY=$(out registryName)"
    ;;

  *)
    sed -n '2,12p' "$0"
    exit 1
    ;;
esac
