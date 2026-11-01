# 061 · The message templates on a business's WhatsApp account

Linear ALY-172 · Decision D-146 · Builds on spec 060 (the line) · Uses `core/templates.py` (the wording, unchanged) and `templates_sync.py` (the older command-line tool)

## What it is for

Outside a customer's 24-hour window ALYR can only send a template Meta has approved, on the WhatsApp
account the shop's number is on. ALYR has written 38 templates in English and Arabic (76 in all). Until
now the only way to know which of them Meta had, refused or paused on a given account was to run
`python -m alyr.templates_sync` on a laptop with the right token, once per account. With fifty shops
the founder needs to see, per shop, which template is not ready and why, without a laptop.

## How it works

1. **An inventory per shop.** For the account a shop's Meta number is on, every template ALYR needs, in both
   languages, with where Meta has it: `draft` (not submitted: ALYR keeps no row for those), `submitted`
   (Meta is reviewing it), `approved`, `rejected` (with Meta's reason and recommendation), `paused`,
   `flagged`, `disabled`, `deleted`. Templates Meta has that ALYR did not write are listed as extras.
   `GET /api/admin/businesses/{id}/whatsapp/templates`, and counts on `GET /api/admin/whatsapp/lines`.
2. **Read from Meta** (`POST .../templates/sync`). Lists the account's templates
   (`GET /{waba-id}/message_templates`, paged) and makes the shop's rows say the same. A read: nothing is
   sent to Meta but the question. A template Meta no longer lists has no row.
3. **Meta's status notices** (`message_template_status_update`, `template_category_update`), arriving at the
   one signed webhook, are written for **every shop whose number is on that account** (several shops
   share ALYR's own account, so each keeps its own copy of the same truth, which keeps row-level security
   the plain rule). Rejections keep Meta's reason code and recommendation; a pause keeps its title; a
   change of category (a utility template Meta now calls marketing) is on the line's trail as a warning.
   A notice that cannot be applied is logged and dropped; the webhook still answers 200.
4. **Submit** (`POST .../templates/submit`) is the only call that writes to Meta's template API
   (`POST /{waba-id}/message_templates`; a refused template is edited in place with
   `POST /{template-id}`; a sample header goes up with the Resumable Upload API first). It is
   **switched off** (`ALYR_TEMPLATE_SUBMIT`, default false): while off it answers 409 and sends nothing.
   What it would send is always visible first (the plan: `create`, `edit`, `held`, `needs_app_id`).
   Each template's answer is recorded as it comes; it stops at the first "too many requests".
5. **Held templates.** Eight templates were written and are not to be submitted until the founder says so
   (deposits and the review request, spec 033; the three documents, ALY-139). That was a comment; it is
   now `Template.held`. They show as drafts held back, are never submitted whatever the switch says,
   and `templates_sync --create` now skips them too. Taking the hold off is the founder's go, written as
   deleting `held=HELD`.

## What it does not do

No new wording was written: every template is `core/templates.py` as it was. No new template was added,
so there is no new draft to mark. The Arabic is still unreviewed (ALY-66).

## Data

Migration 0106: `whatsapp_templates` (the business's own, forced row-level security, deleted with it),
and `admin_whatsapp_template_counts()`, a staff-only count per business and status. Names, languages,
categories, statuses and Meta's reasons are stored; wording never is.

## Rules

- Reading is free; submitting needs the setting on and the founder's yes (D-146).
- A held template is never sent by the back office or by the command-line tool.
- Meta's calls are made outside any database transaction.
- No token is stored or returned; a refused request is described in words (`describe_error`).

## Checked

`tests/test_whatsapp_templates.py` (21 tests, the fake Meta): the inventory, the sync with every status
and Meta's reasons and extras, paging, a forgotten template, a refused token, a missing account ID;
submitting off by default with the plan visible; submitting on sends what Meta lacks and never a held
one, in both languages with the sample values; a sample header uploaded first; a refused template sent
again as an edit; a refusal and a rate limit handled; Meta's notices reaching every shop on an account
and no other; unsigned and unknown-account notices; a bad notice never failing the webhook; a category
change; the list's counts; one business unable to read another's; staff only; the command-line tool
honouring the hold.
Not checked: a real Meta account. No real submission was made or attempted.
