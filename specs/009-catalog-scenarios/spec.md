# Catalog 9: the 30 scenarios, the demo shops, phone-width checks

Status: built in ALY-110 (package 9 of the Catalog, ALY-101). Decision: D-039 (its "As built (ALY-110)" lists where the code fixed a detail). The engine is `specs/001-catalog-engine/spec.md`; the screens `002`; price groups and SKU `003`; WhatsApp `004`; the order page `005`; import and export `006`; reports `007`; per-type presets `008`.

This package builds no feature. It answers one question: does the whole Catalog do what the plan says, and how do we know. The answer is a table (below), a demo shop for every business type (`docs/demo.md`), and a pass over every Catalog screen at phone width.

Words used in the table: **test** means an automated test that runs in CI (`apps/api/tests/`, on real Postgres). **Browser run** means a script drove a real browser (headless Edge over DevTools) and the result was looked at, not a test in CI. **Cannot be automated** says why.

## The 30 scenarios

Titles for scenarios 23 to 26, 28 and 30 are written from what their tests prove; the plan file (Eraser) was not re-read for this page, so check them against it.

| # | Scenario | Proved by |
|---|---|---|
| 1 | Two customers pay for the last item at once; one succeeds | test: `test_catalog_scenarios.py::test_scenario_01_*` (three tests); concurrency proved by `test_catalog_concurrency.py::test_scenario_01_the_two_requests_really_meet_in_the_database` and `…eight_at_once_for_three_never_sell_more_than_three` |
| 2 | An item that sells out in a cart is caught before payment | test: `test_catalog_scenarios.py::test_scenario_02_*` |
| 3 | A price change between add and pay is shown before payment | test: `test_scenario_03_*` |
| 4 | An item hidden by its schedule says when it is next available | test: `test_scenario_04_*` (two tests) and `test_items_schedule.py` |
| 5 | An order after the cutoff is offered the next day or refused | test: `test_scenario_05_*` |
| 6 | A quantity above stock shows the maximum | test: `test_scenario_06_*` |
| 7 | A required option that is missing is named | test: `test_scenario_07_*` |
| 8 | A pay link never paid releases its stock after 30 minutes | test: `test_scenario_08_*` and the hold tests beside it; the race with a payment is proved by `test_catalog_concurrency.py::test_scenario_08_*` (three tests) and by the stress test |
| 9 | A customer who cancels before it was made gets the stock back | test: `test_scenario_09_*` (two); two cancels at once: `test_catalog_concurrency.py::test_scenario_09_two_people_cancelling_one_order_at_once_give_the_stock_back_once` |
| 10 | Staff cancelling after payment says a refund is due | test: `test_scenario_10_*` |
| 11 | An order on a credit account gets the same checks | test: `test_scenario_11_*`; the reversal of a cancelled one: `test_catalog_demos.py` and `test_seed_qirfa.py` |
| 12 | "Same as last time" orders the rest and names the missing item | test: `test_scenario_12_*` |
| 13 | A customer asks to be told when it is back; told once | test: `test_catalog_whatsapp_chat.py::test_scenario_13_*` (three) |
| 14 | Arabic spellings find the item | test: `test_order_page.py::test_scenario_14_*`, `test_catalog_screens.py::test_scenario_14_*` |
| 15 | An unclear name is asked about and never guessed | test: `test_catalog_whatsapp.py::test_scenario_15_*` (two) |
| 16 | A mistake is undone (WhatsApp and the price-change preview) | test: `test_catalog_whatsapp.py::test_scenario_16_*` (three), `test_catalog_screens.py::test_scenario_16_*` |
| 17 | A number that is not a registered staff number is answered like any customer | test: `test_catalog_whatsapp.py::test_scenario_17_*` (four) |
| 18 | Two staff change the same item; both count | test: `test_scenario_18_*` (sequential) and `test_catalog_concurrency.py::test_scenario_18_*` (two staff counting, two receiving; really concurrent) |
| 19 | A stock count that differs is recorded with a reason | test: `test_scenario_19_*` |
| 20 | An import takes good rows and lists bad ones with row and reason | test: `test_catalog_import_scenarios.py::test_scenario_20_*` |
| 21 | Duplicate names are warned about and allowed | test: `test_scenario_21_*` and `test_catalog_import_scenarios.py::test_scenario_21_*` (three) |
| 22 | Deleting an item with order history archives it | test: `test_scenario_22_*` |
| 23 | A bad or hostile photo is refused with plain words | test: `test_media.py` (`bad_photos_are_refused…`, `a_photo_over_the_size_or_pixel_limit…`) and `test_media_images.py` (hidden code, damaged, animated, too many pixels) |
| 24 | Photos on a slow phone connection | test (server): `test_media.py::test_a_cut_off_upload_saves_nothing_and_a_retry_stores_it_once` and the small-size tests in `test_media_images.py`. Browser run (client): the throttled order page below. A real mobile network is **cannot be automated** |
| 25 | The photo store is down: orders keep working with placeholder tiles | test: `test_catalog_scenarios_audit.py::test_scenario_25_*` (added here; before, only the photo's own waiting was tested, not the customer's order), `test_media.py::test_when_the_store_is_down…` |
| 26 | A shop at its photo or item limit is told so and nothing is deleted | test: `test_media.py` (`at_its_photo_limit…`, `a_shop_at_its_item_limit…`, two-at-once limit test) |
| 27 | A worker that was off for hours catches up | test: `test_scenario_27_*` (two) |
| 28 | Opening hours and the Ramadan week round-trip | test: `test_items.py` schedule round trip and `test_items_schedule.py` |
| 29 | One shop cannot read or change another's items | test: `test_scenario_29_*`, `test_catalog_screens.py::test_scenario_29_*`, `test_media.py` isolation tests, RLS test on every Catalog table |
| 30 | The founder, on a real phone, uses the whole thing | **cannot be automated**: needs a real phone and a person. Browser run covers phone width, touch-size, throttled network and the accessibility tree; a real screen reader and real phone are not covered |

Of the 30: 28 are proved by automated tests, one (24) by a test for the server side and a browser run for the page, and one (30) cannot be automated.

### What this package added

- `test_catalog_concurrency.py` (10 tests): the four races of the plan, on real Postgres, with proof they are concurrent. See "Concurrency" below.
- `test_catalog_stress.py` (1 test, marked `stress`): 50 rounds of random mixes of orders, payments, cancels, double cancels, receipts, waste, counts and sweeps from several threads. After every round: stock is never negative, `live == taken` (what is in orders equals what the log took), nothing is oversold, holds match orders, no order is paid twice, totals add up, and `stock.mismatches()` is empty. `ALYR_STRESS_ROUNDS` changes the count; `-m "not stress"` leaves it out. About 20 s.
- `test_catalog_scenarios_audit.py` (scenario 25 through the customer's path).
- `test_catalog_demos.py` (27 tests on the demo shops) and two tests in `test_seed_qirfa.py` (cancelled credit orders have sale and reversal; the repair fixes an old one once).

## Concurrency: proof the races are real

A test that starts two requests does not prove they meet. Two kinds of fake were found while writing these (see mutations below): requests that ran one after the other because the test's own thread pool serialised them, and a test that waited on an unrelated table.

How these meet for certain:

- `hold_open` keeps one request inside its database transaction (a sleep after the guarded step), so the second request arrives while the first is still holding its lock.
- `LockWatch(table)` polls `pg_stat_activity` and `pg_blocking_pids` while the test runs and records a session that is **blocked by another session on a statement that names the table**. The tests assert it saw one. If the requests did not overlap, the test fails.
- `warm(client)` creates the default price group first, so that the one lock seen is the one under test and not a first-time setup insert.

## Mutation checks

Each guard was removed by editing the source, the targeted tests were run, and the source was put back. A test that still passes proves nothing.

| # | Break | Result |
|---|---|---|
| M1 | Stock guard removed (the conditional update that refuses to go below zero) | 3 new tests and 2 old ones fail. The older HTTP scenario-1 test **still passed**: it did not need the guard (it was not truly concurrent), which is why the new tests exist |
| M2 | Stock moved read-then-write instead of one atomic update | 8 fail, old and new |
| M3 | `expire_order` without claiming the payment link | 2 new and 3 old fail |
| M4 | `complete_payment` without `status = 'pending'` | 4 new and 2 old fail |
| M5 | Stock `count` without `for no key update` | only the new two-staff-count test fails |
| M6 | `cancel_order` without `for update`, and `release` without its guard | **nothing failed before**. The new double-cancel test and the stress test (round 0) now fail |
| M7 | The order page draws a photo that is not stored yet | the scenario-25 test fails (and 18 order-page tests) |
| M8 | The seed does not write the reversal of a cancelled credit order | `test_a_cancelled_account_order_has_its_sale_and_its_reversal` fails |

## Demo shops

See `docs/demo.md` and `docs/demo-walkthroughs.md`. In short:

- `python -m alyr.seed_catalog_demos` (or `scripts/demo.sh shops`) makes seven shops: restaurant, bakery, grocery, fashion, shop, wholesale and salon. 19 to 29 items each, English and Arabic, drawn tiles made at run time, 14 days of orders, cancellations, deliveries, counts, waste, sold-out and low items, and a customer in each price group of the wholesaler.
- The history is written by the real services as the app role (the same code path as a customer), then moved back in time. The order of events is simulated first so that order numbers, stock and the log agree at every point.
- Idempotent. It refuses a database that is not clearly local (without `--allow-non-local`), refuses a slug or id used by a real shop, and wipes only its own seven tenants.
- Catalog switched on for these shops only; `ALYR_CATALOG_FOR_NEW_SHOPS` is untouched.
- `seed_qirfa` bug (a cancelled credit order kept its sale and had no reversal): now written through `ledger.reverse_sale`, the function `cancel_order` uses. `repair_cancelled_account_orders` repairs shops cancelled before the fix and runs at the start of every reset. Every statement in it names the demo tenants.

## Phone width, slow connection, accessibility

`scripts/demo-shops-browser-check.mjs` drives headless Edge at 375 px over every Catalog screen (home, list, scrolled and compact list, sold-out, low, drafts, search, edit with sizes, choices and times, draft sheet, stock, add, import, settings, share, selecting, bulk actions) and the customer's order page (top, scrolled, public link, item sheet, bar, review, search with no result, pay, track) for each of the seven shops, in English and Arabic, light and dark. On each screen it runs axe-core (wcag2a, wcag2aa, wcag21aa, best-practice, from `C:/t/tools`, not edited), measures every control (44 px floor, by probing the hit area), looks for text cut off by its box, controls that overlap or sit under something, and sideways scrolling, reads the browser's accessibility tree (every control and picture has a name and role, dialogs are named, headings and landmarks exist) and walks the keyboard (focus stays inside a dialog, follows reading order, shows a ring). Screenshots were looked at.

Result: the full pass (every screen above, seven shops, English and Arabic, light and dark) ran with no failing check after the fixes below. Because the run is long, it was done in pieces; after merging main (ALY-133, signed links by purpose) the customer's order page was run again for the restaurant and the wholesaler in both languages and both schemes, with no failure, and the slow-phone pass was run on the final merged code.

Slow phone (a production build, 375 px, 400 kbit/s, 400 ms latency, processor 4 times slower, cold cache): the items are readable after 3.1 to 3.6 s, and the first tap on "add" works after 10 to 13 s, for six shops, in both languages (the salon has no order page). This is a test on a laptop with throttling, not a real phone.

A real screen reader (VoiceOver, TalkBack, NVDA) was **not** run: it cannot be run here. Names, roles and order come from the accessibility tree, which is what a screen reader reads, but not how it reads it. A real phone was not used either.

### What it found, and what was changed

Fixed in this package (CSS and copy only, no new feature):

- Controls under 44 px: icon buttons and small buttons in the shell, chips, the segmented control, tag rows, the bar's buttons. The shell's own icon-button rule was overriding the Catalog's close and share buttons; fixed by specificity.
- The shop name was cut off in the phone's top bar; it now wraps to two lines. Item names in the list were clamped to a line; they now show whole.
- The warning pill had a contrast of 3.98:1; it now passes.
- Side-by-side fields (sizes row) did not line up when one had a hint; they now share rows.
- Month and actor names (Customer, Assistant) showed in English inside the Arabic UI; they are now translated and the date uses Latin digits as elsewhere in the workspace.
- Primary buttons on the customer's pages were light text on lime in dark mode (contrast 1.2:1): `.cx button { color: inherit }` was winning over `.cx-btn`. Fixed by specificity in `customer.css`.
- The wholesale order table's item-name buttons were 24 px high; they are now 44 px (found on the first full pass; `.ox-wopen`).
- The day chip in the review sheet read "tomorrow" in lower case beside "Tue 20 Oct"; it now starts with a capital.

The home screen (ALY-129, shell and Agent) had findings that belong to that screen, not the Catalog (grey small-text contrast, the KPI row clipped by its scroller, 28 px text buttons); they are noted, not fixed here.

## Known gaps

1. The simulator and `/whatsapp` are wired to the Al Noor shop (`SIMULATOR_NUMBER_ID`), so the demo shops' WhatsApp flows cannot be shown live. Everything WhatsApp-side is tested, but not demoable per type.
2. Engine-origin log reasons ("First price", "Order placed") stay English in the Arabic UI.
3. The workspace shows "QAR" (not «ر.ق») in prices in Arabic.
4. Spa, clinic and home services have no demo shop of their own; the salon stands for them.
5. No real screen reader, no real phone, no real mobile network. Arabic copy is still a draft until ALY-66.
6. Scenario 30 is a person with a phone.
