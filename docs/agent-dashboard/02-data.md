# ALYR Agent: the numbers it can compute today

17 Oct 2026, ALY-99, phase 1. Every number the Agent dashboard could show from the database as it is on `main` plus this branch: where it lives, how to get it in a tenant-scoped query or an existing function, and what is missing. The founder decisions (`00-founder-decisions.md`) and the insight catalogue (`01-research.md`, section B) say what to show; this file says what the data can carry. Paths are under `apps/api/` unless they say otherwise.

## Ground rules for every query

- **Scope.** Every query runs inside `async with db.tenant(tenant_id) as conn`. Row-level security then shows one business's rows and nothing else; no query filters by `tenant_id` itself. Every table below is tenant-owned with forced row-level security, except `users` (global; read names through `memberships`).
- **Time.** The shop's zone is `tenants.timezone` (default `Asia/Qatar`), read with `select timezone from tenants where id = nullif(current_setting('app.tenant_id', true), '')::uuid` (the `_TODAY` fragment in `src/alyr/catalog.py`). Days are shop-local dates. Weeks run Sunday 00:00 to Sunday 00:00 in that zone: `modules/report.py` `bounds()` and `last_full_week()`.
- **Money** is integers in dirhams (100 = QAR 1); `core/normalise.py` `fmt_qar()` formats it.
- **Reuse before writing SQL.** Each weekly-report section has `numbers(conn, start, end, tz, current)` (`modules/{ledger,orders,bookings,inbox}/report.py`). It takes any window, not only a week, so the metrics API can call it for "today", "this week so far" and "the same span last week".
- **Comparisons.** Compare like with like: the week so far against the same days and hours last week, not against a whole week. At noon on a Saturday the sample bakery's week so far is 63 orders. Against all of last week (70) that reads as a fall; against the same span last week (63) it is level.
- **Indexes.** There is no time index on `orders.created_at`, `payment_requests.paid_at` or `bookings.created_at`. That is fine at one shop's size. Add one in a migration if the dashboard queries get slow.

## 1. Orders and items (ALYR Chat, module `orders`)

**Stored.**
- `orders`: `id`, `contact_id`, `number` (from 1001), `status` (`new`, `confirmed`, `ready`, `done`, `cancelled`), `payment` (`unpaid`, `paid`, `on_account`), `total`, `created_at`, `assigned_to`.
- `order_items`: `name`, `name_ar`, `price`, `quantity`, `item_id` (an item that has been ordered cannot be deleted; it is archived), and since ALY-102 a copy of the variant and options as ordered.
- `items` (called `products` until ALY-102): `name`, `name_ar`, `category`, `price`, `available`, and since ALY-102 `status` (only `live` items are sold), variants and stock. See `specs/001-catalog-engine/spec.md`.
- Status-change times exist only as `activity` rows (`subject = 'order'`, actions `placed`, `confirmed`, `ready`, `done`, `cancelled`, `paid`, `assigned`, `took`). `modules/orders/service.py` `tracking()` reads them.

| Number | How | Existing code |
|---|---|---|
| Orders and sales by day, week so far, against last week | `count(*)`, `sum(total)` where `status <> 'cancelled'`, by local date of `created_at` | `orders/report.numbers()` (orders, value, cancelled) |
| Average order value | sales ÷ orders, same filter | none |
| How orders were paid | `sum(total)` by `payment`. `paid` means paid on the test page (see 2). `on_account` means on credit. `unpaid` with a pending link usually means cash at the counter, which is not recorded | `orders/report.numbers()` (paid_online, paid_orders, on_account) |
| Customers who came back | distinct `contact_id` this period with an earlier order | `orders/report.numbers()` (`repeat`) |
| Top items and the riser | `sum(quantity)` from `order_items` joined to `orders`, by `name`, this period against the last | `orders/report.numbers()` (`top` only) |
| Items nobody orders | `items where available and status = 'live'` with no `order_items` in 30 days | none |
| Busiest hours | `extract(isodow, hour from created_at at time zone tz)` over 28 days | none |
| Orders not confirmed; ready but not collected | `status = 'new'` older than 15 min; `status = 'ready'` and the `ready` activity row older than 2 h | the `/app/orders` screen lists them; no count |
| Time to ready, time to done | `activity` `placed` to `ready` or `done` for each order | `tracking()` for one order |
| Cancelled share | `count(*) filter (where status = 'cancelled')` ÷ all | `orders/report.numbers()` |
| Sales per person | `sum(total)` by `orders.assigned_to` | `core/team.py` `performance()` (`sales`, `settled`) |

**Missing.**
- **Cash at the counter is not recorded.** An order collected and paid in cash stays `unpaid` with an open link, so paid-versus-unpaid is not true revenue collection.
- No completion timestamp on the order itself; it comes from `activity`.
- No delivery or pickup, pickup time, address, discount, tax, refund, or cost of goods.
- An order item keeps no category: it reaches `items.category` through `item_id`, which always survives now, because an ordered item is archived and not deleted (ALY-102).
- The home card "Orders today" counts cancelled orders (catalogue card `orders_today`); the report does not. The Agent should use the report's rule.

## 2. Payment requests (test page only)

**Stored.**
- `payment_requests`: `contact_id`, `amount`, `status` (`pending`, `paid`), `provider` (always `'standin'`), `created_at`, `paid_at`, and `order_id` (null for credit account links).
- Order links are made in `modules/orders/service.py` `place_order`; account links in `modules/ledger/service.py` `create_payment_request()`.
- Only `complete_payment()` (`ledger/service.py`) marks a request paid. It is reached through `POST /api/pay/{t}/{p}/complete`, the stand-in page, which answers 404 in production (`routes/pay.py`).

| Number | How |
|---|---|
| Paid by link, by day | `sum(amount)` where `status = 'paid'`, by local date of `paid_at`. Split orders and accounts on `order_id is null` |
| Links still open after 24 h | `status = 'pending' and created_at < now() - interval '24 hours'`, joined to a non-cancelled order |
| Share of links paid, time to pay | paid ÷ created; `paid_at - created_at` |

**Missing.** No real gateway (ALY-17). Until there is one, every "paid by link" figure is money paid on a test page; show it on sample data only, or say so. There are no failed, expired or refunded states and no payment method. The home card "Paid by link today" mixes order and account links.

## 3. Bookings, no-shows and reminders (ALYR Bookings, module `bookings`)

**Stored.**
- `bookings`: `number` (from 101), `contact_id`, `service_id`, `service_name` (copied at booking), `starts_at`, `ends_at`, `status` (`booked`, `completed`, `cancelled`, `no_show`), `reminded_at`, `created_at`, `assigned_to`.
- `services`: `name`, `duration_minutes`, `price` (current, editable), `active`.
- `business_hours`: `weekday` 0–6 with 0 = Sunday, `opens`, `closes`.
- `tenants.booking_reminders`: whether reminders are on.
- Booking `activity` actions: `booked`, `cancelled`, `moved`, `completed`, `no_show`.

| Number | How | Existing code |
|---|---|---|
| Visits that happened, no-shows, cancellations, not yet marked | count by `status` for `starts_at` in the period; "not marked" = `booked` and `ends_at < now()` | `bookings/report.numbers()` (came, no_shows, cancelled, unmarked) |
| No-show rate | `no_show ÷ (completed + no_show)` over 30 days | none |
| New bookings made | by `created_at` | `bookings/report.numbers()` (`made`) |
| Reminders sent | `reminded_at` in the period | `bookings/report.numbers()` (`reminders`) |
| Booked for the next 7 days; bookings today | `status = 'booked'` by `starts_at` | report (`next_week`); card `bookings_today` |
| How full the diary is | booked minutes ÷ open minutes from `business_hours`, per day ahead | none |
| Booked value ahead | join to `services.price`; hidden when every price is 0 | none |
| Repeat no-shows; late cancellations | by `contact_id`; `activity` `cancelled` less than 24 h before `starts_at` | none |
| Client due back | completed visits per contact against their usual gap | none |
| Visits per person | `assigned_to` with `completed` or `no_show` | `team.performance()` (visits) |

**Missing.**
- **No price at booking time.** Past value uses today's `services.price`.
- No staff member or room for the visit: `assigned_to` is who is responsible, not who did the work.
- One customer at a time per shop, so "capacity" is the opening hours (ALY-27).
- Moves and cancellations have no timestamps of their own; the original time of a moved booking survives only in `activity`.
- Opening hours are replaced on every save, so there is no history of them.
- Reminders go 2 hours before the visit; there is no record of whether a reminded customer came that compares with one who was not reminded.

## 4. The ledger and what is owed (ALYR Accounts, module `ledger`)

**Stored.**
- `ledger_entries`: `contact_id`, `kind` (`sale`, `payment`, `adjustment`), `amount`, `note`, `created_by` (a name, not a user), `created_at`.
- `ledger_accounts`: `promised_until`, `last_reminded_at`, `reminder_count`, `assigned_to`.
- `contacts.credit_limit`.
- Reminder messages carry `payload->>'template'` in `payment_reminder`, `payment_reminder_overdue` or `payment_reminder_final`. A tap on "I'll pay within a week" is an inbound message with `payload->>'reply_id' = 'promise'`.

| Number | How | Existing code |
|---|---|---|
| Owed to you now; by age 0–30, 31–60, 61–90, 90+ days; customers owing | payments settle the oldest debt first | `ledger/service.py` `summary()` and `ageing.age()` |
| Over credit limit | `over_limit` per customer | `summary()` |
| Promised and when; promise passed without a payment | `promised_until` (only future promises are returned); payments since | `summary()`; the "passed" half is not built |
| Overdue and not reminded | oldest debt 30+ days, no live promise, `last_reminded_at` older than 7 days | `summary()` fields; the rule is not built |
| Collected this period, by link, from how many; new credit given | sums by `kind` and `created_at`; links from `payment_requests` with `order_id is null` | `ledger/report.numbers()` |
| Owed is growing | `sale` above `payment` three weeks running | none |

**Use `summary().outstanding`, not the home card.** The card "Owed to you" nets every entry, including customers who are in credit. That makes it lower than what is actually owed whenever someone has paid ahead. On the sample bakery no account is in credit, so both say QAR 12,548. Ageing counts days in UTC, not shop time. `summary()` reads every contact and entry into Python; fine at one shop's size.

**Missing.**
- An entry does not point to its order; the link is only the note "Order #N".
- No payment method; `created_by` is a name.
- Nothing writes `adjustment` entries.
- No workspace screen sets `credit_limit`.
- No invoice or statement dates.

## 5. Contacts: new, repeat and quiet customers

**Stored.**
- `contacts`: `name`, `phone` (may be null), `wa_user_id`, `role` (`customer`, `staff`), `lang` (`en`, `ar`), `created_at`, `last_inbound_at`, `consent_service`, `consent_marketing`, `inbox_status`, `inbox_read_at`, `assigned_to`, `credit_limit`.
- The consent log is `consents`.

| Number | How |
|---|---|
| New customers | `contacts` with `role = 'customer'` by `created_at`. This counts people who only wrote; for "first order", use `min(orders.created_at)` per contact |
| Came back, regulars, first order against repeat | orders (and completed bookings) by `contact_id` |
| Regulars gone quiet | three or more orders or visits 31–120 days ago, none in the last 30 (research rule 6). Computed; there is no last-order or last-visit column |
| Language mix | `lang` |
| Who may get a message | `consent_service`; `consent_marketing` is never `granted` today |

**Missing.**
- **Marketing consent cannot be captured (ALY-44).** A "win them back" message to quiet regulars is information only, without a button, as the founder decided.
- No birthday, area, source or tags (ALY-53).
- Merging two contacts deletes the dropped contact's consents, activity and notes, and does not move its bookings (`core/identity.py`).

## 6. Messages and response times

**Stored.**
- `messages`: `contact_id`, `direction`, `kind`, `body`, `payload`, `status`, `created_at`, `sent_by` (empty for the assistant and notices), `sent_by_user`.
  - `status` is one of `received`, `queued`, `sent`, `delivered`, `read`, `failed`, `blocked`.
  - `payload` holds `template`, `category`, `sent_as`, `reply_id`.
- Nothing about response time is stored. Every figure is computed from messages each time.

| Number | How | Existing code |
|---|---|---|
| Customers waiting now, and who is on it | open conversation whose newest unblocked message is the customer's, over 10 minutes old (D-028) | `team.performance()` (`waiting`, per person and unassigned) |
| Median time to first answer, per person and overall | for each staff reply, time since the first customer message after the last answer of any kind | `team.performance()` (`median_reply_seconds`) |
| Customers who wrote; replies by the team; messages ALYR sent | distinct inbound contacts; `sent_by <> ''`; `sent_by = ''` | `inbox/report.numbers()` |
| Unread chats | inbound after `inbox_read_at`. The home card "Unanswered chats" is this, not "unanswered" | card `unanswered` |
| Messages after hours | inbound outside `business_hours` | none |
| Notices and reminders by kind; blocked and failed sends | `payload->>'template'`; `status` | none |

**Caveats.**
- An answer from the assistant counts as an answer. First-answer time therefore measures how long customers were left with nothing, not how long until a person spoke.
- The clock runs through closed hours.
- An inbound message's `created_at` is when ALYR processed it, not when Meta received it.
- Delivered and read times are overwritten in place, so there is no read timeline.

## 7. Team assignment

**Stored.**
- `assigned_to` on `contacts` (the conversation), `orders`, `bookings` and `ledger_accounts`.
- `activity`, which cannot be edited: actors, `took`, `assigned`, and `closed` with `detail->>'outcome'` (`sold`, `booked`, `answered`, `lost`) and `detail->>'reason'` for a lost conversation.
- `memberships.role`: `owner`, `admin` or `agent`.

**Numbers.** `team.performance(conn, staff, days)` with `days` of 1, 7 or 30 gives, per person and for nobody:
- open conversations and customers waiting, with the oldest wait;
- replies and the median first answer;
- conversations closed, by outcome;
- orders and sales they look after;
- visits that happened or were missed.

Also computable: lost conversations by reason (research rule 23).

**Missing.** No shifts or working hours. Sales go to whoever is responsible for the order, not to who served the customer.

## 8. What already exists: the home cards and the weekly report

**Workspace home today** (`GET /api/workspace/home`, `core/workspace.py` `home()`): one number per card a switched-on module declares in `catalog.py`.

| Card | Module | Definition | Caveat |
|---|---|---|---|
| Unanswered chats | inbox | open customer conversations with an inbound message after `inbox_read_at` | It counts **unread**, not unanswered |
| Bookings today | bookings | `booked`, `starts_at` today | Visits already marked as came are not counted |
| Orders today | orders | `created_at` today | Includes cancelled orders |
| Paid by link today | payments | paid requests by `paid_at` today | Order and account links together; test page only |
| Owed to you | ledger | net of every entry | Not `summary().outstanding` (see 4) |

**Weekly report** (D-030, `modules/report.py`):
- `build(conn, week_start)` returns one section per switched-on module, each with this week's numbers and last week's for the first line.
- `preview()` renders it in both languages, and it is stored per module in `weekly_reports.sections`.
- "Still owed" and "overdue" are today's figures even for an older week.
- The numbers in each section:

| Section | Numbers |
|---|---|
| Ledger | collected, payers, credit given, by link, reminders, promised, owed, owing, late (61+ days), late customers |
| Orders | orders, value, cancelled, paid online, paid orders, on account, repeat, top item |
| Bookings | came, no-shows, cancelled, unmarked, made, reminders, next week, busiest weekday |
| Inbox | wrote, new, by team, automatic |

The report is now part of ALYR Agent, which every business has. Its sections stay keyed by module, so the product split changed no stored report.

## 9. Who may see what

**Today.**

| | Owner | Admin | Agent |
|---|---|---|---|
| Products, connections, the ALYR price | yes | yes | no (`catalog.MANAGERS`) |
| Weekly report settings and sending (`/api/reports`) | yes | yes | no (`routes/reports.py` `_manager`) |
| Team report: everyone's numbers | yes | yes | own row only (`core/team.py`, `everyone`) |
| Team report: whole-team totals (waiting, sales, closed, median) | yes | yes | **yes in the API**; only the screen hides them |
| Home cards, including "Owed to you" and "Paid by link today" | yes | yes | **yes**; `/api/workspace/home` checks no role |
| Credit accounts: every balance, collected, reminders (`/api/ledger/*`) | yes | yes | **yes**; no role check |
| Orders with totals; changing products and prices (`/api/orders`, `/api/products`) | yes | yes | **yes**; no role check |
| Every conversation, and assigning anyone | yes | yes | yes |

**Rule proposed for the Agent dashboard**, following D-028 ("an agent sees only their own numbers"):
- Owners and admins see the whole business, money included.
- An agent sees the work in front of them and their own results:
  - customers waiting on them and with nobody on them;
  - orders to confirm and orders ready;
  - visits today and visits not marked;
  - their own first-answer time and closed conversations.
- An agent sees no shop-wide money: no sales, owed, collected, paid by link or anyone else's sales.
- The metrics API should enforce this on the server, not in the screen.

**Needs a decision.** The agent-role gaps in the existing routes predate this work. They let an agent read every balance today: ledger, orders, home cards and team totals. Fixing them changes what agents can do now, so it is a separate issue, not part of this branch.

## 10. The five most useful numbers today, and the biggest gaps

Computable now, from real data, with code that already exists or one query:
1. **Customers waiting now, and who is on it.** `team.performance()`; acts through `/app/inbox`.
2. **Sales and orders, this week so far against the same span last week.** `orders/report.numbers()` over any window.
3. **Owed to you, by age, with promises and "overdue, not reminded".** `ledger.summary()`; acts through "Send reminders".
4. **No-show rate, and visits not marked.** `bookings/report.numbers()` plus one ratio; acts through `/app/bookings`.
5. **Regulars gone quiet, and customers who came back.** Orders and visits by contact. Information only until marketing consent exists.

The median first-answer time per person (`team.performance()`) is the sixth, and is shown best on the Team screen.

**Biggest gaps.**
- **Payments are a stand-in.** "Paid by link" is test-page money until a gateway is live (ALY-17).
- **Cash at the counter is not recorded**, so collected revenue is undercounted for any shop that takes cash.
- **No price at booking**, so booking revenue is today's price list, not what was charged.
- **No marketing consent (ALY-44)**, so every win-back suggestion is information only.
- **Agents can read all money through the API** (section 9).
- Smaller gaps:
  - no last-order or last-visit columns and no stored first-response time (computed, fine at this size);
  - response time ignores opening hours;
  - ageing runs in UTC.

## 11. Sample data: Qirfa Bakery

`uv run python -m alyr.seed_qirfa` (after `python -m alyr.migrate`) writes Qirfa Bakery («مخبز قرفة»): a fictional bakery and café in Bin Mahmoud with eight weeks of activity ending today. Running it again replaces it with a fresh copy; the same random seed gives the same shape.

**What it holds.**
- **Orders:** about 440, from about 30 a week to about 70, each with its chat and its steps. Payment is by link (paid or still open) or on account.
- **Tastings:** cake tastings and consultations. Some ended as no-shows or cancellations, one or two recent ones are not yet marked, and about ten are booked ahead. Most visitors then ordered a celebration cake.
- **Customers:** 80 people, each a first name and an initial. They include 12 regulars, 5 regulars who went quiet more than a month ago, occasional and new customers, and a few who only asked questions.
- **Credit accounts:** 6 accounts with balances from current to over 90 days old, one promise to pay, and reminders sent.
- **Chats:** people answer within minutes in the morning and slower in the evening, and quicker in recent weeks. Conversations are closed as sold, booked, answered or lost. Three customers are waiting right now.
- **Team:** Huda Rahim (owner), Karim Nasr (admin, kitchen and tastings) and Yusuf Amin (agent, counter).
- **Sunday report:** last week's, as sent.

**Signing in.** On a local machine, use `huda@qirfa.example`, `karim@qirfa.example` or `yusuf@qirfa.example`; the code shows on the sign-in page.

**Safety.** The business has only a private simulator line, and the seed queues no jobs, so nothing reaches a phone. Every person and company is invented.
