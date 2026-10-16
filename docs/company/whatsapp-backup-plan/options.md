# The options in detail

Researched 16 October 2026. Prices are as published on that day; check them again before paying anything. Where a source is a third party and not the provider or Meta, it says so.

## What every option has in common

- **Meta's own message fees** are paid in all options. Only template messages are charged, on delivery. Messages that are not templates are free inside the 24-hour customer service window, and utility templates sent inside that window are free too ([Meta pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)).
- **Keeping the WhatsApp Business app** ("coexistence") needs WhatsApp Business app 2.24.17 or later, and is only available through a Meta Solution Partner or Tech Provider ([Meta: coexistence](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)). Once connected, broadcast lists become read-only and disappearing, view-once and live-location messages are switched off in the app; WhatsApp for Windows is unlinked.
- **Qatar and coexistence:** the only unsupported countries we found named were Nigeria and South Africa, and later third-party posts say even those are now supported. We found no source naming Qatar either way. Not confirmed.

## A. Main plan: ALYR becomes a Meta Tech Provider

**How it works.** ALYR's Meta app gets advanced access to `whatsapp_business_messaging` and `whatsapp_business_management`. Shops then connect through Meta's Embedded Signup inside ALYR, with coexistence.

**What ALYR needs.** Meta business verification (business name, address, phone, email, website, possibly documents), basic app settings (icon, privacy policy, category), and two demo videos: one of a message sent from ALYR and received in WhatsApp, one of ALYR creating a template ([Meta: become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)).

**Limits.** By default 10 new shops in a rolling 7 days; 200 after business verification, app review and access verification ([Meta: Embedded Signup overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)). One provider reports Meta dropped the separate access verification step in October 2025 ([360dialog](https://360dialog.com/blog/embedded-signup-versions-migration/)); check when applying.

**Who pays Meta.** "Your onboarded clients must add a credit card" ([Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)). Each shop pays Meta directly.

**Timing.** Meta gives no official figure. Providers report several business days for app review and about 5 business days for access verification ([Twilio](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/integration-guide), [Telnyx](https://developers.telnyx.com/docs/messaging/whatsapp/embedded-signup/tech-provider)).

**Blocked by.** The CR (business verification).

## B. ALYR joins 360dialog's partner programme

**How it works.** ALYR integrates 360dialog's onboarding (their "Integrated Onboarding" or Connect button). Shops connect under 360dialog's Meta approval, and ALYR sends messages through 360dialog's API.

**What ALYR needs.** 360dialog's own quickstart lists: registration as a Meta Tech Provider, "a registered company with relevant details", and a credit card ("the only payment method accepted") ([360dialog: get started](https://docs.360dialog.com/partner/get-started/quickstarts/get-started-as-a-partner)). Their Tech Provider page softens this: "360dialog Partners can onboard numbers immediately" but "onboarding more than 3 numbers requires registration as a Meta Tech Provider" ([360dialog: Tech Provider programme](https://docs.360dialog.com/partner/get-started/tech-provider-program)).

**Cost.** Starter €250 a month plus €49 per number; Growth €500 plus €25; Premium €1,000 plus €15. Month to month. Growth and Premium include help with business verification ([360dialog: partners](https://360dialog.com/partners)).

**Billing to shops.** Either ALYR pays and re-bills ("Partner-Paid"), or 360dialog bills each shop ("Direct-Paid") ([360dialog: get started](https://docs.360dialog.com/partner/get-started/quickstarts/get-started-as-a-partner)).

**Verdict.** Still needs a registered company, and costs €250 a month before the first shop. Only worth it if the CR is done but Meta's own review stalls, or for the help with verification.

## C. The shop opens its own account with a provider

**How it works.** The shop becomes the provider's direct customer. 360dialog sells straight to businesses: plans start at €49 a month per number plus Meta's fees ([360dialog: pricing](https://360dialog.com/pricing)). The shop connects its number through 360dialog's coexistence onboarding, which keeps the WhatsApp Business app and can copy past chats ([360dialog: coexistence](https://docs.360dialog.com/partner/onboarding/whatsapp-coexistence)). The shop then gives ALYR an API key for its number, and ALYR sends and receives through it.

**What ALYR needs.** Nothing legal: no CR, no Meta approval. ALYR is a software tool the shop has connected to its own provider account.

**What the shop needs.** A 360dialog account and subscription, its business details, a card, and the phone with the WhatsApp Business app. 360dialog's coexistence rules: the app must stay installed and be opened at least once every 13 days; newly created app accounts are not immediately eligible; classic Meta business verification and the blue badge are not available on coexistence numbers.

**Cost.** About €49 a month per number (roughly QAR 200; check the rate) plus Meta's fees. A third-party comparison says 360dialog adds 7% on marketing messages sent through the standard API, which conflicts with 360dialog's "no markup" claim ([YCloud comparison](https://www.ycloud.com/blog/ycloud-vs-360dialog), third party).

**Risks.**
- **Migration trap:** "COEX numbers cannot be migrated between WABAs" ([360dialog: coexistence](https://docs.360dialog.com/partner/onboarding/whatsapp-coexistence)). Moving the shop to ALYR's own approval later probably means disconnecting from 360dialog and connecting again through ALYR, not a migration. To confirm with 360dialog.
- **Two bills for the shop** (ALYR and the provider) unless ALYR absorbs the provider's fee.
- **Data residency:** 360dialog would receive every message. Its hosting location is not stated on the pages we read.

**Verdict.** The best backup for a first pilot before the CR.

## D. The shop's own Meta app, set up during the visit

**How it works.** The same way ALYR's own test number works today: the shop's owner creates a Meta developer app and business portfolio with their own Facebook login, registers their number on the Cloud API, and gives ALYR a token for it. ALYR's existing Meta channel is used.

**What ALYR needs.** Nothing legal. A business can use the Cloud API for its own number without being a Tech Provider.

**What the shop gives up.** Coexistence is only available through a Solution Partner or Tech Provider, so the number **leaves the WhatsApp Business app**. The shop uses a second number for ALYR, or moves its main number entirely.

**Cost.** Free apart from Meta's message fees, paid with the shop's card.

**Risks.** More technical (about 30 to 45 minutes with the owner). The shop's token must be stored securely by ALYR. Moving the number to ALYR's approval later uses Meta's documented migration between accounts, which keeps the display name and approved templates; templates must be copied first to avoid downtime ([Meta: migrating numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/migrating-phone-numbers-among-solution-partners-via-embedded-signup)).

**Verdict.** Good for a shop happy to use a separate number. Not for a shop whose customers all know one number in the app.

## Ruled out

- **Twilio.** "If you're an Independent Software Vendor (ISV), you must join Meta's Tech Provider program" ([Twilio: Tech Provider programme](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program)). No shortcut.
- **Other providers** (Gupshup, Infobip, WATI, Unifonic, Qatar resellers): not researched in depth. Third-party guides say resellers can sell on top of a provider without their own Meta approval ([BotPenguin](https://botpenguin.com/blogs/whatsapp-api-reseller), third party), which is option C under another name. Worth a comparison only if 360dialog's answers are poor.

## Open questions to ask the provider

Asking these is an outside message and needs the founder's yes.

1. Can a business in Qatar open a direct account and use coexistence, and do you require Meta business verification first?
2. If that business later moves to a software partner's own Meta approval, what happens to a coexistence number, given that it cannot be migrated between accounts?
3. Where is message data stored and processed, and do you add any charge on top of Meta's fees?
