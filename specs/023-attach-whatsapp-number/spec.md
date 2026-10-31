# 023 · Attaching a business's Meta number from the back office

Linear ALY-166 · Decision D-054 · Builds on spec 019 (WhatsApp ways, D-050) and spec 018 (the onboarding engine, D-049)

## What it is for

Until now the only way a Meta number reached `channel_numbers` was a seed script. Every other
part of ALYR already reads that row: the inbound path finds the business by it, the outbound
layer sends from it, and the go-live check calls WhatsApp done when it exists. So the first
paying business with a new number (the way D-050 offers first) could not go live without a
developer at a database prompt. This is the missing step: ALYR staff attach the number from
the back office, after Meta shows it connected.

## How it works

1. Staff add the business's number to ALYR's own WhatsApp account in Meta (the owner has
   already given the number and the name, spec 019), and finish registering it in WhatsApp Manager.
2. In `/ops` Onboarding, under the business's Steps, staff paste the **Phone number ID** (and,
   optionally, the WhatsApp Business Account ID) and press Attach.
3. ALYR asks Meta about that ID first: `GET /{phone-number-id}?fields=display_phone_number,
   verified_name,status,quality_rating` (checked against Meta's phone number page, 25 Oct
   2026). Only `status: CONNECTED` is attached. Anything else is refused with what Meta said, and
   nothing is written.
4. The number is written to `channel_numbers` (channel `meta`) by `admin_attach_whatsapp_number`,
   a function for platform staff only. The app role still cannot write `channel_numbers`. The
   audit entry `whatsapp.attached` goes in the same transaction.
5. The readiness check runs at once. WhatsApp is done; if everything else is, the business is live
   and the money-back clock (D-034) starts.

Detach (`DELETE`) removes the Meta row only, never the private test line, and audits
`whatsapp.detached`. Messages to that number stop reaching the business, and the step opens again.
The history of what was attached, when, and by whom is the append-only `platform_audit`.

## Rules

- A Meta number belongs to one business; a business has one Meta number for now (detach to change).
- IDs are digits only, checked before Meta is asked, so nothing else can be put in the URL.
- One token (`ALYR_META_ACCESS_TOKEN`) serves every number on ALYR's account. A business with its
  own account and token arrives with Embedded Signup (ALY-39); nothing is stored for it now.
- The ID is not a secret. No token, key or personal data of a customer is stored or sent.

## API

| Route | Does |
|---|---|
| `POST /api/admin/businesses/{id}/whatsapp/number` `{number_id, waba_id?}` | Ask Meta, attach, audit, answer the readiness state. 422 with the reason when refused. |
| `DELETE /api/admin/businesses/{id}/whatsapp/number` | Detach, audit, answer the readiness state. 404 if none. |

The onboarding board's rows carry `number` (id, account, number as customers see it, when, by whom).

## Checked

`tests/test_attach_whatsapp.py`, with Meta's answer faked at the HTTP layer: attach connects
WhatsApp and is audited; a number Meta shows as pending is refused and nothing written; Meta's
refusal is passed on; bad IDs never reach Meta; one number per business and one business per
number; detach opens the step again and keeps the test line; owners and the app role cannot do it.
Not checked: a real Meta number. That needs the verified Meta account (ALY-6) and is the first thing
to try the day a number exists.

## Not here

What comes after attaching (a check, a test message, the line's trail and one screen for every line) is spec 060.

Registering a number through the API (`/register`), subscribing an account to webhooks, templates
for the account (ALY-172) and Embedded Signup (ALY-39).
