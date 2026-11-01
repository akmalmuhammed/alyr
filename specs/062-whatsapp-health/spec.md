# 062 · The health of a business's WhatsApp number, from Meta

Linear ALY-166 · Decision D-147 · Builds on specs 060 (the line) and 061 (templates, whose webhook path it shares)

## What it is for

A shop's number can be flagged for low quality, restricted, hit by a policy violation or taken off its account by
the shop, and the shop's customers stop hearing from it while ALYR's own checks, which look at ALYR's side
only, stay green. Meta tells ALYR; nobody was listening. With fifty shops the founder needs the answer to "is
any number or account in trouble" on one screen and on his phone, without opening Meta.

## What Meta says, and how it arrives (pages checked 31 Oct 2026, linked from `docs/runbooks/whatsapp-line.md`)

| About | Field | What it carries | Kept as |
|---|---|---|---|
| The number | `GET /{number-id}` (read) | `status`, `quality_rating`, `name_status`, `whatsapp_business_manager_messaging_limit`, `throughput`, `health_status` | quality, status, name status, limit, throughput, sending |
| The number | `phone_number_quality_update` | `display_phone_number`, `event` (`ONBOARDING`, `THROUGHPUT_UPGRADE`), `max_daily_conversations_per_business` (`current_limit` is deprecated) | messaging limit, throughput |
| The number | `phone_number_name_update` | `decision` (APPROVED, REJECTED, PENDING, DEFERRED), `rejection_reason` | name decision and reason |
| The number | `account_alerts` (`entity_type` PHONE_NUMBER) | `alert_info`: severity, status, type, description | active alerts |
| The account | `account_update` | `event`: `ACCOUNT_RESTRICTION` (`restriction_info`: type, expiration), `ACCOUNT_VIOLATION`, `DISABLED_UPDATE` (`ban_info`: DISABLE, REINSTATE, SCHEDULE_FOR_DISABLE), `ACCOUNT_DELETED`, `ACCOUNT_OFFBOARDED`, `ACCOUNT_RECONNECTED`, `PARTNER_REMOVED`; other events are not about health | restrictions, violation, ban, state |
| The account | `account_review_update` | `decision` | review |
| The account | `account_alerts` (BUSINESS) | as above | active alerts |

The quality **rating** (green, yellow, red) is not in any webhook Meta documents now: it is read
(`GET /{number-id}?fields=quality_rating`), by the worker every `ALYR_LINE_POLL_MINUTES` (default 360; 0 reads
nothing) and when staff press Check. A notice about a number names it by its display number, which is matched
against the number attached (digits only); one about an account is written for every shop whose number is on it.

## What ALYR makes of it

`core/whatsapp_health.py`, `evaluate()`: a severity, `ok` / `attention` / `critical` (or `unknown` before Meta has
said anything), and the reasons behind it, each with a level and a scope (the number, or the whole account).

- **Critical:** status FLAGGED, RESTRICTED, BANNED, DELETED or DISCONNECTED; quality red; sending BLOCKED; an active
  restriction on the account (until its expiry, or until Meta lifts it); a disable or a scheduled disable; the account
  deleted, offboarded, or the business removing ALYR (`PARTNER_REMOVED`); Meta's review rejected.
- **Attention:** quality yellow; sending LIMITED; an unusual status; the display name rejected; a policy-violation
  notice (for 30 days); an alert Meta marks WARNING or CRITICAL; a review not yet decided.
- Meta's list of phone number statuses is not on a page I could read; the ones above are what its help pages and
  partners describe. Anything else is shown as it came, and is "attention".

A line whose severity is critical reads **problem** on the lines screen. A restriction with an expiry is made again
when it runs out (the worker, hourly), and the screen makes it again when it is read.

## What the founder sees

- `/ops` → WhatsApp lines: the first thing wrong under each line's state, and a **Health** section (rating, status,
  limit, sending, name, review, restrictions with their end, alerts, when it was last read and last heard).
  English and Arabic, RTL.
- **Today:** a trouble with one number is one item for that shop (urgent when critical). A trouble with an account is **one
  item for the account** saying how many shops it reaches, because ALYR's own account is shared: fifty shops are not
  fifty items. Message templates Meta rejected, paused, flagged or disabled are one quiet item per account.
- **An alert to the phone** (`line_health`, `core/alerts.py`): one message when any number is critical or any account is
  restricted, disabled or removed; counts only, never a name or a number; a reminder every two hours; "cleared" when it ends.

## Data

Migration 0107: `whatsapp_line_health` (the business's own, forced row-level security, deleted with it; states and Meta's
words only), `admin_whatsapp_lines()` replaced to carry it, and `whatsapp_health_alert_counts()` (counts for the alert).

## Rules

- Reads only. Nothing in this spec writes to Meta.
- A failed read of one line is counted and leaves its state as it was; it never stops the others.
- The webhook never fails because of a notice it cannot apply.
- No token, phone number or customer's words are kept.

## Checked

`tests/test_whatsapp_health.py` (33 tests, the fake Meta): every severity rule; the check reading the extended fields and
falling back to the basics; quality and flag changes on the trail; quality notices reaching the number they name and no
other, with the deprecated field as a fallback; a notice for an unattached number; a display name rejected then approved;
a restriction reaching every shop on an account and no other; an expired restriction stopping without a notice; a
disable scheduled then lifted, a business removing ALYR, an ignored event; a violation, a review, an alert beginning and
ending; an alert about one number; unsigned and unknown notices; detach forgetting health; the Today items (one urgent
per shop, one per shared account, one quiet one for templates); the alert counting and naming nothing; polling with one
line unreadable; the hourly pass without Meta; isolation; nothing personal kept.
Not checked: a real Meta account. How Meta words `status` for a flagged number is as its help pages say, unproven.

## Not here

Messaging-limit increases (Meta decides), pausing a shop's sending on a flag, telling the owner (the owner is not
messaged about ALYR's account), and the shop's own account's token expiry (spec 063).
