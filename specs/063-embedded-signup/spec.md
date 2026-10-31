# 063 · A business connects its own WhatsApp account through Meta's Embedded Signup

Linear ALY-39 · Decisions D-148 (the flow, behind a flag) and D-149 (a business's own token) · Builds on specs 060 to 062 and spec 019 (WhatsApp ways, D-050) · Needs ALY-52 (Tech Provider) and ALY-262 (App Review), which are the founder's

## What it is for

Today ALYR staff add each shop's number to ALYR's own WhatsApp account in Meta and attach it from `/ops` (spec 023).
That needs a person for every shop, and it cannot serve a shop that already has its own WhatsApp account, or a number
in the WhatsApp Business app that should stay there. Embedded Signup is Meta's pop-up for exactly that: the owner signs
in to Meta, chooses their account and number, and Meta gives ALYR access to it. Built, tested against a fake Meta, and
**off** until the founder has done what Meta needs (`docs/runbooks/embedded-signup.md`).

## The flag and what must be set

`ALYR_EMBEDDED_SIGNUP` (default off). It offers nothing unless all of these are also set: `ALYR_META_APP_ID`,
`ALYR_META_APP_SECRET`, `ALYR_META_ES_CONFIG_ID` (the Facebook Login for Business configuration's ID, not a secret) and
`ALYR_CHANNEL_KEYS_KEY` (32 random bytes, base64, in Secret Manager; a developer machine has a built-in key that protects
nothing). A missing piece keeps it off and says which (`off`, `not_configured`, `no_key`). The web build that serves `/start`
must be made with `ALYR_EMBEDDED_SIGNUP=on` to allow the Facebook SDK in that page's security policy (`next.config.ts`).

## How it works (Meta's pages checked 31 Oct 2026, linked from the runbook)

1. **The owner's screen** (`/start`, the WhatsApp step) shows **Connect with Meta** when the API says it is available
   for the owner's way (`own_account`: the default flow, their existing account; `move_number`: a number in the WhatsApp
   Business app, `featureType` `whatsapp_business_app_onboarding`, kept in the app) and everything the way needs is ticked.
   `GET /api/whatsapp/signup/config` gives the public values the pop-up opens with. English and Arabic; the API answers a
   code and the screen words it.
2. **The pop-up.** The Facebook SDK (`connect.facebook.net`) opens the configuration with `response_type: "code"`. The
   browser gets a one-time **code** (it lives 30 seconds) and, from Meta's page, a **session message** (`WA_EMBEDDED_SIGNUP`)
   naming the account, number and portfolio. Only a message from facebook.com or a subdomain is read.
3. **`POST /api/whatsapp/signup/complete`** (owner or admin only). Nothing the browser says is believed:
   1. the code is exchanged for the business token (`GET /oauth/access_token`, server to server, with the app's secret);
   2. the number and the account's numbers are read with **that token**, so a forged message naming somebody else's assets is
      refused by Meta;
   3. a number that is not connected is registered with a random six-digit PIN (`POST /{number-id}/register`); a number moved
      from the WhatsApp Business app is not;
   4. ALYR's app is subscribed to the account's webhooks (`POST /{waba-id}/subscribed_apps`);
   5. the token is **sealed** and the number attached in one transaction. Nothing is attached unless every step passed.
   Every Meta call is made outside a database transaction. A failure is on the line's trail in Meta's words and told to the
   owner in their language.
4. **Afterwards** the number is a line like any other: Check, the test message, templates, health (specs 060 to 062). Every
   call about it is made with the business's own token (D-149). A business removing ALYR from its account arrives as
   `PARTNER_REMOVED` and is critical (spec 062).

## The business's own token (D-149)

`channel_credentials` (migration 0108): the token and the PIN, sealed with AES-256-GCM under `ALYR_CHANNEL_KEYS_KEY`
(`core/channel_keys.py`, the way a shop's payment keys are sealed), the shop's and the number's IDs bound in. The channel asks
`core/channel_credentials.py` for the token for the number or account a call is about; the answer is the shop's token or ALYR's.
`channel_credential_for(ident)` returns ciphertext only. The token is never logged, returned or put in a job. Its end date,
when Meta gives one, shows on the line and the health reads **ends within two weeks** and **expired** (a refresh job is not built).

The app role still cannot write `channel_numbers`: `signup_attach_whatsapp_number()` does, only for the caller's own business,
only when a setting the sign-up code sets is on, and only when credentials for that very number are already stored.

## Data

Migration 0108: `channel_credentials` (forced row-level security, deleted with the business), the two functions above, and
`admin_whatsapp_lines()` made again to say whose token a line uses. `core/erase_rules.py` has its rule.

## Rules

- Off by default; a missing setting closes it, never opens it.
- A claim from the browser is never stored unless Meta shows it, with the business's own token, to be that token's.
- A token is never in a log, an answer, the trail or the audit log. Nothing about a customer of the shop is involved.
- Hard rule 4: only Meta's own pop-up and Cloud API. Hard rule 2: the owner's own action with Meta (docs/data-residency.md).

## Checked

`tests/test_embedded_signup.py` (22 tests, the fake Meta, which refuses a token that does not own the asset it is used on):
the flag and each missing piece; nothing offered or accepted while off; the public values for each way and no secret; owner
only; a number on ALYR's account not this way; a full connection (exchange, read-back with the business's token, register with a
PIN, subscribe, attach, health read); the token sealed, bound, and shown nowhere; coexistence not registering; later calls going
with the business's own token and other shops with ALYR's, including a send; forged claims; an expired or reused code; Meta
refusing to register or subscribe; a number that stays unconnected; a finish without a number; a number already taken and a second
number; detach removing credentials; cancel and error on the trail; the database refusing every shortcut; the lookup answering
ciphertext only; token expiry; the channel's hook; the simulator's signature. `app/(product)/start/signup.test.mjs` (5): only
facebook.com is believed.
Not checked: a real Meta account, the pop-up in a browser against Meta, Meta's actual token lifetime, and coexistence's
history and echo messages (not processed: no `history`, `smb_message_echoes` or `smb_app_state_sync` handling).

## Not here

Refreshing a token that expires; the coexistence message sync; a business adding a second number; billing set-up (the business
adds its payment method in WhatsApp Manager, Meta's own step).
