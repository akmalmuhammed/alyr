# Google Cloud, Doha: backups and the emergency host

Decision D-036. Two separate uses of Google Cloud's Doha region (`me-central1`):

1. **Every night:** an encrypted copy of the database lands in a Cloud Storage bucket in
   Doha. Under USD 1 a month.
2. **Only if Azure Qatar Central fails:** ALYR is started on Cloud Run and Cloud SQL from
   the latest copy. Nothing runs, and nothing is billed for it, until then.

The founder runs these commands in Google's Cloud Shell (in the browser, signed in) or
with the gcloud tool. None of this has been run yet.

## 1. The backup bucket (set up once)

```bash
PROJECT=alyr-backups-<something-unique>
gcloud projects create "$PROJECT" --name="ALYR backups"
gcloud config set project "$PROJECT"
gcloud services enable storage.googleapis.com

# Nearline: cheap to keep, a small fee to read, 30-day minimum. Private, in Doha.
gcloud storage buckets create gs://alyr-db-doha --location=me-central1 \
  --default-storage-class=NEARLINE --uniform-bucket-level-access --public-access-prevention

# Copies older than 40 days are deleted by Google, as a second line after the backup job.
cat > lifecycle.json <<'EOF'
{"rule": [{"action": {"type": "Delete"}, "condition": {"age": 40}}]}
EOF
gcloud storage buckets update gs://alyr-db-doha --lifecycle-file=lifecycle.json

# An account that can add and read copies but not delete them, so a break-in at Azure
# cannot wipe the backups. The lifecycle rule above does the deleting.
gcloud iam service-accounts create alyr-backup-writer --display-name="ALYR backup writer"
SA="alyr-backup-writer@$PROJECT.iam.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding gs://alyr-db-doha --member="serviceAccount:$SA" --role=roles/storage.objectCreator
gcloud storage buckets add-iam-policy-binding gs://alyr-db-doha --member="serviceAccount:$SA" --role=roles/storage.objectViewer

# The key the backup job uses. It is shown once: type it straight into
# `infra/azure/setup.sh secrets` (the two "Google Cloud Storage HMAC" questions).
gcloud storage hmac create "$SA"
```

The backup job's own "delete copies older than 35 days" step is refused on this bucket
by design and is ignored; the 40-day lifecycle rule does it instead.

## 2. The second copy in Cloudflare R2 (EU), if the founder agrees

In the Cloudflare dashboard: R2 > Create bucket `alyr-db-eu`, location jurisdiction
**EU**. Add a lifecycle rule deleting objects after 40 days. Create an R2 API token with
**Object Read & Write** on that bucket only, and type its endpoint, key ID and secret into
`infra/azure/setup.sh secrets`. Without this, set the Azure parameter
`backupDestinations` to `gcs:alyr-db-doha` only.

## 3. The emergency host (only if Azure is down for hours)

Expected time: one to two hours. Practise once before the first paying customer.

1. **Database.** Create Cloud SQL for PostgreSQL 16 in `me-central1`
   (`db-g1-small` or larger), a database `alyr`, and a strong password for `postgres`.
   Grant BYPASSRLS is not needed for a restore.
2. **Restore.** From Cloud Shell, with the Cloud SQL Auth Proxy running and the founder's
   private backup key uploaded for the session only:
   `infra/backup/restore.sh gcs:alyr-db-doha/<newest file> postgresql://postgres:<password>@127.0.0.1:5432/alyr`
   (it creates the app role and checks the target is empty).
3. **Images.** Copy the three images from the Azure registry to Artifact Registry in
   `me-central1` (`docker pull`, `docker tag`, `docker push`).
4. **Run.** Cloud Run services `alyr-api` (min instances 1, CPU always allocated) and
   `alyr-web`, and the worker as a Cloud Run worker pool (min 1), with the same settings
   as in Azure (`docs/hosting.md`, "Production settings"), the database through the
   Cloud SQL connector, and secrets in Secret Manager.
5. **Switch.** A custom domain on Cloud Run in Doha needs Google's external load balancer
   (about USD 18 a month). Point `api.alyr.qa` and `app.alyr.qa` at it in Cloudflare, and
   check Meta's webhook verifies.
6. **After Azure is back:** back up Google, restore into a fresh Azure server, switch the
   addresses back, then delete the Google services.
