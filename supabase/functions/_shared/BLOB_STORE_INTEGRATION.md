# BlobStore integration boundary

This directory contains the active provider-neutral Evidence object boundary.
The Edge API uses it for immutable upload signing, streamed completion
verification, signed download creation, and account-deletion cleanup.
Supabase private Storage remains the default provider until an R2/S3
configuration is explicitly provisioned and verified. Export artifacts remain
in their separate private `exports` bucket.

## Reviewed provider semantics

- Cloudflare R2 exposes its S3 API at
  `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` and requires region `auto`.
- R2 presigned URLs authorize one GET, PUT, HEAD, or DELETE operation for
  between one second and seven days. Anyone holding the URL can use it until it
  expires, so URLs and query signatures must never enter database identifiers,
  analytics, logs, or durable sync payloads.
- Browser requests require bucket CORS rules for the exact origins, methods,
  and signed headers used by the client.
- The AWS JavaScript v3 presigner must mark `Content-Type` as signable and
  `x-amz-meta-*` verification headers as unhoistable when those headers must be
  supplied by the uploader.
- R2 implements `HeadObject`, `GetObject`, `PutObject`, `DeleteObject`, and
  `DeleteObjects`, but its S3 feature matrix differs from AWS. Heldat therefore
  treats streamed SHA-256 calculation as the authoritative byte-integrity
  boundary rather than assuming a provider checksum feature.
- Supabase signed upload URLs have a provider-defined two-hour validity.
  Supabase recommends new object paths rather than overwriting existing paths.

Primary references:

- <https://developers.cloudflare.com/r2/api/s3/presigned-urls/>
- <https://developers.cloudflare.com/r2/api/s3/api/>
- <https://developers.cloudflare.com/r2/buckets/cors/>
- <https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/>
- <https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl>
- <https://supabase.com/docs/guides/storage/uploads/standard-uploads>

## Contract

`blobStore.ts` exposes only immutable canonical keys:

```text
HOUSEHOLD_UUID/BLOB_UUID/EVIDENCE_VERSION_UUID
```

Provider endpoints, bucket URLs, signed query strings, and provider object URLs
are transport details. The Postgres `blob_objects.object_key` remains the
canonical identifier.

Every adapter supports:

1. A signed immutable PUT intent.
2. HEAD metadata for byte size, content type, ETag, and expected-checksum
   metadata when the provider preserves it.
3. A web `ReadableStream<Uint8Array>` for authoritative streaming SHA-256
   verification without buffering the complete object.
4. A short-lived signed GET.
5. Bounded, idempotent batch deletion with per-key failures.

R2/S3 PUT signing requires:

```text
Content-Type
If-None-Match: *
x-amz-meta-heldat-sha256
x-amz-meta-heldat-byte-size
x-amz-meta-heldat-content-type
x-amz-meta-heldat-schema
```

The Supabase adapter uses `upsert: false` and `x-upsert: false`. Supabase HEAD
does not replace streaming SHA-256 verification because signed standard uploads
do not bind the Heldat metadata headers.

## Environment

All providers require:

```text
BLOB_STORE_PROVIDER=supabase|r2|s3
BLOB_STORE_BUCKET=evidence
BLOB_SIGNED_DOWNLOAD_TTL_SECONDS=300
```

R2:

```text
R2_ACCOUNT_ID=<32 lowercase hex characters>
R2_ACCESS_KEY_ID=<scoped S3 access key>
R2_SECRET_ACCESS_KEY=<scoped S3 secret>
BLOB_SIGNED_UPLOAD_TTL_SECONDS=300
```

The endpoint and `auto` region are derived rather than accepted from
environment input.

Generic S3-compatible storage:

```text
S3_ENDPOINT=https://storage.example
S3_REGION=region-id
S3_ACCESS_KEY_ID=<access key>
S3_SECRET_ACCESS_KEY=<secret>
S3_FORCE_PATH_STYLE=false
BLOB_SIGNED_UPLOAD_TTL_SECONDS=300
```

Supabase:

```text
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only service role key>
BLOB_SIGNED_UPLOAD_TTL_SECONDS=7200
```

## Active wiring and provider migration sequence

1. One `BlobStore` is instantiated per warm Edge isolate with
   `createBlobStoreFromEnv`.
2. The database upload-intent RPC remains the admission, ownership, and quota
   boundary.
3. Provider-neutral upload signing occurs only after the database reservation
   succeeds.
4. Completion calls `headObject`, validates size/type/metadata, then hashes
   `openReadStream().stream` incrementally before `mark_blob_stored`.
5. Signed downloads are returned only after authorization, immutable
   EvidenceVersion validation, and provider metadata assessment.
6. Account deletion and the maintenance worker use `deleteBatch`; queue rows
   are completed only after provider-confirmed deletion and released for
   bounded retry on failure.
7. Before selecting R2/S3 in production, provision exact CORS and scoped
   credentials, set the provider environment, run its live integration suite,
   and retain Supabase as the rollback configuration.

Never place S3 credentials, service-role keys, signed URLs, or provider endpoint
URLs in a mobile/web bundle or response logging.
