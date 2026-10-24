# ALYR Agent dashboard patterns

The workspace home (`/app`) is ALYR Agent: it says in one sentence how the week is going,
lists what needs the owner now, suggests at most three things with the rule behind each, and
shows what ALYR already did. The same component is the homepage figure, so it is the best
screen ALYR has. Sources: `docs/agent-dashboard/01-research.md` (A, B, C, E),
`03-build-brief.md`, `05-critique.md`, D-035.

## Architecture

- **One engine, every word rendered there.** `GET /api/agent?lang=en|ar` returns one
  `AgentView` (`apps/api/src/alyr/modules/agent/`: `facts.py` reads, `insights.py` is the
  rule registry, `view.py` assembles, `words.py` words). Arabic comes from whole templates
  with `counted()` and `agree()`. A figure is sent as `{"b": …}` so the screen wraps it in
  `<bdi>`.
- **One component, two homes.** `_agent/AgentDashboard.tsx` draws an `AgentView` and fetches
  nothing. The workspace renders it from the API; the site renders it in `mode="showcase"`
  from samples captured from the engine (`python -m alyr.agent_samples` writes
  `_agent/samples/{bakery,salon,homeservices}.{en,ar}.json`; never edit them by hand).
- **A new rule is one registry entry** with its rule in plain words, its minimum, both
  languages, and either an action on a screen that exists or an honest status line, plus a
  test at its threshold in both languages.

## The blocks, in order

1. **Eyebrow:** the greeting with the first name, the day, "Updated 16:20" (one clock).
2. **The summary sentence is the heading** (the largest text after the hero number). It
   names its measure and reuses the figures of the numbers below: "Orders up 5%, sales down
   1% on the same days last week." Facts in ink, the comparison muted. Never a third
   meaning of a word the screen already uses ("waiting").
3. **Needs you now** beside **Done for you.**
   - Needs: at most 3 ruled rows (count, words, arrow to the filtered screen). They cannot
     be dismissed; they clear when the work is done. Setup steps left appear here as one
     row once records exist ("2 setup steps left for ALYR Chat · Connect your WhatsApp
     number"), only for people who can manage. When empty: "Nothing is waiting", with one
     Volt tick only once the shop is live.
   - Done for you: what ALYR sent for the business this week (replies, booking reminders,
     payment reminders sent on a press), counts only, each linked. It is the weekly proof
     of the subscription.
4. **The numbers (KPI strip):** four numbers on one rule, no boxes. The first is the hero
   number, the other three smaller. Chosen by the products in use and the business type: two
   from the main product (sales for a shop, visits for a salon, money owed for wholesale),
   then "Owed to you" if Accounts is on. Each has a mono label, the figure in tabular
   Instrument Sans with the unit at half size, and its change. One caption on the strip says
   what is compared ("Against Sunday to 13:19 last week"). Never repeat a Needs row as a KPI.
5. **Suggestions** beside a compact week chart.
6. **Busiest hours, top items or services, money owed** (three columns).
7. **Team** (at most 48 rem wide) and the **report line** ("Your report goes to 2 numbers on
   Sunday at 9:00").

On a phone: header and summary (3 lines at most), Needs, Done, the numbers two by two,
suggestions (the first open, the rest folded with a chevron), the week, busiest hours as
three cells in words, top items, owed, team as one line a person.

## Number rules

- **Like with like.** "Week so far" is Sunday 00:00 shop time to now, against the same span
  last week. "Today" is against the same weekday last week, never yesterday. Weeks start
  on Sunday.
- **Percentages only when both periods count 20 or more;** otherwise "7 · last week 4".
  A rate on a small base is a count ("2 of 15", not "13%").
- **Round once,** and use the rounded figure for every threshold the screen shows.
- No forecasts, no projected revenue ("booked value ahead" is at today's prices and says
  so), no health scores, no red and green, no staff ranking (D-028).
- The first week shows counts without comparisons ("Comparisons start Sunday 26 Oct");
  days before onboarding are drawn as nothing, not zeros.

## Suggestion cards

- At most 3, ordered: tasks, then money, then knowledge; of two equal, the one whose action
  exists. A card leaves when its rule stops being true. Skip rows a higher card already
  counted.
- Each card: a title that names the measure ("QAR 3,616 owed 30+ days, not reminded in 7
  days"), one supporting line, the **rule line** in mono ("RULE · owed 30+ days, no promise,
  no reminder in 7 days · 4 customers" / «القاعدة · …»), "Who (3)" to list the counted rows,
  and either:
  - an action to a screen that exists, opening it filtered; the first task or money card
    carries the page's only Volt button; or
  - an information-only status line with the hollow pending dot and no button ("Information
    only. Writing to them needs their marketing consent, which ALYR does not collect yet.").
- Knowledge cards have "Not now" (until the numbers change or Sunday); tasks and money do not.
- Volt never sits on a knowledge card.
- "By rule", never "I noticed".

## Charts

- **The week:** seven narrow bars from Sunday (rounded top 3 px at most), past days in ink,
  last week as a faint ghost bar beside each, today with a thin Volt cap (the one Volt mark),
  coming days as a dashed outline at last week's height, a closed day labelled "Closed".
  Today's comparison tick is last week *to this time*, not the whole day. Booked days ahead
  are drawn on the same axis as a count ("3 booked"). A 1 px baseline; values only for today
  or on focus.
- **Busiest hours:** weekday rows by opening hours in five ink tints (never Volt), zero cells
  a 4% tint with no outline, closed hours blank; hidden below 50 events; the top cell in
  words beneath ("Thursdays 19:00–20:00").
- **Top items or services:** five ruled rows, 4 px inline bars, the change in rank
  ("Rank vs previous 28 days").
- **Money owed:** the total, then one bar in four age segments (0–30, 31–60, 61–90, over 90
  days), the oldest named.
- In Arabic every time axis runs right to left; ▲▼ do not mirror and are read as "up" and
  "down". Every chart has a sentence for screen readers inside it.

## States

- **Empty:** the setup checklist leads; below it the structure as dashed slots that say what
  will appear. No zeros, no empty charts.
- **First week:** counts without comparisons; suggestions are tasks only.
- **Quiet:** one line per product, no judgement ("3 orders so far; 4 by this time last
  week."), nothing red.
- **Stale:** "Last updated 16:05", the numbers stay.

## Motion

"The fold closes it": a card whose rule stops being true closes along 45° (short, the arrival
ease, mirrored), Done gains a count with one Volt tick, Needs steps down once. On first load
the numbers and bars rise along 45° with the stagger, once a session, never on the 15 s poll.
Reduced motion shows end states.

## Showcase mode (the site)

`mode="showcase"` with `headingLevel` from the host: links render as text, no "Not now",
"Updated", stale line, team, report or setup; the moment ("Thursday · 16:20") instead of a
date; "Who (3)" still opens; no region landmarks. On the site it sits in the workspace window
on the Carbon plate, `inert` in the hero crop, with `headings={false}` (its titles are text,
not headings), the "Sample" mark in the window's bar or the sample switch, and a first line
for screen readers and crawlers naming the fictional business. No "paid through ALYR links" row on a public sample (ALY-17).
