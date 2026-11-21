# Embedded Signup: what the founder does in Meta, and then in ALYR

Written 31 Oct 2026 (ALY-39, `specs/063-embedded-signup/spec.md`, D-148, D-149). Embedded Signup is Meta's pop-up by which a
business connects its own WhatsApp account to ALYR. ALYR has built it and it is **off**. Nothing below happens by itself: every
step in Meta is the founder's (an account click, a permission, a submission), and turning it on is his decision.

Meta's pages are the source and change; read each one again before its step. Checked 31 Oct 2026:

- Overview and requirements: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview
- Implementation (v4): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation
- Onboarding customers as a Tech Provider (token, subscribe, register): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider
- The default flow: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/default-flow
- A number in the WhatsApp Business app (coexistence): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- Subscribing an app to an account's webhooks: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/manage-webhooks
- Registering a number: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration

**Version note.** Embedded Signup v2 and v3 end on 15 Oct 2026; ALYR's code is v4. ALYR's default Graph version setting
(`ALYR_META_GRAPH_VERSION`) is `v21.0`; Meta's pages now show `v26.0`. Check which versions Meta still serves and set the
setting to a current one before relying on any of this: the same setting is used by the pop-up's SDK and by every Graph call.
**16 Nov 2026:** v21.0 is removed on 21 Jan 2027 (Meta's changelog), so the default is now `v26.0`.

## What it needs first (both are the founder's, ALY-52 and ALY-262)

Meta lets an app onboard customers only after it has **Advanced access** to both permissions, so the Tech Provider steps in
`meta-tech-provider.md` come first. Until Business Verification, App Review and Access Verification are done Meta limits an
app to onboarding 10 new customers in a rolling 7 days; they raise it to 200.

## Where it stands (16 Nov 2026)

| Step | State |
|---|---|
| 1. Approval | **Done 16 Nov 2026**: App Review approved, Tech Provider 2 of 2 |
| 2. Client OAuth settings | **Done 16 Nov 2026**, checked after a reload: all six on; `https://app.alyr.qa/` in both lists |
| 3. Configuration | **Done 16 Nov 2026**: "ALYR Embedded Signup", ID `1615391736569509` (not a secret: the sign-up page sends it to the browser). WhatsApp Embedded Signup variation, WhatsApp Cloud API only (Marketing Messages untouched), system-user token that **never expires**, WhatsApp accounts, the two permissions |
| 4. Webhook fields | **Done 16 Nov 2026**, checked after a reload: the eight fields below, callback `https://api.alyr.qa/webhooks/whatsapp` |
| **App published (Live)** | **Not done; the founder presses it.** App dashboard → Publish → Publish. Meta says that while the app is unpublished **no production webhooks are delivered**, not even for the app's admins, and only admins, developers and testers can use the pop-up |
| 5. Secrets and settings | One command now: `infra/gcp/setup.sh es-on 1615391736569509`, run by the founder signed in as a project owner. It makes `channel-keys-key` once (never shown), sets `ALYR_EMBEDDED_SIGNUP`, `ALYR_META_ES_CONFIG_ID` and `ALYR_META_APP_ID` (which production did not have) on the API, and the key on the API and the worker. Then `gh variable set ALYR_EMBEDDED_SIGNUP --body on` and a release (`release.md`) so the web image may load Meta's SDK on `/start` |
| 6 and 7. A test business, then Check | After the above |

## The steps

1. **Confirm the approval.** App dashboard → App Review → Permissions and features: `whatsapp_business_management` and
   `whatsapp_business_messaging` show **Advanced access**, and the Tech Provider onboarding is complete
   (`meta-tech-provider.md`, step 6 done). Until then do not go on: the pop-up would show only to the app's own admins,
   developers and testers.
2. **Client OAuth settings.** App dashboard → Facebook Login for Business → Settings → Client OAuth settings. Set each of these
   to **Yes**: Client OAuth login, Web OAuth login, Enforce HTTPS, Embedded Browser OAuth Login, Use Strict Mode for redirect
   URIs, Login with the JavaScript SDK. Add `https://app.alyr.qa` (and every domain the owner's screen is served from, HTTPS only)
   to both **Allowed domains** and **Valid OAuth redirect URIs**. The pop-up returns data only to a page on those domains.
3. **Make the configuration.** Facebook Login for Business → Configurations → **Create configuration**: custom, the **WhatsApp
   Embedded Signup** login variation (Meta also offers a template called "WhatsApp Embedded Signup Configuration With 60
   Expiration Token"). Select only the products, assets and permissions ALYR needs (WhatsApp accounts, `whatsapp_business_management`,
   `whatsapp_business_messaging`): extra ones make owners abandon the flow. Save it and copy the **configuration ID**.
   **Decide about the token's life** (the founder): the template's name says its token expires after 60 days. ALYR shows each
   business's token end date on `/ops` → WhatsApp lines and warns two weeks before, but it does **not** renew a token. If Meta
   offers a configuration whose token does not expire, choose it; otherwise a developer must build the renewal before ALYR relies
   on a business's own account.
4. **Webhook fields.** App dashboard → WhatsApp → Configuration: the callback is `https://api.alyr.qa/webhooks/whatsapp` with the
   verify token ALYR already uses. Subscribe these fields: `messages`, `account_update`, `account_alerts`, `account_review_update`,
   `phone_number_quality_update`, `phone_number_name_update`, `message_template_status_update`, `template_category_update`. (For a
   number moved from the WhatsApp Business app Meta also sends `history`, `smb_app_state_sync` and `smb_message_echoes`; ALYR does
   not process them yet, so a moved number's chat history and the messages the owner types in the app are not shown in ALYR.)
   ALYR subscribes its app to each business's account itself when the business connects.
5. **The secrets and settings** (a developer does this for the founder; nothing is typed into a chat or a ticket):
   1. `infra/gcp/setup.sh es-on <configuration id>`, signed in as a project owner. It makes the key that seals tokens
      (`channel-keys-key`, 32 random bytes, never shown) if there is none, lets `alyr-run` read it, and gives the API and the
      worker `ALYR_CHANNEL_KEYS_KEY`; it sets `ALYR_EMBEDDED_SIGNUP=true`, `ALYR_META_ES_CONFIG_ID` and `ALYR_META_APP_ID` on
      the API. Lose the key and every business's own token is unreadable: they connect again. A full `setup.sh apps` keeps
      all of it (it asks the live API). `ALYR_META_APP_SECRET` was already set; `ALYR_META_APP_ID` was not (16 Nov 2026).
   2. `gh variable set ALYR_EMBEDDED_SIGNUP --body on`: `deploy-gcp` passes it to the web image, so the page that opens the
      pop-up may load Meta's SDK. Then a release, as always (`release.md`), with the founder's yes.
6. **Try it with a test business first.** Make a business of your own, choose "I have a WhatsApp Business account" (or "move my
   number"), tick what the way needs, press **Connect with Meta**, and finish in the pop-up. While the app is in development
   mode only its admins, developers and testers can do this.
7. **Check the line.** `/ops` → WhatsApp lines → the business → **Check**: every row should be a tick; the access token reads "The
   business's own". Ask the owner to link their phone and send the test message (`whatsapp-line.md`).
8. **Billing is Meta's.** The business adds a payment method in WhatsApp Manager → Overview → Add payment method. Meta bills the
   business; ALYR adds no markup (D-007).

## When it goes wrong

| What the owner or `/ops` shows | Meaning | Do |
|---|---|---|
| "Meta did not accept the connection (it only lasts half a minute)" | The one-time code expired or was used | Press Connect again |
| "Meta does not show that number on your account" | The session message named assets the token does not own | Press Connect again and choose the number; if it repeats, look at the line's trail |
| "Meta could not switch your number on" | Registering failed (Meta allows 10 tries per number in 72 hours) | Finish the number's setup in WhatsApp Manager and wait |
| "Meta does not show your number as connected yet" | The display name is in review or the number is not verified | Wait for Meta's name decision (`phone_number_name_update`), then Connect again |
| "Meta did not let ALYR receive your messages" | Subscribing the app to the account failed | Try again in a minute; check the app's permissions |
| "That number is already connected to another business" | It is attached elsewhere | Detach it there first (staff) |
| The line's access token "ends" date is near | A business's own token has an end date | Ask the business to connect again from its sign-up screen; renewal is not built |
| Critical: "the business removed ALYR from its account" | `PARTNER_REMOVED` | Ask the owner; nothing can be sent until they connect again |

## Turning it off

`infra/gcp/setup.sh es-off` unsets `ALYR_EMBEDDED_SIGNUP` (and rebuild the web app without `ALYR_EMBEDDED_SIGNUP=on`). Businesses already connected keep working: their
tokens stay sealed and are still used. Staff can detach a number from `/ops` as before.
