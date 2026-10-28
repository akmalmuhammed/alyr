# Becoming a Meta Tech Provider (ALY-52, D-007)

Written 28 Oct 2026, the day Meta verified the business. Checked against Meta's page
"Get started for Tech Providers" on 28 Oct 2026:
https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers

Tech Provider approval is what lets a shop connect its own WhatsApp number to ALYR through
Meta's Embedded Signup (ALY-39), and keep its WhatsApp Business app (coexistence).

## Where things stand

| Step | State |
|---|---|
| Meta app with the WhatsApp use case, in the business portfolio | Done: app `alyr`, ID 1071845795713841, portfolio "Alyr" 1123909593527755 |
| 1. Business verification | **Done 28 Oct 2026** ("Verification for alyr software"). Legal name alyr software, CR 255539, domain alyr.qa verified (DNS TXT record) |
| 2a. App basic settings: icon, privacy policy URL, category | Not done. The privacy policy page is built (`/privacy`, ALY-72) and waits for the founder's yes to publish |
| 2b. Two screen recordings | Not done |
| 2c. Advanced access to `whatsapp_business_messaging` and `whatsapp_business_management` | Not requested |
| Webhooks | Done for the test number (12 Oct); the app is subscribed to `messages` |
| Submit: "Begin App Review" | Not done; the founder submits |

Meta's page no longer lists a separate "access verification" step (it did in 2025).

## Who can do it

The app dashboard (developers.facebook.com) opens only for the app's own admins: **Akmal's**
Facebook account. Beevi is an admin of the business portfolio (full access, 26 Oct) but not
of the app; on her account the dashboard falls back to the developers homepage.

## The steps, in order

1. **Publish the privacy policy.** Merge the ALY-72 pull request and publish the site
   (founder's yes). Check https://alyr.qa/privacy and https://alyr.qa/privacy#delete answer.
2. **App settings** (App dashboard → App settings → Basic), as Akmal:
   - Privacy policy URL: `https://alyr.qa/privacy`
   - User data deletion: "Data deletion instructions URL", `https://alyr.qa/privacy#delete`
   - Terms of service URL: none published yet (the customer agreement, PR #47, is a draft
     for a lawyer). Leave empty unless Meta asks for it.
   - App icon: 1024 × 1024 px. Use the ALYR symbol from the design system on Carbon
     (`apps/web/app/icon.svg` exported to PNG). Ask the Site and brand lane for the file.
   - Category: "Business and pages" (or "Business" in Meta's current list).
   - Contact email: `akmal@alyr.qa`. App domains: `alyr.qa`.
3. **Two screen recordings** (screen capture with sound off is fine; Meta accepts the
   API Setup and WhatsApp Manager versions):
   - **Video 1, a message sent from the app and received in WhatsApp.** Either ALYR itself
     (the laptop API and tunnel running; a phone sends "Hello" to the test number, the
     reply arrives on the phone; show both screens) or the cURL script on the app's
     **WhatsApp → API Setup** page sending to a test recipient, with the phone showing it
     arrive.
   - **Video 2, a message template being created.** In **WhatsApp Manager → Message
     templates → Create template**. Use a utility template ALYR really uses, for example
     `order_confirmed` from `apps/api/src/alyr/core/templates.py`, not a marketing one. Do
     not record `templates_sync --create` for this: it submits every template Meta lacks,
     which waits on the founder's go (docs/status.md, documents delivery).
4. **Request Advanced access** (App dashboard → App Review → Permissions and features):
   `whatsapp_business_messaging` and `whatsapp_business_management`. For each, say how
   ALYR uses it in one or two plain sentences, and attach the video:
   - messaging: "ALYR sends and receives WhatsApp messages for small businesses in Qatar
     that connect their own number: order and booking confirmations, replies from the
     shop's team, and reminders the customer agreed to."
   - management: "ALYR reads each connected business's phone numbers and message
     templates, and creates the templates the business uses, so the shop does not need
     WhatsApp Manager."
5. **Begin App Review.** The founder presses it.
6. **After approval:** Embedded Signup (ALY-39): a Facebook Login for Business
   configuration for WhatsApp Embedded Signup, its configuration ID in the API's settings,
   and the onboarding screen that opens it (spec 019 states, `ALYR_WHATSAPP_WAYS_OPEN`).

## Limits to remember

- Messaging limit on the test account today: 250 business-initiated conversations in a
  rolling 24 hours (WhatsApp Manager, 28 Oct). It rises to 2,000 after enough
  high-quality conversations.
- Each shop pays Meta for its messages with its own card (D-007; Meta: "onboarded clients
  must add a credit card"). ALYR adds no markup.
- Meta gives no review time. Providers report a few business days.
