# Becoming a Meta Tech Provider (ALY-52, D-007)

Written 28 Oct 2026, the day Meta verified the business; updated the same evening after the
app settings were done; updated 31 Oct 2026, the day App Review was submitted. Checked against Meta's page "Become a Tech Provider" (the founder
pasted it into a session on 28 Oct 2026, and the dashboard showed the same steps):
https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers

The steps below are ours, written from that page and from what the dashboard showed. Meta's
page is the source; read it again before each step, because Meta changes the flow.

**What it gives ALYR.** A Tech Provider builds on the WhatsApp Business Platform and offers
it to businesses it onboards, on its own or together with a Solution Partner. Approval is
what lets a shop connect its own WhatsApp number to ALYR through Embedded Signup (ALY-39),
including a number already in the WhatsApp Business app (coexistence).

## Where things stand

| Step | State |
|---|---|
| Meta app with the WhatsApp use case, in the business portfolio | Done: app `alyr`, ID 1071845795713841, portfolio "Alyr" 1123909593527755. The app also has an Instagram use case; ALYR does not use it, and nothing in App Review should ask for Instagram permissions |
| Step 1. Business verification | **Done 28 Oct 2026** ("Verification for alyr software"): legal name alyr software, CR 255539, website alyr.qa (legal name in the footer, PR #144; company page, PR #146), domain alyr.qa verified by DNS TXT record. Submitted by Beevi Jinan, the registered owner, from her account |
| Onboarding type and Tech Provider Terms | **Done:** Akmal chose **Independent Tech Provider** (D-007). The dashboard shows "Onboard as an independent Tech Provider", 1 of 2 steps complete, on 31 Oct |
| Step 2a. App settings | **Done 28 Oct 2026**, saved and checked after a reload: app domain `alyr.qa`, contact `akmal@alyr.qa`, privacy policy `https://alyr.qa/privacy` (published 28 Oct, PR #148), data deletion instructions `https://alyr.qa/privacy#delete`, category "Business and pages", icon (the ALYR mark on Carbon, 1024 × 1024). Terms of service URL left empty: none is published |
| Step 2b. Two videos | **Done:** both edited recordings are attached to their permissions in the submission |
| Step 2c. Advanced access to `whatsapp_business_messaging` and `whatsapp_business_management` | **Requested** in the submission, with the wording in step 5. Not granted until Meta approves |
| Website platform | **Done 31 Oct 2026:** `https://alyr.qa/`. App Review's reviewer step stays locked until the app has a platform; the app is called through the API, so Website is the fitting one |
| Submit: **Begin App Review** | **Submitted 31 Oct 2026 (ALY-262):** Akmal ticked Meta's terms and pressed Submit. Meta shows "Review in progress". A submission cannot be edited or cancelled while it is in review |
| Webhooks | Done for the test number (12 Oct); the app is subscribed to `messages` |

Meta's page does not list a separate "access verification" step (it did in 2025).

## Who can do it

The app dashboard (developers.facebook.com) opens only for the app's own admins: **Akmal's**
Facebook account. Beevi is an admin of the business portfolio (full access, 26 Oct) but not
of the app; on her account the dashboard falls back to the developers homepage.

## Where it is in the dashboard

App dashboard → **Use cases** (pencil icon) → **Customize** on "Connect with customers
through WhatsApp" → left menu **Become Tech Provider** (Meta's page calls it "Tech Provider
onboarding"). The page links to the Embedded Signup documentation, developer support and
success stories, and holds the steps below.

## The steps, in order

1. **Choose the onboarding type** (founder). "Independent Tech Provider": no partner app ID,
   partners stay possible later, App Review required. The other choice, "Working with a
   Solution Partner", needs the partner's app ID and adds one App Review step, **Create a
   partner solution**. That is ALYR's backup route only (`docs/company/whatsapp-backup-plan/`).
   Pressing **Start onboarding** accepts the Tech Provider Terms.
2. **Business verification.** Done. The page marks it complete because the verified
   portfolio is linked to the app.
3. **Review the app settings.** Done (table above). Meta asks for an icon, a privacy policy
   and a category.
4. **Two videos.** Meta needs evidence that the app can send messages and manage templates:
   - **Video 1, a message sent from the app and received in WhatsApp** (phone or WhatsApp
     Web). Either ALYR itself (the laptop API and tunnel running; the test number replies on
     the phone; show both screens), or Meta's allowed alternative: the **API Setup** page's
     cURL command sending to a phone added as a test recipient, with the phone showing it
     arrive.
   - **Video 2, the app creating a message template.** Meta's allowed alternative is
     **WhatsApp Manager → Message templates → Create template**. Use a utility template ALYR
     really uses, for example `order_confirmed` from `apps/api/src/alyr/core/templates.py`,
     not a marketing one. Do not record `templates_sync --create` for this: it submits every
     template Meta lacks, which waits on the founder's go (docs/status.md, documents
     delivery).
5. **Request Advanced access** to the two permissions, each with a short use and its video:
   - `whatsapp_business_messaging`, to send messages for the businesses ALYR onboards: "ALYR
     sends and receives WhatsApp messages for small businesses in Qatar that connect their
     own number: order and booking confirmations, replies from the shop's team, and
     reminders the customer agreed to."
   - `whatsapp_business_management`, to reach those businesses' WhatsApp accounts. Without
     it, calls on accounts the portfolio does not own fail with error code 200: "ALYR reads
     each connected business's phone numbers and message templates, and creates the
     templates the business uses, so the shop does not need WhatsApp Manager."
6. **Begin App Review** (founder). Done 31 Oct 2026. The page says most submissions are
   reviewed within 20 days, and longer if Meta needs more information.

## What we told Meta (31 Oct 2026)

Keep these true. If one stops being true, change the answer at the next review, not after it.

- **Reviewer note:** ALYR is software for small businesses in Qatar; a business connects its
  own number and ALYR uses the Cloud API and the Business Management API from our servers;
  nothing to install and no test account is needed, the two recordings show each permission
  end to end; ALYR uses only the WhatsApp Business Platform and no public_profile data.
- **Facebook Login:** No, it is not integrated. The note says Embedded Signup, which uses
  Facebook Login for Business, comes after approval (ALY-39).
- **Processors with access to Meta's data** (from `docs/data-residency.md`, as IT services):
  Google Cloud (Qatar); Cloudflare (Qatar, United States: its network has no one location, so
  these are the two certain ones, for customers' pages and Meta's webhooks); Resend (Ireland,
  United States: the data is in Ireland, the company is American). PostHog and Zoho are not
  listed because neither receives Meta's data.
- **Responsible entity:** alyr software W.L.L., Qatar.
- **National security requests in the past 12 months:** No.
- **Policies for requests from authorities:** legality review, data minimisation and
  documentation, the three rules of `docs/company/authority-requests.md` (D-125). "Provisions
  for challenging these requests" is not ticked: that waits for a lawyer (ALY-51).
- **Agreements:** allowed usage for the two permissions and `public_profile`, and the Meta
  Platform Terms and Developer Policies at Submit, which Akmal ticked.

Keep the template Video 2 created (`app_review_order_ready`) until Meta approves: the
recording shows it being made.

## After approval

- **Embedded Signup (ALY-39):** a Facebook Login for Business configuration for WhatsApp
  Embedded Signup, its configuration ID in the API's settings, and the onboarding screen
  that opens it (spec 019 states, `ALYR_WHATSAPP_WAYS_OPEN`).
- **WhatsApp Business app users (coexistence):** Embedded Signup can be set up to onboard a
  shop with its existing account and number. This is the way most shops will want (spec
  019's "moving their number with the app kept").
- **Webhooks for each onboarded business:** set up before its messages and templates can
  flow through ALYR (the test number's subscription is not enough on its own).
- **Billing:** each onboarded shop adds its own card to its WhatsApp Business Platform
  account; Meta bills the shop (D-007: ALYR adds no markup).
- **Support:** a confirmed Tech Provider gets all of Meta's support channels.

## Limits to remember

- Messaging limit on the test account today: 250 business-initiated conversations in a
  rolling 24 hours (WhatsApp Manager, 28 Oct). It rises to 2,000 after enough
  high-quality conversations.
- Each shop pays Meta for its messages with its own card. ALYR adds no markup.
