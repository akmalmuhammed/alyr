# Erasing a stopped client's data

The privacy notice promises it: 60 days after a business stops, its data is deleted, except what the
law requires ALYR to keep; copies in backups are gone within 35 days after that. This is how it is
done, how to look at it, how to switch it on, and what to do when something is off. Why it is built
this way: D-116, D-117, D-118 and `specs/042-erase-stopped-client/spec.md`.

**State on 30 Oct 2026: built, tested, not applied.** The job and its schedule do not exist on Google
Cloud yet, and nothing has been erased anywhere. The real deletion is a switch that is off.

The commands below run on the founder's machine, in Git Bash, signed in with `gcloud auth login`.
`erase.sh` prints a plan before it changes anything and never prints a secret.

## What happens, day by day

| Day (counted from the day the cancellation takes effect, `cancels_on`) | What |
|---|---|
| −7 to 0 | The owner is told the day the plan ends (D-082). Everything works. |
| 0 | Sending pauses; a card subscription is cancelled at the provider. Nothing is deleted. The workspace stays open. |
| 0 to 30 | The owner can download everything (Account → Download, D-081). |
| 0 to 59 | Undoing the cancellation in the back office (`DELETE /api/admin/clients/<id>/cancel`) brings the client back exactly as it was. |
| 60, 03:30 Doha | The job finds the client due and erases each of its businesses, one transaction each, then blanks the client's contact details. |
| 60 onward | The worker empties the photo store (within the hour). The undo and a new cancellation are refused: there is nothing to bring back. |
| up to 95 | Copies in Cloud SQL's 14 nightly backups, 7 days of logs and the 35-day exports age out. On-demand backups never do: `infra/gcp/audit.sh database` fails when one is over 35 days old. |

## Look first (these change nothing)

```bash
infra/gcp/erase.sh plan v0.x.y     # what `deploy` would do; calls nothing
infra/gcp/erase.sh dry-run         # the job, once, report only (needs the job to exist)
infra/gcp/erase.sh logs            # the reports it printed: IDs, dates and counts, never a name
infra/gcp/erase.sh status          # latest receipts, clients held, the photo store's progress
```

A dry-run report lists each due client, and per business how many rows of each table would be deleted
and what would be kept. If a client you do not expect is listed, **do not switch the deletion on**:
find out why (its `cancels_on`, in `/ops`), and `hold` it (below) while you do.

## Before the switch goes on

Do not run `enable` until every line is true.

1. **The lawyer has read D-118 and the 16 lines marked `lawyer=True`** in
   `apps/api/src/alyr/core/erase_rules.py` (ALY-51), or the founder has said in writing to go on ALYR's
   own reading. A change they ask for is one line in that file and a release.
2. **The owner will not be surprised.** The only email today is the cancellation one (D-082). The
   recommended 14-day and 3-day warnings are a follow-up (spec 042, "Open questions").
3. **A restore has been shown to work** and you know the next step after one (below).
4. **A first dry run was read by a person** against the real list of cancelled clients, and every
   client in it is one you expect.
5. **A failure of the job reaches a phone.** Today a failed run is only a red execution in Cloud Run
   and a line in the log. A log-based alert on `alyr-erase` (like the ones in `infra/gcp/alerts/`) is a
   follow-up.
6. **The worker is running the version that empties the photo store** (this release or later).

Then:

```bash
infra/gcp/erase.sh deploy v0.x.y   # the job with the switch OFF, the schedule PAUSED
infra/gcp/erase.sh dry-run
infra/gcp/erase.sh enable          # asks you to type ERASE
```

To stop it again: `infra/gcp/erase.sh disable`. What was deleted stays deleted.

After each release, run `deploy` again so the job runs the same image as the API (`setup.sh apps` does
not touch it yet).

## Holding a client back

For a dispute, a request from an authority, a payment in doubt:

```bash
infra/gcp/erase.sh hold <client id> Dispute about the last invoice, see the email of 3 Nov
infra/gcp/erase.sh release <client id>
```

The reason is a **short reference (80 characters), never a name or a story**: it travels in the job's
arguments, which Google logs. A held client is skipped every night and listed under `held` in `status`
(the reason is stored, never printed in a report). It is not a substitute for undoing a cancellation: a
client who stays should have the cancellation undone **before** the 60 days. Once the first of a client's
businesses has been erased the cancellation can no longer be undone, even when the nightly cap leaves
the others for another night; a hold is how to keep those.

## What a run skips, and why

| Report says | Meaning | What to do |
|---|---|---|
| `skipped: held` | A hold is set | `release` when it is over |
| `skipped: card_subscription_running` | A card subscription at Paddle is not cancelled; it would keep charging a client whose data is gone | The hourly sweep cancels it on the stop day; if it did not, look at `card_checkouts` and Paddle |
| `skipped: business_made_after_the_cancellation` | A business under this client was made after the cancellation was asked for (the owner signed up again under the same client). Erasing it with the rest would delete a live business, so nothing of the client is erased | Move that business to a client of its own in `/ops` (or undo the cancellation if the client is staying); the next run carries on |
| `skipped: protected_business` | One of the client's businesses is ALYR's own | Never erased; if this is wrong, the client's businesses were mixed up in `/ops` |
| `skipped: not stopped` / `not yet` | The cancellation was undone, or the time is not up (a race with an undo) | Nothing |
| `waiting: true` | The night's cap (`ALYR_ERASE_MAX_PER_RUN`, 3 businesses) was reached | Tomorrow's run continues |
| `failed: true`, or exit code 1 | A business could not be erased (a lock held by live traffic for more than 15 seconds, or a data problem). **It was left whole**: nothing of it changed | Read the job's log for the line `could not erase a business of client <id>`; the next night retries |
| `last_error` "N objects that are not photo files were left" (in `status`, photo store) | Something under a business's `shops/<id>/` prefix has a name the store will not delete | Look at it in the R2 dashboard and remove it by hand; the worker then finishes the row |
| `stopped: tables_and_rules_that_do_not_match` | A migration added (or removed) a table and `core/erase_rules.py` was not updated. **Nothing is erased until it is** | Add the table's rule; release |

## After a restore

A restore from a backup older than an erasure brings the erased data back, and with it the client's
`cancels_on` and an empty `erased_at`. The next run erases it again (the job is driven by the dates in
the database). So after any restore: let the job run (or `dry-run` to see the client listed, then wait
for the night), and if the switch is on do not leave the restored database serving customers for long
before it has run. If the switch is off, switch it on only after the first dry run lists the restored
client. This also means a restore never silently breaks the 35-day promise.

## What ALYR cannot delete itself

See spec 042, "What ALYR cannot delete itself": Meta (detach the number), Paddle (ask for the customer to
be deleted once the lawyer says ALYR has no reason to keep it), Resend and PostHog (their own retention
and a delete by person), logs (30 days).

## The proof

`erasure_receipts` has one row per business erased and one per client: the tables and how many rows were
deleted, kept and scrubbed, how many people were deleted or made anonymous, the stop day, the day the
business went live, and a fingerprint of the rules. Counts only. `erasure_files` has the photo store's
side: the prefix, when it was queued, how many objects went, and when a listing came back empty. Both are
shown by `erase.sh status`; the back office's audit log has a `business.erased` and a `client.erased`
line for each. No screen in `/ops` shows them yet.
