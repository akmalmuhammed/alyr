# Spec 004: The Catalog on WhatsApp (staff commands, photo to draft, item messages, back in stock, alerts)

Status: built in ALY-106 (package 5 of the Catalog, ALY-101). Decision: D-039 ("As built (ALY-106)"). The plan with the 30 scenarios is the Eraser file named there; scenarios 13, 15, 16 and 17 are this package's. The engine it stands on is `specs/001-catalog-engine/spec.md`; the screens are `specs/002-catalog-screens/spec.md`.

Nothing here is visible to an owner or a customer yet. Every part runs only for a shop whose **`catalog` module is on**, and that module is off for every shop until the go-live sweep (ALY-113). Nothing says "coming" or "beta".

## Who may do what

| Who | What | How it is decided |
|---|---|---|
| A **registered staff number** | Change the Catalog by message: sold out, back, stock, price, undo; send a photo to add a draft | `contacts.role = 'staff'`. The owner registers numbers in the workspace (Catalog settings, "Staff on WhatsApp") through `/api/staff-numbers`, owners and admins only |
| A **manager** (a staff number marked so) | Also gets the stock and refund messages, and may put a draft made from a photo on sale | `contacts.catalog_manager`. A shop that has marked nobody falls back to the numbers that receive the weekly report |
| **Any other number** | Is a customer. Its message goes to the customer side; the staff commands do not exist for it | The router offers a staff message to the commands only when `role = 'staff'` |

A number that is not registered gets exactly the reply any customer gets for a message the shop does not understand, in the language it wrote in. A test sends every command, in both languages, from a stranger and from a known customer, and compares the replies byte for byte with a meaningless message's.

Registering a number that the shop knows as a customer makes it staff and keeps its history. Taking a number off the list makes it a customer again and clears its open question. Registering is the agreement to be told about the shop's own stock and money (a `service` consent with source `staff_registration`).

## Staff commands (`items/commands.py`, `match.py`, `wa_staff.py`)

| Say | Means | English | Arabic |
|---|---|---|---|
| Sold out | Switch the item off (a size: set it to 0) | `sold out shawarma` | `نفذ شاورما`, `الشاورما خلصت` |
| Back | Switch it on again | `back shawarma` | `رجع شاورما` |
| Stock | Count: set the stock of a size | `stock abaya black M 5` | `مخزون عباية أسود M 5` |
| Price | Set the price (riyals, `12`, `12.5`, `12,5`) | `price shawarma 12` | `سعر شاورما 12` |
| Undo | Put back the staff member's newest change | `undo`, the Undo button | `تراجع` |
| Help | List what is understood (staff only) | `help` | `مساعدة` |

The verb comes first; for sold out and back it may also come last («الشاورما خلصت»). Arabic digits, the Arabic article «ال», the spellings people mix up (hamza, ya and alef maqsura, ta marbuta and ha) and a letter missing or wrong in a longer word are all forgiven. A message that does not start (or end, for the two switches) with a verb is not a command and goes on to the other modules: staff also record credit sales and payments by message.

**Never guess.** A name that fits one item is that item. A name that fits several is asked about: a list message with numbered rows and the same list in the text; the answer is the number typed (Arabic digits too) or the row tapped. Nothing changes while the question waits (15 minutes, then it is forgotten); a new command replaces it. A name typed in full beats longer names that merely contain it. A size is a target only when the typed words reach past the item's name (`abaya black M`); `stock abaya 9` on an item with sizes asks which size. More than ten matches ask for more of the name.

**It says what it understood and offers Undo.** Each change answers in the staff member's language with an Undo button (`undo:<id>`). Undo is once per change and only for the person who made it. It refuses, and says so, when the thing changed again since (a switch flipped or a price edited by someone else); a count is undone by a compensating movement and refused when putting it back would take the stock below zero.

**Who and how.** The stock log (`stock_movements.via`), the price history (`item_price_history.via`) and the activity record (`detail.via`) say `whatsapp`, and the actor is the staff member's name. The stock log screen shows "WhatsApp" beside the name. Every change goes through `service.set_available`, `service.record_stock` and `service.update_item`, the same functions the workspace uses.

Refusals are plain: an item that is a draft, hidden or archived is not touched by sold out and back; an item that is always available has no switch; an item that is not counted cannot take a stock figure; a price the service refuses (a sale price above it) is reported and nothing changes.

## Photo to draft (`wa_photo.py`)

A staff number sends a photo with a caption. The inbound message carries the channel's file ID (`InboundMessage.media_id`); a job (`catalog.photo_draft`) downloads it (`Channel.download_media`: Meta's two requests, or the simulator's own store), runs it through the photo pipeline (`core/media.py`), and makes a **draft** item with the photo as its cover. The caption gives the name and price: Latin words are the English name, Arabic words the Arabic name (Arabic only is kept as both, as the workspace does), a number beside QAR or «ريال», or last, is the price. A draft is never for sale.

The reply: a manager is asked "Put it on sale?" with buttons (Put on sale, Undo); the item then needs a name, a price and an Arabic name (Qatar's consumer law), and the reply says which is missing. Anyone else is told it waits for an owner, and the managers are told (text inside their window, the `draft_added` template outside). The same photo twice is one draft. A photo that cannot be used (wrong type, damaged, too large, over the shop's limit) is refused in the staff member's language. The job retries a failed download; if it never works the staff member is asked to send the photo again.

## Customers in the chat (`wa_customer.py`)

* **An item name** (part of it, a spelling mistake, English or Arabic, with "do you have" around it) brings the item's photo as a JPEG with its name, description, price (with the sale and "from" for sizes), the choices, "only 3 left" when 5 or fewer are, and an **Order** button (`order`, handled as before). Without a stored photo the same message goes without it; without the orders module there is no button. Several matches become a list to pick from. Every word of what was written, apart from small talk, must be part of the item's name, so "balance" or "hello" are never an item. Only live items are shown.
* **"menu"** brings a list of what can be ordered now (ten rows at most, each with its price) and the order link; with nothing to list it falls through to the order link as before.
* **A sold-out item** offers **Tell me when back**.

### Tell me when it is back (plan scenario 13)

1. The customer taps the button or writes "tell me when X is back" («بلغني لما يتوفر X»).
2. If they have not agreed to messages from the shop, they are asked once, in plain words: who it is from, that it is an update message, and that STOP ends it. Yes records a **marketing consent** (`consents`, source `back_in_stock_request`, with the words they were shown); No records nothing. A customer who already agreed is not asked again; one who said STOP is told so.
3. A `stock_watches` row waits (one per customer and item). When the item can be ordered again, whatever the route (staff say back, stock received, a count, an order cancelled, an unpaid order's hold running out, a switch turned on in the workspace), `events.py` queues a job and **one message** goes to each waiting customer, and the request is closed in the same transaction. A second sell-out and return sends nothing. STOP closes every request unsent; a request nothing came of in 60 days expires.
4. Inside the customer's 24-hour window the message is ordinary text. Outside it, the `back_in_stock` template.

**How Meta classifies it** (template guidelines, checked 18 Oct 2026, `developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization`). Utility templates must be non-promotional and specific to or requested by the user. The page does not name back-in-stock or availability alerts, but its retargeting section lists "We found a {{car}} that meets your saved search" among messages that are "marketing even if requested by users". An item back in stock is the nearest case, and a template filed as utility that Meta judges to be marketing is approved as marketing anyway (since 9 April 2025). So `back_in_stock` is **MARKETING**: the outbound layer sends a marketing template only to a customer with marketing consent, and a customer without it is recorded as not sent (`stock_watches.status = 'not_sent'`, reason `no_marketing_consent`). Outside the window it is billed as a marketing conversation; nothing is paid until Meta billing is on.

## Messages to the shop's managers (`alerts.py`)

* **Low stock and sold out.** A sale or a count that takes a counted item (rules count and daily limit) to its low-stock number, or to nothing, queues `catalog.stock_alert`. The number is the item's own `low_stock_at`, else the shop's. An item sends at most **one low and one sold-out alert a day** (the key is item, kind and the shop's own date), none **between 22:00 and 07:00** on the shop's clock: an alert that falls in the night waits for 07:00 and is looked at again, so an item refilled overnight says nothing. With nobody to tell, nothing is counted as sent.
* **A refund is due.** Cancelling an order the customer paid (`cancel_order`) tells the managers which order, how much, and that the refund is theirs to make from their own payment account. A payment that arrives for an order whose payment link had already expired and which was cancelled (a real gateway; the stand-in moves no money) tells them too, once per payment, and is on the order's record as `late_payment`.
* **A draft is waiting** (above).

Inside a manager's window these are text in their language; outside it, the templates below.

## Templates (not submitted)

Added to `core/templates.py` in English and Arabic. They are **not** submitted to Meta; the reviewer runs `python -m alyr.templates_sync --create`.

| Name | Category | Used for |
|---|---|---|
| `stock_low` | utility | Low-stock alert to a manager |
| `stock_sold_out` | utility | Sold-out alert to a manager |
| `refund_due` | utility | A paid order was cancelled |
| `refund_due_late` | utility | A payment arrived after the payment link expired |
| `draft_added` | utility | A staff member sent a photo for a new item |
| `back_in_stock` | **marketing** | An item a customer asked about is back |

## Tables and settings (migration 0027)

`items.low_stock_at`; `contacts.catalog_manager`; `stock_movements.via` and `item_price_history.via`; `staff_changes` (what a staff member changed, for Undo); `staff_pending` (the open question, one per staff member); `stock_watches`; `stock_alerts`. Every new table has `tenant_id`, forced row-level security and the isolation tests.

`low_stock_at` is on the item API (`POST`/`PUT /api/items`, null clears it) and in the edit sheet beside "how it runs out"; the low-stock filter and the alerts use it.

## API added

`GET`/`POST /api/staff-numbers`, `PUT`/`DELETE /api/staff-numbers/{id}` (owners and admins). In development only, `POST /sim/photos?from_number=…&caption=…` with the picture as the body plays a phone sending a photo.

## Acceptance

`apps/api/tests/test_catalog_whatsapp.py` (commands, asking, undo, the stranger), `test_catalog_whatsapp_photos.py` (staff numbers, photos, the channel), `test_catalog_whatsapp_chat.py` (items in the chat, back in stock) and `test_catalog_alerts.py` (alerts, refunds, the item's own number). Scenarios 13, 15, 16 and 17 are named in them; every command is tried in English and Arabic. Nothing reaches Meta: the photo "download" is the simulator's own store.

## Left for others

The Arabic of every message is a draft until ALY-66 (all of it is in `modules/items/wa_text.py`, plus the six templates). Templates by business type and the name "Menu" (ALY-107). Import and export (ALY-108). Weekly report lines and the back-office usage view (ALY-109). A real run on Meta (the reviewer): sending the new templates, a real photo download, the image-header buttons message. Customer price groups. Voice notes and Meta catalog sync are not release 1.
