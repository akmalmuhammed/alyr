# ALYR Agent: the numbers it can compute today (data inventory)

| | |
|---|---|
| **Category** | strategy |
| **Date** | 2026-10-17 |
| **Status** | Partly superseded |
| **Where it lives** | `docs/agent-dashboard/02-data.md` on main |
| **Lane** | Product |

## Question it answered
Which numbers can the ALYR Agent dashboard compute from ALYR's own database, where does each live, and what is missing? This is a data study of ALYR's own tables and code, not market research.

## Key findings
- Ground rules: every query runs inside the tenant-scoped transaction, so row-level security does the separating; days and weeks use the shop's time zone, with weeks Sunday to Sunday; money is integer dirhams; reuse each weekly-report section's `numbers()` function, which takes any time window.
- Compare like with like. On the sample bakery at noon on a Saturday the week so far was 63 orders. Against all of last week (70) that reads as a fall; against the same span last week (63) it is level.
- Orders: sales, orders, average order value, how orders were paid, repeat customers, top items, items nobody orders, busiest hours, time to ready and done, cancelled share, sales per person. Status-change times exist only in the activity log.
- Bookings: visits, no-shows, cancellations, unmarked visits, no-show rate, reminders sent, booked for the next 7 days, how full the diary is, booked value ahead, repeat no-shows, late cancellations, clients due back.
- Credit (Accounts): owed by age (0 to 30, 31 to 60, 61 to 90, 90+ days), over limit, promises and passed promises, overdue and not reminded, collected, owed growing. Use `summary().outstanding`: the home card "Owed to you" nets off customers who are in credit and can understate what is owed.
- Messages and team: customers waiting and who is on it, median first answer per person, replies by the team against messages ALYR sent, unread chats. An automatic reply counts as an answer, and the clock runs through closed hours.
- The five most useful numbers today: customers waiting; sales and orders this week against the same span; owed by age with "overdue, not reminded"; no-show rate and unmarked visits; regulars gone quiet and customers who came back.
- Biggest gaps: payments are a stand-in page (ALY-17), so "paid by link" is test money; cash at the counter is not recorded; no price is stored at booking time; no marketing consent (ALY-44), so win-back suggestions are information only.
- Access: proposes that staff with the agent role see their own work and no shop-wide money, enforced on the server. It found that existing routes already let an agent read every balance, order total and home card, and flagged that as a separate issue.
- The existing home cards have definition problems: "Unanswered chats" counts unread; "Orders today" includes cancelled orders; "Paid by link today" mixes order and account links.
- Describes the fictional Qirfa Bakery seed: about 440 orders over eight weeks, 80 invented customers, 6 credit accounts, tastings with no-shows. The seed queues no jobs, so nothing reaches a phone.

## What we decided because of it
- D-035 and D-037 (17 Oct): the dashboard and the homepage figure are drawn from real engine output over sample data, with the comparison and minimum rules set here.
- D-038 (17 Oct): the Sunday report card uses the same rules (same days, percentage only at 20 or more).
- The agent-role access gap was left to its own issue, not decided here.

## What changed since, and conflicts
- The inventory covers orders, bookings, credit, contacts, messages and team only. Since then the Catalog was switched on (D-039, as built 18 Oct) and the dashboard gained "Sold out now" and "Low stock" cards; the Documents engine (D-042) records payments taken by hand. `site-products-2/02-messaging.md` says the Agent's sales still count orders, not cash recorded in Docs, but marks that unverified.
- Payment gateway, marketing consent and per-booking prices were open on 17 Oct. Check `docs/status.md` before repeating any gap as current.
- It agrees with `01-research.md` section B: it confirms which of the 24 insights the data can carry.

## Use it for
- Before adding or changing any dashboard number, home card or report line: what the data can and cannot support, and which existing function to reuse.
- Before writing a public claim about numbers (for example "collected" or "revenue"): the caveats on cash, test payments and booking prices.
- The open question of what staff with the agent role can see.
