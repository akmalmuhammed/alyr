# 010 Order by code: the Catalog as a support layer (ALY-136, D-039)

Written 19 Oct 2026. Migration 0033. No new dependency, no new Meta template.

## The model

A shop shares its inventory page. The customer browses it (photos, details), picks something and
gives the chat an identifier: the item's **link**, its short **code**, its **SKU**, or its **name**.
The chat finds it in the shop the chat belongs to, answers with the item's card, and asks the
customer to **Confirm**. Confirmed items form a **draft order** with a live total; **Place order**
then goes through the ordinary order path (`modules/orders/service.py`), so stock, holds, the credit
account and the pay link are done by the code that already does them, once.

It works in two modes, chosen by the shop (Catalog settings, "How customers order", `shop_settings.whatsapp_mode`). **`link` is the default** and the one recommended (no real shop has a connected number yet, so the prefilled message is a readable order, not bare codes for a human-run number); the seven demo shops and the demo shop Al Noor (the simulator's line) are set to `chat` explicitly. The column is new in migration 0033, so no shop had a stored value: every shop starts on `link`, and a shop that picks `chat` keeps it.

| | `chat`: the shop's number runs on ALYR | `link` (default, recommended): the shop keeps its own number |
|---|---|---|
| Who reads the customer's message | the chat (`modules/items/wa_order.py`) | a person, in the shop's own WhatsApp |
| What "Order on WhatsApp" prefills | codes only, under 140 characters: `Hello Al Noor, I would like to order (item codes): #214 x2, #305. Thank you!` | an order to read at a glance: one line per item (code, name, size, quantity, price), the total, the customer's name when known |
| Long orders | several numbered messages (`Order (1/2): ...`), which the chat adds to one draft | parts of about 900 characters, the total on the last |

The choice only changes the wording of the message the page prepares. Nothing depends on Meta's
catalog features (whether they work in Qatar is unverified): ALYR's catalog is the source of truth.

## Item codes

- A new `items.code`, a small whole number, **per shop, from 101, in the order the shop made its items**, unique in the shop, never changed and never given again (an archived or deleted item keeps its number). Separate from the SKU, which stays the owner's own.
- **The database gives it** (trigger `items_assign_code`, counter `item_code_counters`, a security-definer function so the app role has no right to write the counter): every way an item is made, including imports, seeds and tests, gets one; two items made at the same moment take turns on the shop's counter row (proved with the second one waiting on the first, `tests/test_item_codes.py`). The trigger also refuses any change to a code that is set.
- Examples (`is_sample`) have no code and use no number; `create_item(sample_key=...)` makes them samples from the first row. Keeping one as your own gives it a code.
- Migration 0033 numbers every existing item per shop, oldest first (`created_at, sort, name, id`), names the shop in every statement (a superuser owner is not held to one shop by row-level security: the first version of the migration numbered all shops' items together and `tests/test_item_codes_migration.py` caught it), and works for an owner that does not bypass row-level security.
- Range 101 to 99,999 (three to five digits, easy on an Arabic keyboard). A shop would have to make 99,899 items to run out; the shop's item cap is 1,000.
- Shown: the item card and list row (workspace), the edit sheet (large, with a copy button, not editable), the share sheet (a list of the codes of what is being shared, each copyable; the item's code and "Send code 214 to +974... on WhatsApp" on its printed card), the order page's cards, item sheet, list and wholesale table's first column, the export (a read-only column "Item code (ALYR)", which an import reads and never writes), search in the workspace and on the order page.

## What the chat recognises (`modules/items/codes.py`, pure)

English and Arabic, Western, Arabic-Indic and Persian digits, invisible direction marks ignored:

| Form | Examples |
|---|---|
| a pasted item link | `https://app.alyr.qa/s/al-noor?item=<id>` (another shop's slug resolves nothing) |
| a pasted category link | `...?cat=Cables` (the items in it that can be ordered now, to pick from) |
| a code | `214`, `#214`, `code 214`, `item no. 214`, `رقم ٢١٤`, `كود 214`, `منتج رقم 214` |
| several, with quantities | `214 x2, 305`, `214x2 305x3`, `2 x 214`, `#214 ×2 و #305`, `٢١٤ عدد ٢`, `214 qty 3`, one per line |
| a size | `214 (black M) x2` |
| a SKU, typed exactly | `OUD-12`; also a SKU of plain words when it is all the message says; the SKU of a size picks that size |
| a name | fuzzy as before (`match.py`), but **every word, numbers too, must fit** the name: "iPhone 12" is not "iPhone 15" |

A bare number of 3 to 5 digits is a code only when the rest of the message says nothing else
("214", "do you have 214 please"); with other words ("pay 500", "214 shirt", "iPhone 128") it is part
of a name; a cued number ("code 214", "#214") is a code whatever else is said. Amounts of money next
to QAR / «ر.ق» / "Total" are never codes.

**The OUD-12 hazard (found in the audit).** A token like `OUD-12` fell into the name search and
found an unrelated item whose name contains "oud". Now a token with letters and digits in it is a SKU
reference and nothing else: looked up as a SKU (exact, any case), and if nothing matches, the customer
is told that code was not found and offered "Search by name" and "Talk to a person". Never a card of an
unrelated item (`tests/test_order_by_code.py::test_a_sku_shaped_word_with_no_such_sku_never_matches_an_item_by_name`).

## The flow

1. **Identify.** One message may name several items: they become **one** question.
2. **Card.** One item: its card (photo as a JPEG, name in the customer's language, price in the customer's price group, "from" for sizes, the sale, the code, "only 3 left") with **Confirm** and **Change**. Several: one summary (lines, total) with one Confirm. A size that is not clear is asked (a list; the item is shown first); a size in brackets that fits exactly one is used. An item with a required choice (extras) cannot be ordered in the chat: the customer gets its page, opened on it. Sold out or closed: the card says so, with "Tell me when it is back" (the existing narrow consent flow); nothing is added.
3. **Confirm** adds to the draft after reading price and stock again; any change is said and the question asked again (nothing is added behind the customer's back). **Change** drops the question ("send the code, link or name of the item you want", with "or say 'same as last time'" to a customer who has ordered before).
4. **Draft** with a live total: *Place order* (pay link), *On my account* (only for a customer with a credit limit), *Empty order*. More codes add to it.
5. **Place order** reads price and stock once more; if anything is different from what was last shown it says so and shows the draft again (an item that went is taken off and named); only an unchanged draft goes to `create_order`, inside a savepoint, so a refusal (over the credit limit, too many unpaid holds) keeps the draft and says why in the customer's language.
6. Typing "yes"/"no"/"نعم"/"لا" answers the question; "same as last time" offers the last order again as one question; "cart", "place order" work when a draft exists.

Pending state: `chat_carts` (one row per customer, forced RLS): the draft lines (each with the price last shown), the pending question (with an id in its buttons, so a tap on an old button cannot answer a newer question; a question lives 30 minutes, a draft 6 hours since the last message). A draft holds no stock.

## Unclear things go to a person

A voice message, a picture without a code, a sticker, a document: a polite reply that says a person from the shop will look at it, and an `asked_person` entry on the conversation's record (once in ten minutes). The conversation is already open in the team inbox: every customer message opens it. The same for "talk to a human" in words or by the button, and for a sender who has been rate limited.

## Abuse

- Codes are looked up only in the shop of the number the customer wrote to (row-level security and the tenant of the chat); a link naming another shop's address resolves nothing.
- Five codes that match nothing in ten minutes (counted per sender) hand the sender to a person; nothing is searched until the window passes.
- A draft holds at most 30 lines; a shop at most 500 drafts at once (`chat_cart.MAX_LINES`, `MAX_OPEN`); a message is read for at most 20 items (the rest is said); an expired draft is deleted when the shop next needs room.

## "Order on WhatsApp" on the page (`_customer/order/wa.ts`, pure and tested)

Shown when the shop has typed its number (Catalog settings, as before). Without it the customer sees no button and no way to pick, and the owner is told in the share sheet and in the settings ("Add your WhatsApp number").

- **A visitor** (no link of their own: a shared item, category or table link, a QR code) can pick items with the same steppers; the bar shows the count, the total and *Order on WhatsApp*, and "See my list" opens the list to change. The **item sheet** has *Order on WhatsApp* for that item with the size and quantity chosen, and "Add to my list". A shared item link opens on it.
- **A customer with their own link** orders as before; the review offers "Send on WhatsApp instead".
- The link is `https://wa.me/<number>?text=<UTF-8 percent-encoded>`; the text is built by the same function for both, and `specs/010-order-by-code/messages.json` holds the messages the page writes, which the page's tests and the server's reader tests both check (one file, two languages of code).
- A shop name with three or more digits is left out of the chat message (it could be read as a code).
- Instagram's in-app browser may break the hand-off to WhatsApp. **Not tested here** (no phone, no Instagram).

## Not built, on purpose

- A copy of link-mode orders in the ALYR team inbox: the visitor has no contact in ALYR (public links carry no person), the inbox is built on conversations with a customer, so a copy would need an anonymous-customer concept. Say if wanted.
- A shop prefix on codes: a number is one shop's here (`channel_numbers.number_id` is one tenant), so there is no shared number to route. The shop's name is in the message for a human.
- Codes on order lines and in orders lists (the order keeps the item's id; the SKU is still copied).
- Staff commands by code (`sold out 214`): `commands.py` is unchanged.

## What was checked

See the pull request and `docs/lanes/product.md`. Tests: `test_item_codes.py` (assignment, concurrency, isolation, search, export), `test_item_codes_migration.py` (backfill, both kinds of owner), `test_item_code_parse.py` (every form), `test_order_by_code.py` (the chat's flows through the simulator and the real order path), `customer.test.mjs` (the page's messages), and `scripts/order-by-code-browser-check.mjs` (a real browser at 375 px, English and Arabic, light and dark).
