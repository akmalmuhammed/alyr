# Message templates on a shop's WhatsApp account

Written 31 Oct 2026 (ALY-172, `specs/061-whatsapp-templates/spec.md`, D-146). Outside a customer's
24-hour window ALYR can send only a template Meta has approved on the account the shop's number is
on. This is how to see where each of ALYR's 76 templates (38 in English and Arabic) stands for a shop,
and what to do about each state.

Meta's pages are the source. They change; read the page before acting. Checked 31 Oct 2026:

- Creating, editing and deleting templates: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-management
- How review works: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review
- The status notice: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/message_template_status_update
- The category notice: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/template_category_update

## Where to look

`/ops` → **WhatsApp lines** → a shop → **Message templates**. The line shows "12 of 76 approved", how many are
in review, how many are not submitted, and how many are **held** (written and waiting for the founder's go:
deposits, the review request and the three documents). Problems are listed first with Meta's reason.
**Read from Meta** asks Meta what the account has and keeps the answer; it sends nothing.

Meta also tells ALYR when a status changes (the notice arrives at the same webhook as customers' messages). If
a status looks old, press **Read from Meta**.

## What each state means

| State | Meaning | Do |
|---|---|---|
| Not submitted | ALYR has the wording and Meta has not been sent it | Nothing, until submitting is allowed (below) |
| Held back | Written, waiting for the founder's go | Nothing. Never sent while the hold is on |
| In review | Meta is reviewing it (PENDING or IN_APPEAL) | Wait. Most utility templates are approved within minutes |
| Approved | Sendable | Nothing |
| Rejected | Meta refused it; its reason is shown | See the reasons table |
| Paused | Meta paused it for low quality or rate limiting | Wait for the unpause notice; read the pause's title (FIRST_PAUSE, SECOND_PAUSE, RATE_LIMITING_PAUSE); a second pause is longer. Stop using it where you can |
| Flagged | Customers' feedback put it at risk of being disabled | Read the wording and what is sent through it; ask the owner if customers are complaining |
| Disabled | Meta disabled it after feedback; it cannot be edited or deleted | Write a new template under a new name (a developer's task), and ask the founder |
| Deleted | Deleted or archived at Meta | Submit again, or leave it |
| Extra | On Meta, not in ALYR's catalogue (made by hand in WhatsApp Manager) | Nothing, or ask who made it |

## Rejection reasons (Meta's own codes)

| Code | Meaning | Do |
|---|---|---|
| `INVALID_FORMAT` | The text breaks Meta's format rules; Meta's recommendation is shown | Fix the wording (a developer's task: `core/templates.py`; the tests enforce Meta's format rules) and submit again |
| `INCORRECT_CATEGORY`, `TAG_CONTENT_MISMATCH` | The wording does not match the category (utility) | Reword so it reads as about the customer's own order, booking or account, or accept Meta's category (then the template needs marketing consent; talk to the founder) |
| `PROMOTIONAL` | Meta found it promotional | Remove anything that reads as an offer |
| `ABUSIVE_CONTENT`, `SCAM` | Policy violation | Reword; if it recurs, stop and ask the founder |

A rejected template is **edited in place** and Meta reviews it again; ALYR does that with **Submit to Meta**
(it shows as "To send again as now worded"). Rewording an approved template means submitting it again and
waiting; the old wording keeps going until then.

## Category warnings

If Meta changes a utility template to marketing (or says it will in about 24 hours), the line's trail shows
a **Template** event marked as a warning. A marketing template is billed and limited as marketing. ALYR does
not change its own category on Meta's say-so: tell the founder.

## Submitting to Meta (the founder's decision)

Submitting is a Meta-facing action and is **off**: the **Submit to Meta** button is not shown, the screen says
so, and the API refuses. What would be sent is listed under "What a submission would send".

To allow it, **the founder** decides (nothing is submitted by anyone else), and a developer sets the API's
setting `ALYR_TEMPLATE_SUBMIT=true` on the `alyr-api` service
(`gcloud run services update alyr-api --update-env-vars=ALYR_TEMPLATE_SUBMIT=true`; a full
`infra/gcp/setup.sh apps` deploy replaces every setting, so set it again after one). Things to settle first:

1. **The Arabic.** It is written by an agent and not yet read by a native speaker (ALY-66). Meta reviews and
   keeps what is submitted; rewording means another review.
2. **The Meta app's ID** (`ALYR_META_APP_ID`) for the one template with an image header
   (`weekly_report_card`); without it that template is listed as "needs the Meta app's ID first".
3. **Which held templates to release.** Releasing one is a code change that deletes `held=HELD` on it, in a pull
   request the founder approves.
4. **Whose account.** A shop on ALYR's own account shares one set of templates: submit once, and every shop on
   that account sees the result. A shop with its own account (Embedded Signup) needs its own submission.

Then press **Submit to Meta** on one shop. Meta answers template by template; each answer is recorded as it
comes and the screen says how many were taken and refused. It stops if Meta says there are too many
requests; wait and press it again.

The older command, `python -m alyr.templates_sync` (status) and `--create` (submit), still works and now
skips every held template. It uses ALYR's own account and the laptop's `.env`; prefer the screen.
