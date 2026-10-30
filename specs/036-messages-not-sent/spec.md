# 036 · Messages not sent

Go-live checklist (50 clients, 29 Oct) item 26, a gap the 29 Oct audit found · tracked under ALY-266 (Linear's free issue limit is reached) · Builds on D-010 (the job queue), D-020 (consent) and D-028 (the activity record)

## What it is for

A customer's order confirmation, a booking reminder or a reply can fail, and today nobody sees it:
the inbox marks one message "Not delivered" deep inside a chat, the back office shows a count, and
the only list is an API route (`GET /api/jobs/failed`). The shop needs one place that says which
messages did not reach a customer, why, in plain words, and lets them send one again when the
reason is gone. ALYR needs to know whether failures are ALYR's (the token, the number, an outage)
or the customers' side.

## Two ways a message ends short of the phone

| Status | What happened | Recorded error | Reason on screen |
|---|---|---|---|
| `blocked` | The outbound layer refused it: it never left ALYR | `window_closed`, `no_consent`, `opted_out`, `no_marketing_consent`, `no_back_in_stock_consent` | the same key |
| `failed` | The job gave up after every retry | `could not be delivered` | `gave_up` |
| `failed` | WhatsApp reported a failure | WhatsApp's error title, in English | `whatsapp`, with WhatsApp's words shown as given |

## The screen: `/app/unsent`

- **What it lists:** outgoing messages with status `failed` or `blocked` from the last 14 days, newest first, at most 100 (`GET /api/messages/not-sent`).
- **Each row shows:** the customer, the time, the message's first lines, the reason and, for WhatsApp's refusals, WhatsApp's own words.
- **Send again:** a button when the message may go now. Otherwise, a line saying what would let it go.
- **Who sees it:** everyone on the team, as they can see the inbox. Sending again is recorded on the activity record with who did it (`message_retried`).
- **Where it is reached from:** ALYR Agent's "Needs you now", and the command search ("Messages not sent"). It is not in the navigation, which stays for screens used every day.
- **Words:** in English and Arabic (`_workspace/notSentCopy.ts`). The "Not delivered" tag in a chat is now in both languages too.

## Sending again (`POST /api/messages/{id}/retry`, `core/not_sent.py`)

A message sent again goes through the same rule as a new one (`consent.refusal`), against the customer's consent and window **as they are now**:

- **A notice that went as ordinary text,** inside the window, is still the template it stood for. Its consent is the template's, and as text it needs the window open now.
- **A customer who said stop since** is never sent it, whichever door is used. That includes `POST /api/jobs/{id}/retry`, which now goes through this check for a parked send.
- **A refused picture or file was never kept** (`Outbound.send` stores media only for a message it lets through), so it cannot go again (`file_lost`).
- **When it may go:** the message returns to `queued`. The parked job is sent round again, or a new job is queued.
- **When it may not:** the answer is 409 with the reason, and nothing changes. A refused message's recorded reason is updated if a different one holds now.

Fixed on the way: retrying a parked send job used to do nothing, because the job found its message `failed`, not `queued`, and stopped. The test of that retry now checks that the message was sent.

## ALYR Agent

New rule 25 (`not_sent`, a task in "Needs you now"): a message that **failed** in the last 48 hours. It shows the count and the latest customer, and links to `/app/unsent`. Refusals by rule are on the screen but are not counted here: they are not work waiting. The rule is in `docs/agent-dashboard/01-research.md`.

## The back office

The Today item "Messages failing for …" now ends with why, from `admin_delivery_reasons()`. That function is in migration 0066 and is for platform admins only. It returns counts per recorded error over 7 days, for example "Why: Message undeliverable (2); could not be delivered (1).". It reads counts and error words only, never a message.

## Data

- **Migration 0066:** a partial index `messages_not_sent` on `(tenant_id, created_at)` for outgoing messages that failed or were refused, so the screen and the rule stay cheap. Also the function above.
- **No new table, no new personal data,** and nothing leaves Qatar.

## Tests

- **`tests/test_not_sent.py`:** each reason; sending again by both doors; a stop since; the window reopening; a lost picture; 14 days; roles; the Agent's task.
- **`tests/test_jobs.py`:** a retried parked send is sent.
- **`tests/test_back_office.py`:** the reasons line.
- **`tests/test_agent.py`:** the new rule at its threshold, in both languages.
- **`_workspace/notSent.test.mjs`:** the words in both languages; every reason the API gives has its sentence; no words written into the screen.

## Not in this spec

- **Telling the shop as it happens** (a push or a WhatsApp message to staff): go-live item 42.
- **Sending several again at once.**
- **The back office opening one shop's list:** platform admins see reasons and counts only.
