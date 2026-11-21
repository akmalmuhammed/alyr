# Importing a business's past visits (staff, no screen)

For a business that keeps its appointments and payments in another system, ALYR Insights has nothing to read. This puts a file of that business's **past visits** into ALYR's booking tables so the Agent, the weekly report and the MCP read tools read real numbers. It is not a way to take bookings and it never contacts anyone. Why it is built this way: D-197, D-198 and `specs/070-visits-history-import/spec.md`.

**State on 21 Nov 2026: built and tested on a local database with an invented salon file; not released, not run on production, never run on a real file.** The commands below are untested against Google Cloud.

## Before you start (all of these are the founder's, not an agent's)

1. **The founder says go** for this business, and for the first import of a real file says so again after the dry run (as for `seed_into_business`, D-151). Nothing here is applied on an agent's own say-so.
2. **The paper exists** that lets ALYR hold the client's customer file: the customer agreement and the processor terms (ALY-51, ALY-98, D6 of the Insights audit). Until it does, import nothing real. The first real import may be run with names and phones **not kept** (the default); keeping them (`keep_personal`) is a second decision.
3. **The file comes from the client**, by a way that keeps it off every chat and every repository: it is customer data. Keep it on the staff member's own disk, in a folder outside any repository, and delete it when the import is final. It is never pasted into a conversation, an issue or a pull request.
4. **The release holding this is deployed** (migrations 0150 and 0151, `docs/runbooks/release.md`). Until then the route does not exist.
5. **You are signed in to the back office** (`https://app.alyr.qa/ops`, `docs/runbooks/staff-sign-in.md`): the code by email, and the authenticator if the second factor is on. A back-office session lasts 12 hours.

## What you need to know about the business

- Its **ID** (the UUID: `/ops` → Clients → the business; or `GET /api/admin/businesses`).
- Whether it has **Bookings** switched on. If not (Discovery and Insights only), the dry run says `needs_bookings_switch: true` and applying is refused unless you add `"switch_on_bookings": true`, which switches Bookings on for the business and writes `module.on` to the audit log. Bookings being on shows the business the Bookings tab and its setup checklist; no one can book, because no WhatsApp line sends them a link.
- The **time zone** is the business's own (`tenants.timezone`, Asia/Qatar by default). Dates and times in the file are read as that.

## Set up the commands (once per sitting)

The routes use the staff member's own session. In the browser where you are signed in to `/ops`, copy the `alyr_session` cookie's value (developer tools, Application, Cookies), and put it in a shell variable. **Never paste it into a chat, a file in a repository or a command history that is kept.**

```bash
read -rs ALYR_SESSION; export ALYR_SESSION        # paste the cookie value, press Enter
API=https://api.alyr.qa
BIZ=<the business's UUID>
call() { curl -sS -H "Cookie: alyr_session=$ALYR_SESSION" "$@"; }
```

When you finish: `unset ALYR_SESSION`, and sign out of `/ops`.

## 1. Tell the client what to export

```bash
call "$API/api/admin/businesses/$BIZ/visits-imports/template?lang=en" -o alyr-visits-template.csv
```

A CSV with the columns ALYR reads and three made-up visits (`lang=ar` for Arabic headers). The client's own export does not have to match it: columns are found by name in English and Arabic and can be chosen by hand. What the file needs: a date, a start time, the service, the status (came, did not come, cancelled: nothing still booked), and one way to tell clients apart (the shop's own client number is best; a phone number or a name will do). A stylist, a price, a duration, an appointment number and the time a booking was made or cancelled are optional and make the numbers better. **A client name and phone number are not needed.**

## 2. Dry run

```bash
call -X POST --data-binary @visits.csv -H "Content-Type: application/octet-stream" \
  "$API/api/admin/businesses/$BIZ/visits-imports?filename=visits.csv" > preview.json
jq '{id, status, mapping, missing, counts, notes, problems_total, needs_bookings_switch, already_imported, can_apply, hash}' preview.json
```

Nothing is made. What was read from the file (not the file) is kept as a preview row until you apply or discard it. Read it:

- **`mapping`** says which column of the file is which field. `missing` lists a column the file still needs. Fix a wrong one with `PUT` (below).
- **`counts`**: `visits` it would make, `existing` (already in ALYR from an earlier import: skipped), `duplicates` (the same visit twice in this file: the first is used), `problems`, the clients, services and stylists it would make or match. Check `visits` against what the client says the file holds, and `by_status` against their own totals.
- **`notes`** say what was assumed: dates written 03/04/2026 are read **day first**; visits with no price are imported with none.
- **`problems`** have the row number as a spreadsheet shows it (the header is row 1), a code, and the words in English (`message`) and Arabic (`message_ar`). While there is any, `can_apply` is false.
- **Every row**, one answer each, a page at a time:

```bash
ID=$(jq -r .id preview.json)
call "$API/api/admin/businesses/$BIZ/visits-imports/$ID/rows?state=problem&limit=200" | jq .
call "$API/api/admin/businesses/$BIZ/visits-imports/$ID/rows?offset=0&limit=200" | jq '.rows[]'
```

`state` is `ready`, `existing`, `duplicate`, `problem` or `skipped`. By default a preview shows no client name or number, only "Client 4F2A91".

**Change the mapping or the options** (the preview and its hash are made again; the options you send **replace** the ones set before, so send them all):

```bash
call -X PUT -H "Content-Type: application/json" \
  -d '{"mapping": {"date": "When", "service": "What", "status": "How it went", "client_id": "Who"},
       "options": {"date_order": "dmy", "source": "the salon booking system", "exported_on": "2026-11-20"}}' \
  "$API/api/admin/businesses/$BIZ/visits-imports/$ID" | jq '{counts, problems_total, can_apply, hash}'
```

| Option | Does |
|---|---|
| `default_status` | The file has no status column: every row is `completed`, `no_show` or `cancelled`. Say so only if it is true |
| `date_order` | `dmy` (default) or `mdy`, for dates written 03/04/2026 |
| `allow_date_only` | A date with no time of day is accepted and put at 12:00. Off by default: the busiest-hours count needs a real time |
| `default_minutes` | How long a visit is when the file does not say (5 to 600, default 60) |
| `skip_problem_rows` | Leave rows with problems out instead of refusing the file. Read the skipped rows first |
| `keep_personal` | Keep clients' names and phone numbers (default: not kept, not shown). Only once the customer agreement allows it |
| `exported_on` | The day the client cut the file (the dashboard says where its numbers come from). Else the day you apply |
| `source` | What the file is, at most 60 characters ("the salon booking system") |

## 3. The founder's go, then apply

Show the founder the counts and the notes. When they say go:

```bash
HASH=$(jq -r .hash preview.json)        # the hash of the preview they saw: take it from the last answer
call -X POST -H "Content-Type: application/json" \
  -d "{\"preview\": \"$HASH\", \"switch_on_bookings\": false}" \
  "$API/api/admin/businesses/$BIZ/visits-imports/$ID/apply" | jq .
```

Put `"switch_on_bookings": true` for a business without Bookings. Everything is made in **one transaction**, exactly as previewed; if anything differs (the file's mapping, an option, something already in ALYR), it answers `import_changed` and you look again. The file's data is dropped from the preview row when it is applied.

What it makes: the visits (final states only), the clients, the services and stylists it did not find by name (switched off: history, not something to book). What it never makes: a message, a reminder, a review request, a consent record, a job. The clients it makes cannot be messaged until they write to the shop.

## 4. Check, and tell the client

```bash
call "$API/api/admin/businesses/$BIZ/visits-imports" | jq '{data_from, imports: [.imports[] | {id, status, counts, exported_on, first_visit_on, last_visit_on, can_undo}]}'
```

Open the business's workspace as its owner (or the founder's own view of it) and look at the Agent on the home screen. **Do not show the client the dashboard yet** (D-198, "Not done"): until task I5 it says "Booked, next 7 days: 0", the weekly report says "Booked for next week: 0" and "Reminders ALYR sent for you: 0", and it can say nobody receives the Sunday report, none of which is true of a business whose visits come from a file. The client's weekly report goes by email on Sunday at 9:00 (shop time) to each owner; check the owner's email is the one the client wants it on.

## Undo

The **newest** applied import, whole:

```bash
call -X POST "$API/api/admin/businesses/$BIZ/visits-imports/undo" | jq .
```

It removes the import's visits, and the clients, services and stylists it made that nothing else uses. A client who has written to the shop since, or a service or stylist something else points at, **stays** and is no longer marked as the import's (the answer says how many). It is refused (`not_undoable`) when a receipt, invoice or payment was recorded against one of the import's visits. An older import is undone after the newer ones. An undone file can be imported again. `DELETE .../{id}` drops a preview nobody applied (do this for every preview you leave: it holds what was read from the client's file).

The activity record keeps the "cancelled" entries the import wrote ("Import"): it cannot be edited or deleted, and an entry whose visit is gone is not counted by anything.

## Refusals you may see

| Code | Meaning |
|---|---|
| `bookings_off` (409) | The business does not have Bookings. Apply again with `"switch_on_bookings": true` if that is what the founder wants |
| `import_has_problems` (409) | Some rows have problems. Fix the file or choose `skip_problem_rows` |
| `import_changed` (409) | The preview is not what you applied. Look at the new preview and take its hash |
| `already_imported` (409) | This exact file was applied. Undo that import first if it must be redone |
| `import_not_preview` (409) | Already applied, undone or discarded |
| `not_newest` (409) / `nothing_to_undo` (404) / `not_undoable` (409) | See Undo |
| `import_too_big` (413) | Over 5 MB. Split the file (20,000 rows at most) |
| 403 | Not staff, or the second factor was not passed |

## Locally

Run the API and tests as `CLAUDE.md` says (`ALYR_ENV=local`, no sign-in is needed for the back office). `apps/api/tests/fixtures/visits_salon_export.csv` is an invented salon's file (152 visits, two repeated rows, two with no stylist, one date written day/month/year, one time with AM/PM). The tests: `tests/test_history_plan.py` (reading), `test_history_import.py` (apply), `test_history_undo_and_scope.py` (undo, Bookings, two businesses), `test_history_guards.py` (the guards), `test_history_insights.py` (what the Agent and the report read).

## What was not checked

- Anything on Google Cloud: the route behind the Cloudflare edge, the 12-hour session and the second factor on a real staff account, a 20,000-row file, the request time limit for one.
- A real export. The columns of the client's own system are not known to ALYR; the fixture is invented.
- The Arabic wording of the problems and notes (ALY-66).
- That the owner's weekly email shows sensible numbers for a business whose bookings are all imported: the numbers are checked against the file; the email's other lines (task I5) are not.
