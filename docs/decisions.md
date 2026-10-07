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
**Not built yet.** Marketing opt-in capture (it arrives with broadcasts, ALY-44), a consent export, Meta's own messaging limits (ALY-41), and telling a utility template sent inside an open window (free) from one sent outside it (charged).
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
