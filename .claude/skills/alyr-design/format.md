# Format guide: money, times, dates, ids and the words that replace others

Linked from [voice.md](voice.md). One way to write each thing, in both languages, so ten
screens built by ten people print the same. For the **product** (13 Nov 2026, D-180); the public
site keeps the forms in `voice.md` where they differ ("4:05 PM" in its own text).

**One helper per format**, in `apps/web/app/_ui/format.ts` (planned) with a test beside it
(`format.test.mjs`, erasable TypeScript, relative `.ts` imports, so `node --test` runs it). A
screen never formats by hand: no `toLocaleString`, no `toLocaleTimeString`, no `Intl.*` in a
screen, and no printing of the API's English `*_text` fields where a helper exists (Arabic
needs the number, not an English string). Amounts are integers in dirhams until the helper.

| Helper | Writes |
|---|---|
| `money(dirhams, lang)` | `QAR 85`, `85 ر.ق` |
| `formatTime(iso, lang)` | `09:40` (the one place that knows 24 h or 12 h) |
| `formatDate(iso, lang, opts)` | `Thu 12 Nov`, `Thu 12 Nov 2026` |
| `formatDateTime(iso, lang)` | `Thu 12 Nov · 09:40` |
| `duration(minutes, lang)`, `age(ms, lang)` | `1 h 30 min`, `4 min` |
| `range(a, b)` | `07:00–22:00` |
| `phone(number)` | `+974 5555 0134` |
| `orderNo(n, lang)`, `bookingNo(n, lang)` | `#1043`, `Booking 118` |
| `count(n, noun, lang)` | `3 orders`, `1 order` |
| `initials(name)` | `AH` (one helper for every avatar) |

## Money

- **English:** `QAR 85`, `QAR 85.50`, `QAR 1,234`, `QAR 1,234.50`. A thousands comma; **no `.00`**
  and no trailing zero on a whole amount (the API's `money()` and `fmt_qar` already do this);
  decimals show as two digits only when the amount has them. A no-break space between "QAR" and
  the figure, so it never splits across lines.
- **Arabic:** the amount, a no-break space, «ر.ق»: «85 ر.ق», «1,234.50 ر.ق». Western digits.
  **Never "QAR" on an Arabic page.** Always inside `<bdi>`.
- **A negative** writes the sign first: `-QAR 85`, «-85 ر.ق» (in `<bdi dir="ltr">`). A credit
  or a refund prefers its word ("Credit QAR 85") to a minus. (Known divergence: the agent's
  `money()` in the API writes `QAR -85`; the helper is the standard.)
- **A range** takes an en dash: `QAR 40–120`.
- **Where it is mono and where it is Sans.** In a table cell or a key-value row, money is mono
  and aligns to the end. Inside a sentence, a title, a button or a Tag, and from 24 px up, it is
  Instrument Sans with tabular digits (`ui-rules.md` section 5). Never half and half in one row.
- **Paper documents** (the receipt, invoice, quote or credit note a customer receives, and their
  on-screen preview) always show **two decimals**: `3,110.00`. The screen's own list of the same
  document says `QAR 3,110`.
- **Fees under one riyal** (Meta's per-message rates, back office only) show the decimals the
  rate has, up to three, as Meta publishes them: never rounded, never invented.
- **A price on a screen comes from the price list** (the back office's), never typed into a
  screen or a copy file. No setup fee appears anywhere (D-092).
- **Percentages** are `8%` with Western digits; only when both periods count 20 or more
  (`honesty.md`), otherwise "7 · last week 4".

## Times

- **24-hour, Doha time:** `09:40`, `16:20`, two-digit hour, a colon, no "am" or "pm". Always the
  shop's own zone (`Asia/Qatar`), never the browser's.
- **One helper, `formatTime`.** It is the only place that knows the clock's style. **Open:**
  whether the product shows a 12-hour clock instead. Until that is answered, write 24-hour
  everywhere through the helper so the change is one edit. (When it flips: English "4:30 pm",
  Arabic «4:30 م» and «9:00 ص», as `arabic.md` and `voice.md` already write them for the site.)
- In Arabic the time keeps Western digits and sits in `<bdi dir="ltr">`: `09:40`.
- **Time with a date,** on one line: the date, a middle dot, the time: `Thu 12 Nov · 09:40`.
  Not a comma, not "at", not time first. A two-line cell puts the date over the time.
- **A timeline or a thread** shows the time alone for today (`09:38`), the weekday and time for
  the last six days (`Wed 16:06`), and the full date for older ones (`Tue 3 Nov · 16:06`).
- **A caption that says when the screen was read** is "Updated 09:40". The top bar writes
  "Thu 12 Nov · Doha 09:40".
- **Never "ago"** on a screen nobody reloads ("5 min ago" goes stale); write the time, or an age
  that is part of a counted wait ("Waiting 4 min").

## Dates

- **English:** `Thu 12 Nov`: weekday, day, month, three letters, no comma, no ordinal. With
  the year when the year is not the shop's current one or a list spans years: `Thu 12 Nov 2026`.
  A month alone: `Nov 2026`. Months: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec.
- **Arabic:** `الخميس 12 نوفمبر`, Gulf month names (يناير فبراير مارس أبريل مايو يونيو يوليو
  أغسطس سبتمبر أكتوبر نوفمبر ديسمبر), Western digits, never an `en-GB` date; the week starts on
  Sunday; a tight column uses the day's initial (ح ن ث ر خ ج س). In `<bdi>`.
- **Weekdays are true.** 12 Nov 2026 is a Thursday. Check any date you type against a calendar.
- Group labels and sentences say "Today", "Yesterday", "Tomorrow" where they help; the label's
  capitals come from CSS, never typed.
- The week starts on Sunday ("week so far" is Sunday 00:00 shop time to now).
- Paper documents write the full date `12 Nov 2026`. The address bar may carry an ISO date;
  a screen never shows one.

## Durations and ages

- **A duration** (how long a service or booking takes) is as the owner set it: minutes under
  two hours (`45 min`, `90 min`), hours above (`2 h`, `2 h 30 min`). At most two units, a space
  between the number and the unit, no "hrs", no "mins".
- **An age** (how long something has waited) uses the largest unit: `4 min`, `3 h`, `2 d`.
  Never "ago". "Waiting 4 min".
- **In a sentence** write the words: "for 7 days", "24 hours", "23 more hours", "1 hour".
- **Arabic** uses whole words through `counted()` («5 دقائق»، «20 دقيقة»، «ساعتان»); it does not
  abbreviate to «د» or «س», which read as letters. A column is sized for the Arabic. Draft until
  the native review.

## Ranges

An **en dash with no spaces**: `07:00–22:00`, `4–10 Oct`, `30 Oct–2 Nov`, `Sun–Thu`,
`QAR 40–120`, `1–14 of 14`. Never "to" (`07:00 to 22:00`), a hyphen or an em dash. In Arabic
the range sits in `<bdi dir="ltr">`: `07:00–22:00`, and a date range keeps its numbers in one
`<bdi>` before the month: «4–10 أكتوبر». Opening hours: `Sun–Thu 08:00–22:00`.

## Phone numbers

`+974 5555 0134`: the country code, a space, then four and four digits for a Qatar number.
Mono, in `<bdi dir="ltr">`, never mirrored in Arabic. Another country's number shows the `+`,
the country code and the digits in groups of three or four, never run together. Staff see a
customer's number; a customer page shows none; the owner's connector app sees the last three
digits only. Typing an eight-digit Qatar number is accepted and gets 974. Sample numbers use
the fictional range `+974 5555 01xx`.

## Ids and prefixes

- **Orders** start at **#1001** in each shop and go up: `#1043` in a table, "Order #1043" in a
  sentence, «الطلب رقم 1043» in Arabic.
- **Bookings** start at **101** in each shop: "Booking 118" in a sentence and a heading
  (no hash), «الحجز رقم 118». In a column headed "Booking" the number alone. The drawings'
  `B-2318` is retired.
- **Documents** print the number the API returns and a screen never builds one: the kind's
  prefix, the year only when the series restarts each year, and the count padded with zeros:
  `INV-0042`, `INV-2026-0042`. The prefixes in the engine are RC (receipt), INV (invoice), QT
  (quote), DN (delivery note), ST (statement), CN (credit note), DR (deposit receipt) and PF
  (proforma). The drawings' `R-2026-...` and `Q-2026-...` are wrong: the code wins.
- **An item** is shown by its **Code**, as the owner set it. Never "SKU".
- Every id is mono, in `<bdi>`, never broken across lines. A link to an order, booking or
  document names the number; a link a customer receives carries a signed token and never a
  person.

## The empty value

- **"None"** (Arabic «لا يوجد») when nothing is there: no note, no discount, no balance owed to
  show as a figure. Never an em dash, a hyphen or a blank as a placeholder.
- **"Not set"** when something should have a value and the owner has not given it yet (hours,
  a fee).
- **A zero is a zero:** `QAR 0`, `0 orders`. "None" is for the absence of a value, not a count.

## Counts and "of"

- Digits always: "3 orders", "12 unread". A no-break space between the number and its noun.
  Thousands with a comma: "1,234 items".
- Singular and plural through `count()`: "1 order", "2 orders". Never "(s)". English "0 orders" or
  "No orders yet" in a sentence. Arabic goes through `counted()` and `agree()` with whole
  templates (`arabic.md`); never a number after a preposition that needs a case the helper
  lacks: turn the sentence round.
- "n of m" for a share and a pager: `12 of 45 items`, `1–14 of 14`.
- Initials for an avatar: the first letter of the first two words of a name (`AH`), one helper.
- A quantity shows as the item's unit, trailing zeros dropped: `2 kg`, `1.5 kg`, mono in a cell.

## "By rule:" sentence form

A number the product counted by rule says how, in the panel footer (`PanelFooter`, mono 11,
muted). The form is `By rule: <the condition in plain words> · <the count>`:

- "By rule: owed for 30 days or more, no reminder in 7 days · 4 customers"
- «بحسب القاعدة: مستحق منذ 30 يوماً أو أكثر، دون تذكير خلال 7 أيام · 4 عملاء» (draft for the
  native review)

One rule per footer, thresholds as numbers, the count last after a middle dot, no "AI" or
"predicted", nothing the product did not count. The ALYR Agent dashboard keeps its RULE line
until it is restyled (`honesty.md`).

## Replacement wording

Decided on 13 Nov 2026. Each left phrase is out of the product; the right is what to write.

| Instead of | Write | Why |
|---|---|---|
| "Free replies allowed for 23 more hours" | "Typed replies allowed for 23 more hours", or "Window open until Fri 09:27" | "Free" claims what WhatsApp's own rates may not give (`honesty.md`) |
| "Ask ALYR to connect something", "Ask ALYR about a product" | "Send a request to ALYR", with "A person from ALYR reads it." (no time promised) | A request goes to ALYR's back office queue; there is no one to ask |
| "Ask ALYR how the day is going" (a linked phone) | "A linked phone can ask for today's numbers on WhatsApp" (use the real command words from the owner actions) | Name the data, not an assistant |
| A nav entry or heading "Ask ALYR" | A name for what the screen shows ("Requests", "Reports"); no entry until the screen exists | D-039 |
| "Noura asked from the workspace: Ask ALYR" (a request log line) | "Noura sent a request from the workspace" | Say who did what |
| Lifecycle tag "At risk" | The counted signal: "Payment overdue", "No sign-in for 7 days", "Line not connected"; the footer says "By rule: ..." | "At risk" predicts |
| "Churned" | "Stopped" with the date | A fact, not a label for a person |
| "Powered by ALYR", "Issued with ALYR" on a customer page | "Set up by ALYR" | "Powered" is banned; one footer everywhere |
| "SKU", "Search name, code or SKU" | "Code", "Search name or code" | `voice.md` vocabulary |
| The staff role "Agent" in a sentence | "your team", "staff", "the person who handles it" (the role keeps its name "Agent" in a role list) | `voice.md` |
| "Best when you already take card payments" (a recommendation) | State what each option is; recommend only with a reason the product counted | No unexplained advice |
| An "Assistant" label on automatic replies | "Automatic reply" | `honesty.md` |
| "estimated margin" | "Margin, from your costs" | Owners and admins only; the cost is the owner's own number |
| A "NEW" mark, "beta", "coming soon", "planned" on a screen | Nothing | D-039 |
| `07:00 to 22:00` | `07:00–22:00` | Ranges |
| An em dash as an empty cell | "None" | House style |

## Not here

The banned words and the claims table are in [honesty.md](honesty.md); Arabic grammar and the
term list in [arabic.md](arabic.md); sentence case, the middle dot and British spelling in
[voice.md](voice.md). Where the live code still differs (the API's `fmt_qar` writes "QAR" in
both languages; `ledger/service.py` hard-codes Eastern digits; `/t` and `/b` print Eastern
digits through `ar-QA`; the workspace prints English `*_text` fields), the code is wrong and
the helper replaces it as a screen moves.
