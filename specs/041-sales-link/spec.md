# 041 · Sales link: a quote made on a visit opens sign-up at the pay step

ALY-216, part of ALY-163 ("Door 2b" in the 23 Oct 2026 client onboarding plan). Decisions D-105 to D-108 (provisional numbers). Builds on D-032 (price list and quotes), D-049 (one flow for both doors), D-051 and D-092 (the first payment is the first month, nothing is paid before go-live), D-067 (terms accepted by version, ALY-167), D-080 (signed links), D-022 (sign-in by a code to the email). It does not touch the Pay ALYR panel, Today's "accepted, waiting for payment" item, the price-ready email, the payment-date default (ALY-274) or the activation job (ALY-213).

## What it is for

The founder sells in person. On a visit he learns the shop's type, name and the owner's email, and agrees a price. Today the owner then has to find `/start`, retype everything, and wait for ALYR to prepare a price. The sales link carries the visit to the end: the founder builds the quote in `/ops`, sends one link, and the owner proves their email, reads the quote, accepts the terms and lands on the go-live card that asks for the first month. The business already has its type and products. Most of the first ten clients are expected to arrive this way.

## Words used

- **Lead** (also **prospect**): a client with no business yet. It is a row in `clients` with its plan in `clients.prospect` (the business type, the Arabic name, the area). The pipeline around leads (stages, follow-ups, lost reasons, converting) is ALY-84 and is not built here; this is the smallest thing the sales link needs, and ALY-84 builds on it (D-106).
- **Sales link**: one offer to one lead. A row in `sales_links`, a signed token in the address, a code to the owner's email.

## What the founder sees (`/ops` → Clients)

1. **New lead** on the Clients list: business name, the owner's name, the owner's email (required, because the code goes there), phone (optional), the type of business, the area (optional). It makes a client with no business. The list shows it with "none" under Businesses.
2. Open the lead. **Price** works as it does for any client (New quote from the price list, edit the lines, Publish to the owner). The first draft is made from the price list for the lead's business type, exactly as sign-up would have drafted it, so the amounts are the price list's and nothing is typed in code. A lead's type and area can be changed in the **Sales link** card until a link is used.
3. **Sales link** card (a lead with a published quote only). **Send link** with a life of 1, 3, 7 (the default), 14 or 30 days makes the link and shows:
   - the address with **Copy**;
   - **Share on WhatsApp**, which opens the founder's own WhatsApp with the sentence and the link ready to send to the owner (ALYR sends nothing itself, so there is no template and no consent step);
   - **Show QR**, a large code on a white card for the owner to scan from the founder's phone during the visit, drawn by the same utility as the shop's counter QR codes (ALY-112, `_workspace/qr.ts`);
   - **Revoke**.
   It also says, in words: "Not opened yet", "Opened 2 times, last 14:05", "Email proved", "Used on 3 Nov: the business is X", "Ran out on 6 Nov", "Revoked by Y".
4. Sending a new link revokes the earlier unused one. Changing the lead's email revokes it too (the link was made for another address). A link whose quote is taken back to a draft or withdrawn still opens, and says the price is being prepared; the owner cannot accept until it is published again, and an acceptance in the moment between is refused with "the price has changed".
5. A client that already has a business gets no sales link card: its owner signs in and answers a published price on the plan step, as today.

## What the owner sees (`/join#…`)

A new page (`/join`, the token in the address's fragment), outside the sign-up layout and outside analytics, English and Arabic with a switch (the language follows the device, then the saved choice). Four steps on one screen, no sign-in first.

1. **Open.** "ALYR has prepared an offer for *Dafira Bakery*." The business name, the type, a masked email (`n••••@gmail.com`) and "Send me a code". A link that is expired, revoked, used or not ours says so in one sentence and who to ask. Nothing else about the shop is shown before the code.
2. **Code.** Six digits sent to the email the founder recorded; the owner cannot type another address, so holding the link is not enough. A wrong code, too many codes and too many guesses are said in words.
3. **The offer.** The published quote exactly as the plan step of `/start` shows it (monthly price, discount, period, once-only lines, the note, the promise, "together" saving), the products the business gets, the owner's name (prefilled, editable), and the current customer agreement and privacy notice, each linked and ticked as on `/start` (every current version, so a published agreement is asked too), and **Accept and continue**. Without every tick nothing is created.
4. **Go.** The business is created with its type and products, joined to the lead's client; the terms are recorded (who, which version, when, from where) exactly as sign-up records them; the quote is accepted; the owner is signed in; the page opens `/start`, which lands on the go-live step where the card "Pay your first month" shows what is due, the bank details and the card button when card billing is on. Everything else on that list (content, hours, a try-out, WhatsApp) is still to do and says so; nothing is hidden.

The link works while public self-serve sign-up is closed, because the founder's invitation is the permission (D-107).

## The link

- **Address.** `{web}/join#<token>`. The token is the address's *fragment*, which a browser never sends to a server: it is in no request log (the web host's, the edge's, the API's), in no analytics event and in no Referer, and the page gives it back in the body of its own calls. No name, email, phone, price or business ID in it.
- **Token.** `core/links.py`, a new purpose `sales`. `payload = version | purpose | link ID | expiry | …`, `mac = HMAC-SHA256(secret, context | client ID | payload)[:16]`. The client's ID sits inside the signature, so a token cannot be pointed at another client, and a token of any other purpose (order, booking, document, resume, track, pay) opens nothing here and this one opens nothing there. The expiry is signed.
- **Row.** `sales_links`: the link ID, the client, who made it, when it runs out, `revoked_at`/`revoked_by`, how many times it was opened and when, when the email was proved, and, once used, when and the business made. At most one link per client is unused and unrevoked (a partial unique index). The token is not stored: it is made again from the row, which is how **Copy** and **Show QR** work on a later day.
- **Checks on every call**, in this order: the limit for the address is counted, then the token's shape, the row it names, the signature against that row's client, the signed expiry, the row's own expiry, `revoked_at`, `claimed_at`, and that the client still has no business. A forged token, a token with someone else's link ID and a token with the wrong purpose all answer "this link does not work" with the same words and status as an unknown one.
- **Single client, single use.** The database function that makes the business (`signup_create_business`, migration 0081) takes the link, locks it, and refuses unless it is unused, unrevoked, unexpired, its client has no business, and the client's recorded email is the email the one-time sign-up token proved. The link is marked used in the same transaction as the business.

## Security

- **Proof of the mailbox.** The code goes only to `clients.contact_email`. Five codes an hour per email (existing), five per link, twenty guesses an hour per link, and per address limits on every call (`core/ratelimit.py`, new `JOIN_*` limits). A refused call is not counted again; forged tokens count against their address first.
- **Audit log** (`platform_audit`, append only), visible in `/ops` → History for the client: `lead.created`, `sales_link.sent`, `sales_link.opened` (once per ten minutes at most; the count is exact on the row), `sales_link.code_sent`, `sales_link.verified`, `sales_link.accepted` (the business made and the quote accepted), `sales_link.revoked` (with the reason: by hand, replaced, email changed). The owner's own actions are recorded with the actor "Owner (sales link)" and no address or name beyond what the audit log already holds.
- **Analytics.** The page is not mounted under the sign-up layout, so PostHog is not loaded on it; the token is in no analytics event. It is `noindex` like every product page, sends no referrer (the page's metadata says `no-referrer`, so the terms links it opens never see the token) and the API logs never print a token or a code.
- **Who may call.** The staff routes need ALYR staff (the existing `platform_admin` check). The public routes need a live link. Nothing takes a tenant or client ID from the request: the client comes from the token's row.
- **Data in Qatar.** No new service. The code email is the sign-in email already sent through the mail provider. The WhatsApp share is a `wa.me` address opened on the founder's own phone.

## API

Staff (new `routes/sales_links.py`):
- `POST /api/admin/leads` · `PUT /api/admin/clients/{id}/prospect` · `GET|POST|DELETE /api/admin/clients/{id}/sales-link`.

Public (new `routes/join.py`, `core/sales_link.py`):
- `POST /api/join/open`, `/code`, `/verify`, `/accept`, each with `{t}` in the body (never in a query string or a log).

Changed: `core/links.py` (purpose `sales`, `mint(…, expires=)`, `peek`), `core/pricing.py` (a lead's first draft and preview use its type; `_client` carries `prospect`), `core/onboarding.py` (`create_business` takes the link), `core/ratelimit.py`, migration 0081 (the function), `main.py`.

## Money

Every amount is the price list's through `pricing.draft_lines` and `pricing.quote_view`; the first payment is `access.due()`, so D-092 (no setup fee while the `setup` line is switched off) applies by itself, and PR #197's wording on the go-live card is what the owner reads. The join page prints amounts from the API's quote view in the same way `/start` does. No price is written in code or in copy.

## Not in this spec

- **The lead pipeline** (stages, follow-ups, lost reasons, convert, a lead list apart from Clients, sign-up at `/start` joining a lead by email): ALY-84.
- **ALYR emailing the link.** The founder shares it himself (WhatsApp, a QR, a message from his own phone). An email of the link needs the email skill's design and the founder's wording; the code email already exists.
- **A link for a client that already has a business** (it signs in and answers on the plan step today).
- **A Today item** for "link opened, not accepted" (Today's items are ALY-274's this week).
- **Several businesses on one offer.** One link makes one business.
- **Arabic read by a native speaker** (ALY-66): the Arabic is written to the Arabic rules and not yet signed off.

## Checks

`tests/test_sales_link.py` on the real path (PostgreSQL, HTTP in and out, the mail provider replaced by a recording transport): the whole visit (lead, quote from the price list, publish, send, open, code, verify, accept) ending with the business joined to the lead's client, the terms recorded, the quote accepted, the owner signed in and `GET /api/onboarding/payment` showing what the price list and the quote make due, including with the setup line switched off; a forged token, a token of another purpose, a token pointed at another client's link, an expired link, a revoked link, a used link and a link whose email changed are each refused with the same words and no business; a code for the wrong address, a sign-up token for another email and a second use are refused by the database function itself; the limits answer 429; every event is in the audit log; the staff routes refuse anyone who is not ALYR staff; `tests/test_tenant_isolation.py` lists `sales_links` as a platform table with forced row-level security. In a real browser (Chromium against a seeded local API): the founder's flow at 390 px, the QR read back with an independent decoder, the owner's page at 390 and 320 px in English and Arabic, light and dark.
