---
name: alyr-whatsapp-message
description: Write or change any WhatsApp message ALYR sends to a shop's customer or to an owner. Use for automatic replies and menus in a module's chat.py, notices inside the 24-hour window, Meta message templates in apps/api/src/alyr/core/templates.py (new, reworded, translated or resubmitted after a refusal), reminders (booking, payment), order and booking confirmations, the Sunday report card's caption and its template, staff-phone replies, the WhatsApp prefill on the site, and drawings of WhatsApp messages on the site. Load alyr-design first; read CLAUDE.md hard rules 4 and 5.
---

# A WhatsApp message

A WhatsApp message is the product's voice in the customer's own chat. It is short, in the
customer's language, in the shop's name, and it goes only where Meta's rules and the
customer's consent allow.

## Before you start

1. Load `alyr-design` (voice, Arabic, honesty). Read `CLAUDE.md` hard rules 4 (official
   WhatsApp only: Meta's Cloud API) and 5 (consent before sending).
2. Read the module's `chat.py` and `service.py`, `core/outbound.py` and `core/templates.py`.
   A message is an `OutboundMessage` returned by a module or built with
   `templates.notice()`; it goes through `Outbound.send`, which records it, checks consent,
   the 24-hour window and the tenant's limit, and queues a job. **Never call a channel
   directly**, and never add a send path around the outbound layer.
3. **Check Meta's current documentation** for template categories, limits and pricing before
   relying on them (`CLAUDE.md` "How work is done" 2). The rules below were checked in Oct
   2026 and can change.
4. Decide which kind it is (below). Each kind has different rules.

## The kinds

| Kind | When it can go | Wording |
|---|---|---|
| **Reply** (free-form) | Inside the 24-hour window after the customer's last message | The module's own words, in the customer's language; buttons and lists allowed |
| **Notice** | Anything ALYR starts (confirmation, ready, reminder, report) | `templates.notice(to, name, lang, body, *params)`: `body` inside the window, the template outside it |
| **Template** | Outside the window: only a template Meta has approved, with its blanks filled at send time | Fixed wording in `core/templates.py`, English and Arabic, reviewed by Meta |
| **Image with caption** | Inside the window only; outside it, a template with an image header | Caption at most 1,024 characters |
| **Marketing** | Never yet: marketing consent cannot be captured (ALY-44); the outbound layer keeps marketing a template even inside the window and blocks it | Do not write one |

A notice sent after the window has no link unless the template has one (the tracking link
cannot go in an approved template today): write the template so it reads complete without
the link.

## Wording rules

- **Lead with the fact, in the shop's name.** "Order 1001 received: 1 x Breaker 16 A, 1 x
  Cable 1.5 mm. The total is QAR 179. You can pay here: {link} . Thank you." (the product
  writes "x" between quantity and item; the site's Arabic drawings use «×») The
  customer must know who wrote and why in the first line.
- **One message, one job.** A confirmation does not sell; a reminder does not announce.
- **Short.** A reply fits a phone screen without scrolling. Buttons say the action ("Pay
  now", "I'll pay within a week", "Cancel"); at most three.
- **The product's words, exactly:** "ready for collection", "Complete", "Booking 101 is
  confirmed". The same words as the customer pages and the workspace.
- **Polite, never pushy.** Payment reminders by age: friendly under 60 days, firm from 60,
  final from 90 (`reminder_tier`); never threats, never the amount in capitals, never "debt"
  («ديون»): «مبلغ مستحق».
- **Stop means stop.** Every customer can reply STOP / «إيقاف»; never argue with it, never
  send after it (the outbound layer blocks it; do not work around it).
- **No AI voice:** the automatic replies are the shop's, not an assistant's. No "I", no
  "I understand", no typing dots, no emoji-led messages.
- **Money:** "QAR 1,850" in English, «1,850 ر.ق» in Arabic (`money()`); `fmt_qar` writes "QAR"
  in both languages today, a known bug: use the language-aware helper in new code.
- **Links** on their own, followed by a space before the full stop (" ."), so the phone does
  not take the full stop into the link.
- **Bold** (`*bold*`) only for the one figure or name that matters; italics (`_…_`) for the
  rule line in the report. Never bold a whole line.
- **Times** as the product prints them ("Tue 13 Oct, 8:30 AM"); the weekday must be right.

## Arabic in WhatsApp

- MSA in messages ALYR sends; the customer may write in Gulf and the reply stays plain MSA
  with Gulf-friendly words. Staff replies are their own.
- **Every Arabic line opens with U+200F**, and a U+200F follows every bold or italic run
  that ends in Latin. Without it «*ALYR Chat* · 68 طلباً» displays as «68 · ALYR Chat».
- Whole templates per language with `counted()` and `agree()`; never fragments; turn a
  sentence round rather than put a count after a preposition.
- Western digits; «ر.ق» after the amount; ALYR feminine, products masculine.
- The language is the customer's: the router answers in the language they wrote in.

## Meta's template rules (checked Oct 2026; `test_every_template_follows_metas_rules`)

- Name in `snake_case` (`[a-z0-9_]+`), the same name in every language.
- Blanks `{{1}}`…`{{n}}` in order, one of each, with a sample value for each (`samples`,
  and `samples_ar` where the Arabic differs). Sample values are fictional (Al Noor
  Electricals, Qirfa Bakery).
- A blank is never the first or last thing in the text.
- No line break in the body or in a value (`clean()` puts values on one line); at most 1,024
  characters.
- Enough words for the blanks: Meta refused the Arabic booking reminder for three blanks in
  too few words (13 Oct). Aim for at least ten other words around three blanks.
- Category: **utility** for anything about an order, booking, account or report the customer
  or owner already has; Meta may reclassify a template as marketing (a back-in-stock notice
  may be). Never word a utility template as a promotion.
- An image header needs a sample image at review (`header_sample`); `templates_sync --create`
  uploads it.
- Rewording an approved template means submitting it again and waiting for approval; the
  old wording keeps going until then. Say so in the PR.
- Submitting is the founder's: `scripts/api-in-docker.sh uv run python -m alyr.templates_sync`
  shows status; `--create` submits. An agent does not run `--create` without his yes.

## The report card message (D-038)

The card image (`alyr-generated-image`) with about eight lines under it, from the engine
(`modules/agent/week.py` `message()`): heading (report, shop, week), one summary that agrees
with the card, one line per product with the main product first, Done for you, one next step
with its rule in italics. At most 1,024 characters under an image; past that the done line
goes first, then each product keeps its headline. Inside the window it is an image with a
caption; outside it the text-only `weekly_report` template until `weekly_report_card` is
approved and `ALYR_REPORT_CARD_TEMPLATE=true`.

## On the site

Drawings of WhatsApp use the site's `.wa` chat in WhatsApp's own colours, no logo, and the
product's exact words. Read ticks only on messages the drawn sender sent. The site's prefill
for ALYR's own line is the owner's voice, in Gulf Arabic on purpose.

## Do and don't

- Do write both languages at once, as whole messages, and read each aloud.
- Do add a test for every new message through the simulator (`CLAUDE.md`: the real path).
- Don't send a message that promises what is not live (card payments, "your number").
- Don't put the customer's phone number, full name or anything beyond the order in a message
  to someone else; don't log message bodies.
- Don't use WhatsApp's name or logo in a way that implies ALYR is WhatsApp.

## Done when

- [ ] It goes through `Outbound.send` or `templates.notice()`; a test covers inside and
      outside the window and STOP.
- [ ] English and Arabic written whole; agreement and RLMs checked in the rendered text.
- [ ] Template rules test passes; sample values fictional; the category is honest.
- [ ] Read on a phone-width render (the simulator, or the site's drawing) in both languages.
- [ ] If a template changed: the PR says it needs resubmitting, and the founder is asked.
