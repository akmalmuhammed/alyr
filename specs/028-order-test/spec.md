# 028 · The owner's test order

Linear ALY-168 (epic ALY-163). Decision D-064. Part 3 of spec 027 (self-serve onboarding for order businesses, D-063). Builds on D-031 (the private test line every new business gets) and the readiness check (D-049), whose "test" line already knows an order placed by the test customer proves the owner tried it.

## What it is for

An appointment business ends its setup by booking a test visit on a private test line. An order business needs the same: the owner plays their own customer, orders from the real order page, and sees what their customer would see and what their team would get. When they finish, the test leaves no trace in the numbers and no stock behind.

## What the owner does

In `/start`, on the `try` step of the `orders` way:

1. Says **menu** on the test line (a suggestion chip, or types it). The chat answers with the owner's own order link: a signed token, never a contact ID (hard rule, `core/links.py`).
2. Opens the link, which is the shop's real order page, picks items and places the order. The page is the same one customers use; nothing is drawn for the test.
3. Back in `/start` the screen says **"It works. Order #1001 came in, QAR 80."** and Continue turns on. The order is in the workspace's Orders list marked **Test order**.
4. Taps **Mark it ready**, as staff would. The customer's message ("Order #1001 is ready for collection.") appears in the test chat.
5. Continues to the plan and the go-live list, where "test order" is done. Skipping the test is allowed, as for bookings; the go-live check then stays open.

## What a test order is

- **Marked once, by the database.** `orders.is_test` (migration 0056) is set by a trigger when an order is inserted for a contact whose `wa_user_id` starts with `TEST.` (`core/identity.TEST_PREFIX`; a real customer's ID is a phone number). Because a trigger sets it, no way of making an order (the page, the chat, a file, connected mode, a seed) can forget it, and nothing in the application writes the column (a test checks that).
- **Real where the owner needs it real:** it takes stock, it has a number in the shop's sequence, it is in the list and the inbox, it can be moved along by staff, and the customer's messages are sent.
- **No money, no documents:** a test order asked to be paid by link is placed as pay on collection, it cannot be marked paid (`order_is_test`, 409), no receipt or invoice is ever made for it, and cancelling it never raises a refund.
- **Counted nowhere.** Every query that adds orders up leaves it out: the ALYR Agent, the weekly result report, the home card "orders today", the team's numbers, the Catalog's reports (sold, margin, deliveries, discounts, items that did not sell), "came back" customers. The owner's test chat is also left out of the customer and message counts (the Agent's and the weekly inbox section's).

## The guard

`tests/test_order_test.py` reads the application's SQL (every string literal in `src/alyr`) and fails for any query that reads `orders` without naming `is_test`, unless it is listed in `FINE_WITHOUT` with the reason it need not (one order by its ID, one customer's own history, the owner's own list). A new report that counts orders and forgets the mark fails the test and names the query; a listed query that no longer exists fails it too. A second test gathers the Agent's facts and the weekly report before the test, after the order, and after finishing, and requires that the order-derived numbers do not move and that, once the test is over, everything equals what it was before (except when the business is marked as set up).

## When the test ends

Finishing onboarding (`POST /api/onboarding/finish`, which opening the workspace calls) cancels every test order of the owner's test customer, **whatever state it reached** (the owner may have marked it ready) and gives its stock back, in the same transaction, once. Nothing is sent to the test customer and no one is told. The order stays in the list, marked Test and cancelled, as the test booking and the test chat stay in the history. The answer says how many were cancelled (`test_orders_cancelled`).

## Switching the path on

`presets.BUILT_WAYS` now lists `orders`, so the back office can switch an order type to self-serve. **That moves no type:** each one stays set up with ALYR until the founder switches it in `/ops` (D-032, D-063). Wholesale and travel still cannot be switched.

## Not in this spec

- **The test customer's chat in the inbox and the "unanswered" home card** during the test: the chat is a real conversation while the owner tests, and `finish` closes it, as for bookings.
- **Documents for a test order,** and **online payment** in the test: a test order is pay on collection. Testing the pay page needs the shop's own payment account (D-044) and waits for it.
- **Items that were ordered in a test** are not deletable afterwards (an item with an order is archived, not deleted), the same as for any item that has been ordered. A sample the owner ordered in the test stays archivable.
- **Order numbers:** the test order takes the shop's first number, so the first real order is #1002. Orders have no gapless rule (documents do, and a test order makes none).
- **A backfill:** orders the test line could place before this (an owner of a shop without the orders module who typed "menu") are not marked.

## Checks

`tests/test_order_test.py` (12): an order from the test line is marked, is pay on collection and makes no payment request; it takes stock; the owner marks it ready and the customer's message is in the chat; it is counted nowhere the owner reads (the Agent's facts, the weekly report, the cards) and after finishing everything equals what it was; finishing cancels it and returns its stock, tells nobody and raises no refund; one the owner marked ready is returned too; finishing twice cancels nothing twice; a real customer's order in the same shop is never touched; a test order cannot be marked paid; the guard; the guard's own check; nothing writes the column. `tests/test_order_onboarding.py` and `tests/test_pricing.py` follow the path being built and off for every type. `scripts/order-onboarding-browser-check.mjs` runs the journey in a real browser at 375 and 320 px in English and Arabic, light and dark: the chat's link, the real order page, an order placed with that link, the success line, Mark it ready, the customer's message, finishing, and the Orders list marking it Test with no way to mark it paid; axe finds nothing. `scripts/golive-truth-check.mjs` passes for all five order types, both languages, as they ship.
