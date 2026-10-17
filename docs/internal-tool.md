# The ALYR internal tool

ALYR's own console for running every client from one place. It is for ALYR staff only, never for clients. Decision D-033, Linear ALY-79 (phases ALY-80 to ALY-96). Agreed with the founder on 17 Oct 2026.

## What the founder decided (17 Oct 2026)

| Question | Answer |
|---|---|
| How much to build | All three levels, built in order: level 1 first so the tool is usable for selling straight away |
| Invoices | Our own simple invoices: numbered, English and Arabic, made from the accepted quote; ALYR records payments received. An export for the accountant |
| Leads | In the tool: shops visited before they sign up, on the phone, converted to a client in one tap |
| What staff may see inside a client's workspace | Setup only (services, hours, team, numbers, connections, products). **Never customer conversations** |

## Principles

1. **One source of truth.** The tool reads the product's own database. No spreadsheet copies of clients; Linear is for ALYR's work, not client records.
2. **Built around the founder's day.** He sells in person, so Today, Leads, Client 360 and the onboarding board work on a phone. Billing and the price list are laptop-first.
3. **Every change leaves a trace.** Each staff action is written to an audit log that cannot be edited.
4. **Separate and locked down.** It moves to its own address (for example `ops.alyr.qa`) when hosted, staff only, with shorter sign-in sessions. It talks to tenant data only through guarded database functions (D-027).
5. **No customer conversations.** Staff can see and change a shop's setup, but the tool never shows message content (founder's decision). Counts and delivery status only.
6. **Arabic where clients see it.** The tool itself is English. Anything a client receives (quotes, invoices, notices) is English and Arabic.

## How it is organised

A **client** is who pays (D-032). A client may start as a **lead**: a shop being visited, with no business yet. When they say yes, ALYR (or the owner at `/start`) creates their **business**, which goes through **onboarding** to **live**. The client's **quote** becomes a **subscription**, which produces **invoices** and **payments**.

```
lead ── won ──▶ client ──▶ business(es) ──▶ onboarding ──▶ live
                  │
                  └── quote ──▶ subscription ──▶ invoices ──▶ payments
```

## Areas

### Level 1: run the first 10 clients

| Area | What it does | Controls |
|---|---|---|
| **Today** | One queue of everything due:<br>• sign-ups waiting for a price<br>• quotes unanswered for 2+ days<br>• help requests by age<br>• go-live blockers<br>• overdue invoices<br>• follow-ups due<br>• failed messages | Snooze, assign, open the client |
| **Leads** | Shops by area and type. Stage: visited, demo, proposal, won, or lost with a reason. Next follow-up, notes, a quote before they sign up, convert in one tap. If the owner signs up at `/start` with the lead's email, the business joins that client | Stage, follow-up date, lost reason, convert |
| **Client 360** | Company and contacts, lifecycle (lead, pilot, paying, at risk, churned), businesses, one timeline of everything, notes, follow-up tasks, tags, price and balance | Edit, lifecycle, price mode, move or merge businesses |
| **Business controls** | Products and modules, team (invite, remove, change owner, resend sign-in), onboarding step, go-live checklist done on the owner's behalf. Status: active, paused, suspended or closed | Pause, suspend for non-payment, resume, reopen onboarding, close |
| **Onboarding board** | Every business by stage: signed up → set up → tried → priced → accepted → WhatsApp → payments → live. Days in stage, blockers, who at ALYR is on it | Move stage, assign, flag blocker |
| **Requests** | "Ask ALYR" and sign-up requests as tickets: assignee, due date, status (open, in progress, waiting on client, done), notes, history | Assign, status, due date |
| **Billing** | Subscription from the accepted quote, starting at go-live. Numbered invoices in English and Arabic with ALYR's company details. Record payments (bank transfer, cash, cheque, link). Overdue ageing. Promise tracker (first month free if no booking). Credit notes. Rule: suspend sending after N days overdue, never delete data | Billing start, pause billing, mark paid, credit or write off, reminders, suspension rule |
| **Settings** | Price list, sign-up per type and the promise (built, D-032). Sign-up open or closed (moved from env into the tool; env stays as a hard override). Emergency stop for all outgoing messages | Open or close sign-up, stop all sending |
| **Staff and audit** | Audit log of every staff action (before and after, cannot be edited). Staff list. Back-office sign-in valid for 12 hours | Add or remove staff |

### Level 2: operate with 10 to 50 clients and a small team

| Area | What it does |
|---|---|
| **Roles** | Founder, sales, support, finance, viewer. Discounts above a limit need the founder's approval. Two-step sign-in for staff |
| **Messaging health** | Each WhatsApp number's status, quality rating and messaging limit. Templates per account. Failed messages and dead jobs with retry. Opt-outs. Estimated Meta cost per shop |
| **Setup view** | A shop's settings as the owner sees them, read-only: services, hours, team, numbers, connections. Never conversations |
| **Usage and health** | Per shop: messages, bookings, orders, logins. A health score. Alerts: no login for 7 days, unanswered pile-up, quality drop |
| **Revenue reports** | Monthly recurring revenue (new, grown, lost), billed against collected, sign-up to live funnel, time to go live, export for the accountant |
| **Announcements, presets, feature flags** | Notices to all or some clients. Starting services and hours per business type, editable (now in code). Beta features per client |

### Level 3: scale, partners and the GCC

| Area | What it does |
|---|---|
| **Data and compliance** | The owner exports their own data (staff never see conversations). Anonymise after closing, with retention rules. A log of customer data requests (Qatar privacy law, PDPPL) |
| **Partners** | Partner records and partner price lists (the QAR 199 tier), referral attribution, commission statements |
| **Other countries** | Currency per client, tax rates on invoices. E-invoicing rules (for example Saudi ZATCA) are researched when we enter that country |
| **Integrations** | Accounting export or sync, contracts signed online. The tools are chosen when needed, free first (`docs/stack.md`) |

## Build order

One pull request each, in this order. Each one is used and checked before the next.

| # | Phase | Level |
|---|---|---|
| 1 | Tool shell (phone and laptop navigation), Today, audit log, staff list, 12-hour staff sessions | 1 |
| 2 | Client 360: profile, contacts, lifecycle, timeline, notes, tasks, tags | 1 |
| 3 | Business controls: modules, team, status (pause, suspend, close) enforced in the product, onboarding step, go-live checklist | 1 |
| 4 | Onboarding board and requests as tickets | 1 |
| 5 | Leads: pipeline, quote before sign-up, convert, sign-up joins the lead's client | 1 |
| 6 | Billing: subscriptions, invoices (English and Arabic), payments, overdue, promise tracker, credit notes, suspension rule | 1 |
| 7 | Switches: sign-up open or closed and the emergency stop, in the tool | 1 |
| 8 | Staff roles, discount approval, two-step sign-in | 2 |
| 9 | Messaging health | 2 |
| 10 | Setup view (read-only, never conversations) | 2 |
| 11 | Usage and health score, alerts | 2 |
| 12 | Revenue reports and exports | 2 |
| 13 | Announcements, presets editor, feature flags | 2 |
| 14 | Data and compliance | 3 |
| 15 | Partners | 3 |
| 16 | Other countries: currency and tax on invoices | 3 |
| 17 | Integrations: accounting, contracts | 3 |

## Security rules for every phase

- Every back-office route checks the caller is ALYR staff, and every change writes an audit entry in the same transaction.
- Cross-business reads go through `admin_*` database functions that refuse to run without the API's staff declaration (D-027). New global tables have forced row-level security that only allows the back office.
- No route returns message bodies to staff.
- Money is stored in dirhams (integers). Accepted quotes and issued invoices are locked by the database.
