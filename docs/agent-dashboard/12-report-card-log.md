# The Sunday report as a report card: build log

ALY-99, branch `aly-99-report-card`. The founder approved the redesign on 17 Oct 2026. One entry per stage, newest last.

**Before.** The Sunday report (D-030) was 25 equal lines of plain text with no headline, one section per product in a fixed order, so a bakery's report opened with credit accounts.

**After.** A branded card image at the top of the WhatsApp message, about eight lines of text under it, both drawn from ALYR Agent's engine so they agree with the dashboard.

## Stage 1 · the card image

- **Where:** `apps/api/src/alyr/modules/agent/card.py` draws the card as SVG; `week.py` reads the week through the engine and says what the card shows.
- **Reading the week.** `week.read()` runs `facts.gather()` at the last microsecond of the reported week (Saturday 23:59:59.999999 shop time). "This week" is then the whole reported week and "last week" the week before, the same days on both sides (A2). The main product and the week's state come from `view.lead()` and `view.state_of()`.
- **What it draws**, 1080 × 566 (WhatsApp's 1.91:1 header ratio, which no phone crops):
  - the ALYR logo (its 45° fold planes with the Volt plane), "Agent · Weekly report", the week ("4–10 OCT"), and "SAMPLE" on the site's samples;
  - the shop's name;
  - one hero number with its unit and its change against the week before. The hero is the measure the bars draw, so they always agree: sales for a shop or restaurant, visits (jobs, appointments) for a booking business, money collected for a trader, customers who wrote for an inbox only. A percentage only when both weeks count 20 or more (A3, `view._comparable`); otherwise "The week before: 19". The first week says "First week on ALYR";
  - seven day bars, Sunday first, the week before as a ghost bar beside each one. The busiest day is the one Volt signal, with its value. A closed day is a dashed slot;
  - two or three key facts, chosen by the products switched on and `business_type`: the main product's first fact, then what is owed if ALYR Accounts is on, then each other product's first. A bakery gets the most ordered item, what is owed and its tasting visits; a salon its no-shows, what is booked for the coming week and who wrote; an AC company its no-shows, what is owed and what is booked.
- **Themes:** Carbon (the default: it stands out in a light and a dark chat alike) and Paper. Volt only for the busiest day and the logo's plane. No red or green; ▲▼ in ink.
- **Type:** Instrument Sans for Latin and every figure, IBM Plex Sans Arabic for Arabic, IBM Plex Mono for labels in English (capitals, tracked); Arabic labels are never tracked or in capitals.
- **Rendering: resvg, through `resvg-py` 0.5.0 (MIT; resvg itself is MIT/Apache).** It shapes text with rustybuzz, HarfBuzz's rules in Rust, so Arabic letters join correctly. Tested before building: it lays every line out left to right, so a plain Arabic line came out with its words and numbers in the wrong order. Fix, in `Canvas.text()`:
  - each Arabic line is wrapped in a right-to-left embedding (U+202B … U+202C), which makes the bidi algorithm order it as an Arabic reader expects;
  - a number range inside it ("4–10") gets a left-to-right embedding of its own, as `<bdi>` does on the site;
  - the whole layout is mirrored in Arabic (x → 1080 − x): the start of the line on the right, Sunday's bar the rightmost, time running right to left (01-research C). The logo and ▲▼ are never mirrored.
  - Checked by eye on enlarged crops: "4–10 أكتوبر", "كرواسون بالزبدة", "13,400 ر.ق", "أكثر بـ33% من الأسبوع الذي قبله" all read correctly. `next/og` was not used (it scrambles Arabic word order), nor Pillow with raqm (its wheels load FriBiDi from the system, which the API's image does not have).
- **Fonts** are embedded from `modules/agent/fonts/`, copied from the design-system branch (`asset-continuity-web/public/alyr/fonts/`), each with its SIL Open Font Licence 1.1 file beside it. No system font is used (`skip_system_fonts`), so the card is the same on every machine.
- **Fitting:** `fontTools` (MIT) measures each line from the fonts' advance widths, so a long shop name or item shrinks to fit and, past a minimum, ends in "…".
- **New dependencies:** `resvg-py` (draws the card with correct Arabic shaping, free, no system libraries) and `fonttools` (measures text so it fits).

## Stage 2 · the text and the template

- **The text under the card** (`week.message()`), with WhatsApp's `*bold*` and `_italics_`:
  - the heading: report, shop, week;
  - one summary statement that agrees with the card and the dashboard: the main measure in its own words, then the comparison with the week before by the same rules ("Last week: 68 orders, QAR 12,005. Orders up 1%, sales up 1% on the week before.");
  - one line per product, the business's main product first (a bakery opens with ALYR Chat, not with credit accounts);
  - "Done for you": what ALYR sent for the business that week (A8);
  - one next step with its rule, from the dashboard's own cards (`view.render()` read when the report goes out): a suggestion with a screen to act on first, then a task waiting now, then something worth knowing. For example "Send reminders: QAR 3,501 owed 30+ days, not reminded in 7 days." and "_Rule · owed 30+ days, no promise, no reminder in 7 days · 2 customers_".
  - Arabic lines each start with a right-to-left mark, so a line that opens with "ALYR Chat" still runs right to left in WhatsApp.
  - Within WhatsApp's 1,024 characters under an image: past that the done line goes, then each product keeps its headline.
- **Arabic agreement.** Every sentence is a whole template per language with `counted()` and `agree()`. Where a count would follow a preposition (and need a case `counted()` does not have, «على عميلين»), the sentence is turned around: «6 عملاء لم يسددوا بعد», «من أصل 31», «رسائل أرسلتها نيابة عنك: 245».
- **The template `weekly_report_card`** (`core/templates.py`, stored the way the repo stores templates): utility, an IMAGE header and five body blanks (shop, week, summary, products, next step), one paragraph in each language because the repo's check keeps line breaks out of template bodies. Sample values and sample header images (`samples/report/bakery.{en,ar}.png`) are from the Qirfa sample, in both languages.
- **Sending** (`report.deliver`):
  - **inside the 24-hour window:** the card as an ordinary image with the text as its caption. No template, so no approval needed;
  - **outside it, until Meta approves the card template:** the existing text-only `weekly_report` template, as today; REPORT then brings the card;
  - **outside it, once approved and `ALYR_REPORT_CARD_TEMPLATE=true`:** `weekly_report_card` with the card as its image header;
  - **REPORT in the chat:** the card and its text.
  - If a card cannot be drawn, the report goes as text and the failure is logged.
- **The outbound layer carries images** (hard rules 4 and 5 unchanged: every image still goes through `Outbound.send`, which checks consent and the window):
  - `OutboundMessage` has `image` (PNG bytes) and `media_id`, and a new kind `image` (free-form, so only inside the window; caption at most 1,024);
  - migration **0021 `message_media`**: the image kept beside its message, tenant-owned with row-level security; kept only for a message that will be sent, and dropped for a template without an image header;
  - the delivering job uploads the image to the channel at send time: `MetaChannel.upload_media()` posts it to Meta's Media API (`POST /{phone-number-id}/media`) and sends the message with the media ID, so nothing is hosted in public. The simulator returns a stand-in ID;
  - Meta's payloads: `{"type": "image", "image": {"id", "caption"}}`, and a template's `header` component with `{"type": "image", "image": {"id"}}`. Checked against Meta's media and template-media pages on 17 Oct.
- **`templates_sync --create`** now submits a template with an image header: it first uploads the sample image through the Resumable Upload API (`POST /{app-id}/uploads`, then the bytes with `file_offset: 0`) and puts the handle in the header's example. It needs `ALYR_META_APP_ID`.

## Stage 3 · samples for the site

- `python -m alyr.report_samples` seeds Qirfa Bakery, Dafira Salon and Zilal Cooling as they stood when their report went out, **Sunday 11 Oct 2026, 9:00 Doha**, and renders the week of **4 to 10 Oct**:
  - `apps/web/app/_agent/samples/report/{bakery,salon,homeservices}.{en,ar}.png` (Carbon) and `.paper.png` (Paper), each marked "SAMPLE";
  - `{key}.{lang}.json`: the caption, its lines, the template's values and the card's data, for the site to show the real output on a phone.
- The samples are seeded at the Sunday moment rather than the dashboard samples' Thursday, so the coming week's bookings are still "booked". Their numbers therefore differ from the dashboard samples', which describe a different moment.
- Renders at phone width (330 px) are in `docs/agent-dashboard/shots-report/` (not committed). At that size the hero, the shop's name and the facts' values read easily; the small labels are about 7 px, so the text under the card carries every number too, and a tap opens the card full size.

## Checks

- 377 API tests pass in Docker (`alyr_agent_test`), including `tests/test_report_card.py`: the card renders for each sample in both languages and both themes at 1080 × 566; about eight lines within 1,024 characters; no AI words; the template's five blanks; the rules at their thresholds (20 or more for a percentage), Arabic agreement, the mirrored Arabic layout; the Meta payloads; the fallback and the approved template through the simulator; an image is never sent outside the window; and the committed samples match the engine.
- ruff clean. The web app is unchanged apart from the new sample files.

## Not done

- Nothing was submitted to Meta. The founder's steps are in D-038.
- The owners' email still carries the long sectioned report (D-030), not the card.
- No workspace screen shows the card yet (the report has no screen, D-030).
- The simulator's chat page shows an image message's caption, not the image.
- The Arabic has not been reviewed by a native speaker (ALY-66).
