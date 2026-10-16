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
