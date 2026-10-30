# ALY-263 · What the demo may claim (29 Oct 2026)

Read against the code on this branch (cut from main 53da141) and `docs/status.md` of 28 Oct 2026, not against older docs. "Built" means it works on the simulator or Meta's test number; no business uses ALYR yet. Each scene's labels in the demo follow this table.

## Labels

| Label | Means | Arabic (draft) |
|---|---|---|
| Built | The product does this today, on the test number | مبنيّ |
| Set up by ALYR | A service ALYR does for the shop at setup, outside the product | تجهّزه ALYR |
| Sample | The names and numbers are a fictional shop's | مثال |
| Sample week | The week's numbers are the engine's captured sample | أسبوع توضيحي |
| Your estimate | Worked out from the owner's own three numbers on screen | تقديرك |

## Claims, scene by scene

| Scene | Claim | True today? | Source | Condition shown |
|---|---|---|---|---|
| 3 | A message after closing gets the order page back at once | Built | `modules/orders/chat.py` ("Here is our order page. Pick what you need: …") | "Works on WhatsApp, the app your customers already use." No claim about the shop's own number |
| 3 | The customer picks a size, a choice (flavour), the message on the cake and the pickup day | Built | `capabilities.py` `variants`, `options`, `pickup_date`; the bakery demo shop's "Message on the cake" choice (`demo/shops/bakery.py`) | none |
| 3 | The name "Noor 7" | **Not a field on the order page.** The customer writes it in the chat; the team sees the chat beside the order | `_customer/order/` has no free-text line for an item | Drawn in the chat, not as a field. Open for the founder (a text choice is a product change) |
| 3 | A pay link, then Paid | Built on a stand-in test page | `pay/[tenant]/[payment]`, status.md | "Card payments go live with your own payment provider." |
| 3 | "We received QAR 160 for order 1043. Thank you." | Built (template text) | `core/templates.py` | Template needs Meta's approval outside the 24-hour window; inside it, an ordinary message |
| 3 | A number each day: 11 of 12, 12 of 12, then the next day with room | Built | `items/availability.py` `rule_daily_limit`, `first_day_with_room`; `items/notes.py` "Order ahead: next available {day}" | none |
| 3 | "Tomorrow's list" of what to make | **No such screen.** Orders carry their day; a per-day list by item is not built | `orders/service.py`, `_workspace/Screens.tsx` | Drawn and marked Sample, not Built. Open for the founder |
| 4 | "Order #1043 is ready for collection." and the tracking page | Built | `orders/service.py` status words, `t/[tenant]/[order]` | none |
| 4 | Sold out, "Tell me when it is back", one message when it is back | Built | `capabilities.py` `back_in_stock`, `core/templates.py` | Outside 24 h it is a template (marketing) that needs Meta's approval and the customer's consent to that one message |
| 4 | The café's reminder is firmer because the debt is older | Built: gentle under 60 days, firm from 60, final from 90 | `ledger/service.py` `reminder_tier`, `reminder_text` | One press sends reminders (they are not automatic). The café's oldest purchase is 64 days, so the firm wording is the product's |
| 4 | The café sees its own prices | Built | `price_groups` | none |
| 4 | A numbered invoice in Arabic and English | Built, and off for every shop until its screens are reviewed | ALYR Docs, D-042 | Label Built; never "live" |
| 4 | "QAR 45 kept" on a QAR 180 order | Arithmetic on the owner's 25% | the pain card | Your estimate |
| 5 | One order touches Chat, Shelf, Docs, Accounts, Bookings, Agent | Each step built; Docs is off for every shop until set up | the modules | "If it is the café" for Accounts |
| 5 | Booking reminder two hours before | Built | `bookings/service.py` `REMIND_BEFORE = 2 h` | none |
| 5 | Each person on the team with their own sign-in | Built | `core/auth.py`, team and roles | none |
| 5 | A second branch under the same account | **Not built** | no branches in the schema | Drawn on a dashed rule, "Not built yet" |
| 5 | More products switched on when needed | Built (modules per shop) | `catalog.py`, D-027 | none |
| 5, 8 | Every month we sit with your numbers | A promise of the service (D-048, open for the founder) | decisions.md D-048 | Set up by ALYR |
| 6 | Google profile with an Order button that opens the shop's ALYR page; review request after pickup | Not product features. The founder's bundle | `00-founder-decisions.md` | Set up by ALYR |
| 6 | QR card and Instagram bio link to the order page | Built (`share_links`, `table_qr`) | `capabilities.py` | none |
| 7 | The Sunday report card | Built, never sent to an owner | status.md, D-038 | Sample week; "The first reports go out once WhatsApp approves the report's wording." |
| 7 | The Agent home | Built | `_agent/AgentDashboard.tsx`, samples | Sample week |
| 8 | "Your customers are yours. Our staff never read your chats." | ALYR staff (`/ops`) see every client, never a shop's conversations | `alyr-product-screen` surfaces, `/ops` | none |
| 8 | "Month to month, 7 days' notice." | The agreed terms (honesty.md §6); no price beside it | honesty.md | none |
| 8 | "Works on WhatsApp, the app your customers already use." | True of the channel | founder's line | Never "keep your number" (ALY-39) |
| 9 | A QR code to a test line | Only if the founder enters the link on the setup panel | setup panel | Without a link, no code is drawn |

## Must not appear

Any price; AI words (honesty.md §1); "smart", "seamless", "solution", "platform", "unlock"; keep your number or the WhatsApp Business app; WhatsApp or Meta logos or WhatsApp green on ALYR's own surfaces; Google's logo; card payments as live; a provider's name; invented customers, testimonials, market statistics or ratings beyond the one drawn sample review; "rule" lines (the owner is new to ALYR, as on the public site).

## Names used

Qirfa Bakery (the default before the founder types a name; register, web check 16 Oct 2026), customers Mariam Saleh, Aisha Hamad, Khalid Nasser (register), Tamr Café (register, **not checked**), first names only in the scene-1 previews. The founder's manual check of Tamr Café is open.
