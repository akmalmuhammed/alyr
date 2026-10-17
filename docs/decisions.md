# Decision log

Every decision that shapes Alyr, newest last. One entry per decision: what we chose, why, what we rejected, and what would make us revisit it. Add an entry in the same pull request as the change it explains. Never rewrite an old entry; add a new one that supersedes it.

Status: **Accepted** (in force), **Proposed** (waiting for the founder), **Superseded by D-xxx**.

| # | Decision | Status |
|---|---|---|
| D-001 | One deployable service (modular monolith) | Accepted |
| D-002 | PostgreSQL with forced row-level security for tenant separation | Accepted |
| D-003 | Plain SQL migrations, never edited after they are applied | Accepted |
| D-004 | Modules never call a channel; one outbound layer | Accepted |
| D-005 | Chat simulator as a first-class channel | Accepted |
| D-006 | Product 1 is Inbox and Collect; launch before payroll | Accepted |
| D-007 | Meta Tech Provider route; no message markup | Accepted |
| D-008 | E-invoicing parked | Accepted |
| D-009 | Contacts are keyed on WhatsApp's BSUID; phone is optional | Accepted |
| D-010 | Jobs and outbox live in PostgreSQL | Accepted |
| D-011 | Free tiers first; everything runs from Docker Compose so it can move | Accepted |
| D-012 | No AI model is required for Product 1 | Accepted |
| D-013 | Where things run until the first 10 customers | Accepted |
| D-014 | Branch per issue, pull request, green CI before merge | Accepted |
| D-015 | WhatsApp is the mobile app; no native app, no offline engine | Accepted |
| D-016 | Product 1 includes a slim order-and-pay link | Accepted |
| D-017 | Launch pricing: flat per number with seats included | Proposed |
| D-018 | Company registration starts now, not when the product is ready | Proposed |
| D-019 | The API does not run on Cloudflare Python Workers (for now) | Accepted |
| D-020 | Consent and the 24-hour window are enforced in the outbound layer | Accepted |
| D-021 | A person answering from the inbox pauses the assistant for that customer | Accepted |
| D-022 | Sign-in is our own: one-time code by email, sessions in our database | Proposed |
| D-023 | ALYR is the company; the WhatsApp product is its first product | Accepted |
| D-024 | Bookings join Product 1; the first customers book, order, pay and track | Accepted |
| D-025 | The public site uses the playbook's words on the design system's look | Proposed |
| D-026 | The homepage is about ALYR the company; ALYR Chat has its own page | Accepted |
| D-027 | One workspace for every product, driven by a catalogue; ALYR has a back office | Accepted |
| D-028 | Every item has one person responsible, and the team's work is on the record | Accepted |
| D-029 | Email at @alyr.qa: Cloudflare Email Routing in, Resend out | Accepted |
| D-030 | A weekly result report to the owner, one section per product | Accepted |
| D-031 | Self-serve onboarding: sign up, create the business, start from a preset, try it on a private test line | Accepted |
| D-032 | Prices are set per client from the back office: a price list, a quote per client, published live to the owner | Accepted |
| D-033 | The internal tool: one console for every client, built in three levels; staff never see customer conversations | Accepted |
| D-034 | Product first and paid from the first customer; the homepage leads with what ALYR sells today | Accepted |
| D-035 | ALYR is a suite of products led by ALYR Agent: Chat, Bookings, Agent, Accounts, Payroll coming; the workspace home becomes the Agent dashboard | Accepted |
| D-037 | The public site presents the suite: the homepage leads with ALYR Agent at work, and every live product has its own page | Accepted |
| D-038 | The Sunday report is a report card: a branded image from ALYR Agent's engine with about eight lines under it | Accepted |
| D-039 | The Catalog (items, stock, photos) is built complete before go-live; photos on Cloudflare R2; free now, charged by usage later | Accepted |

---

## D-001 · One deployable service
**Date** 6 Oct 2026 · **Status** Accepted

FastAPI modular monolith: modules are folders with clear boundaries, deployed as one service plus one worker process.

**Why.** Two people cannot operate many services. Module boundaries give most of the benefit; a network between them gives mostly failure modes.
**Rejected.** Microservices; serverless functions per feature.
**Revisit when.** One module's load or release cadence is clearly hurting the others.

## D-002 · Row-level security in the database
**Date** 6 Oct 2026 · **Status** Accepted

Every tenant-owned table has `tenant_id` and a forced RLS policy. The app connects as `alyr_app`, which owns nothing and cannot bypass RLS. Tested in `tests/test_tenant_isolation.py`, including a check that fails when a new table has no policy.

**Why.** A forgotten `WHERE tenant_id = ...` is the classic multi-tenant leak, and code written quickly with an AI agent is exactly where it would happen. The database refuses instead.
**Rejected.** Filtering in application code; a database per tenant (too costly on free tiers and to migrate).
**Revisit when.** A customer contractually requires a physically separate database.

## D-003 · Plain SQL migrations
**Date** 6 Oct 2026 · **Status** Accepted

Numbered `.sql` files applied in order by `python -m alyr.migrate`. A migration that has been applied anywhere other than a developer's own machine is never edited; changes go in a new file.

**Why.** RLS policies, grants and roles are clearer in SQL than through an ORM migration tool, and there is no ORM here.
**Rejected.** Alembic (was in the original issue).
**Revisit when.** We need down-migrations or branching migration histories.
**Note.** `0001_core.sql` was edited twice on 6 Oct before any shared environment existed. That window is now closed.

## D-004 · One outbound layer
**Date** 6 Oct 2026 · **Status** Accepted

Modules return `OutboundMessage` objects. `core/outbound.py` is the only code that sends, and it records every message. Consent, the 24-hour window and messaging limits are enforced there.

**Why.** Meta's rules are per message. Enforcing them in one place is the only way a new module cannot break them and get a merchant's number restricted.

## D-005 · The simulator is a real channel
**Date** 6 Oct 2026 · **Status** Accepted

A second channel with the same interface as Meta's. Everything is built and demoed against it first.

**Why.** Development and sales demos do not wait on Meta, payment providers or the internet. It also keeps test runs free.
**Risk.** The simulator can drift from Meta's real behaviour. Each phase's exit test therefore runs on a real number.

## D-006 · Product 1 is Inbox and Collect
**Date** 7 Oct 2026 · **Status** Accepted (founder said "start building end to end" on 7 Oct)

Shared team inbox, contacts, credit ledger, payment links, reminders, broadcasts. Sold before payroll, jobs or ordering are built. Full reasoning: `master-plan.md` sections 4 and 6.

**Revisit when.** Alpha merchants will not pay for it, or ask for payroll first.

## D-007 · Tech Provider, no markup
**Date** 7 Oct 2026 · **Status** Accepted

Alyr applies to Meta as a Tech Provider. Merchants pay Meta for messages with their own card. Alyr earns from subscriptions only.

**Why.** Only Solution Partners hold a credit line and may invoice clients for messages; that programme is slow to join.
**Cost.** The plan's 10% message margin is gone. At Qatar rates it was small: a merchant sending 2,000 utility templates a month pays Meta about USD 18.
**Revisit when.** We have enough merchants that carrying their message bill becomes a selling point.

## D-008 · E-invoicing parked
**Date** 7 Oct 2026 · **Status** Accepted

Nothing is built until Qatar's General Tax Authority publishes the technical specification. Invoices keep sequential numbers and a clean record so a serializer can be added.

**Why.** The law is a Cabinet-approved draft (6 May 2026) and is expected to follow VAT, which has not started. The brief's signing details were Saudi Arabia's.
**Revisit when.** The GTA publishes a specification or announces a date.

## D-009 · Contacts keyed on BSUID
**Date** 7 Oct 2026 · **Status** Accepted

`contacts.wa_user_id` (Meta's business-scoped user ID) is the identity. `phone` is optional. Inbound matching tries BSUID, then phone, and fills in whichever was missing. Meta's `user_id_update` webhook moves a contact to its new ID.

**Why.** WhatsApp usernames roll out in 2026. A customer with a username may reach us with no phone number in the webhook.
**Source.** https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/

## D-010 · Jobs and outbox in PostgreSQL
**Date** 7 Oct 2026 · **Status** Accepted

A `jobs` table claimed with `FOR UPDATE SKIP LOCKED`, written in the same transaction as the data it belongs to. One worker process from the same codebase.

**Why.** A message row and its send job commit together or not at all, with no broker to run. It also costs nothing extra, which matters under D-011.
**Rejected.** Redis-based queues (a job can be lost between the database commit and the enqueue); Celery or a hosted queue (more to operate, not free).
**Limit.** Comfortable to a few hundred jobs a second, far beyond the first hundred merchants.
**Built 7 Oct (ALY-50).** Sends and inbound webhooks are jobs. Retries double from 5 seconds, six attempts, then the job is parked and the message is marked failed. A job left running by a dead process is requeued after five minutes. Delivery is at least once: if the process dies after Meta accepts a message and before we record it, the retry can send it twice. Meta offers no way to make a send idempotent, so that window is accepted.
**How it runs.** Locally and in tests the API runs jobs itself right after each request (`ALYR_JOBS_INLINE=true`). In production that is switched off and `python -m alyr.worker` runs them.
**Revisit when.** Queue latency grows under load, or we need fan-out to many workers.

## D-011 · Free tiers first, built to move
**Date** 7 Oct 2026 · **Status** Accepted

Until the first 10 paying customers we do not pay for infrastructure where a free option is adequate. To keep that from becoming a trap, the whole system runs from `docker-compose.yml` using only standard PostgreSQL, Redis and S3-compatible storage. No feature may depend on a hosting vendor's proprietary service.

**Why.** No money goes out before money comes in, and nothing has to be rewritten when we move.
**Tracked in.** `stack.md` lists every tool, its free limit, what we lose by staying on it, what we swap to, and the trigger.
**Unavoidable costs.** A domain name, Meta's fees for our own sign-in codes, the lawyer.

## D-012 · No AI model required for Product 1
**Date** 7 Oct 2026 · **Status** Accepted

The ledger's chat commands, balance questions and payment intents work from rules (`core/normalise.py`). A model is an optional improvement behind one gateway, off by default.

**Why.** Free model tiers use prompts for training and human review, which rules them out for real customer messages. Rules cost nothing, are testable, and never send a customer's text anywhere.
**Revisit when.** The rule-based test set's accuracy on real merchant messages is not good enough, and the legal opinion (ALY-51) says where a model may run.

## D-013 · Where production runs until the first 10 customers
**Date** 7 Oct 2026 · **Status** Accepted (founder chose on 7 Oct; see "Chosen" below)

Options considered, all at no cost:

| Option | Where | For | Against |
|---|---|---|---|
| **A. Microsoft for Startups credits** (recommended) | Azure Qatar Central | In Qatar. USD 1,000 on signup, USD 5,000 after verification, enough for a year or more at our size. Managed PostgreSQL and backups | An application with a review of about 17 business days. Reports of capacity limits in the region |
| B. Oracle Cloud Always Free | Dubai or Jeddah | Free indefinitely, commercial use allowed, never sleeps. 2 cores and 12 GB runs everything | Not in Qatar. We run PostgreSQL and backups ourselves. Free capacity is sometimes unavailable at signup. Idle machines can be reclaimed |
| C. Free developer platforms (Neon, Render, Upstash) | Europe | Fastest to set up | Not in the region. Free services sleep, and a sleeping server misses Meta's webhook deadline. Limits are tight |

**Chosen, in three stages.**

1. **Now, for development and the Meta test number:** everything on the founder's laptop in Docker, reached by Meta through a Cloudflare Tunnel. Costs nothing and needs no account beyond Cloudflare. Works only while the laptop is on.
2. **For demos and the alpha, until credits arrive:** web app on Vercel (free plan while there is no revenue; its terms forbid commercial use, so upgrade to the paid plan with the first paying customer), database on Neon's free PostgreSQL, DNS and certificates on Cloudflare. The API and worker still need an always-on home; that is the gap in this stage, filled by stage 3 or, if credits are late, by the laptop tunnel or Oracle's free server.
**Confirmed 7 Oct after the Cloudflare trial (D-019):** stage 1, the laptop tunnel, is what we use now. The always-on home for the API is decided when the first alpha merchant needs one: Cloudflare Containers (about USD 5 to 12 a month) or Oracle's free server.

3. **Target:** Azure Qatar Central on Microsoft for Startups credits. Moving the database is a dump and restore, because we use only standard PostgreSQL.

**Neon and Qatar's privacy law.** We found no rule that stops a private company hosting SMB customer data outside Qatar: the law's general principle is against restricting cross-border flows, and localisation duties fall on government bodies and some regulated sectors. That is our reading, not a lawyer's (ALY-51 is still open). Two limits follow until it is confirmed: only the fictional demo shop and consenting alpha merchants go on Neon, and no salary or QID data goes there at all, which means Product 2 waits for Qatar hosting or the written opinion.
**Neon's free limits.** 0.5 GB and the database sleeps after five idle minutes, waking in about a second. No Middle East region, so expect roughly 100 ms extra per query from Qatar. Swap trigger: storage near 0.4 GB, or the first paying customer, whichever comes first.

## D-014 · Branch, pull request, green CI
**Date** 7 Oct 2026 · **Status** Accepted

One branch per Linear issue, named after it. A pull request with green CI before anything reaches `main`. See `working-with-claude.md`.

**Why.** Until 7 Oct work went straight to `main`. That was acceptable for a scaffold and is not acceptable once there is anything to break. A pull request is also the only place a founder who does not read every line can see what changed.
**Limit.** GitHub's free plan cannot enforce branch protection on a private repository, so this is a rule we keep, not one GitHub enforces.

## D-015 · WhatsApp is the mobile app
**Date** 7 Oct 2026 · **Status** Accepted

Staff use WhatsApp itself plus an installable web workspace. No native app, no offline sync engine.

**Why.** WhatsApp already works on a bad connection and queues messages. Building on it is the product's premise.
**Revisit when.** A paying segment needs something a web app cannot do (for example background location).

## D-016 · Product 1 includes a slim order-and-pay link
**Date** 7 Oct 2026 · **Status** Accepted (founder's request)

Product 1 gains "Order link": a merchant's products on one shareable page, a cart, and checkout that lands the order in the chat and the workspace. The customer pays by link or, if they have a credit account, puts it on account, which writes to the ledger.

**Why.** The founder needs a live demo in which a customer buys and pays in under a minute; it closes sales better than a ledger alone. It reuses what exists: contacts, payment requests, the ledger and the outbound layer.
**Kept out, deliberately.** Product options and variants, stock counts, delivery zones and fees, customer-specific price lists, and sync with WhatsApp's own catalog. Those stay in Phase 5 with the full ordering product.
**Risk.** Product 1 is now three things (inbox, ledger, orders). If the alpha slips, orders is the part to cut back, not the inbox.

## D-017 · Launch pricing
**Date** 7 Oct 2026 · **Status** Proposed (founder said "ok" to the range; exact figures to confirm)

Flat monthly price per connected WhatsApp number, with seats included rather than charged per person:

| Plan | Monthly | Includes |
|---|---|---|
| Starter | QAR 490 | 1 number, 3 seats, inbox and ledger |
| Team | QAR 890 | 1 number, 8 seats, adds order link and broadcasts |
| Extra seat | QAR 40 | Beyond the plan's seats |
| Setup | QAR 2,500 once | Number connection, data load, staff training |

**Why seats are included.** Small shops share logins when seats cost money, which breaks assignment and the audit trail. Three covers an owner and two counter staff; eight covers a service business with a dispatcher and technicians. Competitors that sell to this market price the same way.
**Revisit when.** Five merchants have paid, or two prospects in a row object to the same number.

## D-018 · Company registration starts now
**Date** 7 Oct 2026 · **Status** Proposed (the founder plans to register once the product is ready)

Recommendation: start the Qatar commercial registration now, in parallel with building.

**Why.** Three things on the path to the first customer need a registered company and cannot be started without one: Meta's business verification and Tech Provider review (which is what lets a merchant connect their own number), a payment provider merchant account for Alyr's own billing, and the startup credit programmes. Each has its own queue. If registration starts when the product is ready, the product then waits weeks for paperwork.
**What works without it.** Everything on the simulator, and the Meta test number with up to five phones. That is enough for demos, not for a merchant's real number.

## D-019 · The API does not run on Cloudflare Python Workers, for now
**Date** 7 Oct 2026 · **Status** Accepted, on the evidence of a deployed trial (pull request 4)

We deployed the unchanged API to a Cloudflare Python Worker on the free plan, with the database on Neon reached through Hyperdrive, and measured it.

| Check | Result |
|---|---|
| Runs unchanged (FastAPI, asyncpg, pydantic) | Yes |
| Code size against the 3 MiB free limit | 2.69 MiB compressed. Passes with about 10% to spare |
| Tenant separation through Hyperdrive's pooler | Held in 43 of 43 successful rounds: a scoped query saw 26 contacts and the next unscoped query saw 0 |
| CPU per request against the 10 ms free limit | **553 to 787 ms** for the ledger summary. Fifty times over |
| Reliability | **About 10% of requests failed**, including the trivial health check, with the runtime's own error: "Cannot enter a promising task from inside another running promising task. This is a bug in Pyodide." |

**Why not.** A webhook endpoint that drops one request in ten is not usable, and the cause is inside Cloudflare's Python runtime, not our code. The CPU figure means the free plan would throttle us under any real traffic; the paid plan would absorb it but the requests are slow.
**Also learned.** Hyperdrive caches read queries by default. Our tenant is set per transaction, not in the query text, so a cached result could be served to another tenant. Caching must stay disabled on any Hyperdrive configuration we ever use. Cloudflare's Python tooling does not run natively on Windows; it was run in a Linux container.
**Kept from the trial.** `Database` can open one connection per use; the test suite can target any PostgreSQL; `uvicorn` is in its own dependency group; Neon is proven for our schema.
**Still good uses of Cloudflare.** DNS, certificates, the tunnel, and possibly the web app. Cloudflare Containers would run our Docker image unchanged on the USD 5 plan, and is the Cloudflare option to try next if we want one.
**Revisit when.** Cloudflare fixes the runtime error and Python CPU cost falls, or we rewrite the webhook intake as a small JavaScript Worker in front of the API.

## D-020 · Consent and the 24-hour window are enforced in the outbound layer
**Date** 7 Oct 2026 · **Status** Accepted · Linear ALY-40

Every message passes one check in `core/outbound.py` before it is queued. A refused message is still recorded, marked blocked with the reason.

| Message | Allowed when | Otherwise |
|---|---|---|
| Free-form text, buttons, lists | The customer wrote to the shop in the last 24 hours | Blocked: `window_closed` |
| Utility or authentication template | The customer has agreed to service messages and has not said stop | Blocked: `no_consent` or `opted_out` |
| Marketing template | The customer has separately agreed to marketing | Blocked: `no_marketing_consent` |

**How consent is gained and lost.**
- Writing to the shop first counts as agreeing to service messages, recorded as `customer_initiated`. It is never agreement to marketing.
- A merchant's existing credit customers are recorded as `merchant_record` when their data is loaded. The merchant is attesting that those customers agreed; the onboarding checklist must make them confirm it.
- A message that is exactly a stop word, in English or Arabic, withdraws both kinds of consent at once. A start word restores service consent only.
- Every change is appended to `consents` with its source and the customer's wording. The application can add and read rows but cannot change or delete them; the database refuses.

**Why in one place.** A module that forgets the rules cannot break them, and a merchant's number cannot be restricted because of a bug in one feature.
**Consequence.** Anything Alyr sends that is not a direct reply must be a template. Payment confirmations were changed from free text to a template for this reason: a customer may pay days after their last message.
**Added 12 Oct 2026, after the first live test.** A utility or authentication notice sent while the customer's 24-hour window is open goes as an ordinary message instead of a template. It is free there and needs no template approved by Meta; the first live order showed its confirmations failing because the templates do not exist on Meta yet. Outside the window the template is still required, and marketing always stays a template.
**Not built yet.** Marketing opt-in capture (it arrives with broadcasts, ALY-44), a consent export, and Meta's own messaging limits (ALY-41).
**Legal note.** What counts as valid consent under Qatar's privacy law is a question for the lawyer (ALY-51). This implements Meta's rule and keeps the evidence.

## D-021 · A person answering from the inbox pauses the assistant for that customer
**Date** 7 Oct 2026 · **Status** Accepted · Linear ALY-28

When a staff member replies from the inbox, the assistant stops answering that customer's typed messages. It starts again when the conversation is closed or staff press "Hand back to assistant".

- **Still automatic while paused:** stop and start words, and tapped buttons such as "Pay now". A customer who taps a button must never get silence.
- **A closed conversation reopens** on the customer's next message, with the assistant on.
- **Only customers who have written appear in the inbox.** A reminder run to 200 customers does not create 200 open conversations.
- **Staff replies obey the same rules as the assistant.** They go through the outbound layer, so a typed reply after 24 hours is refused and shown as not sent. A refused reply does not pause the assistant.

**Why.** Two voices answering one customer is the most common complaint about chatbot inboxes, and the pause must not depend on staff remembering a switch.
**Not built yet.** Staff names on replies and assignment to a person (both need sign-in, ALY-18), internal notes, labels (ALY-53), sending a template from the inbox when the window is closed (ALY-20), search, and automatic hand-back after a period of silence.

## D-022 · Sign-in is our own: one-time code by email, sessions in our database
**Date** 8 Oct 2026 · **Status** Proposed (built as the default; the founder was offered "own" or "hosted" and has not answered) · Linear ALY-18

Staff sign in with a 6-digit code sent to their email. A session cookie then identifies them for 30 days. There are no passwords.

| Choice | Why |
|---|---|
| Our own, not a hosted service such as Clerk | Free at any size, staff identities stay in our database (the Qatar data rule), and nothing to migrate away from later. |
| Codes, not passwords | Nothing to leak, reuse or reset. A small shop's staff will not manage passwords well. |
| Email first, WhatsApp later | An owner must be able to sign in before their WhatsApp number is connected, and when it is restricted. |

**How it is protected.** Codes and session tokens are stored only as hashes. A code lasts 10 minutes, 5 wrong guesses burn it, and an email may request 5 codes an hour. The form answers the same way for unknown emails. The cookie is HttpOnly and SameSite=Lax, and Secure outside local. Membership is checked on every request, so removing someone signs them out at once.

**Data model.** `users`, `login_codes` and `sessions` belong to a person, not a tenant, so they are on the short list of global tables. `memberships` (who works for which shop, as owner, admin or agent) is tenant-owned with row-level security; its policy also lets sign-in read the memberships of the person who has just proved who they are. The tenant for every request comes from the session, never from the browser.

**Roles today.** Owners and admins manage the team; only an owner can create, change or remove an owner; a shop always keeps one owner. Agents can use everything else. Finer permissions (who may send reminders, see totals) are not built.

**Open demo.** On a local machine with `ALYR_DEMO_OPEN=true` (the default) the workspace still works without signing in, as the demo shop. Everywhere else every workspace request needs a session.

**Not built yet.**
- **No email is sent.** No provider is chosen. Locally the code is shown on the sign-in page; outside local, sign-in answers 503. This must be solved before any hosted environment. Options to research: Resend, Amazon SES, Cloudflare Email.
- A person who works for several shops lands in the first; there is no shop switcher.
- No list of signed-in devices and no "sign out everywhere".
- Creating a shop and its first owner is still a database-owner action; there is no sign-up.
- No separate protection against cross-site form posts beyond SameSite=Lax.

## D-023 · ALYR is the company; the WhatsApp product is its first product
**Date** 11 Oct 2026 · **Status** Accepted (founder, 11 Oct) · Linear ALY-56

ALYR is a technology company for businesses in Qatar and the GCC, with several products to come. The WhatsApp product is Product 1, not the company. The founder had said the same on 7 Oct ("alyr is the main name ill have multiple product").

- **The public site** (`/`, `/ar`) presents the company first and Product 1 as the thing available now. The demo and workspace moved from `/` to `/whatsapp`.
- **Transformation services** (audits, custom programs) are the long-term direction, not something sold today. The site therefore does not offer an audit; its one request is early access to the product.
- **Brand.** The approved design system v1.0 applies to everything public. See `docs/brand.md`.

**Consequence.** `docs/master-plan.md` still opens by describing Alyr as the WhatsApp layer only. Read it as the plan for Product 1 until it is revised.
**Not decided.** Legal company name, what the second product is, and services pricing.

## D-024 · Bookings join Product 1; the first customers book, order, pay and track
**Date** 11 Oct 2026 · **Status** Accepted (founder, 11 Oct) · Linear ALY-27

The founder named the first customers as businesses that need booking, scheduling, ordering, paying and tracking. That widens the first buyer from the credit trader in the master plan to service businesses: clinics and salons, home and field services, shops, and travel or document offices.

| Need | State |
|---|---|
| Ordering | Built: order link |
| Paying | Built against a stand-in gateway; a real gateway is ALY-17 |
| Tracking | Built for orders: each status change messages the customer |
| Booking and scheduling | API built (pull request 13); screens not built |
| Team inbox | Built |

**Consequence.** Bookings moved from "next products" into Product 1. The credit ledger stays, as one tool among several rather than the centre.
**The first gap a booking customer will hit:** one customer at a time per shop. A salon with three chairs needs bookable staff or resources.

## D-025 · The public site uses the playbook's words on the design system's look
**Date** 11 Oct 2026 · **Status** Proposed (the founder said "update the homepage based on the findings" without choosing a look) · Linear ALY-56

Two brand sources disagree. The design system v1.0 (branch `codex/alyr-native-foundation`) defines the look now live: uppercase ALYR, Carbon and Volt, the Command Fold logo, "Transform the business." The founder's Brand & Growth Playbook (a Claude Docs document, 11 Oct) defines a different brand: lowercase "alyr", cobalt blue, an "a" mark, "Go digital without the IT team", products alyr Chat, Pay, Books and Sites.

**What was done.** The site keeps the design system's look and takes the playbook's positioning and voice: the local tech partner that sets it up for you.

| Taken from the playbook | Held back, and why |
|---|---|
| Master line "Go digital without the IT team" and brand idea "We do the tech. You run the business." | "Live in 48 hours": nothing is live on Meta yet, so the promise cannot be kept today |
| Four pillars: sell more, keep more, easy, trusted | Prices: the playbook says QAR 199 a month, D-017 proposes QAR 490 and 890 |
| Product name "ALYR Chat" and its line "Sell, book and get paid in the chat" | "Free 14-day pilot": an offer only the founder can make |
| Restaurants and cafes as the first audience | "Licensed Qatari payment partner": no provider is signed |
| Call to action is WhatsApp first (`NEXT_PUBLIC_ALYR_WHATSAPP`) | The WhatsApp button itself: ALYR has no number yet |
| "Not affiliated with WhatsApp or Meta" line; no hype words; no sample statistics | Lowercase "alyr" in text, cobalt, the "a" mark: these belong to the other look |

**Open, for the founder.** Which look is ALYR's; the Arabic spelling of the name; the launch price; whether the 48-hour and pilot promises are made publicly.

## D-026 · The homepage is about ALYR the company; ALYR Chat has its own page
**Date** 12 Oct 2026 · **Status** Accepted (founder, 12 Oct) · Linear ALY-56

The founder said the homepage had become a page about WhatsApp. ALYR is a company that digitalizes small and mid-sized businesses and supports them in anything to do with technology, within its licensed activities. The WhatsApp product is its first product and matters, but it is one thing ALYR does.

| Page | Is about | Address |
|---|---|---|
| Homepage | ALYR: what it is, the services, how it works, who it works with, and a short section on the product | `/`, `/ar` |
| ALYR Chat | The product: the demo, why owners choose it, who it suits, what comes next | `/chat`, `/ar/chat` |

**Services named on the homepage:** websites and online stores; customer systems; automation and integrations; dashboards and reporting; AI assistants; setup, training and support.

**This reverses part of an earlier position.** On 11 Oct the founder said services were the long-term direction and the product the only thing for sale, so the site offered only the product. Services are now offered publicly.

**Open, for the founder.**
- The company is not registered, so there are no licensed activities yet. Each service on the page must be covered by the licence chosen in ALY-59; remove any that is not.
- Who delivers a service when an owner asks for one, while the founder is also building the product.
- No prices are shown for services or the product (ALY-62).

## D-027 · One workspace for every product, driven by a catalogue; ALYR has a back office
**Date** 16 Oct 2026 · **Status** Accepted (founder, 16 Oct: one workspace rather than a separate portal; switch modules underneath, sell products on top; build phase A, keep phase B easy) · Linear ALY-18

A shop manages everything from one ALYR workspace at `/app`. There is no separate client portal.

| Audience | Where | What they do |
|---|---|---|
| Staff at the counter | The workspace's working screens | Inbox, bookings, orders, credit accounts |
| The owner | The same workspace, owner sections | Products, connections, team, the home numbers |
| ALYR staff | The back office at `/ops` | Create a shop and its owner, see every shop, do the setup steps shops ask for |
| The shop's customers | WhatsApp and the links we send | Never see any of this |

**How products plug in.** `apps/api/src/alyr/catalog.py` declares each module once: its screens and who may see them, what must be connected first, its setup steps, and the numbers it adds to the home dashboard. Products are named bundles of modules (ALYR Chat = inbox, bookings, orders, payment links; Credit accounts = ledger; Payroll is listed as coming). The shell, the setup checklist, the home dashboard and the back office read the catalogue. Adding a product means declaring it there and building its modules; nothing in the shell changes.

**Switching is real, not cosmetic.** A module's routes answer only for shops that have it on (`require_module`), the public booking and order pages close when their module is off, and the chat only offers switched-on modules. Switching off keeps every record.

**Setup is part of switching on.** Each module's steps show as a checklist on the home screen, with "do it now" when the shop can and "ask ALYR" when it is our job. An ask lands in the back office queue.

**The back office crosses shops without weakening row-level security.** It works only through five database functions that refuse to run unless the API has set a transaction-local flag after checking the caller is on the `platform_admins` list. ALYR itself is a shop on the platform, which is how its staff sign in.

**Built for phase B.** Self-serve sign-up, connecting a shop's own WhatsApp number (Embedded Signup, after Meta approval), billing on switch-on (ALY-35) and a payment provider connection all attach to points that now exist: `admin_create_business` becomes the sign-up path, connections gain real "connect" actions, and enabling a product gains a price step.

**Not built.** Sign-up, billing, price preview, real connect buttons, per-role permissions inside a module, live updates, and a customers screen. The workspace screens inside the shell are the existing ones, embedded.

## D-028 · Every item has one person responsible, and the team's work is on the record
**Date** 16 Oct 2026 · **Status** Accepted (founder, 16 Oct: "implement this thoughtfully"; follows the discussion of worker-level accountability and revenue models) · Linear ALY-72

**Why.** The owner's real worry is not automation; it is "I can't see what my staff tell customers, who dropped the order, or whose WhatsApp the customers are really on." Moving staff off personal phones onto one shop number, with every conversation, order, booking and credit account tied to a named person, is visible value on day one. It is also why seats stay included in the price (D-017): accountability only works if every worker has their own sign-in.

**What is built.**

| Part | How it works |
|---|---|
| One person responsible | Conversations (already), orders, bookings and credit accounts each have `assigned_to`. An order or booking starts with whoever looks after that customer's chat. Whoever acts on an item nobody has (replies, moves an order, marks a visit) becomes responsible. Anyone on the team can hand an item to someone else on the team, and to nobody outside it. |
| A record nobody can edit | `activity` holds who did what: took, assigned (to and from), closed with its outcome, reopened, order placed, moved, paid, booking made, cancelled, came or no-show, reminder sent. The app can add rows and read them, never change or remove them, like the consent log and staff notes. The inbox thread shows it between the messages. |
| How a conversation ended | Closing asks: sold, booked, answered, or lost. Lost asks why: price, not available, stopped replying, went elsewhere, other. Closing without an answer still works, so the assistant and older screens are not broken. |
| Team report | `/api/team/performance` for today, 7 or 30 days, in the shop's own calendar. Per person: open conversations, customers waiting (last message from them, unanswered for 10 minutes), replies, median time to first answer, closed by outcome, orders and sales they look after, visits that happened or were missed. Customers waiting with nobody on them are counted separately and shown as an alert. Owners and admins see everyone; an agent sees only their own numbers. |
| Signed replies | A shop setting adds the sender's first name under each staff reply ("— Yusuf"), so the customer knows who is looking after them. Off by default; only an owner or admin can turn it on. Stored in `shop_settings`, which row-level security protects, because `tenants` is shared and read-only to the app. |

**How the numbers are defined.**
- *Waiting*: an open conversation whose newest message (not counting blocked ones) is from the customer and older than 10 minutes.
- *Time to first answer*: for each staff reply, the time since the first customer message after the last answer of any kind. An answer from the assistant counts as an answer, so this measures how long customers are left with nothing, not how long until a person speaks.
- *Sales*: orders placed in the period, not cancelled, by the person responsible for the order.
- Messages now record the replying person's ID (`messages.sent_by_user`), so reply times belong to someone even if they rename themselves.

**Not built yet (next).** Routing new conversations by turn and by language, moving a conversation on when nobody answers in time, shifts, field workers' "on the way" and "done" updates, and commission from attributed sales flowing into Payroll.

**Watch.** A league table can turn colleagues against each other. The report lists people by name, not by rank, and shows workload (open, waiting) next to results.

### Note on Meta pricing, checked 16 Oct 2026
Several third-party sources (Techpoint, ChatArmin, Techweez, Nordflux) report that from 1 October 2026 Meta bills service replies inside the 24-hour window beyond about 1,000 a month per number. Meta's own pricing page, as fetched today, still says all non-template messages are free within an open customer service window and lists only market rate changes for 1 October. Treat the change as unconfirmed. The master plan's pricing line stands until Meta's rate card or a Meta notice says otherwise. If it is confirmed, D-017's prices need a message allowance or a pass-through at cost.

## D-029 · Email at @alyr.qa: Cloudflare Email Routing in, Resend out
**Date** 16 Oct 2026 · **Status** Accepted (founder, 16 Oct: "choose free option as of now") · Linear ALY-74

**What we need.** Addresses at alyr.qa for the founder and for customers to write to (the Google and Microsoft startup programmes require a matching domain, ALY-55; the website needs a contact address, ALY-60). And a way for the app to send sign-in codes (D-022), which until now only worked on the founder's laptop.

**Chosen, at no cost.**

| Job | Tool | Free allowance (checked 16 Oct 2026) |
|---|---|---|
| Receiving: akmal@, hello@ and any other address, forwarded to the founder's existing inbox | Cloudflare Email Routing | Unlimited forwarding; up to 200 rules and 200 destination addresses; messages up to 25 MiB |
| Sending from the app: sign-in codes from no-reply@alyr.qa | Resend, REST API | 3,000 emails a month, 100 a day, one domain |
| Replying as akmal@alyr.qa from the founder's inbox | Resend SMTP in Gmail's "Send mail as" | Counts against the same allowance |

**Considered and not chosen.**
- *Zoho Mail Forever Free*: a real mailbox for up to five people, but web-only (no IMAP), offered only in some data centres, and it would take over the domain's mail records from Cloudflare.
- *Cloudflare Email Sending*: in public beta since April 2026, but sending to anyone other than our own verified addresses needs the paid Workers plan.
- *Brevo*: 300 emails a day free, but we could not confirm that the free plan signs mail with our own domain.
- *Google Workspace*: not free; the Google for Startups Start tier includes 12 months free after acceptance, which can replace forwarding later.

**How the pieces fit.** Cloudflare's records sit on `alyr.qa` itself (MX and SPF). Resend's sit on `send.alyr.qa` (MX and SPF, used for bounces) and `resend._domainkey.alyr.qa` (DKIM), so the two never conflict. A DMARC record starts at `p=none` and tightens once both are verified.

**How sign-in codes are sent.** Directly while the request waits, with an 8-second timeout, not through the job queue. Codes are stored only as hashes; a job would keep the code in plain text in its payload, and a code is useless after ten minutes anyway. If Resend refuses, the person is told to try again. With no key set, nothing is sent and a local machine shows the code on the page as before. Tracking of opens and clicks stays off.

**Data.** Resend receives a staff member's email address and their code, nothing about customers. Use its EU region (Ireland). Listed in `docs/data-residency.md`; the legal basis is our reading until ALY-51 is answered.

**Swap when.** The daily cap of 100 is reached (Resend Pro, USD 20 a month), or a shared team mailbox is needed (Google Workspace through the startup programme).

### Setting it up (founder, about 20 minutes, all free)
1. **Receiving.** Cloudflare dashboard → alyr.qa → **Email → Email Routing** → enable; accept the records Cloudflare adds. Add `akmal@alyr.qa` and `hello@alyr.qa`, both forwarding to your personal inbox, and confirm the email Cloudflare sends.
2. **Sending account.** Sign up at resend.com with akmal@alyr.qa (Claude cannot create accounts). Domains → Add domain → `alyr.qa`, region **Ireland (eu-west-1)** → **Sign in to Cloudflare** so Resend adds its records → wait for "Verified". In the domain's settings, turn **open tracking and click tracking off**.
3. **The app's key.** Resend → API keys → create one with **sending access** for alyr.qa only. Put it in `apps/api/.env` as `ALYR_EMAIL_API_KEY=...` yourself (never in chat or in git), then `scripts/demo.sh up`.
4. **Replying as akmal@alyr.qa (optional).** In Gmail → Settings → Accounts → **Send mail as** → add akmal@alyr.qa with SMTP server `smtp.resend.com`, port 465, username `resend`, password a second Resend API key.
5. **DMARC.** Cloudflare DNS → add TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:akmal@alyr.qa`.
6. **Check.** Sign in at `/login` with your email: the code arrives by email as well as on the page.

## D-030 · A weekly result report to the owner, one section per product
**Date** 16 Oct 2026 · **Status** Accepted (founder, 16 Oct: "implement these items wherever required, depends on the category") · Linear ALY-75

**Why.** An owner who reads "QAR 4,300 collected this week" renews without being asked. The report is how ALYR proves its value every week, so it is part of the product, not a dashboard someone has to open.

**What it is.** Every Sunday at 9:00 in the shop's time zone, the owner gets the numbers for the seven days before (Sunday to Saturday, the Qatar working week). Each product the shop has switched on adds its own section, in this order:

| Section | What it says |
|---|---|
| Credit accounts | Money collected (and how much through ALYR links), new credit, reminders ALYR sent, who promised to pay, what is still owed today, what is more than 60 days late, and a next step when money is late and no reminders went out |
| Orders | Orders and their value, paid online, put on account, customers who ordered again, the most ordered item, cancellations |
| Bookings | Who came, no-shows, cancellations, visits not yet marked, new bookings, reminders ALYR sent, what is booked for next week, the busiest day |
| Team inbox | Customers who wrote, new customers, replies by the team, messages ALYR sent |

The first line of each section is compared with the week before. A product that was quiet gets one line instead of a list of zeros.

**Who gets it.** The shop's own WhatsApp numbers (staff contacts) that the owner marks to receive it, and the owners by email when email is set up (D-029). Marking a number counts as that number's agreement to receive it. Owners and admins see and change it in the workspace API (`/api/reports`); agents cannot. A shop can switch it off.

**How it reaches WhatsApp.** Inside the 24-hour window the whole report goes as one ordinary message. Outside it, the approved `weekly_report` template carries a one-line summary and asks the owner to send REPORT; REPORT (or «تقرير») brings the whole report, because the owner's message opens the window.

**How it runs.** One `weekly_report` job per shop. Each run queues the next week first, so a skipped week never breaks the chain. The worker checks every hour that every shop has one queued, so new shops are picked up. What was sent is stored in `weekly_reports`, so a week is never sent twice, even if the job is retried. Email is sent after the WhatsApp messages are committed and is never retried, so a failed email cannot cause a second WhatsApp message.

**Not yet.** A screen in the workspace (the API is ready), wording by business type (a salon says "appointments", a garage "jobs"), a chosen day and hour per shop, and money saved against delivery-app commission for restaurants (it needs the shop's own commission rate).

## D-031 · Self-serve onboarding: sign up, create the business, start from a preset, try it on a private test line
**Date** 16 Oct 2026 · **Status** Accepted (the flow follows the founder's prototype, ALY-76) · Linear ALY-76

A new owner can create their own business at `/start` without ALYR's back office.

**How a business is created.** The owner proves their email with the same one-time code as sign-in. A new address then gets a single-use sign-up token (an hour, hash stored, table `signup_tokens`). The business, its owner and their membership are created by the database function `signup_create_business`, which spends that token. The app role still cannot write `tenants`; a business changes its own name, area, onboarding step and reminder setting only through `update_own_business`, which acts on the tenant in scope and nothing else.

**Presets.** The type of business (`presets.py`) decides the modules switched on, the way of working, and the filled-in services and opening hours the owner starts from. Prices are samples and the screens say so. Appointment businesses (salon and barber, spa, clinic, home services) have the full flow. Restaurants, shops, wholesale and document offices are created with their modules on and a setup request for ALYR, because their onboarding screens are not built yet.

**The test line.** Every new business gets a private simulator number (`sim-<slug>`). The owner tries their business as a customer through it: the message goes through the real inbound path, so the answer is exactly what a customer gets, and a booking made from it goes through the real booking page. Messages on it never leave ALYR. A WhatsApp test number shared by every business comes later, if the founder wants one.

**Smaller changes that came with it.** A business that takes bookings but has no credit accounts answers a greeting with its own menu (book, my booking, prices). A product counts as on when any of its modules is on. Services can be renamed and repriced. Booking reminders can be switched off.

**The screens** (`/start`, one page). On a phone: one column, a progress bar, the action pinned at the bottom. On a laptop: the step rail, the work, and from 1280 px a live WhatsApp preview of what the owner is setting up (their greeting, their price list, a reminder, then the test chat itself). English and Arabic with right-to-left layout, light and dark. A refresh never loses the owner's place: before the business exists, the sign-up so far is kept in the tab (the token is single-use); after, the step is saved on the business.

**Ending the test.** When the owner opens their workspace, their test booking is cancelled, so its time is free and no reminder goes out, and the test chat is closed, so the inbox does not start with an unanswered chat. Both stay in the history. The go-live list says so.

**A customer who writes in Arabic is remembered as Arabic** by the bookings chat, as the ledger chat already did, so the confirmation and the reminder that follow are in Arabic too.

**Sign-up is closed outside a local machine** (`ALYR_SIGNUP_OPEN`) until the founder decides to open it. Existing staff can always sign in through it.

**Not built yet.** Sign-in by WhatsApp code, more than one customer at a time, the advisor's tablet mode, the restaurant, wholesale and document-office paths, connecting the shop's own number (needs ALYR's Tech Provider approval, ALY-39), and taking payment for the plan.

## D-032 · Prices are set per client from the back office
**Date** 17 Oct 2026 · **Status** Accepted (the founder's direction, refined) · Linear ALY-78 · Updates D-017 and D-031

**The founder's direction.** Pricing is not fixed yet and will differ by client. One client can own several businesses. ALYR sets each client's price in its internal tool, and the owner sees it live as the last step of onboarding.

**What was added to it, and why.**
- **A price list, and a quote drafted from it,** rather than one number typed per client. Every new client starts from a consistent draft, ALYR edits it per client, and we keep a record of exactly what each client accepted. The price list can change at any time; quotes already made keep their own prices.
- **A switch for when the owner sees a price,** per business type and overridable per client. "Prepared": the owner sees "ALYR is preparing your price" until ALYR publishes it. "Automatic": the draft is published at sign-up. Everything starts on "prepared" while the founder works out pricing; "automatic" is there for when self-serve sign-up opens.
- **A client above businesses.** One quote per client, with lines per business, so a multi-business discount is just a line.
- **The same tool controls sign-up.** Per business type ALYR chooses between:
  - self-serve, every step;
  - set up with ALYR (the business is created and a request reaches the back office);
  - not offered.

  A type whose screens are not built can only be set up with ALYR. A business keeps the path it started on.

**How it works.**
- **Price list items.** Each item has a monthly or one-time price and a rule for when a drafted quote includes it:
  - every business;
  - once per client;
  - per product in use;
  - per module switched on;
  - only when added by hand.
- **Starting values:** ALYR Chat QAR 449 a month per business, setup QAR 2,500 per business, an extra team member QAR 40 a month (added by hand), and credit accounts at QAR 0. All are editable.
- **A quote** has lines (any line can be edited, and a negative line is a discount), a percentage off the monthly items, a billing period of 1, 3, 6 or 12 months, a note the owner sees, and whether the promise shows. It moves draft → published → accepted. A newer accepted quote supersedes the old one, and ALYR can withdraw a draft or a published quote.
- **Locks.**
  - An accepted quote cannot change. Database triggers refuse edits to its terms and lines.
  - Owners read only their own client and its published or accepted quotes, enforced by row-level security on new global tables.
  - Only the back office writes, using the same staff check as D-027.
  - The owner accepts through a database function that checks the quote is theirs and still published.
- **Live.** The plan step asks for the quote every 4 seconds, says when ALYR changed it, and accepting a price that changed a moment ago is refused. An owner who finished onboarding before the price was ready sees "Your ALYR price is ready" on the workspace home, and `/start` opens on the plan step for them.
- **The promise** is edited in the back office. The `ALYR_PLAN_*` settings are gone. It starts as the founder's choice of 16 Oct: if no customer books through WhatsApp in the first 30 days, the first month is free.

**Not built yet:**
- owners choosing paid extras themselves;
- an owner adding a second business on their own (ALYR adds it in the back office for now);
- invoices and taking payment;
- a separate price list for partners;
- telling the owner by email or WhatsApp that their price is ready.

## D-033 · The internal tool: one console for every client
**Date** 17 Oct 2026 · **Status** Accepted · Linear ALY-79 (phases ALY-80 to ALY-96) · Plan: `docs/internal-tool.md`

**Decision.** ALYR runs every client from one console: Today, leads, clients, businesses, onboarding, requests, billing, settings, staff and audit. It is built in three levels, in order:
1. Run the first 10 clients.
2. Operate with a small team: roles, messaging health, usage, revenue.
3. Scale: data compliance, partners, other countries, integrations.

**The founder's choices (17 Oct).**
- Build all three levels.
- Our own simple invoices.
- Leads live in the tool.
- **Staff see a shop's setup but never customer conversations.**

**Why one console, built here.**
- The tool reads the product's database, so there is one truth about every client.
- The founder sells in person, so the parts he uses in the field work on a phone.
- An outside CRM or admin tool would hold a second copy of client data, and would still need our guarded database functions to act on businesses.

**A cofounder's note on the order.** On 16 Oct the founder ruled to build only what a paying pilot needs until 10 customers. Building all three levels goes beyond that rule, so they are built strictly in order. Level 1 is usable on its own. The country-specific parts of level 3 (VAT, e-invoicing) are researched when ALYR enters that country.

**Rules for every phase.**
- Back-office sign-ins last 12 hours.
- Every staff change is written to an audit log in the same transaction. The log cannot be edited, by the app or by a database trigger.
- Cross-business reads go through guarded `admin_*` functions.
- No route returns message bodies to staff: failures are shown as counts.

## D-034 · Product first and paid from the first customer; the homepage leads with what ALYR sells today
**Date** 16 Oct 2026 · **Status** Accepted (founder, 16 Oct, in conversation; recorded in `docs/site-redesign/00-founder-decisions.md`) · Linear ALY-56 · Updates D-017, D-025 and D-026

**The decision.** ALYR is the company that sets up and runs the tech for owner-run businesses. It sells a product first: ALYR Chat. Services appear only as part of the subscription, not as a business of their own (this narrows D-026, which put six services on the homepage). There is no free plan and no free trial; the first month is paid, with the money back if an agreed result is missed. The founder sells in person.

**What the public site says, as the founder decided it:**

| Topic | Decision | On the page |
|---|---|---|
| Positioning | Product first: ALYR Chat is the first product; services only within the subscription | The homepage is about ALYR and leads with what is sold today |
| Monthly price | From QAR 449 a month (the field-sold plan). No free plan, no free trial | "From QAR 449 a month" |
| Setup fee | Varies by customer; a starting figure is shown | "Setup from QAR 1,500, quoted at your visit" |
| First month | Paid, money back if an agreed result is missed. The refund is the first month's subscription, not the setup fee. One result, counted in the workspace where the owner sees it too, over the first 30 days after going live. The owner's part: share the chat link and QR codes in the first week | "Your first month, with your money back" |
| Term | Month to month; stop at the end of any month with 7 days' notice (17 Oct; in the first month, up to its last day) | "Month to month. Stop at the end of any month, with 7 days' notice." |
| Founder on the page | Left out: no name, no photo | The trust section speaks as ALYR |
| Contact | hello@alyr.qa (Cloudflare Email Routing, D-029); the WhatsApp number comes later | The email state until `NEXT_PUBLIC_ALYR_WHATSAPP` is set |

**Why.** The founder has the runway for a product-first path and wants revenue and real commitment from the start, not free sign-ups. A price on the page matches what he says at the counter; no competitor in Qatar shows one (`docs/site-redesign/02-messaging.md` §1). A money-back first month replaces the logo wall ALYR cannot have.

**Prices stay off the published site until the commercial registration (17 Oct).** Research for the customer agreement (PR #47, ALY-98) found that ALYR may not sign customers, take money or sell through its website before it holds a CR (D-018, ALY-59), and that offering a priced service on the site before then may count as trading. So the homepage goes live without the price section, the price in the hero, the money-back lines, the price question and the Price link; a plain "What does it cost?" answer says prices go on the page soon. `NEXT_PUBLIC_ALYR_OFFER=on` turns all of it on, for the day the CR is issued and the agreement (with its Arabic version) is ready. The founder chose this over waiting for the CR and over publishing prices now. He also decided that a native Arabic review (ALY-66) is wanted but does not block publishing.

**Relation to other decisions.** D-017's 490 / 890 plans are superseded for field sales by "from QAR 449". D-025's held-back items stay held back (no "live in 48 hours", no free pilot). D-032 starts the back office's draft quote at a setup of QAR 2,500 per business; the page says "from QAR 1,500, quoted at your visit", so a quote can be lower than the draft. The founder should align the default or accept the gap.

## D-035 · ALYR is a suite of products, led by ALYR Agent
**Date** 17 Oct 2026 · **Status** Accepted (founder, 17 Oct, in conversation; recorded in `docs/agent-dashboard/00-founder-decisions.md`) · Linear ALY-99 · Updates D-027, D-030, D-032

**The decision.** ALYR is the business agent for owner-run businesses in Qatar, with a suite of products in one workspace:

| Product | Arabic descriptor | What it is | Modules |
|---|---|---|---|
| ALYR Chat | طلبات واتساب وصندوق الفريق | WhatsApp orders, team inbox, order tracking | inbox, orders, payment links |
| ALYR Bookings | المواعيد والتذكيرات | Appointments, services, reminders, no-shows. Split out of Chat | inbox, bookings, payment links |
| ALYR Agent | نشاطك بالأرقام | The home dashboard and the Sunday report. Suggested actions come next. Included for every business | none of its own |
| ALYR Accounts | الحسابات الآجلة | Credit accounts: who owes you. Was "Credit accounts" | ledger |
| ALYR Payroll | الرواتب ووثائق الموظفين | Still coming | none yet |

There is no separate Pay product: payment links stay a module of Chat and Bookings. Names stay in Latin in both languages, each with a plain descriptor (D-025). The workspace home (`/app`) becomes the ALYR Agent dashboard, and the public homepage will show the same component with sample data. Until a model is in the product (D-012), nothing says or implies AI.

**How the split was made (phase 1, ALY-99).**
- **Shared modules.** The team inbox is shared by Chat and Bookings, like payment links. On ALYR's number a business has nowhere else to answer its customers, so a salon that buys only Bookings still needs the inbox.
- **Which products a business is using.** Products are still derived from modules, with no table of their own (`catalog.products_for`).
  - A product is in use when one of its own modules is on: orders for Chat, bookings for Bookings, the ledger for Accounts.
  - Shared modules alone, as at a travel office, count for Chat.
  - ALYR Agent is always in use.
  - So a salon uses Bookings and not Chat as well, and a bakery that takes orders and books tastings uses both. This replaces D-031's "a product counts as on when any of its modules is on", which would have counted Chat as on for every salon.
- **Switching.** Turning a product off keeps a shared module on while another product still uses it. ALYR Agent cannot be switched on or off.
- **Setup steps.** A shared module's steps (WhatsApp number, payment provider) show once, under the first product using it. An "ask ALYR" counts whichever product it was filed under.
- **Price list (D-032), migration 0017.**
  - Items that applied to Credit accounts now apply to ALYR Accounts. The item keeps its key `credit`, because quotes refer to it.
  - ALYR Bookings gets its own item at QAR 449 a month, so a salon's draft quote stays at QAR 449.
  - ALYR Agent gets a QAR 0 line ("ALYR Agent, included"), so every quote shows what the subscription brings.
  - Prices ALYR already set are never overwritten. Quotes already made keep their own lines.
- **Combination pricing (the founder, 17 Oct; migration 0018).**
  - A business's first product is from QAR 449 a month, and each product it adds is QAR 150 more.
    - ALYR Chat and ALYR Bookings together: QAR 599.
    - Adding ALYR Accounts: QAR 749.
    - ALYR Agent is always included, as a QAR 0 "included" line.
  - In the price list, each product keeps its own price for when it is a business's first: Chat, Bookings and Accounts are QAR 449 each. Accounts was QAR 0.
  - A new item, "Each extra product" (QAR 150, rule `extra_product`), prices every further product.
  - A draft charges the dearest product in use at its own price and every other at the extra price. Its line is named "…, added product".
  - All of it is editable in the back office. Quotes already made keep their own lines.
  - The public site still shows no prices until the commercial registration (D-034).
- **Weekly report (D-030).** It is part of ALYR Agent. Its sections stay per module, so no stored report changed.

**Open for the founder.**
- Agents can read every balance and sale through the existing API (`docs/agent-dashboard/02-data.md` §9). The Agent dashboard will show agents no shop-wide money. Closing the older routes changes what agents can do today, so it is a separate issue.

**The ALYR Agent dashboard (phase 2, 17 Oct).** Built to `docs/agent-dashboard/03-build-brief.md` and `01-research.md`.
- **One engine.** `GET /api/agent?lang=en|ar` returns one `AgentView`, every word rendered from fixed templates in that language, never Arabic assembled from fragments.
  - The rules live in one registry (`apps/api/src/alyr/modules/agent/insights.py`). Each has its rule in plain words, a minimum, both languages, and either an action on a screen that exists or an honest status line. Each is tested at its threshold.
  - Cards are shown in order: tasks under "Needs you now", then money, then knowledge with an action, then knowledge for information. At most three.
  - The screen says "By rule" and shows the rule line. Nothing says or implies AI.
- **One component, two homes.** `AgentDashboard` in `apps/web/app/_agent/` draws an `AgentView` and fetches nothing. The workspace home renders it from the API; the public site will render it from sample files captured from the same engine (`apps/web/app/_agent/samples/`). It is themed by `--ag-*` custom properties and follows the host's light and dark.
- **Roles.** Staff with the agent role get the view without money: no sales, owed, collected, amounts or report line. They cannot set cards aside. Owners and admins see everything. Closing the older routes that already show agents money is a separate task.
- **"Not now"** sets a knowledge card aside until its numbers change or until Sunday (migration 0019, `agent_snoozes`, row-level security).
- **Filtered screens.** Every action opens its screen filtered to the rows the rule counted (`?show=`).
- **Samples.** Qirfa Bakery, Dafira Salon (a women's salon) and Zilal Cooling (an AC repair and maintenance company) are fictional, seeded at a fixed moment, Thursday 15 Oct 2026 at 16:20 Doha. Files: `samples/{bakery,salon,homeservices}.{en,ar}.json`.
  - **AC company, not a clinic (the founder, 17 Oct).** A clinic sample could carry health data under the PDPPL, which the lawyer has not checked. The clinic preset stays in the product.
  - **No "paid through ALYR links" in the samples.** There is no payment provider yet (ALY-17), so it would read as live card payments. The product keeps the row.
- **Showcase mode (the design critique, `05-critique.md`).** `mode="showcase"` is the homepage figure: no links into the workspace unless the host passes its own, no "Not now", team, report or setup, heading levels the host sets, the moment ("Thursday · 16:20") instead of a date. `/agent-sample` (not indexed) shows the three samples for the site builder.
- **Why.** The owner sees in one sentence how the week is going, what needs them, and what ALYR did. That is the weekly proof of the subscription on a month-to-month term, and the same screen is what the homepage shows.

**Not built yet.** The suggestions beyond the 20 rules (for example answered after hours), tapping a number to open its week on a phone, the product pages `/bookings`, `/agent` and `/accounts`, and the homepage figure itself (the site builder takes the component in showcase mode and the samples).

## D-037 · The public site presents the suite: the homepage leads with ALYR Agent at work, and every live product has its own page
**Date** 17 Oct 2026 · **Status** Accepted (founder, 17 Oct, in conversation; recorded in `docs/agent-dashboard/07-site-brief.md` §1) · Linear ALY-99 · Updates D-026 and D-034. Numbered D-037 because the open PRs #51 and #52 both take D-036; renumber at merge if needed.

**The decision.**
- **Five pages in each language:** the homepage, `/chat`, `/bookings`, `/agent`, `/accounts` (`/ar/...` in Arabic). ALYR Payroll is listed as coming, with no page until it is built. D-026 had two (the homepage and `/chat`).
- **A Products menu in the header** lists the suite in its fixed order (Chat, Bookings, Agent, Accounts, Payroll), each with one line and its state; Payroll is a dashed row with no link.
- **The homepage's hero is "Your business just got an agent."** (Arabic draft «صار لنشاطك من يعمل عنه.»), beside the real ALYR Agent dashboard in showcase mode and a live feed of what ALYR did that afternoon for a fictional bakery. The body names only what the product does: it replies to the routine and sends the reminders in WhatsApp, helps the owner follow up what is owed (payment reminders go when the owner presses Send reminders), and tells them what needs them on one screen. The check is in `docs/agent-dashboard/08-site-log.md`.
- **Real screens only.** The homepage and `/agent` draw the dashboard component itself, from sample files captured from the engine; the product pages draw the workspace's own screens (Bookings, Credit accounts) and the customer's booking page in the product's words. Every sample is captioned as a fictional business.
- **The three samples are a bakery, a women's salon and an AC company.** Clinics stay off the site until the lawyer has looked at health data (ALY-51): 06's clinic lines claimed how patient data is kept.
- **Nothing says or implies AI**, not even as "coming". **No "paid through ALYR links"** on a sample. **Prices stay off** until the commercial registration (D-034); with the switch on, the homepage shows from QAR 449 for the first product, QAR 150 for each added one, ALYR Agent included.
- **One template for every product page** (01-research D): a bar under the header, the opening on Carbon with a demo, how it works from both sides, the screen used every day with numbered callouts, everything it does today and "Not yet" under a dashed rule, who it is for, "Works with the rest of ALYR", questions, the closing call.

**Why.** D-035 made ALYR a suite led by ALYR Agent. The site now says so: the first thing a visitor sees is the screen an owner would open every morning, and each product can be read on its own before the visit.

**Open for the founder.** Publishing (the go-ahead each time), the Arabic review (ALY-66), the clinics question (ALY-51), a manual name check for Dafira Salon and Zilal Cooling as for Qirfa (renamed from Sadaf Salon and Nasma Cooling, too close to real businesses), and whether the hero may keep calling the replies and reminders the agent's work while `/agent` explains that ALYR Chat and ALYR Bookings send them and ALYR Agent counts them.

## D-038 · The Sunday report is a report card
**Date** 17 Oct 2026 · **Status** Accepted (founder, 17 Oct, in conversation: the redesign was approved) · Linear ALY-99 · Updates D-030

**The decision.** The weekly report on WhatsApp is a branded card image with about eight lines of text under it, both drawn from ALYR Agent's engine, so the report, the card and the dashboard never disagree. Build notes in `docs/agent-dashboard/12-report-card-log.md`.
- **The card** (1080 × 566, WhatsApp's 1.91:1 header): the shop and the week; one hero number with its change against the week before, the same days, a percentage only when both weeks count 20 or more; seven day bars with the week before as a ghost and the busiest day as the one Volt signal; two or three key facts chosen by the products switched on and the type of business. No text smaller than 31 px, about 9.5 px at WhatsApp's bubble width (the founder's fix, 17 Oct). Carbon by default, Paper as well; Instrument Sans, IBM Plex Sans Arabic, IBM Plex Mono and the logo's 45° fold; mirrored in Arabic. Drawn on the server with resvg (`resvg-py`, free), with every Arabic line in a right-to-left embedding, since resvg lays lines out left to right. The fonts are embedded under the SIL Open Font Licence.
- **The text:** a summary by the dashboard's rules, one line per product with the business's main product first (a bakery's report no longer opens with credit accounts), what ALYR did for the business, and one next step with its rule from the dashboard's own cards. WhatsApp's bold and italics. Arabic from whole templates with agreement, every line opening with a right-to-left mark.
- **Sending.** Inside the 24-hour window, the card as an ordinary image with the text as its caption: no template needed. Outside it, the text-only `weekly_report` template stays until Meta approves the new `weekly_report_card` (utility, an image header and five blanks) and `ALYR_REPORT_CARD_TEMPLATE` is set to `true`; REPORT always brings the card. The image is kept beside its message (`message_media`, row-level security) and uploaded through Meta's Media API when the message is sent, so no image is hosted in public. Media IDs expire after 30 days on Meta's side.
- **Unchanged from D-030:** the day and hour, who receives it, the stored sections per product, the workspace API and the owners' email (still the sectioned text).

**Why.** An owner reads one number and seven bars faster than 25 lines, and a card is the weekly proof of the subscription that can be shown at the counter. Drawing it from the engine keeps one set of rules for every number ALYR shows.

**For the founder: submitting the template to Meta.**
1. Put the Meta app's ID in `apps/api/.env` as `ALYR_META_APP_ID=1071845795713841` (the app `alyr`, in `docs/status.md`).
2. On the laptop: `scripts/api-in-docker.sh uv run python -m alyr.templates_sync` to see where things stand, then `... templates_sync --create`. It uploads the sample cards (`apps/web/app/_agent/samples/report/bakery.en.png` and `.ar.png`) and submits `weekly_report_card` in English and Arabic as utility templates.
3. Wait for Meta's review; run `templates_sync` again to see "APPROVED" for both languages. If Meta moves it to marketing or refuses it, nothing changes for owners: the text-only report keeps going.
4. Once both are approved, set `ALYR_REPORT_CARD_TEMPLATE=true` in `apps/api/.env` (Key Vault in production) and restart the API and the worker.

**Not yet.** The card in the owners' email and in a workspace screen, and a native speaker's review of the Arabic (ALY-66).

## D-039 · The Catalog (items, stock, photos) is built complete before go-live; photos on Cloudflare R2; free now, charged by usage later
**Date** 17 Oct 2026 · **Status** Accepted (founder, 17 Oct, in chat) · Linear ALY-101 · Plan with diagrams: https://app.eraser.io/workspace/Ww2H0YNEriob3hFIEywg

**Where we were.** An owner cannot manage what they sell. The `products` table holds a name, an Arabic name, a category, a price and an on/off switch. There is no screen to add or edit an item, no photo, no quantity, no sizes or colours, and nothing records stock. ALYR loads a shop's menu for it.

**The decision.**
- **Build the Catalog complete before go-live.** An owner or a customer must never meet a screen, button or message that says a feature is "coming" or "under development". What is not ready stays hidden.
- **"Complete" is a fixed list, not "any scenario".** Every business type ALYR sells to has a working catalog template, and the 30 scenarios in the plan are covered by automated tests (the last item sold twice, a price changing at checkout, R2 down, a bad photo, and so on).
- **It is not a separate product.** It is part of ALYR, free now, with usage meters from day one so a later charge is based on real data. Charging goes through the price list and per-client quote of D-032: an included allowance, usage beyond it billed. No billing screen is built before the founder decides.
- **Photos live on Cloudflare R2, free tier first** (see below).

**What it changes in earlier decisions.**
- The 16 Oct rule "build only what a named pilot business needs; no new modules until 10 paying customers" (`operating-model.md`, `lanes/product.md`, D-034) no longer applies to the Catalog. It still applies to every other new module.
- `master-plan.md` 6.2 listed "product options and stock" as deliberately not in Product 1. They are in scope now.
- D-035 and D-037 show Payroll as "coming" in the Products menu and on the site. Nothing "coming" is shown to an owner or a customer at go-live. Payroll appears when it is built. ALY-113 sweeps every such label, including "Early access" on the site (the founder chooses the final wording).

**Agreed details (founder, 17 Oct).**
1. Release 1 includes customer price groups for wholesale and three new business types: bakery and home kitchen, grocery and baqala, fashion and gifts for social sellers.
2. Syncing with Meta's WhatsApp catalog is tested first on our test number and ships only if it works for Qatar numbers. Meta's documentation says the catalog is uploaded to Meta and connected to the shop's WhatsApp Business Account; it does not say whether this works for Qatar numbers.
3. An unpaid pay-link order holds its stock for 30 minutes; the shop can change that.
4. Only WhatsApp numbers the owner has registered as staff can change stock or add items by message. Each change can be undone and is recorded with who made it.

**Naming.** An owner's sellable things are "items" in code, and "Menu", "Products" or "Price list" on screen depending on the business type. The workspace's Products screen, which lists ALYR's own suite (Chat, Bookings, Agent, Accounts), keeps the word "products". Package 1 (ALY-102) decides whether the existing `products` table is renamed or extended in place.

**Item and stock model (summary; the plan has the detail).**
- An item has English and Arabic names (the Arabic is required before it goes live, because Qatar's consumer law requires prices in Arabic, including for online and social-media sellers), photos, a category, a price with its history, a unit, optional variants (size, colour) and options (required choices, priced extras), and a status of draft, live, hidden or archived. An item with order history is archived, never deleted.
- **Availability rules,** one per item plus an optional schedule: always, switch, count, daily limit, schedule with lead time and cut-off.
- **Stock is a log of movements** (opening, received, sold, cancelled and restocked, wasted, counted, adjusted), each with who, when and why. The figure on screen is their total. Stock is reserved in one conditional database step at checkout, so the last item can only sell once.

**Photos and storage.**
- Cloudflare R2, Standard storage, used only through its S3-compatible interface and a small storage layer of our own (D-011: nothing may depend on a vendor's proprietary service). Local disk for development and tests.
- Public photos are served on `media.alyr.qa` through Cloudflare's network. One folder per shop.
- ALYR processes every upload itself: checks the type by content, the size and the pixel count; removes location and camera data; re-saves three WebP sizes (about 320, 800 and 1,600 pixels wide) under content-based names. SVG and other active formats are refused. Cloudflare's separate Images service is not used.
- **Free allowance** (Cloudflare's pricing page, checked 17 Oct 2026): 10 GB-month of storage, 1 million writes and 10 million reads a month, and no charge for downloads. Beyond that, USD 0.015 per GB-month. At about 350 KB per photo across the three sizes (our estimate) the free tier holds roughly 28,000 photos across all shops.
- **Caps:** about 1,000 items and 3,000 photos per shop to start (our estimate), and an alert when the total reaches 80% of 10 GB. A cap stops new uploads with a clear message and never deletes anything.
- **Meters, kept monthly per shop:** photos stored, gigabytes stored, active items, uploads. They exist from day one.
- **Data residency.** Product photos are public by design and are not personal data. R2 sits outside Qatar. The row is in `data-residency.md`.

**What we could not confirm.**
- **Whether R2's free tier needs a payment method on the account.** Cloudflare's pricing page does not say. The founder enabled it on 17 Oct; whether a card was asked for is the founder's to say.
- **R2 cannot be enabled from the command line or the API.** Checked 17 Oct: `wrangler r2 bucket list` on the founder's laptop fails with Cloudflare error 10042, "Please enable R2 through the Cloudflare Dashboard", and wrangler's sign-in has no R2 permission. Enabling is a one-time step in the dashboard (Storage and databases, R2 object storage). Accepting terms and any card details are the founder's to enter.
- Whether the WhatsApp catalog features work for Qatar numbers (see agreed detail 2).

**State on 17 Oct 2026 (the founder enabled R2 in the dashboard).** The bucket `alyr-media` (Standard storage, location chosen automatically by Cloudflare, not Qatar) and the custom domain `media.alyr.qa` (zone alyr.qa, minimum TLS 1.2) were created with wrangler. Checked serving a test file on 17 Oct. `r2.dev` public access stays off, so photos are reachable only through our own address. Two things were needed that the command line could not give: the zone ID, read with wrangler's own sign-in, and a dashboard-made token for the app. **The app token is in place (17 Oct).** The founder made one R2 API token limited to the bucket `alyr-media` (Object Read and Write) and wrote its Access Key ID and Secret Access Key into `apps/api/.env`; the settings are `ALYR_R2_ACCOUNT_ID`, `ALYR_R2_ACCESS_KEY_ID`, `ALYR_R2_SECRET_ACCESS_KEY`, `ALYR_R2_BUCKET` and `ALYR_MEDIA_BASE_URL` (`https://media.alyr.qa`). Checked with a signed S3 request: writing, reading through `media.alyr.qa` and deleting an object all worked, and listing buckets outside `alyr-media` was refused. The dashboard also showed a 'token value' for the same token; the app does not use it, so it should not be kept in the app's settings. Production values go in the secret store (CLAUDE.md rule 6). The test file was deleted afterwards; the bucket is empty.

**Not in release 1** (shown only when finished, based on what owners use): Meta catalog sync, ingredients and recipes, suppliers and purchase orders, barcode scanning, several branches with separate stock, voice notes (needs the AI-model decision, D-012), Instagram.

**Why.** The founder does not want a bad first impression: an owner who cannot change their own menu, or finds a "coming soon" label, will not trust the rest. Research (in the plan) also shows spreadsheets are the real competition, so setup must take minutes from a phone, and staff must be able to update stock without opening a screen.

**Risks.** The scope is large, so packages 1 and 2 come first and anything not ready stays hidden. Meta may classify a back-in-stock message as marketing: test the template category first. The listing policy (no counterfeit or prohibited goods) needs the terms (ALY-68) and a legal look (ALY-51). Demo shops use simple drawn tiles, not copyrighted photos.

**As built (ALY-103, 17 Oct 2026; PR #65).** Where the code fixed a detail this entry left open. None of it changes the decision.
- Sizes are measured on the **long side** (320, 800, 1,600), not the width, so a portrait photo is not larger than a landscape one. A photo is never enlarged: a 600-pixel photo is stored as 320 and 600.
- File names are `shops/<shop id>/<SHA-256 of the file as uploaded>-<size>.webp`. A shop that uploads the same file twice, or two staff who both do, store it once; two shops never share a file. The name is of the upload, not of the cleaned result, so the same picture re-saved by a phone with different metadata is a new photo.
- The type is decided by the first bytes (JPEG, PNG, WebP only; no GIF, HEIC, AVIF or TIFF). Animated images are refused. A file that contains `<script`, `<html`, `<svg` and similar words is refused as hidden code, though re-encoding would have dropped them anyway.
- Photos are written to the store by a **background job** with its own queue table, not inside the upload request, following the rule that a slow outside service is never called from a request. R2 being down therefore delays a photo and fails nothing; the job tries up to 48 times, about an hour apart at the end, then the photo is marked failed and a person can retry it from the failed-jobs list or by uploading it again.
- A shop deleting its own photo removes it for good. Taking one down under the listing policy keeps a marked row, so the same file cannot be uploaded again.
- Caps count photos and items per shop, one setting each (`ALYR_CATALOG_MAX_PHOTOS`, `ALYR_CATALOG_MAX_ITEMS`); there is no per-shop override yet. The alert at 80% compares all shops' stored bytes with 10 decimal gigabytes.
- The meters keep, per shop and month in shop time: photos and bytes stored at the last change, the month's peak (R2 bills on the daily peak), uploads, duplicates, refused uploads and active items.
- Photos and owners are linked by kind and id (`media_links`), with no foreign key to the items table, so the catalog can link items, variants and anything later. New dependency: Pillow, for decoding and re-encoding images.
