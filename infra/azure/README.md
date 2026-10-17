# ALYR on Azure Qatar Central

Decision D-036. What runs where and why is in `docs/hosting.md`; this page is the steps.
The founder runs every step that signs in, pays, or handles a secret. Agents write and
check the code, and never see a secret.

## What gets created

One resource group, `alyr-prod`, in Qatar Central:

| Resource | Size | Roughly a month (list price) |
|---|---|---|
| Container Apps environment, apps `alyr-api`, `alyr-worker`, `alyr-web` (each 0.25 vCPU, 0.5 GiB, always one running) | Consumption | about USD 36 |
| Jobs `alyr-migrate` (each deploy) and `alyr-backup` (nightly, 02:00 Doha) | Consumption | cents |
| PostgreSQL Flexible Server 16, `Standard_B1ms`, 32 GB, 14 days of point-in-time backups, private network only | Burstable | USD 21.31 |
| Container Registry | Basic | USD 5.07 |
| Key Vault, Log Analytics (30 days, 1 GB a day cap), private network and DNS | | a few dollars |
| A budget with email alerts at 80% spent and 100% forecast | | free |

The database has no public address. Only the apps, inside the private network, reach it.

## Steps

**0. Before anything.** Open the account through Microsoft for Startups, on the personal
Microsoft account you will keep. Do not open a plain Azure free account first:
Microsoft for Startups requires an account with no earlier Azure use. Credits stay with
the subscription they are redeemed on.

**1. Install and sign in** (once, on the laptop):

```bash
winget install --exact --id Microsoft.AzureCLI
```

```bash
az login
```

If more than one subscription is listed: `az account set --subscription "<name>"`.

**2. Create the infrastructure** (10 to 15 minutes). It first checks that the
subscription may create the database in Qatar Central, and stops with what to do if not.

```bash
ALYR_ALERT_EMAIL=you@example.com infra/azure/setup.sh infra
```

**3. Store the secrets.** Database passwords are generated and stored without being
shown. You are then asked, one at a time and hidden, for the Meta values, the Resend key
and the backup settings; press Enter to skip any you do not have yet.

```bash
infra/azure/setup.sh secrets
```

**4. Connect GitHub.** Print the five repository variables and set them (none is secret):

```bash
infra/azure/setup.sh github
```

**5. Build the first images.** In GitHub: Actions > deploy-azure > Run workflow, on
`main`, with "Deploy after building" unticked. Note the commit it ran on.

**6. Create the apps** at that commit:

```bash
infra/azure/setup.sh apps <commit>
```

The API and worker restart a few times until the first migration has created their
database role; that is expected and takes a minute or two.

**7. Check from outside:** `<apiUrl>/health/ready`, `<apiUrl>/health/worker` and
`<webUrl>/login` (the `apps` step prints the addresses). All three should answer 200.

**8. Every later deploy:** Actions > deploy-azure > Run workflow, with "Deploy after
building" ticked. It builds, runs migrations, rolls out, and checks health. A failed
migration rolls nothing out.

## Custom addresses (app.alyr.qa, api.alyr.qa)

Once step 7 is green, in Cloudflare DNS for alyr.qa (DNS only, grey cloud, so traffic
goes straight to Qatar):

| Type | Name | Value |
|---|---|---|
| CNAME | `api` | the API's Azure address, without `https://` |
| TXT | `asuid.api` | `az containerapp show -g alyr-prod -n alyr-api --query properties.customDomainVerificationId -o tsv` |
| CNAME | `app` | the web app's Azure address |
| TXT | `asuid.app` | the same verification ID |

Then, for each of `api` / `alyr-api` and `app` / `alyr-web`:

```bash
az containerapp hostname add -g alyr-prod -n alyr-api --hostname api.alyr.qa
az containerapp hostname bind -g alyr-prod -n alyr-api --hostname api.alyr.qa --environment alyr-env --validation-method CNAME
```

Then redeploy `apps` with `publicWebUrl=https://app.alyr.qa` (chat links), set the
GitHub variable `ALYR_WEB_URL=https://app.alyr.qa`, and change Meta's webhook to
`https://api.alyr.qa/webhooks/whatsapp`. Only then retire the laptop tunnel.

## Not checked

This code has been compiled and linted (Bicep 0.48, actionlint, shellcheck) but has
never been deployed: there is no Azure subscription yet. Expect the first run of each
step to need small fixes. Microsoft documents that the PostgreSQL admin can give the
backup role BYPASSRLS on version 16; if it cannot, migrations print a warning and the
backup job fails until it is fixed, while the app keeps working.
