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
  - seven day bars, Sunday first, the week before as a ghost bar beside each one (no legend since stage 4). The busiest day is the one Volt signal, with its value. A closed day is a dashed slot;
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
- Renders at phone width (330 px) are in `docs/agent-dashboard/shots-report/` (not committed). Since stage 4, the smallest text there is about 9.5 px.

## Stage 4 · readable at a phone's size (the founder's fix, 17 Oct)

The founder approved the card with one fix: at WhatsApp's bubble size (about 330 px wide) the small labels were about 7 px and unreadable.
- **Every small label and sub-line about 40% larger:** the smallest type is now 31 px on the card (`card.SMALL`), about 9.5 px at 330 px. Labels went from 23 to 32, sub-lines from 26 to 32, day names from 20 to 31, the busiest day's value from 20 to 31, the change line from 28 to 32. The hero number is unchanged (132).
- **Re-flowed:** the header, the hero and the bars moved up; the fact values sit at 44.
- **Dropped:** the legend (too small to be worth its room). The template's text now says the bars compare each day with the same day the week before.
- **Shortened:**
  - the eyebrow is "Weekly report", without "Agent";
  - "Booked ahead / next 7 days";
  - "ordered again", "of 31 due", "first message";
  - in Arabic, the change line «▲ 33% عن الأسبوع السابق» (the mark says which way; it was cut short on the salon card) and «عميلان مدينان».
- **Arabic day names** are their initials (ح ن ث ر خ ج س), as Arabic calendars head their weeks. The names did not fit seven columns at a readable size.
- **Measuring Arabic:** joined letters turned out 0.66 to 0.84 as wide as the isolated forms `width()` measured, so lines were cut too early. They are now scaled by 0.86, checked against resvg's own renders.
- **New tests** fail if any text on any sample card is under 31 px, or if any line on any card, in either language and theme, is cut short with an ellipsis.
- The samples and the phone-width shots in `shots-report/` were captured again.

## Stage 5 · the card on the public site (Site and brand lane, branch `aly-99-report-site`)

The founder approved replacing the site's drawing of the old report (a white card of 25 plain lines) with the real report card.
- **Where:** the homepage's How it works, step 4 (the bakery, in both languages), and `/agent`'s Sunday report section, which follows the Bakery / Salon / Home services switch on the page's ALYR Agent figure. The old drawing (`ReportBubble`, `.d-report`) and its 25 lines of copy are gone everywhere.
- **The message** (`apps/web/app/_site/ReportPhone.tsx`): the site's WhatsApp chat (`.wa`, the same drawing and colours as `/chat`, light and dark), from the business's own line ("Qirfa Bakery · Business account", as the report goes from the shop's number), a "Sunday" chip, one image message with the card, the engine's text under it with `*bold*` and `_italics_` drawn as WhatsApp draws them, and 09:00. No ticks, since the owner receives it. No message bar: its placeholder in WhatsApp's own grey fails contrast (axe), and the bar adds nothing to the message.
- **The card follows the theme:** Carbon on dark, Paper on light. Both read well in the drawn chat; matching the page was chosen and is the same on every figure. Both pictures are lazy and the hidden one is `display: none`, so only the shown card is fetched.
- **The images** (`scripts/site-report-images.mjs`): AVIF (12–18 KB), WebP (19–29 KB) and a palette PNG fallback (15–22 KB) per card, 1080 × 566 with explicit width and height, imported so Next fingerprints them (`_site/report/index.ts`, written by the script). Run it again whenever `python -m alyr.report_samples` captures new samples.
- **Words:** alt text for each card from the card's own facts, and the sender, day and time, in `copy.ts` in both languages (`report`). The message text is the engine's sample output, unchanged, apart from one display fix below. Captions: "The Sunday report on WhatsApp, for 4–10 Oct" with the sample's "fictional bakery / salon / AC company"; the week is named because the ALYR Agent figure above it shows a later Thursday (15 Oct) with different numbers.
- **Claims:** unchanged framing. The homepage's step 4 and `/agent` still say the first reports go out once WhatsApp approves the report's wording, and `/agent`'s eyebrow keeps "Early access". `/agent`'s body now describes the card (main number against the week before, each day beside the week before, two or three facts, a line per product, what ALYR did, one next step with its rule) instead of "one section per product", and drops the REPORT line, which described the text-only fallback.
- **Arabic order in the text (product fix needed).** An Arabic line such as «‏*ALYR Chat* · 68 طلباً» opens with a right-to-left mark, but the number after a Latin bold name is tied to it by the bidi algorithm, so the line shows «68 · ALYR Chat» from the right, in WhatsApp as on the site. The site adds a second right-to-left mark after each bold or italic run on an Arabic line (`marks()` in `ReportPhone.tsx`). `week.message()` should do the same (U+200F after each marked run that ends in Latin), then the samples captured again; until then the site's Arabic text differs from the engine's by those invisible marks.

**Checks:** `pnpm lint` clean; `pnpm build` and `bash scripts/build-site.sh` pass (129 files). axe-core on `/`, `/ar`, `/agent`, `/ar/agent` at 1440 and 390, light and dark, scrolled to the report (16 runs): no violations. Lighthouse mobile on the built site, two runs each: `/` Performance 97, LCP 2.4 s, CLS 0; `/agent` 98, 2.3 s, 0; `/ar` 96–97, 2.4 s, 0; `/ar/agent` 98, 2.3 s, 0; Accessibility, Best practices and SEO 100. Screenshots in `docs/agent-dashboard/shots-report-site/` (not committed).

## Checks

- 377 API tests pass in Docker (`alyr_agent_test`), including `tests/test_report_card.py`: the card renders for each sample in both languages and both themes at 1080 × 566; about eight lines within 1,024 characters; no AI words; the template's five blanks; the rules at their thresholds (20 or more for a percentage), Arabic agreement, the mirrored Arabic layout; the Meta payloads; the fallback and the approved template through the simulator; an image is never sent outside the window; and the committed samples match the engine.
- ruff clean. The web app is unchanged apart from the new sample files.

## Not done

- Nothing was submitted to Meta. The founder's steps are in D-038.
- The owners' email still carries the long sectioned report (D-030), not the card.
- No workspace screen shows the card yet (the report has no screen, D-030).
- The simulator's chat page shows an image message's caption, not the image.
- The Arabic has not been reviewed by a native speaker (ALY-66).
