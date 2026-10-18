# Spec 002: Catalog screens (the owner's side of the Catalog)

Status: built in ALY-104 (package 3 of the Catalog, ALY-101). Decision: D-039. The engine under it is `specs/001-catalog-engine/spec.md`, including its section "Added for the workspace screens", which lists the API these screens needed. This page says what an owner sees and does, how it behaves when things go wrong, and how it is checked.

**Hidden until go-live.** The screens are one entry, "Catalog" («الكتالوج»), in the workspace navigation. It appears only for a shop that has the `catalog` module switched on (`tenant_modules`), and no product, starting setup or sign-up switches it on. The go-live sweep (ALY-113) decides which shops get it. Nothing on the screens says "coming", "soon" or "beta" (a test reads every file that holds their words).

## The one rule for the words

Every word is in `apps/web/app/(product)/_workspace/catalogCopy.ts`, English and Arabic written against the same type, so a missing Arabic line fails the type check. The Arabic is a draft until a native speaker reviews it (ALY-66). The section's name is "Catalog" in both languages. An owner's things are "items" («أصناف»); the workspace's own Products screen (ALYR's suite) keeps "products". The business-type names (Menu, Price list) belong to the templates package (ALY-107).

## What the owner can do

**The list.** Items as a photo grid or a compact list (remembered on that device). Search that finds Arabic spellings (the alef and its hamza, ya and alef maqsura, ta marbuta and ha, the marks above letters, Eastern digits). Filters: All, Drafts, Sold out, Low stock, Archived (a filter with nothing in it is not offered), and a category. Each row has a switch (Available / Sold out) and says in words why an item cannot be ordered: sold out, none left, not orderable now, draft, hidden. A switch moves at once and says so in a message with Undo. "Select" lets the owner pick items for a bulk action. A banner offers to walk through any drafts. The list asks again every 20 seconds, so a colleague's change appears.

**Adding with photos.** "Add items": take a photo or choose several. Each photo is shrunk in the browser (long side 1,600 px, upright, no location data; a small photo is sent as it is), sent with its own progress, and made a draft item when it is stored. A failed photo (no connection, refused) is a row with the reason in words and "Try again" or "Skip"; nothing is half-saved, and the other photos carry on, two at a time. Then "Fill in the drafts": one at a time, a name (English or Arabic or both), the Arabic name, a price, a category and "Put it on sale". Skip leaves a draft. An owner who writes only Arabic leaves the English name empty and the Arabic one is used for both. "Add one item" opens the full form for an item typed without a photo.

**The edit sheet.** Photos (up to eight; choose one to make it the cover, move it earlier or later, or take it off; Add / Take a photo), names and descriptions in both languages, price and sale price with an end date, unit, smallest order, category, status (draft, on sale, hidden, archived), how it runs out (always, on or off, counted in stock, a number each day) with the opening count or daily number, sizes and colours (name in both languages, price difference, stock or daily number, available), choices and extras (a group the customer must or may choose from, with priced options), when it can be ordered (any time, or windows: opening hours, or "order N days ahead before 18:00", between dates, closed on some days), tags, and its history (every price and who changed what). Archive and Delete (an item with history is archived, as the API decides). Leaving with unsaved changes asks first. An agent who may not edit sees it read-only, with the reason.

**Stock.** Every counted item and size, with the number in the system (or today's allowance), and Received, Wasted and Count. A count shows the difference from the system before it is recorded, and asks for a reason when they differ (chips for the usual ones). Below, the latest changes across every item, with who made them, why, and the balance.

**Bulk actions.** Mark sold out, mark available again, change prices by a percentage (with presets), move to a category, archive. The owner sees exactly which items change and what each new price is, and which cannot take the action and why, then applies; the apply carries the preview's hash, so something that changed in between asks the owner to look again. The newest bulk change can be undone once, from the message and from a button on the screen; items edited since are left alone and counted.

**Settings (owners and admins).** Whether agents may add and edit items (off to start), the low-stock number (5), when the shop's day starts, how long an unpaid pay-link order holds its stock.

## Roles

| Role | Can |
|---|---|
| Owner, admin | Everything above |
| Agent | See the list and items; flip a switch; record stock received or wasted; count; mark items sold out or available in bulk (and undo that) |
| Agent, when the owner allows it | Also add, edit, archive and delete items, manage their photos, upload photos, and change prices, categories and archive in bulk |

The screens hide what the signed-in person cannot use (the API's `access` says what that is), and the API refuses it anyway (tests).

## When something goes wrong

| What | What the screen does |
|---|---|
| No connection | The page says so; the list keeps what it had and tries again by itself; an upload row says "No connection" and offers Try again |
| A photo is refused (too large, damaged, wrong type, the shop's photo limit) | The reason in the owner's language from the API, on that photo only |
| The photo store is down | The photo is `pending`; its tile is drawn as a placeholder ("Being saved") and appears when stored; everything else works |
| A photo failed for good | A tile that says it was not saved |
| An item has no photo | A drawn placeholder tile, never a broken image |
| The shop reached its item limit | The API's message; drafts already made are kept |
| Two people change the same thing | The last save of the edit form wins (it sends every field); stock changes from both count (the log adds them); the photo order refuses an out-of-date list and says to reload |
| A bulk change's items changed after the preview | Refused with "look again", and the preview is shown again |

## Look and behaviour

The workspace's own: its tokens (`design/tokens.json`, D-040; no colour or face of the Catalog's own, and `scripts/design-check.mjs` passes), tiles on hairlines, pills, switch, buttons, motion and focus ring (`shell.css`), light and dark by the device or by the site's theme switch, Volt only for the main action and for progress. Built at 375 px first: targets are 44 px or more, no sideways scrolling, a sheet is a bottom sheet on a phone and a side panel on a laptop, and a sheet follows the on-screen keyboard (the visual viewport) so its buttons are never under it. Right to left is real: logical properties throughout, arrows and the switch mirrored. Keyboard and screen readers: labelled fields with hints and errors by reference, selected states have a mark as well as a colour, sheets trap focus, close on Escape and give focus back, everything behind an open sheet is inert, results and messages are announced politely. Text that is small is the shell's darker grey (4.5:1), not its lightest.

New to the shell, and the only edits to it: one import, one icon path and one branch in `app/(product)/app/[[...section]]/page.tsx`, and two greys darkened for contrast in `shell.css` (the phone tab bar's labels and the top bar's small label), which every workspace screen gets.

## How it was checked

`scripts/catalog-browser-check.mjs` drives headless Edge over the DevTools protocol (no packages) at 375 px against a dev API and web app: English with 30 items and Arabic with 6, each with sample photos drawn by a script. It adds the photos on a throttled connection, drops the connection and retries one, walks the drafts, types one item, searches by an Arabic spelling, flips a switch and undoes it, edits one item (a sale, two sizes, an extra, a time, a tag), counts with a difference and checks the reason is needed and the log has it, runs a bulk price change with preview and undo, checks the keyboard (Tab stays in the sheet, Escape closes it, focus returns), shrinks the window to simulate an on-screen keyboard, signs in as an agent, looks at a laptop, and runs axe-core on the grid, the edit sheet and the stock tab in light and dark. Each language: 50 checks pass; axe finds nothing on the Catalog's screens (the laptop sidebar's and top bar's own greys, which the shell has had since before the Catalog, are left out of the laptop run). API behaviour is in `apps/api/tests/test_catalog_screens.py` and `test_catalog_scenarios.py`.

Not checked: a real phone, a real on-screen keyboard (it is simulated by a smaller window), real photos from a camera, a slow real network (it is throttled), VoiceOver or TalkBack, Safari, the Arabic by a native speaker, R2 (local disk is used), and more than a few hundred items.

## Left for other packages

Order page, share links and search for customers (ALY-112). WhatsApp commands and photo-to-draft by message (ALY-106). Templates by business type and the name per type (ALY-107). Import and export is built (ALY-108, `specs/004-catalog-import-export/spec.md`): "Import / Export" beside Settings, a sheet with the downloads, the upload, the preview and the result. Alerts, usage meters and a back-office usage screen (ALY-109). Category order and Arabic category names (the API has them; no screen). Customer price groups. A language switch on a phone that is not in the search palette, and the laptop sidebar's grey text (the shell's: ALY-129).
