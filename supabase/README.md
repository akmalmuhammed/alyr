# ALYR Supabase pilot boundary

This directory implements the free-tier pilot boundary described by the
mobile plan. It is not deployed automatically and it is not represented as
production-grade backup, end-to-end encryption, or verified legal evidence.

## Included

- Postgres entities for the focused household/place/asset/evidence product.
- Deny-by-default, household-scoped Row Level Security.
- Atomic, idempotent sync commands with visible version/location conflicts.
- Immutable evidence-version and blob metadata.
- Private Storage policies with a 10 MiB file limit.
- A 40 MiB per-household application quota in the upload-intent API.
- A serialized 20-household closed-pilot admission cap.
- One-time manual household invitation codes.
- Permission-scoped export snapshots.
- A privacy-minimal product-event allow-list.
- An OpenAPI 3.1 contract.
- A single authenticated Edge Function router.

## Honest pilot limitations

- Supabase Free can pause and does not include managed backups.
- Upload completion downloads the stored object in the Edge Function and
  confirms byte size and SHA-256 before the server marks it stored.
- Export creation queues a snapshot; rendering is not included yet.
- Email delivery is intentionally outside this slice. Invitation codes are
  shared manually during the closed pilot.
- The clients must retain their durable local outbox and encrypted Recovery
  Kits.

## Local verification

The static contract checks require only Node:

```sh
node --test supabase/tests/schema.test.mjs
```

The local database suite proves cross-household RLS, role-negative paths,
idempotent nested commands, analytics rejection, upload reservation binding,
and the closed-pilot boundary:

```sh
supabase db reset --local --no-seed
supabase db lint --local --level warning
supabase test db --local
```

## Closed-pilot admission

Signup alone does not authorize household creation. Before an invited pilot
owner creates a household, an operator must approve that authenticated user in
SQL:

```sql
insert into public.pilot_enrollments (user_id, max_households, note)
values ('USER_UUID', 1, 'Closed pilot household 01');
```

Clients cannot read or write this table. The project-wide active household cap
is 20, and each approval defaults to one household.

## Edge secrets

The API uses the caller token and anon key for ordinary RLS-scoped work. Only
the final, byte-verified `mark_blob_stored` transition uses the Edge runtime's
server-side service-role key. That key must never be placed in Expo, Vite,
EAS public variables, logs, responses, or client bundles.
