# Heldat backup format and destination adapter contract

Status: version 1, local destination implemented.

The implementation lives in:

- `supabase/scripts/backup-core.mjs`
- `supabase/scripts/backup-database.mjs`
- `supabase/scripts/backup-storage-rest.mjs`
- `supabase/scripts/backup-operations.mjs`
- `supabase/scripts/heldat-backup.mjs`

## Security properties

- All database dumps, schema dumps, manifests, and Storage objects are encrypted
  with AES-256-GCM before destination persistence.
- The 32-byte operator master key is domain-separated with HKDF-SHA256 into
  per-artifact encryption keys and a distinct envelope-authentication key. The
  backup identifier is the HKDF salt and a versioned purpose string is the info.
- Every artifact uses a fresh random 96-bit nonce.
- Authenticated additional data binds the artifact to
  `backupId + NUL + artifactId`.
- The small plaintext completion envelope is authenticated with HMAC-SHA256.
- The envelope contains operational metadata and encrypted artifact
  size/checksum only. Object names, bucket contents, row counts, and source
  endpoints remain inside the encrypted manifest.
- Source and target identities in plans/manifests are SHA-256 fingerprints of
  canonical host/database, HTTPS-origin, and Supabase project-reference values.
  Credentials are excluded. Standard direct or pooler database endpoints must
  expose the same project reference as the paired Supabase origin.
- Database credentials are passed to PostgreSQL tools through `PG*` process
  environment variables, never command arguments.
- Raw PostgreSQL tool stderr is not echoed; failures report only its byte
  count, avoiding both plaintext and guessable content digests in routine logs.
- PostgreSQL processes and dump lock waits have explicit bounded timeouts with
  termination escalation suitable for Windows and CI.
- Supabase Storage requests reject redirects so the service-role `apikey`
  cannot be forwarded to another origin.
- Restore is blocked unless database and Storage identities both differ from
  the source, target class is exactly `non-production`, and the operator supplies
  the target-specific confirmation fingerprint.

The encryption key is process input and is not stored in the backup. Key
management and independent custody are operator responsibilities.

## Committed local layout

```text
DESTINATION_ROOT/
  heldat-backup-YYYYMMDDTHHMMSSZ-1234abcd/
    envelope.json
    manifest.hbk
    database/
      database.dump.hbk
      database.schema.sql.hbk
    storage/
      OPAQUE_UUID.hbk
      ...
```

Work in progress uses a `.partial-...` sibling directory. The local adapter
flushes encrypted files and commits with an atomic directory rename after
complete offline verification.
Only canonical `heldat-backup-*` directories with authenticated
`status: complete` envelopes are listed or eligible for retention.

## Encrypted artifact container

Byte layout:

```text
8 bytes   ASCII "HLDBK01\n"
4 bytes   unsigned big-endian JSON-header length
N bytes   UTF-8 canonical JSON header
M bytes   AES-256-GCM ciphertext
16 bytes  GCM authentication tag
```

Header fields:

```json
{
  "aadSha256": "SHA256_OF_BACKUP_AND_ARTIFACT_BINDING",
  "algorithm": "AES-256-GCM",
  "artifactId": "ARTIFACT_ID",
  "keyDerivation": "HKDF-SHA256",
  "nonce": "CANONICAL_BASE64_12_BYTES",
  "version": 1
}
```

The ciphertext SHA-256 covers the full container, including magic, length,
header, ciphertext, and tag. The plaintext SHA-256 and byte count are calculated
while encrypting. Both pairs are authenticated transitively through the
encrypted manifest and authenticated envelope.

Limits are enforced before allocation or traversal:

- encryption header: 64 KiB;
- plaintext envelope: 128 KiB;
- decrypted manifest: 64 MiB;
- 1,000 private buckets;
- 250,000 Storage objects;
- safe integer byte counts and canonical relative artifact paths.

## Completion envelope

`envelope.json` is canonical JSON plus a newline. Its authenticated fields are:

```json
{
  "backupId": "heldat-backup-YYYYMMDDTHHMMSSZ-1234abcd",
  "createdAt": "UTC_ISO_TIMESTAMP",
  "destinationAdapter": "local-v1",
  "encryption": {
    "algorithm": "AES-256-GCM",
    "containerVersion": 1,
    "keyDerivation": "HKDF-SHA256"
  },
  "format": "heldat-operator-backup-envelope",
  "manifest": {
    "id": "manifest",
    "kind": "encrypted-manifest",
    "path": "manifest.hbk",
    "plaintextBytes": 0,
    "plaintextSha256": "SHA256",
    "ciphertextBytes": 0,
    "ciphertextSha256": "SHA256"
  },
  "status": "complete",
  "version": 1,
  "integrity": {
    "algorithm": "HMAC-SHA256",
    "value": "HMAC_OF_ALL_FIELDS_EXCEPT_INTEGRITY"
  }
}
```

The sample zero sizes are structural placeholders; runtime validation requires
positive ciphertext size and the exact recorded values.

## Encrypted manifest

The manifest contains:

- format/version and matching backup identifier;
- creation/completion times;
- hashed source database and Storage identities;
- PostgreSQL custom dump artifact;
- plaintext schema artifact;
- exact row counts for the configured verification schemas;
- evidence that boundary schema hashes and row counts matched around the
  sequential database capture;
- a fresh random alphanumeric `pg_dump --restrict-key` used for repeatable
  schema output and kept inside this encrypted manifest;
- a canonical schema fingerprint that omits volatile pg_dump version/timing
  comments but retains DDL, policies, and grants;
- database client tool versions;
- private bucket constraints;
- each Storage object's original name, content type, update time, and opaque
  encrypted artifact;
- bucket/object totals.

Artifact identifiers and paths are unique. Bucket identifiers and object names
within each bucket are unique. Manifest totals must equal the validated content.
Database ACL/grant statements remain in the PostgreSQL dump and schema
fingerprint; owner replay is omitted for target portability.
Version 1 aborts when any public Storage bucket exists. Silently omitting its
bytes would conflict with the bucket/object metadata present in the full
PostgreSQL dump.

## Destination adapter v1

An adapter exposes:

```text
kind: lowercase versioned identifier, for example local-v1 or s3-v1
begin(backupId) -> transactional handle
open(backupId) -> immutable read handle
list(key) -> authenticated committed backup summaries
remove(backupId, key) -> authenticated exact-backup deletion
```

Read handle:

```text
createReadStream(relativePath)
stat(relativePath) -> exact file/object size and type
readJson(relativePath, maximumBytes)
```

Transactional handle extends the read handle:

```text
createWriteStream(relativePath) -> create-only stream
writeJson(relativePath, value) -> create-only canonical JSON
commit() -> expose one complete immutable backup
abort() -> remove all staging material
```

Required behavior:

1. Reject absolute paths, backslashes, NULs, normalization changes, `..`, and
   any resolved traversal outside the backup namespace.
2. Reject duplicate backup identifiers and overwrite attempts.
3. Never expose staging work through `list`.
4. Make `commit` all-or-nothing from a reader's perspective.
5. Authenticate the envelope before listing or deleting a backup.
6. Return exact byte sizes; verification compares them before decryption.
7. Delete exactly one authenticated, completed backup.
8. Surface provider errors as typed `BackupError` failures without logging
   credentials.

## R2/S3 adapter contract

`r2://` and `s3://` destination parsing is reserved but currently fails with
`DESTINATION_ADAPTER_NOT_INSTALLED`.

A reviewed object-store adapter should:

- use a unique staging prefix;
- upload immutable artifacts with create-only conditions;
- verify provider checksums and sizes after upload;
- copy/promote objects into an immutable final prefix, or keep the unique prefix
  and write a signed completion marker last;
- write `envelope.json` last as the only visibility marker;
- have `list` enumerate only final prefixes with an authenticated envelope;
- use conditional requests/version IDs so commit and retention cannot race;
- abort by deleting only its own unique staging prefix;
- implement bounded pagination, retry with idempotency, timeouts, and exact error
  mapping;
- use least-privilege credentials scoped to the backup prefix;
- support provider-side retention/object lock as a policy above, not a
  replacement for, application encryption and verification.

Before enabling R2/S3, complete a cost/billing review, add deterministic adapter
contract tests, add provider integration tests against a non-production bucket,
and perform a full restore drill. Provider URLs and object version IDs must not
become canonical Heldat record identifiers.

## Versioning

Any incompatible change to container bytes, manifest semantics, envelope
authentication, or adapter commit behavior requires a new explicit version.
Readers must fail closed on unsupported versions. Existing version-1 backups
and keys remain necessary until their retention window expires.
