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

## What it needs first (both are the founder's, ALY-52 and ALY-262)

Meta lets an app onboard customers only after it has **Advanced access** to both permissions, so the Tech Provider steps in
`meta-tech-provider.md` come first. Until Business Verification, App Review and Access Verification are done Meta limits an
app to onboarding 10 new customers in a rolling 7 days; they raise it to 200.

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
   1. Make the key that seals tokens: 32 random bytes, base64. Store it in Secret Manager in Doha as `channel-keys-key` and give
      the API and the worker `ALYR_CHANNEL_KEYS_KEY` from it (`docs/runbooks/secret-rotation.md`, "Where production stands").
      Lose it and every business's own token is unreadable: they connect again.
   2. Set `ALYR_META_ES_CONFIG_ID` (the configuration ID from step 3). `ALYR_META_APP_ID` and `ALYR_META_APP_SECRET` are the
      app's, already set.
   3. Set `ALYR_EMBEDDED_SIGNUP=true` on the API service. A full `infra/gcp/setup.sh apps` deploy replaces every setting, so set it
      again after one.
   4. Build the web app with `ALYR_EMBEDDED_SIGNUP=on` (a build setting) so the page that opens the pop-up may load Meta's SDK;
      publish as always, with the founder's yes.
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

Unset `ALYR_EMBEDDED_SIGNUP` (and rebuild the web app without `ALYR_EMBEDDED_SIGNUP=on`). Businesses already connected keep working: their
tokens stay sealed and are still used. Staff can detach a number from `/ops` as before.
