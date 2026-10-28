# What the new pages may say, checked 25 Oct 2026

Against `docs/status.md` (main, 25 Oct), the code named, and `alyr-design/honesty.md`.
"Built" means it works on the simulator or Meta's test number. No business uses ALYR yet;
every product is described as something ALYR sets up with a shop ("Set up for you").

| Claim on the pages | True today? | Source | Condition said beside it |
|---|---|---|---|
| Customers order from a page that opens from the chat, no app, no account | Built | `modules/orders/`, order page v2 (spec 005) | None needed |
| Order by the piece or by weight | Built | Decimal quantities (spec 013, ALY-149) | None |
| A daily limit per item and a time orders close; a day's notice | Built | Catalog availability rules (spec 001: daily limit, schedule with lead time, cut-off) | None |
| Each order lands on one screen with one person responsible | Built | Team accountability (D-028) | None |
| Customers are told when the order is confirmed and when it is ready | Built, inside the 24-hour window | `modules/orders/service.py`, tracking (ALY-73) | Not repeated on sector pages; the guide says "a message" generally |
| Order tracking page with each step | Built | `/t/` (ALY-73) | Ends at ready for collection and complete; no drivers or maps |
| A code or link of an item sent in the chat starts an order | Built | spec 010 | None |
| Sold out shows on the order page when stock runs out | Built | Catalog (spec 001, 005) | None |
| Delivery areas with a fee and a minimum order | Built, off for every shop | spec 014 | "once we switch it on for your shop"; no driver tracking |
| Booking page from the chat; only free times; confirmation at once; reminder 2 hours before; "my booking" to see or cancel; Came / No-show | Built | `modules/bookings/`, `/bookings` page copy | One booking at a time for the whole business (said on the salon and home services pages) |
| ALYR Agent: no-show rate over 30 days; repeat no-shows booked again; owed by age; promises passed | Built | Agent rules (D-035), `/bookings` and `/accounts` copy | Never "rule"; "counts" |
| Credit sale recorded with one line from the staff phone; customer told every entry with the new balance | Built | `modules/ledger/chat.py` | None |
| "How much do I owe?" brings the balance | Built | `BALANCE_WORDS` in `ledger/chat.py` ("how much", "owe", «كم علي», «رصيد») | Drawn as "Balance sent" in the grocery sample |
| One press sends reminders to everyone 30+ days; tone follows the age; at most one in 3 days; "stop" ends them | Built | `/accounts` copy, ledger service | None |
| A payment settles the oldest purchase first | Built | ledger | None |
| Credit limit refuses an order on account over it | Built | with ALYR Chat | "with ALYR Chat" |
| Payment links | Built on a test page only | ALY-17 open | Not used on sector pages except "card payments are not live yet" where links are named |
| Numbered receipts in Arabic and English for payments recorded | Built, ALYR Docs off for every shop | spec 011, 013; D-042 | Never "available"; framed as what we set up |
| Shared inbox, saved replies, notes, take over a chat | Built | `modules/inbox/` | None |
| ALYR answers the everyday requests; everything else goes to the team | Built (keyword and button matching) | honesty.md §2 | Never "understands" |
| No delivery-app commission on direct orders; ALYR takes no commission | Said on the homepage's questions with the offer off | `home.faq` "delivery-apps" | Only as the homepage says it |
| WhatsApp Business app has a catalog, quick replies, labels, greeting and away messages, and a short link | True of the free app, from third-party guides read 25 Oct 2026 (trengo.com, rasayel.io, qiscus.com); WhatsApp's own help centre not read | WhatsApp Business app | Guides name the features only, never a limit or a count, since the sources differ on limits |

## Must not appear (checked by `banned-words.mjs` where a pattern can)

AI words; "rule"; prices, "free", "money back"; "keep your number"; "live in 48 hours";
live on WhatsApp; customers, counts, ratings; hosted in Qatar; a response time; clinics;
parallel chairs; drivers or maps; the WhatsApp or Meta logo; competitors by name.

## Sample data

- The day split reuses the homepage's rows for bakery, salon, restaurant, home services and
  fashion (same customers' first names, same order numbers): the figure is the same drawing.
- Groceries and baqalas get their own rows: customers by first name or by flat and building
  ("Flat 12"), no business names, so no name needs the founder's register check.
- Every figure is marked "Sample" once (`SampleMark` in the drawn screen's bar) and opens
  with the machine line `fig.note`.
