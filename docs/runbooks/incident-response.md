# Incident response

For when something is broken or someone may have seen data they should not. Written to be
followed by one tired person. Keep notes as you go: times, what you saw, what you did.

## 1. First ten minutes, every incident
1. **Is customer data exposed or is money affected?** If yes, it is a Severity 1: stop other work.
2. **Stop the harm before finding the cause.** Turn the thing off rather than debug it live:
   - Laptop demo: `scripts/demo.sh down` (stops the API, worker and tunnel).
   - Public site: in Cloudflare, Workers → `alyr-site` → roll back to the previous deployment.
   - A webhook flood: in Meta's app dashboard, unsubscribe the `messages` field.
3. **Write one line in Linear** (label `Incident`): what, since when, who is affected.

| Severity | Examples | Respond |
|---|---|---|
| 1 | Data from one shop visible to another; a secret leaked; payments marked paid wrongly | Now, until contained |
| 2 | WhatsApp replies stop; sign-in broken; site down | Within the hour |
| 3 | One feature wrong for one shop | Next working day |

## 2. A secret leaked
(A key or token in git, chat, a screenshot, a log, a public place.)
1. **Revoke it first**, then replace it (`docs/runbooks/secret-rotation.md`). Removing it from
   git history does not help: assume anything pushed or pasted has been copied.
2. Check the provider's logs for use you do not recognise (Resend emails, Meta messages,
   Cloudflare audit log).
3. Note it in the incident issue, with the time it leaked and the time it was revoked.

## 3. A shop may have seen another shop's data
1. Take the affected screen or route offline (revert the PR and deploy, or stop the API).
2. Find which shops and which records: the activity table, API logs, the database.
3. **Qatar Law No. 13 of 2016** requires telling affected people and the data-protection
   regulator when a breach may cause them serious harm. Which authority and how fast is a
   question for the lawyer (ALY-51); record the answer here. Get legal advice the
   same day (ALY-51) before writing to anyone; keep the facts ready: what, who, when, what we did.
4. Tell the affected merchants in plain words: what happened, what data, what we have done.

## 4. WhatsApp stopped replying
1. `scripts/demo.sh check`: database, Meta token, templates, tunnel, pages.
2. Failed jobs: back office → delivery problems, or `GET /api/jobs/failed` for one shop.
3. Meta status page and the app's quality rating; a template may have been paused.

## 5. Afterwards (within a week, for Severity 1 and 2)
Write `docs/audit/incident-<date>.md`: timeline, cause, why our checks missed it, and the
issue numbers of the fixes. No blame; the point is the missing guard.
