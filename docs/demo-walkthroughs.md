# Five-minute walk-throughs

Setup first: `scripts/demo.sh up`, then `scripts/demo.sh shops` (see [demo.md](demo.md)). Sign in at `http://localhost:3100/sign-in` as `owner@demo-<key>.example`; the code is on the page. Open `/app/catalog`. Use a phone-width window (375 px) for the customer parts: it is how the owner's customers will see it. Each walk-through is the same four beats: show the list, change a number, place an order as the customer, see it in the numbers.

The same four beats, for every type:

1. **The list (1 min).** Open the Catalog. Point out the sold-out and low tabs and the draft. "This is what you see when you open the app in the morning."
2. **Change a number (1 min).** Open an item, add stock (Stock tab, "Received"), see the log line with your name. Or count the shelf and enter a different number: the difference is recorded with a reason.
3. **Order as the customer (2 min).** Open the shop's order page (`/s/demo-<key>`, or the private link printed by the command). Add two things, open the review, pay on the pay page (it is the local test payment, no money). Say which item the customer cannot take because it is sold out.
4. **See it land (1 min).** Back in the workspace the order is in, the stock went down by what was bought, and Stock shows "Order placed" in the log. Cancel the order: the stock comes back, once.

What to add per type:

## Restaurant: Zaytoun Kitchen (`demo-restaurant`)

- Open "Chicken shawarma": it has a size and extras to choose, and a required choice that is missing is named.
- "Foul and eggs" is a breakfast dish (06:30 to 11:00): outside those hours the order page says when it is next available.
- Lamb machboos and lamb ouzi have a daily limit (12 and 8): when they run out they are sold out for the day and are back the next morning.

## Bakery: Hanan's Oven (`demo-bakery`)

- "Chocolate celebration cake" has sizes (variants), each with its own price and stock, and needs two days. Most cakes are next-day: the order page offers the first day it can be ready.
- The cinnamon roll is sold out and the butter croissant is low: show them under the sold-out and low tabs.

## Grocery: Najma Baqala (`demo-grocery`)

- Weights in kg and packs. Receive a delivery of one item (+24) and record waste of another (-3): both show in the log with a reason.
- Fresh milk is low and the egg tray is sold out. Change one price, see it in the price history, then undo it.

## Fashion: Layali Abaya & Gifts (`demo-fashion`)

- Sizes are variants with their own stock. The pashmina shawl is sold out.
- The Eid gift box (three days) and the name necklace (four days) are made to order: the order page says when they can be ready.
- The satin evening abaya is a draft and the winter shawl is hidden: neither is on the order page.

## Shop: Safwa Home & Gadgets (`demo-shop`)

- Sizes on the T-shirt, thobe and towel, SKUs on the items; search by SKU or by name, in Arabic spelling variants too. The power bank is sold out, the kettle is low.
- The smart watch is a draft and the room heater is hidden: neither is on the order page.

## Wholesale: Rawda Trading (`demo-wholesale`)

- Open the order page as a cafe customer (Karak Corner) and as a retail customer: the same item has a different price and minimum, and the page is a table, not a gallery.
- Show the price groups in Settings. Cafes and hotels buy on account (each has a credit limit). The frying oil tin is sold out and the ghee is low.
- Cancel an on-account order: the sale and its reversal both appear in the customer's account.

## Salon: Lumi Salon & Spa (`demo-salon`)

- Services (booked) and retail products (counted). The dry shampoo is sold out and the serum is low.
- There is no order page: the salon takes bookings. Show the week of bookings in Bookings and a retail product sold at the counter, which lowers the count.

## What is not in the walk-through

Anything over WhatsApp itself (adding items by message, the customer's reminder): the simulator is wired to the Al Noor shop only, so do that part there.
