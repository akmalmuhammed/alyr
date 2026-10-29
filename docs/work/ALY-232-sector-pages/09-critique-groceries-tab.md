# Critique: the homepage's Groceries tab (ALY-232)

Independent quick critic, 29 Oct 2026. Branch `aly-232-sector-pages`, worktree `D:\alyr-sector`,
uncommitted change to `copy.ts` (`home.business.rows[id="groceries"]`, en and ar), `brand.tsx`
(`basket`), `HomePage.tsx` (`BUSINESS_ICON`), `copySectors.ts` (`row: "groceries"`). Read against
the build at http://localhost:3141 (`alyr-build` a252d7f…-dirty; the served HTML carries the new
row). Nothing edited, rebuilt or committed. Screenshots in `C:\t\grocritic\`.
**Not the native Arabic sign-off (ALY-66).**

## Verdict

The tab is true, on pattern and works at every width: nothing is claimed that is not built, the
earlier P0 (a promise on a named day) stays fixed, and `/for/groceries` now draws the same
figure. One line breaks "say it once" and should change before merging. The rest is polish.

**P0: 0 · P1: 1 · P2: 7**

## P0

None.

## P1

| # | Where | What is wrong | English | Arabic |
|---|---|---|---|---|
| P1-1 | `home.business.rows[groceries].with[2]` (en, ar) | Appears word for word inside `sectors.items.groceries.answer` ("…and one press sends reminders to everyone 30 days or more behind, firmer…") and again in the credit guide's "With ALYR" (`copyGuides.ts` items["keep-track-of-who-owes-you"].alyr.items[3]). The skill's keep-out list names exactly this: a line repeated from the homepage word for word. Don't fall back on the wholesale row's "See who owes how much and for how long…", which is on the same page. | "Neighbours 30 days or more behind get a reminder when you press Send reminders." | «يصل تذكير إلى كل جار تأخر 30 يوماً أو أكثر حين تضغط «إرسال التذكيرات».» |

(The button label matches `copy.ts` ar «إرسال التذكيرات: حسابات 30 يوماً أو أكثر».)

## P2

| # | Where | What is wrong | Replacement |
|---|---|---|---|
| P2-1 | `…rows[groceries].day[1]` | Close to `sectors.items.groceries.today.items[3]`; in Arabic the first four words are the same («طلبات العمارة تصل برسائل صوتية…»). | en "Flats and villas order by voice note and photo." · ar «تطلب الشقق والفلل برسائل صوتية وصور.» (matches Flat 12 / Villa 7 in the sample) |
| P2-2 | `…rows[groceries].day[0]` (ar) | Opens like `sectorsAr…today.items[0]` («دفتر الديون خلف الكاونتر…»). English is different enough. | ar «الجيران يشترون بالآجل، ولا سجل لذلك إلا دفتر الديون.» · en may stay, or "Neighbours buy on credit, and the notebook is the only record." |
| P2-3 | `…rows[groceries].with[1]` | Its tail "in the chat, by the piece or by weight" repeats the bakery row's `with[0]` on the same homepage. Optional. | en "Regulars order from your list in the chat, and an order can go on their account." · ar «يطلب الزبائن الدائمون من قائمتك في المحادثة، ويمكن أن يُسجَّل الطلب على حسابهم.» (true: orders on account with ALYR Chat; ties to #1188 "On account") |
| P2-4 | ar `…orders[3].status`, `orders[4].status` | Every other row writes «جاهز، وأُبلغ العميل» and «… تردّ» with the shadda. | «جاهز، وأُبلغ العميل» · «جوزيف يردّ» |
| P2-5 | ar `…rows[groceries].subject` (and `sectorsAr.items.groceries.subject`) | Every other row uses «لـ»: «كيف تعمل ALYR لمخبزي / لصالوني / لمطعمي». | «كيف تعمل ALYR لبقالتي» |
| P2-6 | `home.business.split.label` (en, ar), the fold's label on the homepage and on every sector figure | "The same afternoon" for 6:40–7:42 pm (and for the morning rows). The sector page heading already says "The same hour". | en "The same hour, today and with ALYR" · ar «الساعة نفسها، اليوم ومع ALYR» |
| P2-7 | `brand.tsx` `basket` handle | The two handle strokes `M8 10l3-6`, `M16 10l-3-6` end 2 units apart with square caps, so at 3x the top is a ragged peak. The crate's lid in the same set is a flat-topped trapezoid. | `"M8 10l2.5-6h3l2.5 6"` in place of the two handle paths (one path, miter joins, flat top at y 4; the glyph stays inside 3–21 × 4–20 like `crate`) |

Small things, no change needed: two "Fatma"s are now on one homepage (restaurant and groceries
tabs). That is harmless, but «هند» / "Hind" would remove it. "Everyone 30 days or more behind"
leaves out the 3-day and stop safeguards, the same way the accepted truth table does.

Tab-row behaviour, which existed before this change (not caused by it): on a deep link, EN at 390 and
1024 scrolls Groceries to 8 px from the edge. That hides Bakeries and puts the tab outside the page's
gutter, though Groceries was already fully visible at 390. AR leaves the row alone. If wanted, in
`BusinessTabs.tsx`, scroll only when the tab is cut off:
`const r = row.getBoundingClientRect(), b = tab.getBoundingClientRect(); if (b.left < r.left || b.right > r.right) tab.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });`
(the row's `scroll-padding-inline: var(--gutter)` then keeps it on the gutter).

## What holds up

- **Claims.** "One line from the staff phone … the customer gets the new balance" matches
  `ledger/chat.py` `_staff` (records, replies "The customer has been told", sends
  `service.entry_message`, a template outside the 24-hour window). "How much do I owe?" →
  "Balance sent" matches `BALANCE_WORDS`. "One press sends reminders" (not automatic) is right.
  No AI word, price, "free", "rule", keep-your-number, delivery tracking or driver anywhere.
  Ahmed's "I'll pay Thursday" stays in the owner's chat only; the "With ALYR" side shows
  "Credit sale, new balance sent · Recorded", so 07's P0 stays fixed.
- **Sample.** Statuses are ones the other rows use. Order numbers are plausible (#1187, #1188, newest
  first). Names are first names or flats and villas, with no business names. One "Sample" / «مثال»
  in the Carbon bar. The unread header is computed (`DaySplit` sums `n`: 38), so it always adds up.
- **One source.** `/for/groceries` and `/ar/for/groceries` render the figure from the row (checked
  in the served HTML). The tab's "See the page for groceries" links `/for/groceries` and
  `/ar/for/groceries`. The `id="groceries"` anchor is unique on both homepages, and `#groceries`
  opens the panel.
- **Arabic.** MSA in `day`/`with`. «الزبائن الدائمون» follows the term list. «دفتر الديون» is used
  for the owner's notebook, which is allowed. «30 يوماً» agrees with its number. The prefill is Gulf
  on purpose. Customer chat lines are Gulf, one register each.
- **Layout.** 1440: all eight tabs fit (row 1376 = 1376, no scroll), en and ar, light and dark.
  1024: the row scrolls (1258 > 1024), the chosen tab is visible, and "Something else" is cut at
  the edge as the scroll cue. 390 and 320: it scrolls, the chosen tab is visible in both
  languages, and `scrollWidth` equals the viewport (390, 320), so no overflow. The basket sits on
  the 24 px grid at the set's stroke and reads as a basket.

## Not checked

The Meta approval state of the `entry_recorded` template. Machine copies (`/llms.txt`, `.md`) and
JSON-LD for the new row. Keyboard tab order and screen-reader output. Reduced motion. The fold
drag. Dark at 1024/320. A native Arabic read (ALY-66).
