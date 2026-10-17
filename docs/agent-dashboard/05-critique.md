# ALYR Agent: design critique

17 Oct 2026. The screenshots are live Saturday data, so I also rendered the fixtures (`review/render.js` → `review/render/`). Crops are in `review/`.

**Verdict.** The structure is right. But the screen contradicts itself in its first two lines, one selector flattens its spacing, and the bar slabs and the setup tile outshout the summary. It reads as a well-ruled spreadsheet.

## P0: must fix

**P0-1 · The summary contradicts the numbers** (`view.py` `_compare()`, the KPI lines; `bakery-en-1440`).
- *Problem:*
  - "Up 3" counts orders but names no unit, and it sits beside sales ▼ 1%.
  - The KPIs say "on last week"; the summary says "same days".
  - "2 orders are waiting" is a third meaning of "waiting".
- *Fix:* name the measure and reuse the KPI's figure.
  - EN: "Orders up 5%, sales down 1% on the same days last week."
  - AR: «الطلبات أكثر بـ5%، والمبيعات أقل بـ1% عن الأيام نفسها من الأسبوع الماضي.»
  - KPI lines become "▲ 5%", with one caption on the strip: "Against Sunday to 13:19 last week" / «مقارنةً بالأحد حتى 13:19 من الأسبوع الماضي».
  - "2 orders need confirming".

**P0-2 · The week chart misstates its numbers** (`review/render/`: bakery, `salon-week.png`, `clinic-week.png`).
- *Problem:*
  - Today's bar is partial, but its last-week tick is a full day. The bakery fixture's bars sum to about +4%; the KPI says +33%.
  - Booked days ahead are a share of open minutes drawn on a visits axis, so `0.41` reads as 3 visits.
  - Coming days are full-height dashed boxes, the loudest shapes in the chart. The clinic's closed Friday looks like an open, empty day.
- *Fix:*
  - Send `last_by_now` for today and draw the tick there. Show the full day as a 12% ghost.
  - Send `booked_count` and draw it on the same axis, labelled "3 booked" / «3 محجوزة».
  - Draw coming days as a dashed outline at last week's height.
  - Add `state:"closed"` and draw it with the label "Closed" / «مغلق».

**P0-3 · The reset selector removes the component's spacing** (`clinic-en-390`, `bakery-en-1440` bottom).
- *Where:* `agent.css` lines 55–56. `.ag ul` and `.ag p` have specificity (0,1,1), which beats every (0,1,0) margin.
- *Problem:* ticks at 100% underline "THIS WEEK" and the total. A double rule runs under the KPIs. "Last week", "Oldest:" and the empty slots touch what sits next to them.
- *Fix:* `:where(.ag) :where(ul,ol){list-style:none;margin:0;padding:0}` and `:where(.ag) :where(h1,h2,h3,p){margin:0}`.

**P0-4 · A promise and a fake chat in "ALYR team"** (`page.tsx`: `helpOnline`, `sentReply`, `DoubleTick`).
- *Problem:* "A person replies, usually within the hour" is a service level nobody has agreed. After sending, the "Got it…" bubble and the double tick look like a person answering at once.
- *Fix:*
  - Subtitle: "A person from ALYR reads every message." / «يقرأ كل رسالة شخص من فريق ALYR.»
  - After sending, a plain status line with no bubble and no ticks: "Sent to the ALYR team. We answer on WhatsApp or by email." / «أُرسلت إلى فريق ALYR. نرد عبر واتساب أو البريد.»

**P0-5 · Arabic grammar and bidi errors in the fixtures the homepage will use.**
- *Shot:* `review/b-ar-cards-zoom.png`, `salon-ar-390`, `review/render/salon-ar-top.png`.
- *Fixes:*
  - «عميلان تغيّبوا… ولديهم» → «تغيّبا… ولديهما»
  - «زبون دائم واحد غابوا» → «غاب»
  - «حان موعد عودتهم» (one customer) → «عودته»
  - «عميل واحد تجاوزوا» → «تجاوز»
  - «على عميلان» → «على عميلين»
  - «الطلب #… لـName» renders as "Daniel BJ 1439#" (`bakery-ar-1440`). Send `["الطلب ",{b:"#1437"}," للعميل ",{b:"Sameer Y."},…]`.
  - «Rasha F. محجوز» → «موعد Rasha F. يوم السبت 21:00»
  - «مساء الخير يا Huda» → «يا هدى» (needs a `name_ar`).
- *Root cause:* `words.py` conjugates verbs for the plural only. Add verb forms for 1, 2, 3–10 and 11+, and wrap every name in `{b}`. A native speaker signs off before the homepage.

**P0-6 · There is no showcase mode for the homepage.**
- *Problem:* the component hard-codes an `<h1>` (a second H1 on the homepage) and fixed ids. It links into `/app/*` (a sign-in wall). It shows "Thu 15 Oct · Updated 16:20" frozen in time.
- *Fix:* see "As a homepage figure".

## P1: should fix

**P1-1 · The hierarchy is inverted** (`bakery-en-1440`).
- *Problem:* the greeting, at 36 px, carries no information. The summary, the one thing that matters, is 17 px body text. Four KPIs at 40 px all shout equally.
- *Fix:*
  - The summary becomes the heading: 28 px (24 on the phone), weight 500, line-height 1.25, `max-width:38rem`.
  - The greeting moves into the eyebrow: "Good afternoon, Huda · Sat 17 Oct · Updated 13:19". That drops one of the three clocks.
  - The first KPI becomes the hero at 56 px; the other three are 28 px.

**P1-2 · The setup checklist owns the first screen** (`bakery-en-390`, `bakery-en-1440`).
- *Problem:* five Volt marks sit above the component's one Volt button, and staff see it too (`bakery-agent-role-en-1440`).
- *Fix:* once records exist, show it as one Needs row: "2 setup steps left for ALYR Chat · Connect your WhatsApp number" / «بقيت خطوتان لإعداد ALYR Chat · اربط رقم واتساب». Keep the full tile for the empty state, and hide it when `can_manage` is false.

**P1-3 · Duplicates waste the best space.**
- "Waiting now 3" repeats Needs. Use "Came back this week" (orders) or "New bookings this week" (bookings).
- The chart's title and total repeat KPI 1. Title it "By day" / «حسب اليوم», with no total.
- In the salon and the clinic, two of three cards name one person (Ethan B., Maha S.). Skip ids that a higher card counted, and drop a card left empty.

**P1-4 · The charts are slabs** (`review/b-week-zoom.png`, `bakery-dark-en-1440`).
- *The week:*
  - Bars: `.ag-bar{width:56%;max-width:40px;margin-inline:auto;border-radius:3px 3px 0 0;background:color-mix(in srgb,var(--ag-ink) 88%,transparent)}`.
  - Last week becomes a 10% ghost bar, or a tick at `inset-inline:0`. At -4 px it overlaps the next bar on the phone.
  - Today gets a 3 px Volt cap (`box-shadow:inset 0 3px 0 var(--ag-volt)`). The 10 px triangle vanishes at homepage scale and is 1.2:1 on the dark bar.
  - Add a 1 px baseline. Show values only for today or on focus. In dark mode, bars at 78% ink.
- *Busiest hours:* outlined zero cells read as a checkbox grid. Use `.l0{background:color-mix(...ink 4%...);box-shadow:none}` and `gap:2px`, and leave closed hours blank.
- *Top items:* every bar is 72% or more, so make them 4 px. Head the change column "Rank vs previous 28 days" / «الترتيب مقابل الـ28 يوماً السابقة», with 9 px triangles.

**P1-5 · The KPI strip** (`bakery-en-1440`, `salon-ar-390`, `bakery-en-390`).
- *Values sit lower* without a change line, or under a wrapped Arabic label. Fix: `.ag-kpi-link{align-content:start}`, and on the phone, labels with `min-height:2lh`.
- *The dividers miss the 12-column grid below.* Fix: `.ag-kpis{grid-template-columns:repeat(12,1fr);column-gap:40px}`, each KPI spanning 3.
- *"QAR" is as big as the digits.* Fix: send `{unit,b}`, draw the unit at `.5em` in ink-2 and the value at `clamp(28px,3.4cqi,40px)`.
- *On the phone the first value hits the rule.* Fix: `minmax(46%,max-content)` and `padding-inline-end:16px`.

**P1-6 · Type and spacing have no system.**
- *Problem:* 17 font sizes, and three treatments of numbers (mono 26/500, sans 40/600, mono 15/500).
- *Fix:* all figures in Instrument Sans with tabular digits, mono only for labels and rules. Sizes 11/13/15/18/28/56. Spacing on 4/8 (no 6/10/14/18), with 56 px between sections.

**P1-7 · "Done for you" is the proof of value but reads as a footnote** (`salon-en-1440` leaves a 600 px empty column).
- *Fix:* rows as `grid-template-columns:5.5rem 1fr`, the value right-aligned at 20/600.
- *New order:*
  - Needs (8) beside Done (4);
  - the numbers;
  - Suggestions (8) beside a compact week chart (4);
  - Hours, Top and Owed (4/4/4);
  - Team, at most 48 rem wide (today it spreads across 1,100 px).

**P1-8 · Words on the cards.**
- "Show me" beside "Show the orders": rename it "Who (3)" / «من هم (3)».
- "QAR 3,616 overdue, with no reminder this week" contradicts its rule (30+ days, 7 days, no due dates). Write "QAR 3,616 owed 30+ days, not reminded in 7 days" / «3,616 ر.ق مستحقة منذ 30 يوماً أو أكثر، دون تذكير منذ 7 أيام».
- "Messages to many customers need marketing consent. Coming." is wrong for one customer and promises something. Write "Information only. Writing to them needs their marketing consent, which ALYR does not collect yet." / «للعلم فقط. مراسلتهم تحتاج موافقتهم التسويقية، وALYR لا تجمعها بعد.»
- On the phone, folded cards need a chevron, and the team table clips "Waiting" (`bakery-en-390`). Use one line per person: "24 replies · first answer 8 min · 5 open · 2 waiting".

**P1-9 · The samples are not credible in Doha.** The salon does beard trims for Rasha F. and Noor A. (make Dafira a women's salon). A dental patient "usually comes every 10 days". The clinic says "customers", not "patients" / «مراجعون». The bakery's third suggestion is a 20% no-show rate on cake tastings.

**P1-10 · States.**
- *Empty:* "…shows here" appears twice. "Nothing is waiting" gets a Volt tick before WhatsApp is connected. Two boxes are not "the real structure": draw dashed outlines of the week, the hours and the list.
- *First week* (`salon-first-week-en-1440`):
  - Days before onboarding are drawn as zeros. Draw nothing for them.
  - The hours grid is a checkerboard built from 13 visits. Hide it under 50.
  - "New" appears on every top row.
  - "13%" no-shows on about 15 visits breaks A3. Write "2 of 15".
  - Volt sits on "booked value", a knowledge card. Volt belongs only on task or money cards.
- *Quiet:* "A quiet week" judges the week. Write "3 orders so far; 4 by this time last week." / «3 طلبات حتى الآن، و4 حتى هذا الوقت من الأسبوع الماضي.»

**P1-11 · Accessibility.**
- `--ag-ink-3` is 3.23:1 (light) and 3.98:1 (dark) on 10–11 px text. Use ink-2.
- The bars' `aria-label` sits on an `<li>` with hidden content, so many screen readers announce empty items. Put an `.ag-sr` sentence inside.
- On desktop, `display:none` hides the top three hours from screen readers. Use `.ag-sr`.
- ▲ and ▼ are read as "black triangle". Add hidden "up" or "down".
- The first card's title is a disabled button, and on desktop the toggles say `aria-expanded=false` while open.
- The setup `<h2>` comes before the `<h1>`.

## P2: polish

1. Ages: "0–30", "31–60", "61–90", "Over 90 days" / «أكثر من 90 يوماً».
2. Under "Owed": "QAR 2,313 more than a week ago" / «أكثر بـ2,313 ر.ق من قبل أسبوع».
3. On a Saturday, write "today at 16:15" / «اليوم الساعة 16:15», not "Saturday".
4. Arabic time ranges render as "09:00–08:00". Use `<bdi dir="ltr">`.
5. The clinic shows "10%", yet its ≥ 10% card does not fire. Round once.
6. `useState(animate)` freezes `is-rising`. Use `useId()` for the ids.

## As a homepage figure

```ts
mode?: "workspace" | "showcase";   // default workspace
headingLevel?: 2 | 3;              // summary as <hN>, greeting as <p>
```

In showcase mode:
- links render as `<span>`;
- no "Not now", "Updated", stale line, team or report;
- the eyebrow shows "Thursday · 16:20";
- "Who (3)" still opens its list;
- the figure rises once in view.

The checklist, the "Simulator" chip and the help box live in the shell and never appear. Caption: "FIG · SAMPLE, FICTIONAL BAKERY" / «شكل · بيانات تجريبية لمخبز خيالي».

**Crop:** 1,120 px wide, from the eyebrow to the first suggestion and the week chart (about 820 px with the P1-7 layout). On the phone, the header, Needs and the numbers at 390 × 844.
- Bakery: lead with "Send reminders" and "QAR 3,706 paid through ALYR links".
- Salon: lead with the booked days ahead.
- Clinic: the same, with Friday marked "Closed" and "patients".

**Premium enough?** Not yet. Every element weighs the same, black is the only fill, and the grid shows its seams. P1-1, P1-4 and P1-6 fix that without decoration. Keep one strong rule, above Needs, and 10% hairlines everywhere else.

## The five changes that would lift it most

1. **Make it true.** The summary names its measure and agrees with the KPIs; the chart compares like with like in one unit (P0-1, P0-2).
2. **Invert the hierarchy.** The summary as the headline, one hero number, setup folded into Needs, Done beside Needs (P1-1, P1-2, P1-7).
3. **Fix the reset selector and adopt a type and spacing scale** (P0-3, P1-6).
4. **Redraw the charts.** Narrow bars, last week as a ghost, a Volt cap, a soft heatmap (P1-4).
5. **Ship showcase mode with credible, grammatical samples** (P0-5, P0-6, P1-9).
