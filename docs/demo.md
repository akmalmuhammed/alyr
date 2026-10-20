# Demo shops for the Catalog

One make-believe shop for every type of business that has a Catalog, each with a fortnight of orders, cancellations, deliveries and counts behind it. They exist so the founder can show the Catalog to a restaurant owner, a baker, a grocer, a boutique, a hardware shop, a wholesaler or a salon with something that looks like their own shop, and so the screens and the order page can be checked against real-looking data. Built in ALY-110 (Catalog 9, decision D-039). Everything is invented: shop names, people, phone numbers and amounts. Nothing here can reach a phone.

| Key | Shop | Type | Items | What it shows |
|---|---|---|---|---|
| `restaurant` | Zaytoun Kitchen (مطبخ زيتون) | restaurant | 29 | Menu with choices, a breakfast window, daily limits, one item on sale, a sold-out and a low item, a hidden item and a draft, an unpaid order holding its stock |
| `bakery` | Hanan's Oven (فرن حنان) | bakery | 23 | Cakes in sizes, next-day orders, daily batches, a sold-out and a low item |
| `grocery` | Najma Baqala (بقالة نجمة) | grocery | 29 | Weights (kg), packs and boxes, deliveries received, waste, a price change, sold-out, low, hidden and draft items |
| `fashion` | Layali Abaya & Gifts (ليالي للعبايات والهدايا) | fashion | 20 | Sizes as variants, made-to-order lead times of three and four days, a sold-out item, a hidden item and a draft |
| `shop` | Safwa Home & Gadgets (متجر صفوة للمنزل) | shop | 23 | Sizes as variants, SKUs, stock counts, a sold-out, a low, a hidden and a draft item |
| `wholesale` | Rawda Trading (روضة للتجارة) | wholesale | 23 | Price groups (cafe, hotel), retail prices, minimum orders, packs, a customer in each group, credit limits |
| `salon` | Lumi Salon & Spa (صالون لومي للتجميل والسبا) | salon | 19 | Services and products, counter sales, bookings (no order page) |

Travel and documents have no Catalog. Spa, clinic and home services have no shop of their own here: the salon stands for the services family.

## Run it

You need Docker running and the local database up (`docker compose up -d postgres redis`, which `scripts/demo.sh up` also does).

```
scripts/demo.sh shops
```

That is a wrapper for `python -m alyr.seed_catalog_demos` inside the API container. It makes all seven shops and prints, for each one, how to sign in and the link to its order page. Run it again at any time: it puts each demo shop back to the same starting state. It never touches any other shop.

Options (after `shops`):

- `--list` says what would be made and writes nothing.
- `--only bakery,salon` makes only those.
- `--repair-only` only gives the demo shops' cancelled credit orders the reversal they should have (see below).
- `--allow-non-local` lets it run on a database that is not clearly a local one. Do not use it on the live database. Without it the command stops with a message when the database host is not `localhost`, `127.0.0.1`, `postgres` or `host.docker.internal`, and when a demo slug or id is already used by a real shop.

The history is written for the 14 days up to "now", so run it again before a demo and the week looks current.

## Sign in

The web app is at `http://localhost:3100` (`scripts/demo.sh up` starts it). Go to `/sign-in`, enter the shop's address, and the code is shown on the page (it is only shown on a local machine). Each shop has an owner and an agent:

- `owner@demo-<key>.example`, for example `owner@demo-bakery.example`
- `agent@demo-<key>.example` (an agent can look but not change prices or stock settings)

The workspace opens at `/app/catalog`. The Catalog is switched on for these seven shops by this command. Since the go-live sweep (ALY-113 part 1) a new shop gets it from onboarding and the shops that existed got it from migration 0032; this command changes neither.

## What a customer sees

Each shop, except the salon, has an order page at `/s/demo-<key>` (anyone) and, for each customer, a private link. The command prints the first customer's link; the page greets them by name and offers "same as last time". For a customer's own link in another shop, sign in as the owner and open Share in the Catalog. Customers write in English or Arabic, and the page follows their language.

Photos are drawn tiles made at run time (a plate, a loaf, a bottle and so on, in the shop's colour). No pictures are downloaded and none are kept in the repository. They are stored on local disk, never in the online photo store.

## The WhatsApp simulator

The simulator page at `/whatsapp` is wired to the original sample shop (Al Noor). Since ALY-136 the simulator's API takes a shop's address, so any shop with a private test line (the seven demo shops, a shop made in onboarding) can be talked to: `POST /sim/messages` with `{"from_number": "97455500555", "text": "101 x2, 103", "shop": "demo-restaurant"}`, `GET /sim/conversations/<phone>?shop=demo-restaurant`, `GET /sim/personas?shop=...`, and `shop` on `POST /sim/photos`. The seven demo shops and Al Noor are on `chat` mode explicitly (the setting "How customers order"); every other shop starts on `link`, where the order page's message is a readable order for a person. A walk-through: send an item's code (shown on its card in the workspace and on the order page), tap Confirm, tap Place order. The page at `/whatsapp` itself still shows Al Noor only.

## Wholesale

Rawda Trading has three groups of customers: cafes (Karak Corner, Dune Roasters, Marsa Bites, and two Arabic names), hotels and caterers (Pearl Bay Catering, Oasis Events Catering, and a hotel), and retail shops. Open the order page as a cafe customer and as a retail customer: the same item shows a different price and minimum. Some customers buy on account up to a limit.

## Salem Maintenance (invoices only)

`scripts/demo.sh shops` also makes **Salem Maintenance** («سالم للصيانة», ALY-141), an AC repair business in Doha that uses ALYR for invoices and receipts and nothing else (`--only salem` makes just it). It has four saved lines (AC repair, AC deep clean, Filter change, Inspection visit), three customers (Ahmed Al Thani, who has written to the test line; Sara Al Mulla; Doha Villas Co., a company with a registration number), and five papers: an unpaid invoice for the company with its payment link, a paid invoice for Ahmed with its receipt, a small unpaid one for Sara, and a walk-in receipt.

- **Sign in:** `owner@demo-salem.example` (owner) or `agent@demo-salem.example`; the code shows on the sign-in page. Open `/app/documents`: the navigation is Home, Documents, Products, Connections, Team; there is no Orders, Catalog or Bookings.
- **Make an invoice in a few seconds:** New, then write `Filter change 120 for Ahmed` (or «فلتر 120 لأحمد») and Fill in the form; or open Customers, Ahmed, Start an invoice.
- **By message:** in the simulator, send as `97455500141` to the shop `salem-maintenance`: `invoice Ahmed 500 for AC repair`, tap Yes, then Undo. A message from any other number gets the ordinary customer reply.
- **The payment link:** open the unpaid invoice, copy the link, open it on this machine (the stand-in payment page, no money moves), and pay: the invoice reads paid and its receipt appears.
- **From the start:** sign up a new shop at `/start` and choose "Invoices only" (the product lead's switch `ALYR_INVOICES_FOR_NEW_SHOPS=true` must be on, or make the business in the back office).
- An issued document can never be deleted, so this shop is made once: running the command again leaves it as it is and says so.

## Safe to repeat

- Everything it writes carries a fixed demo id and a `demo-` slug, and the wipe only touches those shops (and the older Qirfa and sample-bookings shops for the credit repair).
- If a real shop has taken one of those slugs or ids, it stops and says so.
- Cancelled credit orders have both the sale and its reversal in the ledger, through the same function a real cancellation uses. A demo shop made before this fix is repaired at the start of every run.

## Reset and clean up

`scripts/demo.sh shops` is the reset. To remove the demo shops altogether, delete the rows with their `tenant_id` for the seven ids `0a1f0000-0000-4000-8000-00000000d101` to `...d107` (and `...d201` for Salem Maintenance, whose issued papers the database will not delete, so for that one drop the local database volume).

## Walk-throughs

Five minutes per type, what to open and what to say: [demo-walkthroughs.md](demo-walkthroughs.md).
