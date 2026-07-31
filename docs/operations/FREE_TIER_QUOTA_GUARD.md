# Heldat free-tier quota guard

## Purpose

Supabase Free does not expose a durable metrics endpoint or Log Drains. The
Heldat launch policy nevertheless requires operator action at 50%, 70%, and
85% of every launch-critical quota. `free-tier-quota-guard.mjs` converts one
fresh, numeric operator snapshot into a deterministic JSON decision and exits
non-zero when enrollment should be frozen.

This guard covers:

- provider database bytes;
- provider file-storage bytes;
- current-month egress bytes;
- current-month Edge Function invocations; and
- Heldat's smaller 800 MiB retained-storage ceiling.

It complements the protected `/maintenance/readiness` aggregate and the
bounded public API probe. It does not replace provider telemetry, an alert
route, authenticated workload tests, or a witnessed incident drill.

## Daily operator workflow

1. Read the first four current values from the intended Supabase project's
   usage dashboard. Read `applicationRetainedStorageBytes` from the protected
   backend-readiness summary after migration `202607310008` is deployed.
2. Create a local file outside the repository. Record the time at which all
   five values were observed. Use integers, not formatted strings or rounded
   percentages.
3. Run the guard. The default maximum snapshot age is 24 hours.
4. Retain the JSON result with the dated operator record. A non-zero exit is a
   release/enrollment stop signal, not a reason to bypass the check.

Example input (illustrative zero values only):

```json
{
  "snapshotVersion": 1,
  "observedAt": "2026-08-01T12:00:00.000Z",
  "usage": {
    "databaseBytes": 0,
    "storageBytes": 0,
    "monthlyEgressBytes": 0,
    "monthlyEdgeInvocations": 0,
    "applicationRetainedStorageBytes": 0
  }
}
```

Run from the repository root:

```powershell
npm run guard:supabase:free-tier -- --snapshot=C:\tmp\heldat-usage.json
```

For a shorter observation window:

```powershell
npm run guard:supabase:free-tier -- --snapshot=C:\tmp\heldat-usage.json --max-age-hours=12
```

The snapshot should contain only aggregate numbers. Keep it out of Git and do
not add household identifiers, emails, object keys, filenames, or request
payloads.

## Decision contract

| Saturation | Level | Operator action | Enrollment | Cloud uploads |
|---:|---|---|---|---|
| below 50% | `normal` | Continue the controlled pilot and refresh daily | Allowed by this guard | Allowed by this guard |
| 50% through 69.99% | `watch` | Notify the operator and review growth | Allowed by this guard | Allowed by this guard |
| 70% through 84.99% | `action` | Freeze enrollment and prepare capacity migration | Frozen | Allowed by this guard |
| 85% through 99.99% | `critical` | Queue uploads locally and protect drafts | Frozen | Queued |
| 100% or more | `exhausted` | Run the capacity incident procedure | Frozen | Queued |
| missing or stale | `unknown` | Refresh all required measurements | Frozen | Queued |

The highest of the five quota levels controls the summary. A snapshot older
than the configured maximum age fails closed even if its reported usage is
low. More than five minutes of future clock skew is rejected.

## Output and automation boundary

Successful evaluation emits one JSON object with:

- used, limit, remaining, saturation percentage, next threshold and action for
  every quota;
- snapshot freshness and age;
- the highest severity;
- `enrollmentAllowed`, `cloudUploadsAllowed`, and `passed` decisions.

Input and runtime failures emit a versioned structured error without echoing
the snapshot path or file contents. `passed` becomes false at 70%, while 50%
remains an explicit warning.

Before public expansion, add a scheduled collector and tested alert delivery
so this manual snapshot is no longer the primary quota signal. Keep the
existing 10K operations gate authoritative for backup, restore, SMTP, load,
database pressure, sync backlog, cleanup age, crashes, and on-call evidence.
