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
| D-036 | ALYR runs on Azure Qatar Central; backups and the emergency host are on Google Cloud in Doha | Accepted in direction |
| D-037 | The public site presents the suite: the homepage leads with ALYR Agent at work, and every live product has its own page | Accepted |
| D-038 | The Sunday report is a report card: a branded image from ALYR Agent's engine with about eight lines under it | Accepted |
| D-039 | The Catalog (items, stock, photos) is built complete before go-live; photos on Cloudflare R2; free now, charged by usage later | Accepted |
| D-042 | Documents (receipts, invoices and the rest) are one engine: gapless numbers, issued paper nobody can change, Arabic first, a PDF drawn by fpdf2 and kept in the database; free now, metered later | Accepted |
| D-046 | The public site adds ALYR Shelf (the Catalog) and ALYR Docs (Documents), each with its own page; Payroll leaves the site until it is built; every product's state is "Set up for you" | Accepted |
| D-056 | Search and AI visibility: be found, described correctly and contacted in Qatar, in search and AI assistants; profiles and verification switch on from settings | Accepted |
| D-058 | The homepage hero's ALYR Agent figure (and /agent's) moves continuously, the one exception to "plays once", with a pause button and calm pacing | Accepted |
| D-059 | Motion is always on: the site's figures (How we work, the products frame, the signature figures, with the flows, demos and the live Agent) keep playing, each with a Pause control; text arrives once | Accepted |

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
**Date** 11 Oct 2026 · **Status** Look decided by D-040 (17 Oct: Carbon and Volt; the playbook's cobalt retired). The rest stands as written · Linear ALY-56

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

## D-036 · ALYR runs on Azure Qatar Central; backups and the emergency host are on Google Cloud in Doha
**Date** 17 Oct 2026 · **Status** Accepted in direction (founder, 17 Oct: skip Oracle and focus on Azure, with backups on other clouds; "start building phase 1"). Still the founder's to answer: when to open the Azure account, the Google Cloud account, the encrypted copy in Cloudflare R2, and the move of the product to alyr.qa addresses · Linear ALY-63, ALY-10 · Updates D-013 and D-019

**Why now.** Everything ran on the founder's laptop. A real booking reminder was missed on 13 Oct because the laptop was asleep, and demos stop when it does.

**The decision.**

| Role | Where | Why |
|---|---|---|
| Main home | Azure Qatar Central: Container Apps (web, API, worker, each always on, each able to add copies), PostgreSQL Flexible Server 16, Key Vault, Container Registry | In Qatar (hard rule 2). About USD 62 a month at Qatar list prices: Container Apps about 36, the database 21.31, the registry 5.07. Own domain and HTTPS included. Startup credits do not need venture funding |
| Database protection | Azure's own backups (7 to 35 days, point-in-time, across the region's three zones), plus a nightly encrypted dump to Google Cloud Storage in Doha and a second copy in Cloudflare R2 | Qatar Central has no paired region, so Azure offers no copy elsewhere. Doha keeps a copy in Qatar with a second company; R2 survives a Qatar-wide event. Under USD 1 a month |
| Emergency host | Google Cloud Run and Cloud SQL in Doha, started from the latest backup | USD 0 while unused; about 110 to 150 a month if ever run. Restore and switch in about one to two hours |
| Web app standby | Vercel Pro, only if needed | It has no Gulf region and cannot run the worker, so it can hold the web app only |

**Considered and rejected.**
- **Oracle's free server:** the founder chose to skip it.
- **Neon's free database:** an always-on worker uses about 182 compute-hours a month against 100 free, so it would stop mid-month.
- **Cloudflare alone:** cannot run the Python API (D-019); Containers would still need an always-awake database.
- **Vercel for the API or worker:** no long-running worker, no Gulf region, data processed anywhere.
- **Google Cloud as the main home:** about USD 85 to 107 a month; its Doha region needs an extra USD 18 load balancer for a custom domain, and that terminates outside Qatar.
- **AWS:** its Bahrain and UAE regions are reported damaged since March 2026; Frankfurt is a last resort only.
- **Alibaba Cloud:** no managed containers in Dubai.
- **Qatar's local providers (Meeza, Ooredoo, Vodafone):** sales-led only; revisit for government-linked customers.

**How it stays movable (D-011).** Three images (API and worker, web, backup) and standard PostgreSQL. `docker-compose.prod.yml` runs the same images on any single server and is the rehearsal on the laptop. Moving clouds is a restore and a DNS change. Details and commands are in `docs/hosting.md`.

**Rules that come with it.**
- Production images start in production mode: no simulator, no open demo, jobs only in the worker.
- Migrations take a lock, so two deploys cannot apply the same file twice.
- The backup role is the only role that reads past row-level security; it is read-only and used only by the backup job. The application role still cannot bypass it (hard rule 1).
- Dumps are encrypted to a key only the founder holds.
- The worker checks in every 30 seconds, and `/health/worker` turns red after two minutes of silence. Uptime monitoring watches it.
- The backup tools match the database's major version (the rehearsal found why).

**Before the commercial registration.** Opening the Azure account (Microsoft for Startups, about USD 200 of credit) is the founder's personal account and card, not ALYR trading; he decides when. The USD 5,000 tier needs the company. Do not open a plain Azure free account first: Microsoft for Startups requires an account with no prior Azure use.

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

**As built (ALY-104, 18 Oct 2026; photos linked to items, and what the screens needed).** Where the code fixed a detail this entry left open, or the founder's brief for the screens went beyond it. None of it changes the decision, and one wording differs from it (the first bullet).
- **The section is called "Catalog" («الكتالوج»), not "Menu", "Products" or "Price list".** The founder asked for that name on the screens, and it never collides with the Products screen that lists ALYR's own suite. Calling it by the business type (Menu for a restaurant) is left to the templates package (ALY-107), which owns the starting setups.
- **A module that is in no product.** `catalog` is declared in `catalog.py` with one screen and belongs to no product and no starting setup, so it is off for every shop. Nothing an owner sees mentions it until the back office writes a `tenant_modules` row for the shop; the go-live sweep (ALY-113) decides which shops. The items API answers where `orders` or `catalog` is on.
- **A draft may be incomplete.** A draft made from a photo has no name and a price of zero. Anything else needs a name and a price above zero, and the database enforces it (`items_price_set`), so a draft cannot be sold by mistake.
- **Photos on items.** Up to eight, the first is the cover; a size or colour (a variant) has one. Every item the API returns carries `photos` and `cover` with a state (`ready`, `pending` while the photo store is down, `failed`; the cover is `missing` with no photo), so a screen always has something to draw. Adding, removing, reordering and choosing a cover are on the item's activity record.
- **Bulk actions are previewed, then applied with the preview's hash, and the newest can be undone once.** The hash makes sure an owner applies only what they saw. Marking things sold out is the counter's work, so agents may do it in bulk; prices, categories and archiving need the right to edit.
- **Agents.** They flip switches, record stock and count the shelf. Adding and editing items and photos is for owners and admins, unless the owner turns on "agents may edit items" in the shop's settings (off to start).
- **Low stock** is a number per shop (`low_stock_at`, 5 to start): a size counted at or below it, and not gone, is low. ALY-109 (alerts) may refine it per item.
- **Arabic search** folds the spellings people mix up (the alef and its hamza, ya and alef maqsura, ta marbuta and ha, the marks above letters, Eastern digits) on both sides of the comparison, and a word may be a part of the name's word.
- **The screens (ALY-104, `specs/002-catalog-screens/spec.md`).** Photo-first adding makes a draft for each stored photo at once (so nothing is half-saved and a retry repeats nothing), then walks the owner through the drafts. An owner who writes only Arabic may leave the English name empty: the Arabic one is stored in both. A bulk change is undone from a message and from a button, once. The list offers a filter chip only when something is in it. The two forms of every word are in one file (`catalogCopy.ts`) and the type check refuses a missing Arabic line. Anything fixed to the window (toasts, the selection bar, sheets) is drawn in the shell's root, because a screen that arrives with the shell's rise animation keeps a transform and would otherwise hold the fixed layer against the whole screen.
- **Left open for the founder** (from the build): the section is called "Catalog" everywhere, not Menu or Price list per business type (ALY-107 decides); the workspace has no language switch on a phone outside the search palette; the shell's grey text on the laptop sidebar and top bar is below 4.5:1 and is not changed here (both in ALY-129).

**As built (ALY-106, 18 Oct 2026; the Catalog on WhatsApp).** Where the code fixed a detail this entry left open. None of it changes the decision; `specs/004-catalog-whatsapp/spec.md` is the whole of it.
- **Staff are the numbers the owner registered** (`contacts.role = 'staff'`, the same list the weekly report chooses its recipients from), added in the Catalog settings ("Staff on WhatsApp", `/api/staff-numbers`). A message from any other number never reaches the commands and is answered like any customer's, in its own language; a test compares the replies byte for byte. A staff number marked **manager** also gets the stock and refund messages and may put a draft made from a photo on sale; a shop that marked nobody falls back to the numbers that receive the weekly report.
- **"stock abaya black M 5" sets the count** (a count with a difference, the same as the workspace's), it does not add five. The verb comes first in both languages; for sold out and back it may come last («الشاورما خلصت»). A name that fits one item is that item; a name that fits several is asked about with numbers and nothing changes meanwhile. A longer name that merely contains the typed one never beats a name typed in full. A spelling mistake is forgiven only in a word of four letters or more.
- **Undo is once per change and only for the person who made it**, and is refused when the thing changed again since. The stock log, the price history and the activity record say `whatsapp` and carry the staff member's name (migration 0027: `via`).
- **A photo sent by staff** becomes a **draft** through the same photo pipeline as an upload; the caption gives the English name, the Arabic name and the price. Putting it on sale needs a manager, a name, a price and an Arabic name. The download from Meta is a job, never part of the webhook request.
- **Back in stock is a marketing message outside the 24-hour window.** Meta's template guidelines (checked 18 Oct 2026) say a utility template must be non-promotional and requested by the user, and list "a saved search found a match" among the retargeting messages that are "marketing even if requested by users"; availability alerts are not named. So `back_in_stock` is filed as marketing, sent as an ordinary text inside the window, and outside it only to a customer who holds the **narrow consent `back_in_stock`** (founder's decision, 18 Oct: asking to be told about one item must not become general marketing consent). The customer is asked once, in plain words, when they tap "Tell me when back"; Yes is recorded in `consents` with the purpose `back_in_stock`, the words shown and the source, and sets `contacts.consent_back_in_stock`; it never sets `consent_marketing`, so broadcasts (ALY-44) still need an explicit marketing opt-in. STOP takes it back and cancels every request; START does not give it back. One message, then the request is closed.
- **Owner alerts:** a sale or count takes a counted item to its low-stock number (the item's own, else the shop's) or to nothing, and the managers hear once a day for each of the two, never between 22:00 and 07:00 on the shop's clock (a night alert waits for 07:00 and is looked at again). The per-item `low_stock_at` is on the item API and the edit sheet.
- **Refunds due:** cancelling an order the customer paid tells the managers which order and how much, and that the refund is theirs to make; so does a payment from a real gateway that reaches an order after its link expired (the stand-in moves no money and says nothing).
- **Six templates** (`stock_low`, `stock_sold_out`, `refund_due`, `refund_due_late`, `draft_added` utility; `back_in_stock` marketing) are in the catalogue and are **not submitted**.
- An image can now ride on a message with buttons (`OutboundMessage.image`, header of the interactive message, JPEG) and list rows can have a description and an Arabic button; `InboundMessage` carries a photo's file ID and `Channel.download_media` fetches it.

**As built (ALY-127, 18 Oct 2026; customer price groups and SKU, `specs/003-price-groups-and-sku/spec.md`).** Where the code fixed a detail agreed detail 1 left open. None of it changes the decision.
- **The default group is the normal price.** A shop always has one default group (made by the migration for existing shops, on first use for a new one). It has no price rows, can be renamed and cannot be removed. A customer with no group of their own, a page opened with no customer and a group with no price for an item all pay the item's normal price, so a shop prices only what differs.
- **A group's price replaces a sale price.** The price agreed with a kind of customer is not lowered by a retail promotion; a group with no price of its own for the item pays the sale price like everyone else. The bulk price change moves normal prices only.
- **A price per item and per size.** A group's price for a size wins; else its price for the item plus the size's difference; else the normal price. Each change is added to a history, like the normal price's.
- **Removing a group archives it.** Its customers go back to the default group (on each one's record), its prices and history are kept, and its name can be used again. The app's routes never delete a group.
- **The order keeps the group's name and every line's price.** Changing a group, a price or a customer's group never rewrites an order; the order list shows the group (when it is not the default) and the SKU.
- **Who sets a customer's group:** owners and admins, because it decides what a customer is charged. There is no customer-details screen yet (ALY-53), so the picker is in the header of the inbox conversation, the one place a customer's own record is edited.
- **SKU is unique across items and their sizes**, ignoring case, checked by the app under a lock per shop with a unique index under each table. An archived item keeps its code until it is cleared. A SKU is a code of the owner's own: ALYR makes none up and does not read barcodes (barcode scanning is not in release 1).
- **Knowing a customer's order link shows that customer's prices**, as it already lets them order on credit (D-016). A wholesale customer who passes their link on shows the wholesale prices to whoever has it. ALY-112 decides whether the link needs more than the contact's unguessable ID. (Updated by "As built (ALY-112)" below: it does, a signed token; a bare contact ID no longer shows anyone's prices.)

**As built (ALY-108, 18 Oct 2026; import and export, spec 006).** Where the code fixed a detail this entry left open. None of it changes the decision.
- **Excel without a library.** An `.xlsx` is read and written with Python's standard library (`modules/items/xlsx.py`, about 600 lines) instead of openpyxl. The Catalog needs one table of text, numbers, yes/no and dates in and one formatted table out, and an owner's upload is untrusted input, so what matters is the limits: the file, each part, the unpacked total and ratio, rows and columns are bounded before anything is parsed, an XML declaration of a document type or entity is refused, nothing is written to disk, a formula is never calculated (its saved value is used and the row says so). No new dependency, so nothing for `pip-audit` to watch. The reader and writer were checked against openpyxl in both directions (run once with `uv run --with openpyxl`, not a dependency); they have not been opened in real Excel or LibreOffice. `.xls` and `.xlsm` are refused with a message that says what to save instead.
- **The file is the export's format.** One row for each size or colour of an item, the item's columns repeated, `Item ID` first, so an exported file edited and uploaded again updates exactly those items; a hand-made file is matched by name only when the owner chooses "update the item with that name". An empty cell keeps what the shop has. A sale price of `0` ends a sale.
- **"Good rows go in, bad rows are listed" and "all or nothing per file" are both kept.** A row the preview left out (a wrong price, no name, a size twice, an ID that is not this shop's) stays out and is listed with its row number and reason; the apply of everything else is one transaction, so a failure the preview could not foresee changes nothing. The import carries the preview's hash like a bulk action, so it applies exactly what was seen.
- **An incomplete item becomes a draft, not an error:** no price or no Arabic name. A number-a-day item with no number for a size is an error for its row, not a draft, because the engine refuses a size without one even in a draft (found when a preview that said "draft" failed to apply). The Arabic name is still required before an item goes on sale (D-039). Duplicate names are warned about and never merged, inside the file and against the catalog, and the owner can choose to update the item with that name or leave the row out.
- **Stock numbers never touch the number directly.** A new size gets an `opening` movement and an existing size a `counted` one (the difference is recorded), both with the reason "Import" and the person's name; the same number again writes nothing.
- **The activity record.** The import is written under subject `item` with the import's id as the subject id (action `import_applied` or `import_undone`, with the file name and the counts) and each item it touches has its own `created` or `updated` rows, with who. The record table's list of subjects was not widened, so as not to collide with other migrations.
- **Undo, once, newest only.** Items the import added are deleted if nothing has happened to them since, archived if they have been ordered or their stock has moved, and left (and named) if they were edited; items it changed get their old values, sizes and stock back unless they were changed since; the photos it added come off. The photo library keeps the pictures.
- **Photos from a zip are added by a background job** (one item at a time, remembering where it is, a photo that cannot be used is named and the rest carry on), matched by the file names in the Photos column or, for a row that names none, by a file called like the item. A web link is never downloaded; an ALYR photo link from an export is recognised.
- **Limits** (settings, with the item and photo limits of ALY-103 still applying): a sheet 5 MB (`ALYR_CATALOG_IMPORT_MAX_BYTES`), a zip 40 MB (`ALYR_CATALOG_IMPORT_MAX_ZIP_BYTES`), 3,000 rows, 600 files in the zip. A preview that is not applied is kept for a day, ten at most.
- **SKU is in the file** (an item's and each size's, ALY-127): a code used twice in the shop or in the file is an error for the row that causes it and names what has the code. **The item's own low-stock number is in the file** (ALY-106): a column for items counted in stock, empty keeps it, 0 to 100,000, not used (with a warning) for an item that is not counted. **Not in the file:** customer price groups (group prices, a customer's group, a deliberate choice: they are about who buys, and one file holding both is easy to get wrong), staff numbers, managers and "tell me when it is back" requests (people, not items; nothing in `core/consent.py` is touched), option groups and schedules (screen only), category order and Arabic category names. **An import holds the owner's alerts back (founder, 18 Oct):** a stock number in a file is a count, but a stocktake file must never send an owner hundreds of messages, so the import's stock moves (and the undo's) carry a flag that skips the per-item low-stock and sold-out alerts (every other path keeps its once-a-day-per-item alert; customers waiting for an item are still told). After an apply that counted stock the managers get one message, "After your import, N items are low or sold out", through the alerts' own rules (managers, their language, not at night, the counted items recorded as alerted that day); it is plain text with no new template, so it goes only inside a manager's 24-hour window and is skipped otherwise.

**As built (ALY-112, 18 Oct 2026; the customer order page, share links and QR codes, `specs/005-order-page-v2/spec.md`).** Where the code fixed a detail this entry left open. None of it changes the decision.
- **Hidden, and a shop without the Catalog is untouched.** The new page appears for a shop that has the `catalog` module on (no shop, until ALY-113). A shop without it keeps the page it had (`LegacyOrder`), with two changes it needed anyway: the signed token below, and amounts written in the page's language.
- **Links: a public link is not a person.** An item's, a category's or a table's link (and its QR code) opens the page for anyone, at the normal prices, and cannot order; it sends a customer to the shop's WhatsApp (`wa.me/<number>?text=Order`, or `Order table 7`) to get a link of their own. A link for one customer (the one the chat sends) carries `?t=<token>`: HMAC-SHA256 over the shop and the customer (and the table), signed with `ALYR_LINK_SECRET`, valid for 60 days (`ALYR_LINK_DAYS`; the founder tunes it). **This answers the question ALY-127 left open:** whoever holds a customer's link is that customer until it runs out, as before, but the link can no longer be made from a contact ID, edited, or used at another shop, and a public link never carries one. A bare `?c=<contact id>` grants nothing now (no shim: there were no real customers); the contact's ID is inside the token, readable by whoever holds the link, so until the booking page is signed too a forwarded order link shows an ID that still works there (updated by "As built (ALY-133)" below: the booking page takes a signed token made for booking and no bare ID, so a forwarded order link opens nothing there). The secret: a developer machine has a public built-in value; anywhere else the API will not start without 32 or more characters. A developer machine that shows the page through a tunnel should set the secret too: the API logs a warning when the built-in key is in use and the public address is not this machine. A single customer's link cannot be ended on its own (only all of them, by changing the secret); a per-customer counter would do it, and the booking page's `?c=` should follow the order page (new issues).
- **A table's QR code** is the shop's public page with the table in the link (`?table=7`). To order, the customer taps "Order on WhatsApp", whose message is `Order table 7`; the chat answers with their own signed link that carries the table, and the order records it. Staff see it on the orders list and the customer on the tracking page. The shop's WhatsApp number is a new Catalog setting (a shop cannot connect its own number yet, ALY-39, so it is typed by the owner or at setup); without it the page tells a visitor to open the link from their chat, and the Share sheet says the number is missing.
- **Stock is told only when it is true and small.** "Only 3 left" shows when what is left is above none and no more than the shop's low-stock number; above that the page says nothing, because the exact count would tell a competitor the shop's stock. The checkout still says exactly what is left at the moment it matters. The cart check, which the page asks before payment, still says exactly what is left when more is asked for, because the checkout must; anyone with a link could probe stock that way, and closing it needs rate limits (ALY-116).
- **Sold-out items:** greyed or left out, the shop's choice (ALY-107's `sold_out_display`, set with its type and changed in the Catalog settings; grey to start). An item outside its hours is always listed, with the words for when it is back ("Ready from 5 pm", "Order before 2 pm for tomorrow"), because the customer should know.
- **The shop's type chooses the look** (ALY-107's `catalog` hints on the store page): the section's name is the line above the title and in the search box; `menu` is photo rows by category, `grid` two photos to a row, `list` compact rows without photos, `table` the compact table (also for a price group or the shop's own setting). The day of the order, a quick add on every row, "same as last time" and the SKU in the table are on the page for every type, with no switch. ALY-107's review sentences about the order page are checked against this page in the browser run (`layouts`).
- **Pack sizes are sold in whole packs** for pieces, kilos, hours and portions with a pack size above one (the stepper steps by the pack; the cart check refuses the rest with `not_pack_multiple`). A box or a pack is already the pack. *Open for the founder:* the plan did not say whether a pack size forces multiples or only informs.
- **Money in Arabic.** Qatar's consumer law (Law 8 of 2008, Article 17) requires prices in Arabic, shown clearly and prominently (Ministry of Commerce and Industry reminder, 14 Sep 2021); it names no digit style or abbreviation, and "prices start from" is treated as misleading, so a range writes both ends. The customer pages write `24 ر.ق` (the amount, then «ر.ق», Western digits) and English writes `QAR 24`, from one helper (`_customer/price.ts`); the API's Arabic sentences use the same form. Chosen because Qatari companies write it so online (Vodafone Qatar's Arabic site), it is ALYR's own rule, and it reads the same in a chat. Not the statute's text: the wording should be checked against the official legal database before launch. The `ar-QA` locale would give Arabic-Indic digits; one line in the helper changes it if the reviewer (ALY-66) prefers.
- **A released order says so.** The pay page knows `pending`, `paid` and `expired`; a link whose order was released says "This order was released", "Nothing was charged" and offers "Order again", which carries the customer's own link if the tab still has it (the order page keeps it for the tab; the pay page mints nothing). A Pay that is refused because the hold ran out becomes that state.
- **QR codes** are drawn in the browser by `qrcode-generator` 2.0.4 (MIT, no dependencies, loaded only by the Share sheet), error correction M, a four-module quiet zone, dark on light; a decode test reads each code back with `jsqr` (a development dependency). Reason: a hand-written encoder would have needed the same decode test and more code; this one is small, permissively licensed and widely used. Audit run (`pnpm audit --prod`).
- **Search** folds Arabic the way the workspace does, on the server (`items/text.py`) and, when everything is loaded, in the page (`_customer/fold.ts`); both pass the same cases (`specs/005-order-page-v2/fold-cases.json`).
- **Not built, by choice:** the shop's own logo on the page (the shop's name and monogram lead, as before); a share button for customers; the booking page's signed link (built in ALY-133, below); an item link in the "back in stock" message (ALY-106 sends the order page's link, now signed; the page can open on an item with `?item=`).

**As built (ALY-109, 18 Oct 2026; the Catalog in the weekly report, on the home screen and in the back office, `specs/007-catalog-reports/spec.md`).** Where the code fixed a detail this entry left open. None of it changes the decision.
- **The report section is a section like the others** (key `catalog`, between the orders and the bookings), so it is in the stored week, the workspace's report and the owners' email. It is **not in the WhatsApp card's caption**: that is the Agent's one line per product (D-038) and the Catalog is in no product. Whether the caption gets a Catalog line is a decision about the card, left open.
- **Six lines, each left out when it has nothing to say:** what sold out and for how long, how many customers asked for something sold out, what is low now, the best sellers by units and by money, and what did not sell. A section with no lines is left out of the report altogether (the engine's `render` skips it). A **sale is a line of an order that was not cancelled**, the same orders the Orders section counts, so a cancelled order and one taken off a credit account by ALY-128 are not sales. The lines have **no comparison with the week before** (they are lists, not one figure).
- **"How long sold out" is worked out, not recorded.** An item sells out three ways (switched off, a counted stock at nothing, a daily limit used up), and a daily limit starts again at the shop's day start with no event at all, so a log of "sold out" events could not close its own spells. `items/spells.py` reads the two logs that are never edited, the stock log (`balance_after`) and the activity record's switch flips. Only live items that are not "always available", only the time since an item went live, and a total under an hour is left out as a count being corrected. The one gap this found was closed: saving the switch with the item (`PUT /api/items/{id}` with `available`) now leaves the same `switched_on` / `switched_off` row as flipping it. A size's limit is today's, not as it was.
- **"Customers who asked for something sold out" is a new record,** `sold_out_asks`, once per customer, item and day (migration 0030), because nothing recorded it: `stock_watches` needs the customer's agreement and is written after the ask. It is written when a customer's cart check, refused order or "same as last time" meets a sold-out or switched-off item, and when the chat shows or is asked about one; never for staff, a draft, a price that moved or a closed schedule. A refused order is rolled back, so its asks are written afterwards in a transaction of their own, best effort.
- **The home cards ("Sold out now", "Low stock") are the Catalog list's own filter counts** (`listing.counts`), so a card is exactly the number of rows in the list it opens. They are declared with the module in `catalog.py` (a card may now name its own `count` and an `href`), returned by `/api/workspace/home`, and drawn on the ALYR Agent dashboard as a "Catalog" section (the `catalog` block of `GET /api/agent`). A card with nothing to show is a number and not a link. Tapping one opens `/app/catalog?show=sold_out` or `?show=low_stock`. Arabic: «نفدت الآن», «مخزون قليل» (the words of the list's own chips).
- **The back office's Usage view** (`/ops/usage`, `GET /api/admin/media/usage/history`): per business, items, photos, gigabytes, uploads and the change since last month; the total against R2's free 10 GB with the 80% state; month by month. Read only, **no price and no billing**: charging by usage waits for the founder and goes through the price list (D-032).
- **The workspace now remembers its language on the device.** Found in the browser run: every screen is a new page component, so a link inside the workspace (the new cards, or any row of Needs you now) sent an Arabic reader back to English. It is a per-device convenience in `localStorage`.

**As built (ALY-107, 18 Oct 2026; business-type templates, `specs/008-catalog-business-types/spec.md`).** Where the code fixed a detail this entry left open. None of it changes the decision; the first bullet settles the naming ALY-104 left to this package.
- **One setting decides whether anyone gets it: `catalog_for_new_shops` (`ALYR_CATALOG_FOR_NEW_SHOPS`, default off).** Off, onboarding of every type is exactly what it was before the Catalog (a test compares the modules of the eight old types, and that no sample, category or setting is written), and the three types that exist only for the Catalog are not offered. On, each type gets its catalog. It never switches anything on for a shop that exists; that, and flipping the setting, is the go-live sweep (ALY-113).
- **The section is named by the type of business**, in both languages: **Menu** («القائمة») for a restaurant and a bakery, **Products** («المنتجات») for a grocery, a fashion seller, a shop and the appointment businesses, **Price list** («قائمة الأسعار») for wholesale, and "Catalog" for a shop with no type of its own. The workspace's own screen that lists ALYR's suite keeps the word "products" except where the shop's section is "Products" too: there it is "ALYR products" («منتجات ALYR»), so two entries never share a name.
- **What a type starts with** (full table in the spec): how a new item runs out (a restaurant on or off; a bakery a number each day, ordered one day ahead before 18:00; a grocery, a fashion seller, a shop and a wholesaler counted), the low-stock number (3, 3, 10, 2, 5, 20), whether a sold-out item is greyed on the order page or left out (a grocery leaves it out), which of the two WhatsApp alerts are on, the order page's layout (hints for ALY-112), the starting categories with Arabic names, and which folded parts of the item form start open. The owner changes the sold-out look, the new-item rule and the two alerts in the Catalog's settings; the rest is the type's. A photo draft runs out the way the shop's new items do.
- **Samples are drafts the database will not let anyone sell** (`items_sample_is_draft`), marked "Sample", with prices called examples, drawn tiles instead of photos (nothing stored or downloaded), removable in one call. Saving one in the edit sheet, putting a photo on it or "Keep it as mine" makes it the owner's; nothing else can change one, and the WhatsApp commands and the chat never see them. Their prices are examples (as D-031's service prices are), not zero, so the screens look like a real shop; they can reach a customer only after the owner has saved the item and put it on sale.
- **The Catalog is optional for the appointment businesses** and is a single row on their go-live list. **Photos for the services themselves are not built:** a service belongs to the bookings module and has no photo (ALY-27's screens). **Wholesale gets the `orders` module as well as `catalog` when the setting is on** (decided 18 Oct, answering this package's open question): its customers order from the price list, so it has an order page in the table layout, price groups decide each customer's price, and a customer with a credit limit puts an order on their account (a test places one through the store API at the group price, and the limit holds). With the setting off wholesale is as before, without orders. The price drafted for it does not change: its inbox and payment links already counted as ALYR Chat beside ALYR Accounts. Travel and documents have no catalog at all.
- **Left open:** the Arabic of every sentence (ALY-66); the sentences of the review that describe the order page (a photo grid, a size picker, a pickup date, a link for every item) must be true of the finished page (ALY-112) before the setting is switched on.

**As built (ALY-110, 18 Oct 2026; the 30 scenarios, the demo shops and the phone-width pass, `specs/009-catalog-scenarios/spec.md`).** This package built no feature. None of it changes the decision.
- **Scenario coverage is a table, not a belief** (spec 009): each of the 30 scenarios names its tests, "browser run only" or "cannot be automated". 28 are proved by automated tests; 24 by a test for the server and a browser run for the page; 30 (a person with a real phone) cannot be automated.
- **A race test must prove the requests met.** The older scenario-1 test passed with the stock guard removed, because its requests never overlapped. The new concurrency tests hold one transaction open and record, from `pg_stat_activity`, a session blocked on the table under test (`tests/concurrency.py`: `hold_open`, `LockWatch`, `warm`). A test that did not see a block fails.
- **A stress test is part of CI** (`test_catalog_stress.py`, marker `stress`, 50 rounds, about 20 s; `ALYR_STRESS_ROUNDS`, `-m "not stress"`). After every round, stock is not negative, the log adds up to the stored number, nothing is oversold, no order is paid twice.
- **A gap the mutations found:** cancelling one order twice at once (the second cancel giving the stock back again) was caught by no test. Fixed with tests, not code: the code was right.
- **Demo shops** (`alyr.seed_catalog_demos`, `scripts/demo.sh shops`, `docs/demo.md`): seven, one per type that has a Catalog. They are made by the real services as the app role and then moved back in time, so the history cannot disagree with the rules. Photos are tiles drawn at run time (Pillow, already a dependency). The seeder refuses a non-local database and a slug or id that a real shop uses, and deletes only its own seven shops. The Catalog is on for those shops only; `ALYR_CATALOG_FOR_NEW_SHOPS` is not touched.
- **`seed_qirfa` kept the sale of a cancelled credit order.** It now writes the reversal through `ledger.reverse_sale`, the function `cancel_order` uses; `reverse_sale` takes an optional `at` for history written in the past (every real call leaves it out). A shop cancelled before the fix is repaired at the start of every reset.
- **The phone-width pass found and fixed** controls under 44 px, a shop name cut off in the top bar, clamped item names, a warning pill below 4.5:1, misaligned paired fields, English month and actor names in the Arabic UI, and (customer pages, dark mode) primary buttons at 1.2:1. A real screen reader and a real phone were not used.
- **Left open:** the WhatsApp simulator is wired to the Al Noor shop only, so the demo shops' WhatsApp flows cannot be shown live; the Arabic is still a draft (ALY-66); engine log reasons are English in the Arabic UI; prices show "QAR" in Arabic in the workspace.

**As built (ALY-133, 18 Oct 2026; the booking page's signed link, `specs/005-order-page-v2/spec.md`).** Where the code fixed the gap ALY-112 left open. None of it changes the decision.
- **A token says what it is for.** The signed token gained a purpose (order, booking) inside the signature: one token layout and one secret serve both pages, and a token made for one opens nothing on the other. The reason is the same as the reason for tokens at all. The contact's ID is readable inside any token, and a link is a capability, so a link should open only what it was sent to open: an order link that is forwarded, or screenshotted, must not let its holder book as that customer, and a booking link must not open the order page, where the same customer can order on their credit account. `links.mint` and `links.read` take the purpose as a required argument, so no page can read "any token"; the purpose is checked after the signature, so a forged token learns nothing from the answer. The layout is version 2; version 1 (ALY-112's, with no purpose) is refused as malformed rather than read as an order link, so links sent before this stop working (no real customer had one). *Not chosen:* a second secret for booking (two things to rotate, and the purpose inside one signature does the same job), and a header of its own (the header keeps the order page's name, `X-Order-Link`, and carries either kind).
- **A bare contact ID identifies no one on any customer page.** The booking page's `?c=` and `contact_id` are gone: `GET /api/book/{slug}` reads the token (header, or `?t=` for a tool) and answers who the customer is and whether the link was good, expired or not valid; `POST /api/book/{slug}` takes `token` and books for the customer in it and nobody else (a `contact_id` in the body is ignored). The old `?c=` link, an edited or foreign token and an order link all give the same page. The audit of every public route that reads something the caller controls found the booking page and nothing else that identified a customer: the order page was signed in ALY-112, the WhatsApp webhook is signed by Meta, the simulator exists only on a developer machine, a booking's cancel button is checked to be the sender's own, and the staff routes sit behind a session.
- **A public booking link is a place, not a person.** `/b/<shop>` shows the services and the free times to anyone and cannot book; with the shop's WhatsApp number on record it offers "Message the shop on WhatsApp", with the word the chat answers, to get a link of their own. A booking link is sent in one place only, the chat's reply to "book"; confirmations and reminders are plain notices with no link, and the workspace has no "copy booking link". Anything that adds one must use `links.booking_url`.
- **The pay and tracking pages keep their IDs, and say why.** A payment's and an order's ID are random version-4 UUIDs (122 bits), not derived from anything, and open exactly one payment or one order; holding one gives that one page and the other's ID, and does not give the customer's ID, phone number, surname, balance, another order or another shop's page. They are capability links like the signed ones, without an expiry. Two small changes came out of the audit: both answers are `Cache-Control: private, no-store`, and the pay page shows the payer's first name instead of the full name (`docs/hygiene.md`: public links show first names). The reasoning is written in the routes' own comments and in `test_customer_page_ids.py`.
- **A link that does not work is a page, not an error.** An expired or invalid booking link gives a calm page in the customer's language that says so and says to ask the shop for a new one, with nothing to book with; a link that runs out while the page is open turns into the same page. The page opens in the customer's own language (their link says who they are), else `?lang=`, else the phone's, and sends no referrer (the token is in the address).
- **Found, not changed:** the booking page's prices and a confirmed booking's service name are English on the Arabic page (they come from the API unchanged; D-039's Arabic money rule was applied to the order page only); the confirm button on a public link is disabled with its reason at the top of the page.
- **Left open:** one customer's link, booking or order, cannot be ended on its own; the 60-day life (`ALYR_LINK_DAYS`) is shared, and a booking link is worth less than an order link, so a shorter life for it is the founder's to choose; the Arabic of the new words is a draft until ALY-66; rate limits on the public pages are ALY-116.

**As built (ALY-113 part 1, 18 Oct 2026; the Catalog is switched on).** The founder decided on 18 Oct to switch the Catalog on; real users do not exist yet (the company is not registered), so this is a capability demo and nothing here was published. Only code, defaults, a data migration and tests changed; the site wording, hosting, templates and the Arabic review of ALY-113 remain.
- **On for new shops.** `catalog_for_new_shops` (`ALYR_CATALOG_FOR_NEW_SHOPS`) now defaults to true, so onboarding gives each business type its catalog (travel and documents get none) and offers the three types that exist for it. The setting stays: false creates new shops exactly as before the Catalog (tests run both). A business the back office creates also gets the plain Catalog while the setting is on.
- **On for the shops that exist.** Migration 0032 adds the `catalog` module to every existing business except travel and documents, and the `orders` module to a wholesaler (its catalog needs it, ALY-107). It writes nothing else (no setting, category or sample), never touches a module row that already exists (a shop the back office switched off stays off), ignores a row with no modules at all, and can be run again. It was tested on a database built up to 0031 with data in it, as a superuser owner and as an owner that does not bypass row-level security, and on a scratch copy with the demo shops. **The back office can switch the Catalog off or on for one business:** `POST /api/admin/businesses/{id}/modules/catalog` (`{"enabled": false}`), through `admin_set_module`, audited as `module.off` / `module.on`; nothing is deleted and the screens and pages come back when it is switched on again. No screen in the back office for it yet.
- **The review is true.** Each onboarding sentence was proved in headless Edge on the finished order page and workspace for every type, in English and Arabic (`scripts/golive-truth-check.mjs`). Three were not true and are fixed: the fashion line promised a photo for each size or colour (the API has it, no screen or page does; the sentence now says stock only); the alert lines said ALYR messages "your managers" when a new shop has no staff numbers (they now say where to add them, in the settings under Staff on WhatsApp); the fashion link line did not say a customer who opens it is sent to the shop's WhatsApp only once the number is typed in the settings (it now does). Smaller: the grocery list's "plus and minus on each row" is a plus until something is added; a SKU is optional, so the lines say "can have"; a price group is something the owner adds and puts customers in.
- **Nothing says coming.** ALYR Payroll is out of the line-up (`catalog.py`; D-035 and D-037's "coming" entry is superseded as D-039 said): it comes back with its module on the day it works, and the "coming" product state is gone. Also removed from the workspace and onboarding: the locked "take a deposit" and "more than one customer at the same time ... coming soon" rows (onboarding now says one booking at a time, which is true), "for deposits" on the payment-account row, "for now" on the sign-up closed message, "a gateway replaces this before launch" on the test pay page, and "not available yet" on the payment-provider connection (it says "Set up with ALYR", which is how it works). A test (`test_no_unfinished_wording.py`) fails when such wording returns in the API's strings, the product pages' words or the migrations' strings, in both languages; the public site is left to the founder.
- **Settings changes are on the record.** Changing whether agents may edit items, the low-stock number, the order page's WhatsApp number, how long stock is held, the day start, the wholesale table, how sold-out items look, how a new item runs out, the two alerts, the categories, a staff number (added, changed, removed) or a price group (added, renamed, removed) writes a line to `activity` with who made it (`subject = 'catalog'`, `modules/items/changes.py`): what changed, from and to, never a phone number; a save that changes nothing writes nothing; owners and admins read it at `GET /api/items/settings/activity`. No screen shows it yet.
- **Left open:** the pay page is still a test page (no gateway until the company is registered); the six Catalog templates are written and not submitted to Meta, so alerts and "tell me when back" reach a person only inside the 24-hour window until they are approved; a size or colour has no photo of its own on any screen; the Arabic of the changed sentences is a draft until ALY-66.

**As built (ALY-148, 19 Oct 2026; the feature engine, `specs/012-feature-engine/spec.md`; first pull request).** The founder asked for one complete Catalog that is category-agnostic: a business's setup is a configuration (features, wording, layout), changeable at any time, so a new kind of client is served by configuring, not by writing code. None of it changes D-039's decision; it makes the Catalog's per-type behaviour data instead of code.
- **One registry, one table.** `alyr/capabilities.py` lists every feature once (key, English and Arabic name, what it is for, what it changes, group, where it acts, what it needs, its default, an optional value). `shop_features` (migration 0035, row-level security forced) holds what each shop has chosen, with who set it (`template` or `owner`). `modules/items/features.py` resolves "is this on for this shop?" for every consumer: the shop's row, else its template's value, else the registry's default, and never on when something it needs is off. **A shop with no row for a feature gets its template's value, so adding a feature needs no migration.** Owners read "features"; the word "capability" is code only.
- **Core is not a switch.** Names in two languages, photos, price, the stock log, categories, SKU and import and export are always on and listed as "Always included".
- **Extension points are hidden, not announced.** Decimal quantities, cost and margin, discounts, delivery fees, bundles, suppliers, barcodes, batches and expiry, and serial numbers are registered as `built=False`: no words, no API answer, no screen, no template can carry one, and nothing can switch one on. A test fails if one gains text. This keeps the "no coming soon" rule and leaves the places other builders add them.
- **Off hides and stops; it never deletes.** An owner switching a feature off hides its part of the screens and stops it applying to new items; what exists keeps working and stays visible where an item uses it. The API refuses new use with `feature_off` (the item form's parts, a way of running out, a lead time, a price group). Files drop the columns of a feature that is off unless an item still uses it; an uploaded column of one is noted and left out.
- **Templates are one mechanism, built-ins are in code.** The ten business types with a catalog, and a plain "Any other business", are built-in templates (`shop_templates.py`) made from `presets_catalog.py`. A shop of a type behaves exactly as before: `tests/test_feature_engine_identical.py` compares a shop of each of the eleven types, made through onboarding, with a golden file captured from the code before the work (navigation, cards, setup, settings, what the page is told, what the item form accepts, the files' columns, the review). Reason for code, not rows, for the built-ins: they ship with the program, their words are reviewed in `presets_catalog.py` (ALY-66), and a row could drift from the proof.
- **The four unread layout flags.** `pickup_date`, `quick_quantity`, `same_as_last` and `show_sku` were declared per type from ALY-107 and never read; the order page always offered all four. "No shop behaves differently by default" outranks "declared per type", so every type starts with all four on and the declared per-type values (grocery without "same as last time", restaurant without quick quantity and the rest) were removed rather than made real, which would have taken features away from shops that had them. They are now real features a shop turns off (the pickup day is not asked, a row opens the item, no "same as last time", no code). `report_lines` was removed for the same reason; the report's lines follow the features.
- **Found by the proof test.** The first version tied an item's own low-stock number to the low-stock *alert*; the golden comparison showed a restaurant (no low-stock alert) would have lost the field. The number follows the way of running out, not the alert.
- **The old settings columns are inert.** `shop_settings.alert_low_stock`, `alert_sold_out` and `sold_out_display` are no longer read or written (the migration copied them); they stay so an old build still starts. How a new item runs out and the low-stock number stay settings.
- **Merged with ALY-136 (item codes, Order on WhatsApp, 19 Oct).** Both sides kept. The item code is governed by the existing `show_sku` feature (its key and default unchanged; its words now say the item code, and it also covers the code line on the WhatsApp card), and **Order on WhatsApp** is a new feature `order_on_whatsapp` (on for every type, so nothing changes by default; off tells the page there is no number). `whatsapp_mode` stays the shop's own setting. The proof golden was captured again at `ec1a92b` and differs from the first capture in three places only: `settings.whatsapp_mode`, `store_settings.whatsapp_mode` and the export's read-only "Item code (ALYR)" column.
- **Chosen for the order page.** The section's name and the layout style the owner picks are stored on `shop_settings` (empty means the template's, each language on its own) and used by the navigation, the Catalog's title and the customer's page.

**As built (ALY-148, second pull request; custom fields, changing a type, templates in the back office; migrations 0036 and 0037).**
- **A shop's own fields are data on the row, defined in a table.** `custom_fields` (forced row-level security) holds the definition (a key that never changes, names in both languages, a kind, whether it is on the item or on each size, who sees it, searched, needed, an order, archived or not); the values are a `custom jsonb` column on `items` and `item_variants`, keyed by the field's key. Reason for a column and not a table of values: the value is read with the row it belongs to by the list, the order page and the files, is copied to an order line as it is, takes that row's row-level security and stays queryable. The kind is checked in the application against the definition. A field is **archived, never deleted**; its values stay. Kind and place are fixed once made. At most 20 active fields and 30 choices. A name that is already a column of the files is refused. Each order line keeps a snapshot of the fields the customer saw (`order_items.custom`), so an order never changes when a field is renamed.
- **Every consumer follows a field**: the item form ("More details", and a box in each size), the list's search, the customer's page and search for the fields an owner shows, the export, the template file and the import (a column per field, every value checked, undo restores, a required one left empty makes a draft with a note). With `custom_fields` off, nothing is shown or required and no value can be added to an item that has none.
- **Templates made in the back office are rows; ALYR's own stay in code.** `business_templates` is a global table every shop may read and only the back office writes (`is_back_office()`), with forced row-level security. A template made there holds what a built-in holds (features, wording, layout, how an item runs out, categories, starter fields), is validated like the Features screen (a feature that needs another cannot be on without it), is never given a built-in's key, and is archived rather than deleted (archived: not offered to anyone new, shops that use it keep working). Making one starts from a copy of the closest. Each change is on the audit record. Reason built-ins stay in code: unchanged from above.
- **Changing a type only adds, and is previewed.** An owner or admin sees what another template would switch on and add (categories, fields, the section's name and layout), what stays off because they turned it off, and applies exactly what was read (the preview's hash must come with the apply). Nothing is switched off or removed; what the owner set stays as set; items, prices, stock and orders are untouched. The owner's change moves the shop's template (`shop_settings.template_key`), **not `tenants.business_type`** (that decides onboarding steps and the price list); the back office may move both. Owners may choose ALYR's types that have a catalog and the made templates marked "owners may switch to it".
- **Starter fields per type**, none required, so adding an item is as it was. Seeding at a shop's start is not on the activity record; a later change of type is (`template_applied`).
- **Not done, on purpose:** the back office is English only (as the rest of it is); a self-serve sign-up (`/start`) starts from a type, not a made template; import columns are gated per feature coarsely (a column of a feature that is off is left out, with a note); the Settings sheet still shows the old alert and sold-out controls beside the Features screen (the same switches).

**As built (ALY-136, 19 Oct 2026; the Catalog as a support layer: item codes, "Order on WhatsApp", codes pasted into the chat, `specs/010-order-by-code/spec.md`).** The founder's model, 18 Oct: a shop shares its inventory page, the customer browses it and gives the chat an identifier (the link, a short code or the name), the chat answers with the product card and asks them to confirm, and the order flow starts. It works when the shop's number runs on ALYR and when the shop keeps its own number. None of it changes the decision above.
- **Every item has a code**: a number from 101 per shop, in the order items were made, set by the database (a trigger and a counter row, so two items made at once take turns), never changed, never given again, none for an example until the owner keeps it. Not the SKU. Migration 0033 numbered the existing items and, in its first version, numbered every shop's items together when run by a superuser owner (the migration test caught it; every statement now names the shop).
- **The chat reads** an item link, a category link, a code in any of the forms people write (`214`, `#214`, `code 214`, «رقم ٢١٤», several with quantities, a size in brackets), a SKU typed exactly, or a name. **A token with letters and digits (`OUD-12`) is a SKU and never a name**, so it can no longer find an unrelated item with "oud" in its name; a name must fit in every word, numbers included. A card with Confirm and Change comes back (one summary and one Confirm for several items), Confirm fills a draft with a live total, Place order uses `create_order` unchanged (stock, holds, credit account, pay link). Price and stock are read again at Confirm and at Place order and any change is said. Unreadable messages and "talk to a person" go to the team inbox with a polite reply; too many unknown codes hand the sender to a person; the draft and the shop's drafts are capped. State: `chat_carts` (RLS, expiring).
- **"Order on WhatsApp"** (page): a visitor with no link of their own can pick items when the shop has typed its number, and the bar, the list, the item sheet and the review of an ordering customer open `wa.me/<number>?text=` with the order typed. Two shapes, chosen in Catalog settings ("How customers order", `shop_settings.whatsapp_mode`): a readable order (lines, total, name) for a shop that answers itself, **the default** (`link`; the coordinator's call at review: it is the mode recommended, and no real shop has a connected number yet, so a customer's message is something a person reads, not bare codes); codes only, under 140 characters, for a number connected to ALYR (`chat`, always selectable). The chat reads the second back; the first is for a person. The demo shops and the Al Noor demo shop (the simulator's lines are ALYR's) are set to `chat` explicitly.
- **Deviations from the brief, deliberately:** a name that fits several items is one list to choose from (not several cards), and a single item is one card; an item with required extras sends the customer its page (the chat does not ask extras one by one); the "shop prefix" for a shared number is not built (a number is one shop's here); the copy of link-only orders in the team inbox is not built (the visitor has no contact).
- **Left open:** Instagram's in-app browser and a real phone were not tried; the Arabic is a draft until ALY-66; the mode is the shop's own choice; a shop that gets its number connected (Embedded Signup, ALY-39) should switch to `chat`.

**As built (ALY-149, 19 Oct 2026; decimal and weight quantities, the first feature pack, `specs/013-decimal-quantities/spec.md`; first pull request: storage, the stock engine, the checkout, the API and the files).** Quantities were whole numbers everywhere and the unit `kg` was a label, so a customer could not order 0.5 kg of dates or 250 ml of oud and a shop could not hold 12.5 kg. The founder's rule for packs: one core system, everything specific to a trade a switchable feature, a shop that does not use it unchanged. None of it changes D-039's decision.
- **A quantity is an exact decimal with three places.** `numeric(14,3)` in PostgreSQL (migration 0043, tested on a database built to the migration before it with orders, holds and a stock log, as a superuser owner and as one that does not bypass row-level security), an `int` when whole and a `Decimal` otherwise in Python, a JSON number on the wire (a string is accepted too), thousandths as whole integers in the web. **Never a float:** a float given to a `numeric` parameter raises, and the web never adds, compares or multiplies two quantities with `+`, `<` or `*`. *Reason for the Python shape:* the database connection reads every `numeric` as an `int` when it is whole (`db.py`, `qty.decode_numeric`), so stock `3` is the `3` it always was and code written for whole numbers keeps working; only a fraction needs to know it is one. *Reason for installing a JSON rule:* FastAPI writes a `Decimal` as text in a route that returns a `dict`, and Starlette cannot write one at all in an error answer, so `qty.install_json` makes every answer (and every refusal's `detail`) write a quantity as a number.
- **One rounding rule.** A line is the price of one times its quantity, rounded half up to a whole dirham, once per line; an order is the sum of its rounded lines (`qty.line_total`; the web's `lineTotal` is the same rule in thousandths, and both are tested against one table, `specs/013-decimal-quantities/rounding.json`). It is the Documents engine's rule (`modules/documents/money.py`), so an order and the invoice made from it agree to the dirham. Three halves of a dirham are three dirhams, not two.
- **The step and the smallest order are the item's `pack_size` and `min_order`.** No new column: both became decimals (`min_order` is now "above zero"), and the rule is one function, `qty.check_lots`. A kilo with no step is sold in whole kilos, as it always was; an owner opts an item into fractions by giving it a step such as 0.25. Only a measure (kg, g, litre, ml, metre, tola) may hold a fraction: the database refuses one on a counted unit in an item's step and smallest order and in an order line (check constraints) and in a size's stock, daily limit and day's allowance (a trigger that looks the item up only when a fraction is written).
- **The feature `decimal_quantity` ("Sold by weight or volume") is off for every shop that exists** (migration 0043 writes an OFF row for each) and on for a new grocery or bakery. *Reason:* the founder's rule that existing shops behave identically; a template's value would have switched it on for an existing grocery's form. A perfume or oud shop is "Shop & retail" and switches it on in Features. Off hides and stops, never deletes (the new units and a fractional step are refused for a new use with `feature_off`; what exists keeps working). The golden comparison of the eleven types (`tests/test_feature_engine_identical.py`) did not need regenerating.
- **The unit is written beside a quantity only when the item is sold in fractions** (`quantity.show_unit`): "0.5 kg x Medjool dates", and "1 kg" for the same item; a kilo item sold in whole numbers still reads "3 x Rice". An order line keeps its unit and whether it was shown (`order_items.unit`, `unit_shown`; older lines read as they did). *Reason:* an existing item whose unit is `kg` must read exactly as before.
- **Found by the tests, fixed here:** the Documents engine read `numeric(12,3)` as a `Decimal` and the new connection codec gave it an `int` (its hash and its PDF would have changed; it now reads `Decimal(...)`); a pack size up to 100,000 had no service check and the first version of the new one refused it; a thousands comma in a quantity ("1,2,3") was read as 123.
- **Merged with the pricing pack (ALY-150).** Its arithmetic (`orders/totals.py`) already read a quantity as an `int` or a `Decimal` and rounded half up once per line, the same rule as `qty.line_total`, so a discount, a delivery threshold and a margin on 0.333 kg agree with the page to the dirham (`tests/test_decimal_pricing.py`). Two SQL sums did not round per line and now do: the margin's revenue in `items/costs.py` and the weekly report's in `items/report.py` (`sum(round(price * quantity) - discount)`). An order line keeps its unit and its discount side by side (`order_items.unit`, `order_items.discount`).
- **Part 2 (screens and chat).** The web does no floating-point arithmetic on a quantity or an amount: `_customer/qty.ts` reads typed text, counts in thousandths and rounds a line with the same rule as `qty.line_total`, tested against `rounding.json` and against `messages.json`, the messages the order page writes for a fraction that the chat's reader must read the same way. The quick amounts and the typed amount appear only for an item whose unit is shown (`quantity.show_unit`, which is true for a measure sold in fractions and for g, litre, ml, metre and tola whatever the step); a quantity beside a unit reads number first in Arabic too (`dir="auto"`, not `ltr`). The chat reads a decimal after an item code in English and Arabic numerals and with `.`, `,` or `٫`; a stock command takes decimals and its undo puts back exactly what it took. Found in the browser: an Arabic hint wrote the English unit (`kg`), the new quick-amount strip reused the category chips' class and got their sticky bar, a price said "per" with no unit for a kilo sold whole, and a review stepper was 40 px wide (now 44).
- **Not done:** the weekly report's "best sellers by units" adds quantities of different units together; a gold price that moves each day is a pricing rule (the pricing builder's work) and nothing converts a tola to grams; barcodes and scales; the Arabic is a draft until ALY-66.

**As built (ALY-150, 19 Oct 2026; the pricing pack: discounts and coupon codes, delivery and pickup, cost price and margin, `specs/014-pricing-pack/spec.md`).** The audit of 18 Oct found the gaps: only a dated sale price and customer-group prices; no coupon codes or cart discounts; an order carried `fulfil_on` and `table_label` and no delivery; items had no cost, so no margin. The founder's rule holds: one core system, everything specific to a kind of business is a switchable feature he turns on for a client, owners never see the word "capability". The registry's old extension points `discounts`, `delivery_fees` and `cost_margin` are built as **"Discounts and coupon codes", "Delivery and pickup" and "Cost price and margin"**, **off by default for every shop and every template**, so no existing shop behaves differently (`tests/test_feature_engine_identical.py` and its golden file are unchanged). Three pull requests that stand on each other (migrations 0040, 0041, 0042; no new dependency; no new template).
- **Money.** Whole minor units (dirhams) in `bigint`, as everywhere in ALYR (the brief asked for "numeric in SQL" for money; the whole database holds money as integer minor units, which is exact and is what every report and payment already reads); a percentage is `numeric(6,3)` and `Decimal`; a float is refused (`totals.line_total`). **One rounding rule:** a percentage is worked out once per rule on the amount it applies to and rounded half up to a dirham; the whole discount is shared among the lines by largest remainder, so the lines add up exactly. A line's price is `round_half_up(quantity x price)`, so spec 013's decimal quantities change one function.
- **Order of things.** The Catalog decides an item's price (a customer group's price replaces a sale price, spec 003; the brief wrote "the better of the two", which would change what shops charge today, so the merged rule stays and this says so); discounts come off the goods one rule after another on what is left; delivery is added and never discounted; `total = subtotal - discounts + fee`, kept by a database check. **The goods never go below QAR 1.** What is shown is what is charged: one function (`orders/totals.py`) prices the review, the chat's draft and the order, the page sends `expected_total`, and an order that comes to something else is refused with the new figures.
- **Coupons.** Percentage, amount or "buy N get M free"; whole order or chosen items and categories; minimum order (on the goods before the discount); total and per-customer limits; dates; a price group; stackable or not. Two applied rules must both be stackable, else the one taking most off wins. Automatic discounts need no code. Uses are claimed by a conditional update inside the order's transaction (`uses < usage_limit`), so a limited code cannot be over-used (the table also checks `uses <= usage_limit`); cancelling an order, however it is cancelled, gives the use back once. What an order was given is a snapshot (`order_discounts`); editing a rule never rewrites an order. Orders of one shop are numbered one at a time behind an advisory lock, so two orders for the last use also queue there; the conditional update is proved on its own, without that lock.
- **Delivery.** Pickup on or off, delivery on or off, zones (fee, free-over, minimum, days, cut-off), a flat fee that is the whole delivery with no zones and "Other areas" with some. No maps, no geocoding, no dispatch: a zone chosen from a list and an address in words. Free-over and the minimum are judged on the goods after discounts. The fee is its own line, kept on the order with the zone's name as it was. Chat: "Pickup or delivery?" with buttons, then a list of areas, then the address. The approved order template carries only the total, so the plain confirmation (inside the 24-hour window) is the one that lists the fee.
- **Cost.** Costs live in tables of their own (`item_costs`, `item_cost_history`, `order_item_costs`), not in `items`, sizes or order lines, so no existing reader can show one by accident; the owner-only routes answer 403 to agents whatever the switch; the export, template and import carry the column only for owners and admins of a shop that keeps costs; the report goes to owners and admins. `tests/test_cost_leaks.py` walks 35 places an agent can read, the files, the chat and every message the shop sent. A price under the cost is a warning, never a block. Orders keep the unit cost at the time; extras are not counted in a margin (their cost is not kept).
- **A shop needs the Catalog's order page.** The three features act only where the `catalog` module is on; a shop with the older page (orders without the Catalog) is given none, so the page never shows a different total from the one charged.
- **Also changed:** documents made from an order (ALY-139) carry each line's discount and a delivery line; the demo reset clears the new tables; the Features screen's counts say how many discounts, areas and costs a shop has.
- **Left open for the founder:** whether a group price should instead give way to a lower sale price (today it replaces it); the Arabic is a draft until ALY-66; nothing was tried on a real phone; "buy N get M" works per line only; the cost of priced extras.

## D-040 · ALYR's look is Carbon and Volt, and its values live in one token file
**Date** 17 Oct 2026 · **Status** Accepted (founder, 17 Oct: Carbon and Volt is the brand, ALY-61) · Linear ALY-61, ALY-126 · Replaces the open question in D-025

**The decision.**
- **Carbon and Volt is ALYR's brand.** The design system v1.0 look stays: uppercase ALYR, the Command Fold logo with its redrawn R, Carbon, Volt, Paper, Instrument Sans, IBM Plex Sans Arabic and IBM Plex Mono, the 45° cut. **The playbook's visual identity is retired:** cobalt blue, a colour per product, lowercase "alyr", the rounded "a" mark, Bricolage Grotesque and Geist. The playbook's positioning, voice and content plan still apply (D-025's left column).
- **One source for every value.** `design/tokens.json` (DTCG-style, `design/README.md`) holds every colour in light and dark, the faces, the type scales, spacing, radii, rules, the cut, shadows, motion, breakpoints, z-index and focus. `scripts/tokens-build.mjs` generates the CSS custom properties, a TypeScript module and a Python module from it; nothing else defines a colour or a font. `scripts/design-check.mjs` fails CI on a hard-coded hex colour or font name in site, product or renderer code, with a short list of exceptions in `design/allow.json`.
- **The semantic names are the API**: canvas, surface, text, text-muted, line, volt, on-volt, band and the rest. Pages and screens use those, never a primitive.
- **The product screens use the same tokens and follow the public site's theme switch** (`data-theme`, stored as `alyr-theme`), as briefed for ALY-126. With it, three visible changes to the workspace, onboarding and customer pages: the canvas is Paper (was #eceee9 in light), the dark surfaces are the site's (#0e1012, #15171a, #1b1e22 instead of #0a0b0d, #131518, #1a1d21), and type sizes sit on one scale (11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 36, 56 px; half pixels rounded up).
- **Not changed:** the public site, the report card and the social cards look exactly as before (pixel and byte comparisons in `docs/design-system/01-tokens-log.md`). The logo's master files stay on the design-system branch until ALY-124 moves them.

**Why.** The values had been copied by hand into eleven places, with one name meaning two colours (`--canvas`), two curves under one name (`--ease`), three focus styles and thirteen near-blacks where the brand names three (`docs/design-system/00-audit.md`). The design skills (ALY-126) need one file to read, and a check that keeps it true.

**Still open, for the founder.** Whether product buttons take the 45° notch (the workspace's four button systems are the next step); the Arabic spelling of the name.

---

## D-042 · Documents: one engine for receipts, invoices, quotes and the rest
**Date** 19 Oct 2026 · **Status** Accepted (founder, 19 Oct, in chat: build it; free now and metered later like the Catalog; bilingual by default with Arabic first for consumer sales; shops' documents first, ALYR's own client invoices later on the same engine) · Linear ALY-137, ALY-138 · Spec `specs/011-documents-engine/spec.md` · Does not change D-008 (e-invoicing stays parked). (The number: D-040 is the design system and another open pull request, ALY-130, also wrote D-040 before that merged; D-041 is left for whichever renumbers.)

**Where we were.** A shop could not hand a customer anything with a number on it. ALYR's orders, bookings and credit ledger know what was sold and paid, and nothing turns that into a receipt or an invoice. The plan has an invoice for ALYR's own clients (`docs/internal-tool.md`) and a customer who asks a Qatari shop for an invoice expects Arabic on it.

**The decision.**
- **One engine, three ways in and two ways out.** Documents (receipt, invoice, quote, delivery note, statement, credit note, deposit receipt, proforma) come from ALYR's own orders and bookings, typed by hand, or sent by another system; they leave as a link, a PDF to send or print, or an export. Package 1 (this one) is the engine; the ways in and out are later packages.
- **Gapless numbers per shop, kind and series**, taken under a row lock in the issuing transaction, so a failed issue gives its number back. With an optional prefix and a yearly restart.
- **Branches and cash rounding** (added to the issue on 19 Oct). A shop's places each have their own series (the kind's prefix plus the branch's code, `INV-0042` and `INVLUS-0007`) and may put their own address and phone on the paper. A shop may round the cash total to the nearest 5, 10, 25, 50 or 100 minor units; the difference is a line of its own on the paper, never hidden in a price. A currency is per document (QAR by default; display only, no conversion). The paper of a shop with no CR number says ALYR gives no tax advice.
- **Issued paper cannot change.** The database refuses (a trigger the application role cannot disable), not the application. The only thing that happens to an issued document is that a credit note covering all of it voids it; nothing is deleted. The content is hashed (SHA-256 of canonical JSON) so any change is detectable and a later e-invoicing serializer has a clean, sequential, verifiable record (D-008).
- **Seller and customer are copied onto the document at issue**, with every line. A later change to a price, a customer or the shop's registration number never rewrites a paper someone holds.
- **Arabic is on every consumer document**, Arabic first by default; it cannot be switched off for a consumer (refused when settings are saved, when a draft is made and when it is issued). A business document may be English only. Formal Modern Standard Arabic; Western digits; «ر.ق» after the amount. The wording is a draft until a native review (ALY-66).
- **A shop with no commercial registration number issues receipts, not invoices**, and each says it is not a tax invoice. "Tax invoice" is used only for an invoice that carries tax and a tax number; tax is in the model and off by default (Qatar has no VAT today).
- **The PDF is drawn by fpdf2 with HarfBuzz and kept in the database**, not in R2. Chosen after trying WeasyPrint, reportlab with a shaping layer and (on paper) headless Chromium: the only one that is right on Arabic and installs from wheels, so CI and the image stay as they are. The brand's own fonts, embedded, nothing fetched while drawing, the same bytes for the same input.
- **Free now, metered later, like the Catalog.** The module `documents` is in `catalog.py` and off for every shop; it is in no product and no starting setup, and has no screen, until packages 2 and 3 (the sales hooks and the workspace screens) are built. The back office can switch it on for one shop to try it. No "coming" wording anywhere. The table already has what a meter needs (shop, kind, date of issue); no charge and no meter is built, and none is charged without the founder's decision through the price list and per-client quote of D-032.
- **Roles follow the Catalog's.** Owners and admins do everything. Agents make drafts and see their own; they may issue only when the shop has allowed it (off to start) and only their own drafts; they never see the shop's takings or change settings, numbering or credit notes.

**What it changes in earlier decisions.** Nothing is overruled. `docs/data-residency.md` already said R2 is for public photos and never documents; this keeps to it, which is why the PDF is in the database. D-039's rule that nothing "coming" is shown to an owner or customer applies.

**Rejected.**
- *The PDF in R2.* It would put customers' names and phone numbers outside Qatar (hard rule 2), and the number, PDF and hash could not commit together.
- *WeasyPrint.* Slightly better diacritics and CSS tables, but it needs Pango on the machine: an `apt-get` step in CI and in the image, for a difference nobody sees on paper.
- *A Postgres SEQUENCE for the number.* It does not roll back, so a failed issue would leave a hole.
- *Renumbering or editing an issued document to correct it.* A correction is a credit note and a new document.
- *Calling every sale an invoice.* A shop with no registration number cannot issue one; it issues a receipt.

**Not confirmed (flagged in the spec).** The exact wording of the ministry's Arabic-invoice circular (Arabic as the *main* language, or in addition); the record retention period (ten years is a secondary source, ALY-51); whether an unregistered seller may issue an invoice at all. Until the lawyer answers: Arabic cannot be switched off, a consumer document that leads in English is allowed and warned about, and nothing issued is ever deleted.

**Revisit when.** The lawyer answers (ALY-51); the General Tax Authority publishes the e-invoicing specification (D-008); volume makes the documents too heavy for the database (then a Qatar object store behind `core/storage.py`); a connected POS issues in bursts (draw before the lock); a country pack needs tax-inclusive prices.

**As built (ALY-139, 19 to 20 Oct 2026; package 2: receipts and invoices from sales, payments by hand, delivery; `specs/013-documents-sales/spec.md`).** Where the code settled what the issue left open. None of it changes the decision.
- **Sales make documents through one door, behind a savepoint, with a key.** `modules/documents/sales.py`: a receipt when an order is paid (the payment link's report), an invoice when an order goes on a customer's credit account, a receipt for a payment on a credit account (`ledger.add_entry` is the one door, so staff in the chat and the payment link both come through it), and a credit note when an order that has a receipt or invoice is cancelled (`orders.service.cancel_order`, in its own transaction). Each is issued with a key made of what it is for, so an event that fires twice or at the same moment finds the document that is there; each runs behind a savepoint so a document that cannot be made (no CR number for an invoice, the PDF engine down) skips itself with a reason on the activity record and the sale goes on. A shop without the module pays one `select`, and nothing else. *Chosen over* a hook in the payment webhook (the payment link has no webhook yet; the ledger and the order service are the doors that exist) and over a background reconciliation job (it would issue documents later than the sale and could not share its transaction).
- **A document is the shop's, whoever pressed the button.** The documents of a sale are issued as the shop, with the person's name on the paper (`issued_by`): an agent the shop lets record payments may issue the receipt that goes with one without being allowed to issue documents. Automatic ones say "ALYR".
- **Payments written by hand are their own append-only record** (`manual_payments`), not a change to the order or the ledger alone: it holds who, when, how, the reference and the key, a trigger refuses any change to it (the receipt it produced is the one thing written later), and the receipt is a function of the row, so a payment recorded without a receipt can have one made afterwards. `receipt` and `send` can be said per request; the shop's three "auto" switches decide the rest. Bookings have no payment step, so a booking is paid only this way: a part-payment makes a deposit receipt, the payment that completes it a receipt that lists every payment.
- **Delivery state is read, not copied.** A WhatsApp delivery reads its `messages` row (queued, sent, delivered, failed, blocked), which Meta's reports already keep true; an email keeps its own. The owner sees one word per document (`none`, `queued`, `sent`, `delivered`, `not_delivered`). One automatic delivery per document and channel is a unique index; staff can send again as often as they like and each press is on the record. *Chosen over* storing a second copy of the status in `document_deliveries` and updating it from the webhook: two truths drift.
- **A document goes out as a PDF inside the window and as a template outside it, and a customer who said stop gets neither.** The outbound layer learned a `document` kind (`OutboundMessage.document`, `filename`; stored in `message_media` as `application/pdf`; uploaded with the Media API at send time, never hosted, because it is private) and the template payload learned a document header. `consent.refusal` refuses a document message to a customer who revoked service consent even inside the window (the other free-form kinds are not refused, a pre-existing rule). Three templates, `document_receipt`, `document_invoice` and `document_credit_note` (the third is one more than the brief's two: "your receipt" is the wrong word for a refund), are written and **not submitted**. The shape of a template's document header parameter is from Meta's document-message page and integrators' documentation; Meta's page for template headers did not load, so it is **unconfirmed** until the first approved template is sent.
- **The hosted link is a third purpose of the existing token.** `links.DOCUMENT`: the ID inside is the document's, the purpose and the shop are inside the signature, the life is `ALYR_DOCUMENT_LINK_DAYS` (90, not the order link's 60: a receipt is looked for later), and the page and its PDF read it from the header `X-Order-Link` like the order and booking pages. An order or booking link opens nothing there; a document link opens nothing on those pages. No bare ID is read anywhere. The page shows the document and a Download PDF button and says nothing about the customer (the PDF has their name; the page may be forwarded). It is `noindex` and `private, no-store`. *Not chosen:* a stored link row per send (a token needs none; ending one link on its own is still not possible, as for the others).
- **Email is plain on purpose.** The PDF attached, a subject in the customer's language, a text twin, "Qirfa Bakery via ALYR" as the sender with replies to the shop, no logo image (where the logo is hosted is a founder decision, `alyr-email`), no button, no tracking, light only. A customer's address is on file in `contacts.email` (nothing collects one yet; `PUT /api/documents/customers/{id}/email`; ALY-53 owns the screen) and the guard against example domains moved from the weekly report into `core/mail.py`, where both use it.
- **Left open:** the three templates are to be submitted by the founder; a real send to a real phone and a real email have not been made; the 90-day life of the link; a booking cancelled does not cancel its receipt; a cancelled invoice does not take its sale off the customer's ledger; the workspace screens for all of this (ALY-146).

**As built (ALY-146, 20 Oct 2026; package 3: the workspace screens; `specs/015-documents-screens/spec.md`).** Where the code settled what the issue left open. None of it changes the decision, and the module is still off for every shop.
- **A PDF is shown as pictures of its pages.** A phone cannot be trusted to show a PDF inside a page (Android's Chrome offers a download, iOS Safari shows one page in a scrolling frame) and a screen reader gets nothing from one. `GET /pdf?format=png` and `POST /preview?format=png` draw a page of the real bytes with PDFium (`render/raster.py`, a lock around it because PDFium is not thread-safe, never stored); the PDF is a tap away. *Chosen over* an `<iframe>`/`<object>` with a fallback (three branches to test on devices we do not have), pdf.js (a new front-end dependency) and an HTML redrawing of the paper (a second layout that would drift from the first). Cost: `pypdfium2`, which the tests already used, is a main dependency now.
- **The settings preview is the engine's, with the settings that are typed.** `POST /preview` takes `settings` (owners and admins), runs them through the checks saving runs, and draws; nothing is stored and no number is taken. The form sends only what changed and takes a colour only when it is whole.
- **"Paid" is read, never stored on an issued paper.** An invoice's paid amount now is its paper's payments plus the payments recorded by hand against it (`manual_payments`), and the list, its filters, the totals and the home cards all read it that way. A payment into a customer's credit account by link, chat or balance is **not** matched to an invoice, so such an invoice still reads unpaid: left to the founder (match oldest first, or let staff match by hand).
- **The two home numbers and the lists they open are one query.** `listing.PRESETS` names the filters; `counts` and the list build the same `where`; a test compares them, and the delivery filter in SQL with the delivery summary in Python. An agent sees neither card (the cards are the owner's money; an agent's list holds only their own papers).
- **A copy of an issued document on another paper** is drawn from the stored content (the seller copy in the row, the lines) and never stored; the issued PDF, number and hash do not change. A logo that is not the one the paper was issued with is left off a copy.
- **The address carries the screen** (`?d=`, `?edit=`, `?view=settings`, `?show=`), so Back works and a refusal can send the person to the registration field.
- **Left open:** matching credit-account payments to invoices; a screen for a booking's deposit; the Arabic by a native reader (ALY-66); a real phone, printer and roll; the product lead switching the module on.

**As built (ALY-142, 20 Oct 2026; package 5: connected mode; `specs/016-documents-connected/spec.md`, `docs/connect-api.md`).** Where the code settled what the issue left open. None of it changes the decision.
- **Who owns the numbers is a per-shop, per-kind setting, and ALYR never numbers what the other system owns.** `document_authority` (`alyr` by default, `external`). For `external`, a document carries the other system's number (series `EXT`, no counter, not gap-checked) and its PDF says it was issued by the seller's own system and delivered by ALYR; ALYR's own hooks for that kind **skip and say so** on the activity record (`external_authority`) instead of issuing a non-fiscal "order confirmation" (the simplest correct behaviour: nothing is on paper twice, and the other system issues the receipt when it rings the sale up). The rule is kept in the service, in the numbering path and **in the database** (`documents_guard` refuses an ALYR number for a kind the shop gave away, and an outside number for a kind that is ALYR's), so the engine's guarantees for ALYR-numbered paper (gapless, immutable, hashed) are as they were; the hash of an outside document commits to who numbered it and no earlier hash changes. *Chosen over* a second table of outside documents (it would have duplicated lists, hash, PDF, delivery and the hosted page) and over letting the other system's number live in `source_ref` with an ALYR number beside it (two numbers on one sale is the double paper this exists to prevent).
- **A sale from another system is one door, `ingest.accept`, used by the API and the CSV import.** Idempotent by key and by (kind, external sale ID); the paper's total is the total the till printed (a difference of up to a minor unit a line is shown as the document's Rounding line, more is refused with both numbers). The customer is found or made by phone; the Catalog link is recorded and no stock moves.
- **Consent for a customer who never wrote to the shop is the shop's assertion, recorded.** The owner confirms four sentences once (versioned); a sale that asks for delivery records, on a customer whose consent is unknown, a `service` consent with source `connected_sale`, the assertion, the terms' version and the key's public prefix. Marketing is never granted this way, and a customer who said stop is never messaged whatever the shop asserts. *Open for the lawyer (ALY-51):* whether a settings-screen confirmation is enough as the opt-in. *Chosen over* asking each customer by a first message (WhatsApp forbids starting the conversation without the opt-in, so that is circular) and over treating the sale as consent (it is not).
- **The three document templates are not approved by Meta, so outside the 24-hour window delivery says so at once.** `ALYR_DOCUMENT_TEMPLATES_APPROVED` (default off) makes the job record `blocked: template_not_approved`, tell the shop's webhooks (with the hosted link) and fall back to email. Nothing is submitted to Meta by this package; the founder switches the setting on after approval. The ALY-139 tests assume the approved world (conftest sets it).
- **API keys authenticate a machine and nothing else.** Hash of a 256-bit secret, constant-time compare, prefix to find the row (a policy on `api_keys` lets one row be read by its prefix before the shop is known, as `memberships` does for sign-in), scopes, revoke, a per-key rate limit in the key's own row (one atomic update, fixed one-minute window, 429 and `Retry-After`; no Redis), every management action audited. *Not chosen:* a Redis limiter (a new moving part for a till's traffic) or a per-IP limit (a POS shares one address).
- **Webhooks are written in the transaction of the event, signed, retried through the job queue, logged and guarded against SSRF.** HMAC-SHA256 over `<timestamp>.<body>`, eight attempts over about ten hours, a switch-off after ten failures and a day without success with an email to the owners, no customer data in the payload, and a guard that refuses anything but a public https name, re-resolves at send time, connects to the IP it checked, follows no redirect and reads 2 KB. *Rejected:* delivering webhooks synchronously inside the request (a slow receiver would hold a sale open).
- **Undoing a CSV import withdraws; it never deletes.** Issued paper is never deleted (D-042). A document another system numbered, never sent, with no credit note against it, can be marked withdrawn (the one change the immutability guard allows besides voiding): it stays on record with its number and PDF, leaves the lists and the hosted page, and gives its number and sale back so a corrected file can be imported. A document ALYR numbered is never taken back (a gapless counter), and an import that sent anything or voided something cannot be undone.
- **Left open:** the templates are to be submitted by the founder; a real WhatsApp send, a real email and a real POS have not been tried; the lawyer's answers (opt-in by settings screen; an invoice rendered for a shop with no CR number from another system's data); the Arabic is a draft (ALY-66); the hosted page does not yet say a document is the other system's.

---

## D-046 · The public site adds ALYR Shelf and ALYR Docs; Payroll leaves it; "Set up for you"
**Date** 21 Oct 2026 · **Status** Accepted (founder, 20 Oct, in chat; recorded in `docs/site-products-2/00-founder-decisions.md`) · Linear ALY-205 · Updates D-037. Numbered D-046 because open pull requests take D-043, D-044 and D-045 (and D-041 is left for a renumber).

**The decision.**
- **Two new product pages, in both languages:** `/shelf` for the Catalog under its public name **ALYR Shelf** ("Everything you sell, on one shelf."), and `/docs` for Documents under its public name **ALYR Docs** (receipts, invoices, credit notes and the rest). Code, decisions and the workspace keep "Catalog" (Menu, Products, Price list) and "Documents" / «المستندات».
- **Both go live together, once approved,** although the Documents module is still off for every shop. So the Docs page never says or implies it is available: no "today", "now", "live", "turn it on", and never "coming". It is set up with the shop, like every ALYR product.
- **The suite's order is Chat, Bookings, Agent, Accounts, Shelf, Docs** (the fixed order, then `catalog.py`'s module order), in the Products menu, the footer, the suite section and every "works with" row.
- **Payroll leaves the site** (menu, footer, suite, works-with rows) until it is built (D-039).
- **States:** "Early access" becomes **"Set up for you" / «نجهّزه لك»** on every product; ALYR Agent and ALYR Shelf say **"With every product" / «مع كل منتج»**. ALYR Shelf is included with ALYR, not priced on its own (D-039); with the offer switch on, the "QAR 150 for each product you add" lines name ALYR Chat, ALYR Bookings and ALYR Accounts only.
- **The "agentic" feel comes from what the products do on their own:** stock counted on every sale, the last item sold once, a sold-out item leaving the order page, a receipt issued when a payment is recorded, gapless numbers, paper that cannot change. No AI words.

**Why.** Shelf and Docs are built (D-039, D-042) and are what an owner asks about at the visit: what I sell and what I hand over. A product that is not built is not shown at all (D-039), so Payroll goes rather than staying as "coming".

**Open for the founder.** Publishing (the go-ahead each time), the Arabic review (ALY-66), the manual name check of Qirfa Bakery, and the [F] lines in `docs/site-products-2/02-messaging.md` (routes, the Docs "Not yet" line on tax and e-invoicing, whether ALYR Docs can be a shop's first product when prices are on).

## D-047 · The homepage leads with the owner's problem, and shows the agent honestly
**Date** 22 Oct 2026 · **Status** Accepted (founder, 22 Oct, in chat: "Agentic, shown honestly", then "implement this") · Linear ALY-154 · Updates D-037 and D-046. Source: the homepage improvement table (Claude Doc, 22 Oct).

**The decision.**
- **The homepage opens on the problem, not on ALYR.** H1 "Stop losing orders in the chat." / «لا تدع الطلبات تضيع في المحادثة.», with one plain line under it: "ALYR works as your agent in WhatsApp, by rules you can check. You run the business." The real ALYR Agent dashboard and the feed of what ALYR did stay beside it.
- **The order of the page:** hero (with a row of business chips) · everyday problems, each with its fix and its product · your business, as tabs (your day today, the same day with ALYR, what you would use, a contact button with a message for that business) · one order start to finish (the `/chat` flow figure, told for Sara at Qirfa Bakery, and who did what: 5 messages by ALYR, 3 presses by Yusuf, 0 orders copied by hand) · ALYR Agent explained · how we set it up and stay (what we need from you, when you start, every month) · the products · price (offer on) · trust · questions (six shown, the rest under "More questions").
- **"Agent" is shown, never claimed.** The word appears only beside its rules ("by rules you can check", a rule line, a count). No AI words on the page, no «وكيل» in Arabic (the Arabic says ALYR «تتولى عنك العمل المعتاد»), no "agentic", and no "Is it AI?" question. The flow shows only steps that are built, so it needs no "next" markers.
- **What the table proposed and the page leaves out, because it is not true yet:** a reply-time promise, a named person, "hosted in Qatar", the commercial registration, card payments as live, the Sunday report as running, a founding offer or a 14-day refund, a "Coming next" row. The existing honest notes (one booking at a time, no table bookings) stay.
- **Trust:** "Consent, on record." (ALYR checks consent before any message it starts) and "Built never to hold your money" replace "Stop means stop" and the languages fact; the platform line says "is built on" WhatsApp's official Business Platform.

**Why.** An owner recognises their own problem faster than a product name, and the founder's brief was that every business should find its problem and see its day with ALYR. Showing the agent through what it does, with its rules and counts beside it, is the only version that stays true (D-039, the honesty rules in `.claude/skills/alyr-design/honesty.md`).

**Open for the founder.** Publishing (the go-ahead each time), the Arabic review (ALY-66, the new sections roughly double the homepage's Arabic), and the table's open questions (the WhatsApp number and reply promise, a named person, the setup fee). The product-page template from the table is ALY-208.

## D-048 · ALYR is the small business's tech team; the homepage says so
**Date** 23 Oct 2026 · **Status** Accepted (founder, 23 Oct, in chat: ALYR "is not just WhatsApp" but "a company that helps small businesses in their 0 to 100 about tech", "like a complete business suite, with continuous audit and insights and optimization suggestions and products"; then, on the reimagined homepage and its audit, "implement it") · Linear ALY-210 · Updates D-047 (the hero and the order of the page). Source: the reimagined homepage and its word-by-word and visual audit (Claude Doc, 23 Oct).

**The decision.**
- **Positioning.** ALYR is the technology team an owner-run business never had: what consultants and an IT team do for a big company, done for a small one. WhatsApp is one product and the way in, not the whole company. The homepage's H1 is "The tech team your business never had." / «فريق التقنية الذي لم يكن لدى مشروعك.», and its one action is "Book a check-up" / «احجز فحصاً لمشروعك» (the header says "Check-up" / «احجز فحصاً» below a laptop's width).
- **The work is a loop:** check, set up, see, improve, then check again. The check-up is the visit we already make; nothing new is promised beyond it. "Every month we go over your numbers with you" is promised; it is easy to drop if the founder does not want it.
- **The order of the page:** hero · Why ALYR (a big company, you today, with ALYR, four rows) · how we work (the loop) · what a check-up finds (six shown, the rest folded) · your business · one order, as proof · insights (ALYR Agent) · the products · price (offer on) · trust · questions.
- **Plain words.** "Rule" becomes "reason" or "why" on the homepage: the feed's "Flagged by rule" is "Needs a look", and its rule line starts "Why ·". The product itself keeps its own words. No AI words, as in D-047.
- **Not stated:** the check-up's price (the setup fee is quoted at the visit, as before).
- **Visual audit applied:** the pinned panels on desktop go from seven to two (the products' room only); the agent's whole screen on phones stops after its five numbered parts; links to a section land under the header.

**Why.** The founder's brief: small businesses need what big ones buy from consultants and IT teams, and ALYR is that, with products to back it. Leading with WhatsApp made ALYR look like one tool. The loop is how the work already runs (set up for you, changes whenever asked, the weekly view), so it can be said without a new promise.

**Open for the founder.** Publishing (the founder's go-ahead each time); the headline pick; whether the check-up is free; whether to keep the monthly look at the numbers; the Arabic review (ALY-66).

**Update, 24 Oct 2026 (founder, in chat, on the site audit; `docs/site-audit/00-decisions.md`, ALY-223).** The homepage is folded, against the order above:
- **What a check-up finds** leaves as a section: its six problems become each business tab's "Today" list in By business (each tab's list in the problems' own words, row for row with its "With ALYR" list), so the visitor meets the problems in their own trade.
- **Why ALYR** leaves as a table: its strongest line goes into the hero lead, "Big businesses have consultants and an IT team for this. You have us: we check how your business runs, set up what it needs, and keep improving it with you." / «للشركات الكبيرة مستشارون وفريق تقنية لهذا العمل، ولمشروعك ALYR: نفحص كيف يسير عملك، ونجهّز ما يحتاجه، ونواصل تحسينه معك.»
- **The products** are six plain rows, no longer pinned (the audit's L1), so the homepage has no pinned panel on desktop.
- **"Book a check-up"** is the one action name on every page, product pages included.
- The new order: hero · how we work · your business · one order, as proof · ALYR Agent · the products · price (offer on) · trust · questions.

## D-049 · Onboarding is one engine with three doors; a readiness check decides ready and live
**Date** 23 Oct 2026 · **Status** Accepted (the founder, 23 Oct: "start building this", on the client onboarding plan) · Linear ALY-165, ALY-163 · Spec `specs/018-onboarding-engine/spec.md`

**The decision.** Every client goes through one onboarding flow. A client can come in on their own from the site, with ALYR setting them up, or from a link the founder sends after a visit; the steps are the same, and what differs is who owns each step (the client or ALYR). One readiness check, worked out from the business's own data, says what is left and is the same in `/start`, the workspace and the back office. A business is *ready* when everything but its WhatsApp number is done, and *live* when the number is connected too. Live is recorded once and kept.

**Why.**
- Two separate flows for self-serve and assisted clients would drift. One flow with owners per step lets the founder hand-hold the first clients and learn exactly which steps to automate.
- Meta's approval is the slowest dependency. "Ready, waiting for WhatsApp" lets a client finish everything else and lets ALYR see who is waiting, instead of a client stuck at an unexplained last step.
- The money-back promise (D-034) and the first month need a start date nobody can argue with. Live is that date.

**How.**
- Done is never stored by hand: each check reads the data (`core/readiness.py`). What data cannot say is stored: the step's owner, a blocker ALYR writes, the owner's choice of WhatsApp way and payment way.
- Every change goes into an append-only record for the funnel, with whether ALYR made it. No customer data.
- The four WhatsApp ways are recorded now (ALYR's number, a new number, moving the shop's number with Meta's coexistence so the WhatsApp Business app keeps working, the shop's own account). Owners are offered the last three; ALYR's shared number needs routing that does not exist and the founder's decision (ALY-217).

**Chosen over** a status field staff set by hand (it lies as soon as someone deletes a service), and over working out the board from every business on every page load (it would not scale; the board reads the last state the check saw).

**Revisit when** terms acceptance (ALY-167) and per-shop templates (ALY-172) exist: they become checks. When billing starts at Live (ALY-218).


## D-050 · Each WhatsApp way has its own list of what to have ready, and its state is honest about Meta
**Date** 23 Oct 2026 · **Status** Accepted (the founder, 23 Oct: "think every onboarding, whatsapp integration, our whatsapp, clients own whatsapp options") · Linear ALY-217 · Spec `specs/019-whatsapp-setup/spec.md`

**The decision.** A business chooses how its customers reach it on WhatsApp: a new number, moving the number it already uses in the WhatsApp Business app (Meta's coexistence), or a WhatsApp Business Platform account it already has with another provider. Each way lists what the owner must have ready, in plain words in English and Arabic; the owner gives the number and ticks the rest. The step waits only once everything is ready, and then says on whom: Meta (while ALYR cannot connect that way yet) or ALYR. ALYR marks it connecting, or failed with a reason the owner reads. Connected is never typed in: it is the business's Meta number row.

**Why.**
- The slow part of connecting a number is the business not having what Meta asks for on the day (a number already on WhatsApp, no business portfolio, no card in Meta, an app too old to move). Asking for it up front turns a failed call into a checklist.
- Each business pays Meta for its own messages: a Tech Provider has no credit line. The card in Meta is a step, said plainly before the owner meets it.
- Moving a number changes the owner's app (groups stay in the app, broadcast lists become read-only, disappearing and view once messages switch off, linked computers are signed out, the phone must open the app every 14 days). The owner accepts that before ALYR moves it, not after.
- Until Meta approves ALYR, "waiting for Meta" is the true state. A setting (`ALYR_WHATSAPP_WAYS_OPEN`) opens each way the day it can be connected, with no code change.

**Checked against Meta's own pages on 23 Oct 2026.** Coexistence: app 2.24.17 or newer, six months of one-to-one chats sync within 24 hours, 20 messages a second, the limits above. An account with another provider is shared with ALYR in Meta Business Suite: Meta's new account model does not move numbers between accounts.

**Not offered: ALYR's own shared number.** Customers of many businesses writing to one number needs a step that asks which business they mean, and every message on it is charged to ALYR. It stays in the list of ways, hidden from owners, until the founder decides.

**Chosen over** one generic "connect WhatsApp" button with a call booked by hand (it hides the four very different paths and what each needs), and over storing a "connected" flag (it lies when a number is detached).

**Revisit when** ALYR is a Tech Provider (ALY-52) and Embedded Signup (ALY-39) exists: Embedded Signup will fill in the number and the state itself, and the attach action (ALY-166) writes the Meta number row.


## D-051 · A client pays before their products open
**Date** 23 Oct 2026 · **Status** Accepted (the founder, 23 Oct, answering the onboarding plan's third question: "dashboard will unlock after payment, that means they browse, get to the portal, pay and get access to products") · Linear ALY-212 · Spec `specs/020-pay-before-access/spec.md` · Updates D-049 (the onboarding engine)

**The decision.** The account is still made before any payment (the founder's first answer). The owner signs in, sees the price for their business first, accepts it and pays the setup fee and the first period of that price. Until ALYR has that payment, every product screen and its API answer "your workspace opens once ALYR has your payment" (`402`); the guided setup, the price, the payment page and the go-live list stay open. Recording enough to cover what is due opens every business of that client, once. ALYR's staff can also open it without a payment, saying why (a pilot, a demo); both are on the audit log.

**How a client pays today.** There is no online payment for clients yet (ALY-5, ALY-188). The owner sees what is due, the bank details (the setting `ALYR_BANK_TRANSFER_DETAILS`) and a reference to write on the transfer (`ALYR-` and the first eight characters of the client's ID). ALYR's staff record what arrived in the back office: the amount, how (bank transfer, cash, cheque, a payment link), what the statement shows, and the day. The owner is told it opens the same working day (the founder's fourth answer).

**What stays as it was.**
- The money-back result (D-034) is still counted over the first 30 days after going live, from `tenants.live_at`. Paying first does not start that clock: an owner who takes two weeks to set up loses none of their 30 days. This is how ALYR read the founder's answer; he can say otherwise.
- The refund is still the first month's subscription, never the setup fee (D-034).
- ALYR never holds a shop's money (hard rule 3). This is the client paying ALYR for ALYR's own service, and only references are kept: never a card number.
- Clients that existed before this decision, and the demo shops, stay open (`access_note` says why).

**What it changes.** The appointments setup now starts with the price (`plan` first), and the test line moves after payment: the owner tries their own chat once it is theirs. "Try before you pay" was never a free trial (D-034 has none), so nothing promised is lost.

**Chosen over** unlocking at go-live and billing then (the founder said no: the products open after payment), and over a soft lock that only hides the menu (a locked workspace must be locked in the API too, or it is not locked).

**Revisit when** online payment for clients exists (ALY-5, ALY-188): the payment page pays and opens in one step, and staff stop recording transfers. When the subscription's later periods are billed (ALY-85, ALY-218), which also decides whether the paid period counts from the day products open or from go-live.


## D-052 · Until Azure, the portal and API run on Cloudflare and the database on Neon
**Date** 24 Oct 2026 · **Status** Accepted for the fictional demo shop (the founder, 24 Oct: "use neon and cloudflare", then "if not [Fly or Railway] let's go with that"). **Real clients' data on it: proposed, waiting for the founder's answer** · Linear ALY-224, ALY-10 · Spec `specs/021-cloudflare-neon-hosting/spec.md` · Builds on D-013

**The decision.** The client portal runs as a Cloudflare Worker (OpenNext), the API and the job runner as one container behind a Worker, and PostgreSQL on Neon. No Fly.io, Railway or Vercel. Azure Qatar Central (ALY-63) is still where production ends up; nothing built here is Cloudflare-only except the two small Worker files, so moving is a change of host, not of code.

**Why.**
- The founder already has Cloudflare (DNS, the site, R2, email) and an account is the only thing missing; one fewer vendor to hold.
- Vercel's free plan forbids commercial use; Fly and Railway add a vendor and a bill for what Cloudflare Containers now do.
- The API keeps a plain Dockerfile, so the same image runs on Azure Container Apps later.

**Costs and risks, said plainly.**
- Cloudflare Containers need the Workers Paid plan (USD 5 a month) and are billed by use; our estimate for one always-on small instance is about USD 12 a month in all. Nothing is paid until the founder agrees.
- Neon has no Middle East region (Frankfurt is nearest); Cloudflare places containers where it chooses. This conflicts with hard rule 2 for real merchant and customer data. D-013 already allows Neon in Frankfurt only for the demo shop and consenting alpha merchants, leaving at the first paying customer. The founder is asked whether the first clients may be on it with written consent; **until he answers, only the fictional demo shop is hosted there**, and the register says so.
- Five things are untested until the first deploy (spec 021, "Not proven"), including outbound access from the container to Neon.

**Chosen over** Fly or Railway for the API (another vendor, no gain), the laptop and tunnel (down when the laptop is off), and waiting for Azure credits (no portal for the first clients).

**Revisit when** Azure credits arrive (ALY-55, ALY-63), or the first paying client who has not agreed to data outside Qatar.

## D-056 · Search and AI visibility
**Date** 25 Oct 2026 · **Status** Accepted (founder: "improve and implement", 25 Oct) · Linear ALY-227 · Plan and audit: `docs/growth/visibility.md`

**Decision.**
- The goal is to be found, described correctly and contacted when an owner in Qatar, or someone asking for them, searches or asks an AI assistant, in Arabic and English.
- Global keywords are not a target; Qatar comes first, then the GCC.
- Authority (other people mentioning ALYR) is the biggest gap, so most of the work is off the site: profiles, Google Business Profile, forums, partners, press and original data, in that order.

**What changed in code.**
- The Organization's structured data gains a contact point: the email, and WhatsApp once its number is set.
- It also gains `sameAs` links to ALYR's profiles, listed in `NEXT_PUBLIC_ALYR_SAME_AS` and added only once each profile exists.
- Google Search Console and Bing verification tags can be set from `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` and `NEXT_PUBLIC_BING_SITE_VERIFICATION`.

Nothing claims more than the page, as before.

**Kept.**
- `llms.txt` and the markdown copies stay, although Google ignores `llms.txt`: they cost nothing and agents read them.
- No fake reviews, no undisclosed posts, no AI claims about the product, no prices before the CR.

## D-058 · The live Agent figure moves continuously
**Date** 25 Oct 2026 · **Status** Accepted (the founder, 25 Oct 2026, relayed in the work's brief) · Branch `aly-hero-live-motion` · Rules: `.claude/skills/alyr-design/motion.md`, "The one exception" · Log: `docs/framer-review/06-live-motion-log.md`

**Decision.**
- The ALYR Agent dashboard with the "ALYR · Running" feed beside it (the homepage hero, Qirfa Bakery, and `/agent`'s opening with its three samples) keeps moving, the way the workspace does, instead of playing once and stopping. It is the one named exception to "plays once" (alyr-design principle 10).
- Each sample plays a script of events the product really performs (order page, order received, order confirmation, ready message, welcome menu, booking page, booking confirmation and details, booking reminder, "Needs a look"), and the dashboard's numbers move with them and stay true to each other. Payment reminders are not automatic, so none is shown being sent.

**Conditions.**
- A pause button with its name in English and Arabic (WCAG 2.2.2).
- It stops off screen, in a hidden tab and with reduced motion; reduced motion and no scripts show the settled picture, and the first paint is that picture.
- About one event every 3 to 5 s; Volt only on what just became true, fading back; no flashing; transforms and opacity only; CLS stays 0.

**Revisit when** a visitor or the founder finds it distracting, or another figure asks to keep moving (that needs his word, not this decision).

---
## D-059 · Motion is always on: the site's figures keep playing
**Date** 26 Oct 2026 · **Status** Accepted (the founder, 26 Oct 2026, in his words, relayed in the work's brief: "animation is super fast now make it a bit slower, always it should be always on animations and motions") · Branch `aly-always-on`, stacked on `aly-pace-slower` (PR #142) · Rules: `.claude/skills/alyr-design/motion.md` rule 1 and "Figures that keep playing" · Log: `docs/framer-review/08-always-on-log.md`

**Decision.**
- "A bit slower" is the pace at 1.3 (PR #142); the live Agent figure's beat now follows it too (`--live-beat`: 5.2 s, 6.5 s on a phone).
- "Always on": the figures that show the product at work keep playing while they are on screen, instead of playing once and resting: the homepage's How we work cards (the return line drawn again with Improve), the products frame's six tiles, and the signature figures on `/shelf` and `/docs`. The flows, the demos and the live Agent figure already did. This replaces "plays once" (alyr-design principle 10) for figures, and widens D-058 beyond its one figure.
- Text and sections still arrive once, and the visitor's own controls (the business day's fold, `/chat`'s X-ray, tabs, hovers, presses) are unchanged: looping text would make the page unreadable, and a timer must not move a control under the visitor's hand.

**Conditions** (D-058's, for every looping figure).
- A Pause control per figure or section, its words in English and Arabic (WCAG 2.2.2), absent without scripts and with reduced motion.
- It stops off screen and in a hidden tab; reduced motion and no scripts show the finished picture.
- Its timing comes from the pace tokens, and each finished state holds while its words are read (at least `--dwell-min`).
- The numbers in a scene stay true to each other on every cycle; no layout shift; the homepage's Lighthouse no worse than before.

**Revisit when** a visitor or the founder finds it distracting, or a figure's cycle reads as too busy (its hold is one token away).
