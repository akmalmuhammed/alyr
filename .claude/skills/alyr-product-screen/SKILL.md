---
name: alyr-product-screen
description: Design or change a screen inside the ALYR product. Use for the workspace (/app and its sections, including the ALYR Agent dashboard on the home), the back office (/ops), sign-in (/login), onboarding (/start), the founder's in-shop sales demo (/demo/bakery, ALY-263: its own scene engine, words in its copy.ts, shop colours and stage sizes in the tokens; the old /whatsapp demo is gone), /agent-sample, and the customer pages opened from WhatsApp (order /s, booking /b, payment /pay, tracking /t); for tables, forms, buttons, empty states, status pills, setup checklists, KPI strips, charts and suggestion cards; and for anything under apps/web/app/(product) or apps/web/app/_agent. Load alyr-design first.
---

# A product screen

The product is where an owner, a member of staff or a shop's customer does real work, often
on a phone at a busy counter. It is calmer and denser than the site, on the same tokens.
The Product lane owns `apps/web/app/(product)/` and the API; the Site and brand lane owns
how it looks (`docs/lanes/`). Say in the PR which lane's files you touch.

**Since 13 Nov 2026 the product follows the redesign** (D-180). The rules are in
[ui-rules.md](ui-rules.md): read it whole before you build or change a screen. The parts are
in `alyr-design/components.md` ("Product UI"), the numbers and words in
`alyr-design/format.md`, and the list to run before you ask for review in
[screen-checklist.md](screen-checklist.md). Where this page and `ui-rules.md` differ,
`ui-rules.md` wins and this page is fixed in the same change. The redesign is the product's;
the public site keeps its own system (`alyr-site-page`).

## Before you start

1. Load `alyr-design`. Read `docs/status.md`, `docs/lanes/product.md`, [ui-rules.md](ui-rules.md)
   and the issue.
2. Know who sees the screen and what they may see:
   - **owner and admin:** everything;
   - **agent-role staff:** the work in front of them and per-order totals only; aggregates
     (an open-orders total, spent, owes, a band's figures) and margin are for owners and
     admins and are never sent to an agent (enforced on the server; older routes not yet
     rebuilt still show amounts, a known gap);
   - **ALYR staff** (`/ops`, `platform_admins`): every client, never a shop's conversations;
   - **a shop's customer** (`/s`, `/b`, `/pay`, `/t`): one order or booking, by an
     unguessable link, first names only, no phone numbers.
3. Read the screen's code and the API route it calls. Draw only what the API returns; if
   the screen needs more, that is an API change with tests (`CLAUDE.md`).
4. Check what is not built (`alyr-design/honesty.md`): never a button for it (D-039: what
   is not ready stays hidden from owners and customers).
5. Your own worktree, your own database (`alyr_<name>`), your own ports; never the shared
   `alyr` database, port 8000 or 3100.

## Surfaces

| Surface | Where | Notes |
|---|---|---|
| UI kit (the redesign) | `apps/web/app/_ui/` (planned; `.u-` prefix) | The parts every product screen is built from (`alyr-design/components.md`, "Product UI"). Foundation owner only: a screen asks for a part, never edits or copies one |
| Workspace shell | `(product)/app/[[...section]]/page.tsx`, `_workspace/shell.css` (`.sh`), `_workspace/Screens.tsx`, `Team.tsx` | Sidebar on a laptop, tab bar on a phone, command palette; words in the `T = {en, ar}` object |
| Workspace home | `_agent/AgentDashboard.tsx` from `GET /api/agent?lang=` | [agent-dashboard.md](agent-dashboard.md) |
| Back office | `(product)/ops/` (`Shell.tsx`, `ops.css` overrides `shell.css` by import order) | English only today; Today queue, clients, prices, requests, staff, audit |
| Onboarding | `(product)/start/` (`copy.ts`, `start.css`, `.ob`) | The one product area with a copy file |
| Customer pages | `(product)/s/[slug]`, `b/[slug]`, `pay/[slug]`, `t/[slug]`; frame `_customer/Frame.tsx`, `customer.css` (`.cx`) | Phone first; opened from a WhatsApp link; the shop's name and monogram lead, "ALYR" is small in the foot |

## Rules for every product screen

- **Tokens, not the old local names.** Product CSS still defines its own `--canvas`,
  `--ink`, `--ease`, `--spring` with values that differ from the site's under the same names
  (audit 1.2, 5). When you touch a screen, move what you touch onto the generated tokens; do
  not add a value to the old blocks.
- **Dark mode** from tokens. With ALY-126 the product layout reads the site's stored choice
  (`alyr-theme` on `<html>` as `data-theme`), so a theme picked on the site holds after
  signing in; until that merges the product follows the device only. A switch control inside
  the product is a visible change: ask the founder before adding one.
- **Buttons:** one primary (Volt) action per screen, the rest secondary or quiet. The Volt
  button takes the 45° notch on its **top inline-end corner**, mirrored in Arabic; every other
  kind is a 4 px rectangle; an icon is allowed on an outlined or quiet button and never on a
  Volt one; never radius 999 on a new button ([ui-rules.md](ui-rules.md) section 10).
- **Status:** words first, colour second. The status hues (ok, warn, bad) are product-only
  tokens, always beside a word ("Paid", "Overdue"): a Volt dot is happening now or just done,
  green healthy, amber waiting, red failed. The customer sees the customer's words
  ("Ready for collection", "Complete"); staff see the staff words ("Ready", "Done").
- **Nothing pulses.** Remove infinite animations when you meet them (`.cx-status`,
  `.ob-pulse`, `.ob-live`); a live dot lights once.
- **Words:** every string in the screen's `T = {en, ar}` object or copy file, never inline.
  The product layout sets `<html lang="en">` even on Arabic screens (a known gap): set
  `lang` and `dir` on the screen's root, as the workspace does.
- **Money:** amounts are integers in dirhams in the API; format in the API or one helper
  ("QAR 1,234" / «1,234 ر.ق»), inside `<bdi>`, never wrapped (`alyr-design/format.md`). In a
  table cell or a key-value row money is mono; at 24 px and up and inside a sentence it is
  Instrument Sans with tabular digits. Agents see per-order totals only, no aggregates.
- **Dense type scale:** `--ui-*`: body 13 px (`--ui-small`), captions 12, labels 11, page title
  24; `--ui-input` (16 px) for inputs on a phone so it does not zoom; Arabic one step up;
  nothing under 11; `--font-ui` / `--font-ui-arabic`, `--leading-ui`, weights 400 / 500 / 600
  only; the product's `--ui-space-*` steps, rules before boxes. Mono for identifiers, times,
  dates, phone numbers, money in cells, and labels (section 5 of `ui-rules.md`).
- **Tables** become one card per row on phones (below 48 rem), keeping every column that
  carries meaning (who handles it, its status buttons, the balance and age). A table that
  must scroll sideways shows an edge fade. Row heights are 44, 52 or 60 only.
- **Forms:** a visible label for every field (not a placeholder), the error in words beside
  the field, inputs 36 px high with 13 px text on a laptop and 44 px high with 16 px text on a
  phone or a coarse pointer, focus from the focus token.
- **Empty states** in two shapes: a first-run object the product can make today is a dashed
  slot that says what will appear ("Your first order shows here"); a list that a filter or a
  search has emptied is an `Empty`. Never zeros or empty charts, never a cartoon.
- **Filtered destinations.** A link from a count or a suggestion opens its screen filtered
  to exactly the rows it counted (`?show=unconfirmed`, `?show=unmarked`, `?show=overdue`).
- **Polling never re-animates** and never moves the scroll position.
- **Customer pages:** the shop's brand first (name, monogram), ALYR quietly in the foot
  ("Set up by ALYR", never "Powered by"); the primary button is the shop's colour, not Volt
  (`ui-rules.md` section 17); a language switch in the frame (the order, payment and tracking pages open in the customer's
  own language, from their link; the booking page still opens in English: a known gap); no
  WhatsApp green; the stand-in pay page says "Test payment page. No money moves."; no data
  beyond the one order or booking. Times and dates as the product prints them, Western digits
  in Arabic too (`/b/` prints Eastern digits through `ar-QA` today: fix it when you touch it).
  **Money on a customer page comes from `_customer/price.ts`** (`QAR 24`, «24 ر.ق»), never
  from the API's English `*_text` fields (ALY-112). The order page is `_customer/order/`
  (`specs/005-order-page-v2`): a customer's link carries a signed token and a public link never
  carries a person, so never put a contact ID in a link.

## Do

- Reuse the shared pieces (`_agent`, `_customer/Frame.tsx`, the workspace shell); one
  `initials()`, one `qar` helper, one empty state.
- Write the honest status line for anything not possible yet: "Information only. Writing to
  them needs their marketing consent, which ALYR does not collect yet."
- Show the rule wherever the product decides something by rule.
- Mirror every chart's time axis in Arabic; tick labels and ranges in `<bdi dir="ltr">`.

## Don't

- A button for something not built, a "coming" label, an upsell for a product that is off
  (products that are off do not render at all).
- Alarms (a red page, a flashing or oversized red or green figure; a status colour is a state
  of one thing beside its word), health scores, league tables of staff (D-028), streaks,
  count-ups, glow, bento grids, a row of tiles beside a Carbon band.
- A promise of service ("A person replies, usually within the hour") or a fake reply bubble.
- AI wording, a first-person product voice, an avatar for the system ("Assistant" on the
  inbox label is a known break).
- Change a product screen's behaviour from the Site and brand lane without the Product
  lane's tests.

## Done when

Run [screen-checklist.md](screen-checklist.md) and paste its block into the pull request. In
short:

- [ ] Every role that can open it checked (owner, agent, and for `/ops` ALYR staff); agents
      see no money where they must not.
- [ ] Both languages, light and dark (device setting), 1440 and 390 (and 320 for customer
      pages); every state: empty, first week, quiet, stale, error, offline.
- [ ] Every string in the copy object, both languages; Arabic agreement through the API
      helpers; no "QAR" in Arabic.
- [ ] Targets 44 px, focus visible, headings in order, live regions for changing counts.
- [ ] `scripts/check.sh` passes (API tests through the real path if the API changed).
- [ ] Screenshots of each state to the founder; "Not checked" in the PR.
