# ALYR Insights: what we can tell a shop, from what data, and what the Agent can do about it

**Status:** draft for the founder, 8 Nov 2026. A plan, not a decision: nothing here is built, and no
decision number is taken until the founder answers the questions in section 8. Linear issue: to be
opened (the Linear connection needed signing in when this was written).

**Written from:** the code on `main` at v0.3.10 (`modules/agent/`, `modules/owner/`, the migrations),
`docs/agent-dashboard/` (the founder's rules for the Agent, 17 Oct), `docs/data-residency.md`,
`docs/connect-api.md`, `docs/master-plan.md`, and outside documentation read on 8 Nov 2026. Where a
claim about an outside service was not checked against its current documentation it says so, and
CLAUDE.md rule 2 applies before anything is built on it.

## 1. The short answer

1. **ALYR already holds far more than the Agent uses.** Today it runs 21 rules on orders, bookings,
   the inbox and the ledger. The database also has costs, stock movements, holds and watches,
   sold-out questions, carts, discounts, delivery zones, price history, quotes, review requests,
   resources and their hours, message statuses and the WhatsApp line's health. Nearly 40 more
   insights come from those with no new connection and no new data (section 4).
2. **A few cheap captures unlock the rest** (section 5): a "paid in cash" tap, where a customer came
   from (Meta already sends it for ad clicks and we throw it away), why an order was cancelled,
   marketing consent (ALY-44), and a birthday or area field.
3. **Outside sources come in three kinds** (section 6): ones ALYR already talks to and only has to
   read more of (Meta, the payment gateways), ones the shop holds (its POS, accounting, Google
   Business Profile, a CSV), and free context that is not personal data (prayer times and the Hijri
   calendar, public holidays, weather). The shop's POS is the most valuable, because it adds the
   customers who never use WhatsApp, and it arrives through the connected mode that already exists.
4. **"Agentic" should mean: find it, draft the action, the owner approves with one tap, ALYR does it
   through the layers that already guard it, then measures whether it worked.** Not a bot that acts
   alone with a shop's customers. The measuring is what makes it worth paying for (section 7).
5. **No language model is needed for any of this**, which keeps D-012 and the rule that customer data
   stays in Qatar intact. A model has real uses later (reading Arabic and English free text,
   drafting in the owner's voice), but only after the legal opinion (ALY-51) and proof of where it
   runs (section 9).

## 2. What exists today

| Piece | Where | What it does |
|---|---|---|
| 21 rules | `modules/agent/insights.py` | Each is an `Insight`: a key, a kind, a rule written in words, a finder, a sentence in English and Arabic, and an action or status. 4 are tasks (waiting, unconfirmed, not sent, unmarked), 5 are money (overdue, promise passed, open payment links, over credit limit, owed growing), 12 are knowledge (ready not collected, repeat no-shows, slow answers, no-show rate, quiet regulars, due back, thin days, late cancellations, lost reason, unused items, riser, booked value) |
| Facts | `modules/agent/facts.py` | One gathering of numbers per shop, which the rules read |
| Three places it shows | workspace Agent view (`view.py`), the Sunday report card (`report.py`, `card.py`), and WhatsApp commands from the owner's own number: TODAY, ORDERS, BOOKINGS, OWED, REPORT (`modules/owner/`, D-065) | |
| Guards | the outbound layer (consent, 24-hour window, messaging limit), `agent_snoozes`, `activity`, the actions registry shared by the workspace and WhatsApp | Anything that reaches a customer already goes through these |
| Founder's rules | `docs/agent-dashboard/00-founder-decisions.md` | Rules only, no AI wording on the site or in the product until a model really ships |

What is missing is not computation, it is three things: more questions asked of the data, a way for
an insight to become an action the owner can approve, and a record of whether the action worked.

## 3. The shape of an insight (so new ones fit)

Every insight in this plan is written the same way the existing ones are, so each can become one
`Insight` entry plus one finder:

- **Says something specific**: "14 people started an order on your link and did not finish. About
  QAR 2,340." Not "your conversion could improve."
- **Has a rule anyone can read**: a threshold in plain words (the existing `rule` text), so the owner
  can be told why it fired and we can test it.
- **Names the shop's own numbers**, compared with the shop's own past (same days last week), not
  with a national average. (Between-shop comparison is a separate, opt-in idea: section 6, E4.)
- **Offers one action**: a draft, a link, a switch, or nothing but knowledge.
- **Stays quiet when the data is thin.** If a shop has not entered costs, there is no margin
  insight, and the screen says what to enter to get one (coverage shown as a number).
- **Respects who may see it.** Cost and margin are for owners and admins only, as `items/costs.py`
  already enforces for the Catalog. Staff see tasks, not money.

## 4. Part A: insights from data ALYR already holds

"Needs" says what must be true for it to fire. "Can propose" is the action layer (section 7): D means
a drafted customer message (consent and the 24-hour window apply), S means a setting the owner can
switch on one tap, K means knowledge only. Table names are real tables in the migrations; the exact
columns are checked when each one is specified.

### A1. Money and collection

| # | What the owner reads | From | Needs | Can propose |
|---|---|---|---|---|
| M1 | "Your three best sellers earn you the least per sale." / "The cake earns QAR 14 a sale, the coffee QAR 3." | `order_items`, `order_item_costs`, `item_costs` | Costs entered for the items that sell (show coverage: "costs for 18 of your 25 items") | K, S (raise price) |
| M2 | "You gave away QAR 1,120 in discounts this month, 80% from one rule. Orders with it were 12% larger." | `discount_rules`, `order_discounts`, `orders` | Discounts switched on | K, S (change rule) |
| M3 | "Since you raised the price of X on 3 Oct, it sells 4 a day instead of 6." | `item_price_history`, `order_items` | A price change with 2+ weeks either side | K |
| M4 | "Customers who pay online pay in 6 minutes; 1 in 5 payment links is never paid, mostly new customers." | `payment_requests` | Gateway live (until then only the test page; ALY-17) | D (nudge) |
| M5 | "3 quotes worth QAR 18,500 were sent more than 5 days ago and not answered." | `quotes`, `quote_lines` | Quotes in use | D (follow up) |
| M6 | "Cash is 41% of what you collected." | `manual_payments`, `payment_requests` | The cash tap (B1 in section 5) | K |
| M7 | "This week's sales are on pace for QAR 9,800, last week was 11,200." | `orders` and the report's numbers | Always | K |
| M8 | "Customers who add a drink spend QAR 9 more. 62% of your orders do not have one." | `order_items` (items bought together) | 100+ orders | K, S (suggest add-on in the cart check) |
| M9 | "Delivery brought 34 orders; the fee covered the driver on 21 of them." | `delivery_zones`, `delivery_settings`, `orders` | Delivery switched on, a driver cost entered | K, S (change fee) |
| M10 | "Credit given is up 3 weeks running" (exists as `owed_growing`) plus "3 customers account for 70% of what is owed" | `ledger_entries`, `ledger_accounts` | Credit accounts | D (reminder, exists for `overdue`) |

### A2. Customers

| # | What the owner reads | From | Needs | Can propose |
|---|---|---|---|---|
| C1 | "4 regulars have not ordered in 5 weeks" (exists as `quiet_regulars`), grown into four groups: new, regulars, slipping, lost | `orders`, `bookings`, `contacts` | Always | D (win back, marketing consent needed) |
| C2 | "Of 60 first-time customers last month, 14 came back (23%)." Second-order rate is the single best health number for a shop | `orders`, `bookings` | 30 first-timers | K |
| C3 | "Your top 10 customers spent QAR 6,400 in 90 days. Nobody has thanked them." | `orders`, `ledger_entries` | Always | D (thank-you, no offer) |
| C4 | "14 people started an order and did not finish (QAR 2,340)." | `chat_carts`, the order page's cart check | Carts kept | D (nudge inside 24 hours, a template after) |
| C5 | "17 people asked for the almond cake while it was out. 9 can be told the moment it is back." | `sold_out_asks`, `stock_watches` | Stock tracked | D (restock notice, exists as a watch) |
| C6 | "38% of your customers write in Arabic; your confirmation messages are English only." | `contacts.lang`, `whatsapp_templates` | Always | S |
| C7 | "Most 'lost' chats ended at the delivery question." (exists as `lost_reason`), widened to count the words customers repeat (price, delivery, location, open) | `messages`, `contacts` | Fixed keyword lists in both languages, no model | K, S (add the answer to saved replies) |

### A3. Time and operations

| # | What the owner reads | From | Needs | Can propose |
|---|---|---|---|---|
| O1 | "40% of chats arrive between 8 and 11 pm; nobody has answered one after 6 pm this month." | `messages` by hour, `contacts.last_inbound_at`, first-answer time (the `slow_answers` finder) | Always | S (an after-hours auto reply that sets the time you will answer) |
| O2 | "Mona answers in 4 minutes, Ali in 22." (owner only) | `core/team.py` performance, `messages` | Staff linked | K |
| O3 | "Fridays before prayer are your quietest; Thursdays 6 to 9 pm your busiest." | `orders`, `bookings`, `messages` | 4+ weeks | K |
| O4 | "Orders marked ready wait 31 minutes on average before pickup." | `activity` (placed, ready, done) | Always | K |
| O5 | "9 orders were cancelled this month; 6 after confirmation, mostly Saturday." | `orders`, `activity` | Cancel reason captured (B3) for the "why" | K |
| O6 | "You cannot answer 'is it open?'. It was asked 52 times." | `messages` keyword lists | Always | S (auto reply with hours) |

### A4. Stock and the Catalog

| # | What the owner reads | From | Needs | Can propose |
|---|---|---|---|---|
| S1 | "At your usual pace the chocolate cake runs out on Thursday. Your biggest day is Friday." | `stock_movements`, `items` | Stock counted | K, S (reorder reminder) |
| S2 | "12 items have not moved in 60 days and hold QAR 3,100 of stock at cost." (exists in part as `unused_items`) | `stock_movements`, `item_costs` | Stock and cost | K, S (put on offer) |
| S3 | "3 holds expire today, QAR 540 of orders." | `stock_holds` | Holds used | D (remind) |
| S4 | "Stock counted 140, sold 120, nothing else moved: 20 unexplained." | `stock_movements`, `stock_alerts` | Stock counted | K |
| S5 | "Your menu changes 40 times a month; the item photo was missing on 7 of the 10 slowest sellers." | `item_bulk_changes`, `media_links`, `order_items` | Always | K |

### A5. Bookings (salons, clinics, services)

| # | What the owner reads | From | Needs | Can propose |
|---|---|---|---|---|
| V1 | "A haircut earns QAR 4 a minute of chair time; colour earns QAR 7. Colour is 12% of your bookings." | `services` (price, duration), `bookings` | Always | K |
| V2 | "Layla's diary is 85% full, Sara's 40%." | `booking_resources`, `resource_hours`, `bookings` | Resources set up | S (route new bookings to the freer person) |
| V3 | "Tuesday afternoon is 25% booked (exists as `thin_days`). 11 regulars are due back." | `bookings`, `contacts` | Always | D (invite the due-back list into the gap) |
| V4 | "No-shows are 4% with a reminder and 14% without." | `bookings.reminded_at` | Reminders on for a part of the period | S (switch reminders on) |
| V5 | "Deposits cut no-shows from 12% to 3% on the services that ask for one." | `bookings`, deposit data (checked at spec time) | Deposits used | S |
| V6 | "21 review requests went out; 3 arrived as reviews." | `review_requests`, plus the Google source in E3 | The Google source in E3 for the count | K |

### A6. The WhatsApp line itself

| # | What the owner reads | From | Needs | Can propose |
|---|---|---|---|---|
| L1 | "Your number's quality rating dropped to medium on Tuesday after 3 blocks. Keep marketing messages off for a week." | `whatsapp_line_health`, `whatsapp_line_events`, `whatsapp_line_state` | Line connected | S (pause marketing sends) |
| L2 | "11 messages in the last 2 days did not reach customers" (exists as `not_sent`), grouped by cause (not on WhatsApp, 24-hour window closed, template rejected) | `messages.status`, `core/not_sent.py` | Always | D (resend, exists) |
| L3 | "You can send offers to 312 of your 1,240 customers." (consent coverage) | `consents` | Marketing consent captured (ALY-44) | S (add the opt-in question to the order page) |
| L4 | "Your confirmation template is read by 91%, your offer template by 34%." | message statuses, or Meta's template analytics (E1) | Read receipts on for customers | K |

### A7. Insights for the founder, across clients (back office only)

These are about ALYR's own business and run as the database owner, not inside a shop. They never leave
the back office.

| # | What the founder reads | From |
|---|---|---|
| F1 | "Of the 50 live clients, 9 have not had a customer message in 10 days." (churn risk) | `messages`, `tenants`, `activity` |
| F2 | "Clients who connect their line in the first week are twice as likely to still be active at day 60." | `onboarding_steps`, `onboarding_events`, `whatsapp_setup` |
| F3 | "Which module each type of business switches on, and which it never touches." | `tenant_modules`, usage |
| F4 | "Support: the same question 11 times this week." | `setup_requests` |

### The first ten to build, in order

Ranked by what an owner would pay attention to, how ready the data is, and how small the build is.

1. **C4 abandoned carts**: money in the shop's hands today, a clear action, data already kept.
2. **C5 sold-out demand**: the data exists and the restock notice is already a feature.
3. **S1 days of stock left**: the thing an owner most fears; simple arithmetic on the stock log.
4. **O1 reply coverage by hour** with a one-tap after-hours reply: a gap shops feel, and nothing is needed from the customer's side.
5. **M1 margin leaders** (owner only, once costs are in): changes what the owner pushes.
6. **C2 second-order rate** and **C3 thank your best customers**: the shop's loyalty number, in one line.
7. **V3 fill the thin day** from the due-back list: connects two rules that already exist.
8. **L1 line health warning**: protects the shop's number, which is the whole product.
9. **M2 discounts given**: owners rarely know what their discounts cost.
10. **V4 reminders cut no-shows**: proves the value of a feature the shop already has.

## 5. Part B: data ALYR does not capture yet, and what each unlocks

These are small, mostly one tap or one field. All stay inside the existing tables or one new column,
and each new table follows the rules in CLAUDE.md (a `tenant_id`, row-level security, a rule in
`core/forget.py` and `core/erase_rules.py`).

| # | Capture | Why now | Unlocks |
|---|---|---|---|
| B1 | **"Paid in cash" on an order** (one tap on the order, in the workspace and by WhatsApp) | An order paid in cash at the counter stays "unpaid" with an open link, so today "paid versus unpaid" is not real collection (the Oct data inventory says so) | M6, true revenue, and a payment-link follow-up no longer chases someone who paid cash |
| B2 | **Where the customer came from.** (a) The Meta webhook sends a `referral` object on the first message after someone taps a Click-to-WhatsApp ad: `source_id`, `source_type`, `source_url`, the ad's headline and body, and `ctwa_clid` (omitted for ads shown in WhatsApp Status). The code today does not read it. (b) A `?src=` code on the order link and the QR cards ALYR already prints (counter, table, window, Instagram bio) | Free, first-party, and no shop currently knows which of its efforts bring customers | "Which card, which ad, which post brings orders", cost per customer once ad spend is connected (E5) |
| B3 | **Why an order was cancelled** (a short list: customer changed mind, out of stock, could not reach, too slow, other) | Cancelled share is counted, the cause is not | O5, and a better lost-reason list |
| B4 | **Marketing consent** (ALY-44) captured at the order page and at first chat, kept with its evidence | Every win-back, restock and thank-you message depends on it; a legal question for ALY-51 | L3, C1/C3/V3 sends |
| B5 | **Customer fields**: birthday (day and month), area, "how did you hear about us". `custom_fields` exists, so this is a shop-level choice, not a migration | Occasions and area are what an owner uses to be personal | Birthday message, area heat in deliveries, M9 |
| B6 | **Cost prompts**: ask for the cost of the five best sellers first, with the margin shown as soon as it is entered | M1 is the most useful money insight and needs the shop to enter costs | M1, M2, S2 |
| B7 | **Who handled a chat and when it was closed or lost** as a first-class state (a "resolved" mark) | Reply and resolution time need an end point | O2, C7 |

## 6. Part C: outside sources to connect

"Connect" means one of: read through a public API with the shop's permission, receive a webhook, take
a file the shop uploads, or look up free public context. Each row gives the verdict for now, the
effort in sizes (S a few days, M a couple of weeks, L longer, with unknowns for the shop's side), and
the data-residency check required by CLAUDE.md rule 2.

### E1. Already connected, only read more

| Source | What it gives | How | Residency | Verdict |
|---|---|---|---|---|
| **Meta WhatsApp Business Management API** | Template analytics (sent, delivered, read, button clicks) and pricing analytics (what each kind of message cost), plus the number's quality rating and messaging tier | Same app and tokens ALYR holds per shop (Embedded Signup, D-148). Read-only, scheduled job | Meta is already listed. It returns the shop's own aggregates, not customer data | **Now** (S/M). Feeds L1, L4 and "what your messages cost" |
| **Meta webhook `referral`** (B2) | Which ad or link started a chat | A few lines in the inbound parser (`channels/` is another lane's code, so this is a ticket, not a drive-by) | Already inside Meta's webhook; stored in Doha | **Now** (S) |
| **Payment gateways** (SkipCash, Dibsy, SADAD; D-044, ALY-17) | Paid, failed, expired and refunded states, time to pay, fees, settlement date | One adapter each in `gateways/` (today only the simulator exists), payment status webhooks | The shop's own gateway account; references and statuses only, never card numbers (hard rule 3) | **Next** (rides on ALY-17). M4 becomes real, plus failed-payment and refund insights |

### E2. Held by the shop

| Source | What it gives | How | Verdict |
|---|---|---|---|
| **A CSV or Excel of sales** | Walk-in sales the shop already records somewhere | The connected-mode CSV import exists (`connect/`, `sale_imports.py`) | **Now**: the long tail, no code per vendor. It is also the test of whether shops will bring outside sales at all |
| **POS** (Foodics for restaurants and cafes in Qatar is the most likely first; Loyverse for small shops; a salon system for bookings; Odoo and Zoho are common in GCC businesses) | The sales WhatsApp never sees: walk-ins, dine-in, the till. That makes the denominator: "WhatsApp is 23% of your sales and those customers spend more" | Foodics sends webhooks and has an API (checked 8 Nov 2026, to be re-read before building). Each POS is one small adapter that pushes into the existing `connect_sales` path | **Next, but only after two paying clients name the same system.** Building a connector nobody uses is the expensive mistake. Ask the first 10 clients which one they run |
| **Accounting** (Zoho Books, QuickBooks, Xero, Odoo) | Expenses, so profit and not only sales; supplier bills | OAuth per system, read-only | **Later** (L). Each is a new outside service and a residency row; the shop sees its own books in its own tool already |
| **Bank statement CSV** | Match transfers to orders, for shops that take bank transfers | The owner uploads a file, ALYR matches amounts and references. No bank login, no open banking | **Idea, validate first.** It is non-custodial (ALYR only reads a file the shop gives it). Shops may not want to upload statements |
| **Delivery apps** (Talabat, Snoonu and similar) | Orders that arrive through the apps | Unclear: we found no public SME API, and have not verified one | **Ask the first clients.** Do not assume |

### E3. Reputation and reach

| Source | What it gives | How | Verdict |
|---|---|---|---|
| **Google Business Profile** | Reviews and the rating over time, unanswered reviews, and profile performance (calls, direction requests, website clicks, searches) | The Business Profile APIs need Google's access approval for the project and the shop's consent to a connection (checked 8 Nov 2026, to be re-read) | **Next** (M, plus the approval wait). Unlocks V6, "draft a reply to the 2-star review", and "ask for a review after a happy visit". Reviewer names are personal data: store the minimum, in Doha |
| **Instagram and Facebook page insights** | Reach and clicks to WhatsApp | Meta Graph API, needs Meta app review | **Later** (M). Low value until B2 shows what the pages bring |

### E4. Between shops (ALYR's own data, opt-in)

| Idea | What it gives | Condition |
|---|---|---|
| **Benchmarks** | "Your no-show rate is 12%; similar salons in Doha: 7%." "Your second-order rate is top third." | Opt-in in the terms; computed by a job that outputs only aggregates; shown only when 5 or more shops of the same type contribute; never a name. Needs a decision (section 8) |

### E5. Ads

| Source | What it gives | How | Verdict |
|---|---|---|---|
| **Meta Marketing API** | Ad spend and results for Click-to-WhatsApp ads, so cost per conversation and per sale | `ads_read`, the shop's ad account, Meta app review. Joined to B2's referral data | **Later** (L), and only for shops that run ads. Most early clients may not |

### E6. Free context that is not personal data

These send nothing about customers, so the residency rule is not engaged: they only look up dates and
places.

| Source | Use |
|---|---|
| **Prayer times and the Hijri calendar** (the AlAdhan API is free; checked 8 Nov 2026) | Ramadan, Eid, Friday-prayer lulls and iftar peaks: "last Ramadan your evenings after iftar were 60% busier. Staff for it." Also tells the Agent when not to message (prayer times, late night) |
| **Public holidays and school calendar** | Planning, and the "same week last year" comparison that makes seasonal insights fair |
| **Weather** (a free forecast API) | "Rain Thursday: delivery orders usually rise 25%." Low cost, to try later |

Not recommended: scraping competitors or marketplaces, buying customer lists, reading a shop's email,
and anything that needs the owner's personal passwords.

## 7. Part D: from insight to action (what "agentic" means here)

### 7.1 Four levels

| Level | What happens | Example | Default |
|---|---|---|---|
| 0 Tell | A card with a number and a reason | "Cash is 41% of collections" | On |
| 1 Draft | ALYR writes the action, the owner reads it | The reminder text for 3 overdue customers, in each customer's language | On |
| 2 Do on approval | One tap sends, books, changes a setting or sets a price | "Send" on the win-back draft | On, per rule |
| 3 Do within limits the owner set | The owner switches a rule to run itself, with a cap | "Remind customers 30+ days overdue, at most 5 a day" | Off. Only for rules the owner turns on, and never for offers or anything about price |

There is no level 4. ALYR does not spend a shop's money, change prices, or message a customer who has
not agreed, on its own judgment.

### 7.2 Everything goes through what already guards it

- **Customers:** only through `core/outbound.py` (consent, the 24-hour window, the tenant's limit;
  hard rule 5). Inside 24 hours a free-form message; outside it, an approved template. Every new kind
  of outbound nudge is a new template that Meta must approve, in English and Arabic, and costs the
  shop per message. The insight shows the cost before the owner approves.
- **The owner:** the same actions registry as the workspace and WhatsApp (D-065), so "approve" works
  from either, and only by roles allowed to.
- **Quiet:** no nudges in the small hours or at prayer time (E6), a daily cap per shop, the snooze
  that `agent_snoozes` already has, and no repeat of the same suggestion to the same customer for
  30 days.

### 7.3 The new piece: proposals, with outcomes

One new tenant table, say `agent_proposals`: the rule key, what it found (customers, amounts), the
draft, status (proposed, approved, dismissed, expired, done), who approved and when, and, 14 days
later, the outcome (how many came back, how much they spent). This gives:

- an **audit trail** of what ALYR did on a shop's behalf;
- a **learning signal** for the rules (a rule the owner always dismisses is dropped or loosened);
- the **proof of value**: "This month the Agent's win-back messages brought back 6 customers worth QAR
  1,240." Worded as "followed by", never "caused", unless a control group is used.

### 7.4 Where it shows

- The Agent view in the workspace: the top three things to do today, each with its draft.
- The Sunday report card: the week's proposals and what came of them.
- WhatsApp, from the owner's own number: a new `AGENT` word next to TODAY, ORDERS, BOOKINGS, OWED and
  REPORT lists the top three; the owner replies `1` to approve the first. The first reply opens the
  24-hour window, so no extra template is needed. A daily brief pushed to the owner would be one more
  template (and a cost): keep it opt-in and weekly by default.

### 7.5 What it would look like in a shop

> **Salon, Tuesday 9 am.** *Tuesday afternoon is 25% booked. 11 regulars are due back (usual gap 5
> weeks, last seen 7).* Draft: "Hi Noor, we have Tuesday and Wednesday afternoon free this week. Want
> me to hold a slot?" [Send to 11] [Edit] [Not now]. Fourteen days later: "7 of the 11 booked, QAR
> 1,050."

## 8. Questions for the founder

1. **How far may the Agent go on its own?** The plan assumes levels 0 to 2 for everything and level 3
   only for reminders to a shop's own debtors. Say if that is too much or too little.
2. **Is the Agent part of the price, or an add-on?** It changes how loudly the "proof of value" line
   should be shown and how much we invest in outcomes.
3. **Between-shop benchmarks (E4):** yes or no. They are one of the most useful things a network can
   offer, and they need a line in the terms.
4. **Which POS first?** Ask the first 10 clients which system they run before any connector is built.
5. **Marketing consent wording (B4/ALY-44):** the lawyer's answer (ALY-51) decides what we may capture
   and how long we keep it.
6. **Apply for Google Business Profile API access.** Only the founder can apply, and the approval
   takes time, so apply early even though the connector is later.
7. **A daily brief or a weekly one?** Daily is more useful and costs one template message a day.
8. **Insight data after a client leaves:** `agent_proposals` and cached findings follow the erase
   rules (every new table needs a rule in `core/erase_rules.py`); say if outcome statistics may be
   kept in anonymous form for benchmarks.

## 9. The model question

**The honest position: almost everything above is rules, and rules are better here.** They are
explainable ("why did it say that?"), testable, free to run, identical every time, and they keep
D-012 and the Qatar rule safe. Forecasts for stock and sales are seasonal arithmetic, not a model.

Where a language model would add something real, and the condition each needs:

| Use | Condition |
|---|---|
| Understanding free text in Arabic, English and Arabizi: why a chat was lost, what customers ask for that the shop does not sell, a complaint in the message | Message-level personal data goes to the model. Needs ALY-51 and processing proven to stay in Qatar |
| Drafting replies and nudges in the owner's voice, in Gulf Arabic | Same |
| Telling the week's numbers as a short paragraph | Can be done from numbers only, with no personal data, but a fixed template reads as well and is auditable. Low gain |
| "Ask your data" (a question in words answered from the shop's records) | Highest risk. Any model that writes queries must run only against read-only, row-level-secured views for that one shop; it is the one place a mistake could cross tenants. Last |

**Where models can run.** One site that tracks model availability by Google Cloud region lists many
models, from several makers, as available in `me-central1` (Doha). That page is undated and not an
official source, and most entries are marked as a "Global" deployment, which in general means a request
can be handled outside the region. So a listing in Doha does **not** show that data stays in Qatar.
Before any customer data goes to a model, three things must be in writing: the provider's own
documentation saying the processing stays in the region, a row in `docs/data-residency.md`, and the
lawyer's view (ALY-51). Self-hosting an open model in Doha is the fallback, at a real cost for the
hardware.

**Wording.** Until a model really ships, nothing customer-facing says "AI" (the founder's decision
for the Agent). The Agent is "it watches your shop and suggests, you decide".

## 10. Order of work

Phases, not dates. A phase is finished when its demo works.

| Phase | Contents | Done when |
|---|---|---|
| **0: Ask the data more** | The first ten insights in section 4, all on data already held. Heavy ones are computed by a background job per shop and stored, not worked out on each look (50 shops each polling; the capacity work in D-130 to D-132 put the limits down) | The Agent view shows the new cards on the demo bakery and salon, in both languages, and a test per rule proves it fires and stays quiet |
| **1: Capture and act** | B1 to B4, B7 (cash tap, referral and `?src=`, cancel reason, marketing consent, resolved mark); `agent_proposals` with approve in the workspace and by WhatsApp; the first two actions: remind the shop's debtors (exists, now a proposal) and win back quiet regulars | A shop sees a draft, approves it, the customer gets it through the outbound layer, and the outcome appears 14 days later |
| **2: Read what we are already connected to** | Meta template and pricing analytics (L1, L4); payment gateway events when ALY-17 lands (M4); CSV for outside sales | The line-health warning fires on a real test number, and a shop's CSV shows "WhatsApp's share of your sales" |
| **3: The shop's wider world** | Google Business Profile (reviews, V6), the first POS (once two clients ask for the same one), the prayer and Hijri calendar, benchmarks if approved | Review replies drafted and approved; one POS pushes sales into `connect_sales` |
| **4: A model, if it is worth it** | Aggregate-only narration first (no personal data). Message-level only after ALY-51 and proof of where it runs | Written approval for the data flow, then a test set in Arabic and English that beats the rules |

### Risks to keep in front of us

- **Insights that are wrong are worse than none.** Every rule needs a test, a threshold written in
  words, and a minimum amount of data before it speaks.
- **Messages that nag.** One bad batch of unwanted offers can lower the number's quality rating (L1) and
  harm the shop's whole account. Marketing sends need consent, caps and a visible stop.
- **Outcomes read as proof.** "Followed by" is honest; "caused" is not without a control.
- **Cost of Meta messages** is paid by the shop. The proposal shows it.
- **Costs and margins are the shop's secret.** Owner and admin only, never in the report card sent
  to a shared inbox, never to staff.
- **Weight on the system.** Rules that scan a year of orders for 50 shops must be precomputed and
  indexed; a view that recomputes them per tab would undo the capacity work.

## 11. What I checked, and what I did not

Checked in the repository: the 21 rules and their kinds, the owner's WhatsApp words, the list of
database tables, that the code does not read the Meta `referral` object, that the only payment gateway
adapter present is the simulator, the data-residency table, the connected mode's intake.

Checked in outside documentation on 8 Nov 2026: Meta's webhook reference for the `referral` object and
`ctwa_clid`; Meta's analytics endpoints for templates and pricing; that Google's Business Profile API
needs an access approval; that Foodics offers webhooks; that SkipCash reports payment status by
webhook; that the AlAdhan API is free. Exact fields, limits and prices are to be re-read when each is
built.

Not checked: whether any model provider's processing stays in Qatar (see section 9); whether Talabat,
Snoonu or any delivery app has a public API for small shops; the exact columns of the tables named in
section 4, which each insight's spec will confirm; what shops are willing to connect (the first
clients will say).
