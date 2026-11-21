# Product UI rules (the redesign)

The rules for every screen inside the product after the redesign of 13 Nov 2026
(`docs/design-system/02-product-ui.md` is the log of what was decided, D-180). Read this with
[SKILL.md](SKILL.md); the components are in `alyr-design/components.md` ("Product UI"), the
numbers and words in `alyr-design/format.md`, the per-screen checklist in
[screen-checklist.md](screen-checklist.md).

**Scope.** This file is for the **product**: the workspace (`/app`), the back office (`/ops`),
sign-in (`/login`), sign-up (`/start`) and the customer pages (`/s`, `/b`, `/pay`, `/t`, `/d`).
It does **not** apply to the public site (`_site`, `(site)`, `(site-ar)`), which keeps its own
system in `alyr-site-page`, and it does not restyle the ALYR Agent dashboard (`_agent`), which
feeds the public homepage: that is restyled through its `--ag-*` hooks only. Where a rule
differs between the site and the product, a line marked **Site** says what the site keeps.

**Status of what it names.** Components live in `apps/web/app/_ui/` and are marked "planned" in
the catalogue until merged. Tokens marked (new) in section 4 are added by the foundation
change; until one lands, use the nearest existing token and file a request
(section 20). If a name here and `design/tokens.json` disagree, the file wins and this page is
fixed in the same change.

## 1. Direction, in five lines

1. An instrument panel: a white canvas, hairlines instead of shadows, small exact type
   (13 px body), panels with an 8 px radius and a 52 px header.
2. Mono for data (identifiers, times, phone numbers, money in tables), Instrument Sans for
   words and for figures from 24 px up.
3. One Carbon band per page, one Volt button per screen, colour only for state.
4. Every list has a detail: a drawer for quick work, a full page with underline tabs for deep
   work. A screen answers its question on a laptop without scrolling where it can.
5. Plain and exact: sentence case, the middle dot as a separator, no exclamation marks, no
   "new" badges, nothing drawn that the product cannot do today (D-039).

## 2. The three layouts

Every screen is one of these. Do not invent a fourth; ask (section 20).

| Layout | Used for | Shape |
|---|---|---|
| **Dashboard** | Home, Payments overview, Credit overview, back office Overview | Title row, an optional Carbon band, then a wide column and a side column of 400 px (`--ui-size-side-column`) with a 20 px gap. Content padding applies |
| **Workbench** | Inbox conversations, the booking day | Fills the height under the top bar. Three panes with no content padding: list 340, main (fills), context 320, each scrolling on its own, hairlines between. Phones show one pane at a time |
| **Table + drawer** | Orders, Customers, Catalog items, Documents, Payments, Team, Clients | Title row, filters, a table in a panel, a pager. A row opens a **drawer** of 440 px at the inline end (a side pane on a laptop, a full-screen page on a phone). Deep work opens a **full page** with underline tabs |

Settings and forms are a dashboard with one column: panels stacked, each with its own header
and its own save.

## 3. Page anatomy

Top to bottom, always in this order, each part optional except the title row:

1. **Top bar** (52 px, outside the page content): crumbs at the start (the last one 600,
   the others muted, separated by a faint "/"), then at the end the shop's clock "Thu 12 Nov ·
   Doha 09:40" in mono 11 muted, the line status (`Status`), and an icon button for anything
   that works today. Nothing for a feature that is not built. **One workspace is one place:**
   no place switch, no per-place column or filter anywhere.
2. **Title row:** the page title (24/30, 600) with one muted 13 px sentence under it (gap 4);
   at the end the page's one main action (the Volt button, section 10) and at most one
   outlined button. No eyebrow, no breadcrumb inside the page.
3. **Banner:** at most one per page, under the title row (`Banner`, section 15). A page that
   has a Carbon band shows no banner above it; the band is the first thing to look at.
4. **Filters:** one row: a `Search` (32) at the start, `Chip`s or `Select`s (28/32), a count at
   the end. The first chip is "All n". A filtered result with no rows is an `Empty`.
5. **The work:** panels, a table, panes. Page blocks are 20 px apart.

Content padding is 24 at the block start, 28 at the inline sides and 48 at the block end
(`--ui-space-24`, `--ui-space-28`, `--ui-space-48`). The content column is at most 1144 px wide
and sits in the middle of the space beside the sidebar; the workbench fills it, and a table
fills its column. Below 48 rem the inline padding is 16.

## 4. Tokens the redesign adds

Everything else in this file uses tokens that exist today. These are added (add-only, no value
of an existing token changes) by the foundation change; the names follow it:

| Token | Value | For |
|---|---|---|
| `--control-line` (new) | a light grey; a darker grey in dark | the border of a button or chip. Fields and selects use `--line-strong` |
| `--scrim` (new) | Carbon at half opacity; black a little stronger in dark | behind a dialog or a full-screen sheet. One value |
| `--ok-text`, `--warn-text` (new) | 4.5:1 on `--ok-soft`, `--warn-soft` | the text of a Tag or Banner on a soft fill |
| `--on-band-ok`, `--on-band-warn`, `--on-band-bad` (new) | light tints | status figures on the Carbon band, in both themes |
| `--ui-figure` (new) | 32 px | a figure on the band |
| `--leading-ui-title`, `--leading-ui-figure` (new) | 1.25, 1.15 | 24/30 title; 28/32 and 32/36 figures |
| `--tracking-ui-title`, `--tracking-ui-figure` (new) | -.015em, -.02em | the title and the figures |
| `--ui-space-2` to `--ui-space-48` (new) | 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 48 | every gap and padding (section 5) |
| `--ui-size-*` (new) | control-xs 28, control-sm 32, control 36, control-touch 44, row-compact 44, row 52, row-tall 60, bar 52, dialog-bar 56, sidebar 15rem, drawer 440, dialog 520, side-column 400, icon 16 | the sizes in section 5 |
| `--radius-ui`, `--radius-dialog` (new) | 6, 10 | banner, segmented control, inset tile; dialog |
| `--cut-band` (new) | 28 px | the Carbon band's corner cut |

## 5. Density

### Type scale (English; the product's `--ui-*` tokens)

| Role | Size / line | Token | Weight | Family | Colour |
|---|---|---|---|---|---|
| Large figure (sign-up, customer-page amount) | 36 / 40 | `--ui-display-sm` | 600 | Sans, tabular | `--text` |
| Band figure | 32 / 36 | `--ui-figure` | 600 | Sans, tabular | `--on-band` |
| Stat figure | 28 / 32 | `--ui-heading-lg` | 600 | Sans, tabular | `--text` |
| Page title; a big number in a panel | 24 / 30 (28 for the number) | `--ui-heading` | 600 | Sans (tabular for a number) | `--text` |
| Dialog title, `Empty` title | 15 | `--ui-body` | 600 | Sans | `--text` |
| Panel, drawer and section title | 14 | `--ui-body-sm` | 600 | Sans | `--text` |
| Body; a row's title (500) | 13 / 19 | `--ui-small` | 400 | Sans | `--text` |
| Caption, dense text, help | 12 / 17 | `--ui-caption` | 400 | Sans | `--text-muted` |
| Label, table header | 11, capitals, `--tracking-label` | `--ui-micro` | 400 | Mono | `--text-faint` |
| Data: cell, key-value value, id, time | 13, 12 or 11 | `--ui-small`, `--ui-caption`, `--ui-micro` | 400 or 500 | Mono | `--text` or `--text-muted` |
| Phone input text | 16 | `--ui-input` | 400 | Sans | `--text` |

- **Nothing below 11.** 10, 9 and 8 round up to 11; 22 to 20 or 24; 26 and 30 to 28; 40 and 44
  to 36. A phone tab-bar label is 11.
- **Weights 400, 500, 600 only.** Mono is 400 or 500 (there is no semibold mono). No 700.
- **Arabic is one step up.** Every size from `--ui-micro` to `--ui-body` takes the next step
  in Arabic (11 becomes 12, 12 becomes 13, 13 becomes 14, 14 becomes 15, 15 becomes 16);
  18 px and above do not change. The kit remaps this once, under its `[dir="rtl"]` root; a
  screen never writes an Arabic size. Arabic takes the looser Arabic leading tokens, is never
  tracked, never in capitals, never italic. A mono capitals label becomes IBM Plex Sans Arabic
  at the stepped size; a mono **number** stays mono.
- **Page title 24 is the largest type on a screen** except a figure. No hero type.

### Spacing steps

Gaps and paddings come from `--ui-space-*`: **2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 48**
(28 and 48 are the page's inline and block-end padding only). The values 3, 5, 7, 9, 18 and 22
are not used.

| Where | Value |
|---|---|
| Panel header and row side padding; a drawer's padding; a panel body | 20 |
| Dialog padding | 24 |
| Gap between page blocks | 20 |
| Gap inside a panel body | 16 |
| Between a control and its label; a control's icon gap | 6 |
| Between buttons in a row | 8 |
| Between lines of a two-line cell | 2 |
| Page gutter on a laptop (inline) | 28; 16 on a phone |

### Heights

| Thing | Height |
|---|---|
| **Table row** | **44** compact (drawer lists, menus, pickers, dense lists), **52** default, **60** only when a row carries two lines and a Tag. No other row height: 38, 40, 48, 56, 64 and 76 are not used. A row that needs more is a card or a drawer |
| Table header | 36, `--surface-subtle`, a label |
| Panel header, drawer header, top bar | 52 |
| Dialog header | 56 |
| Pager | 44 |
| **Control** | **36** default (a field, a page-level button), **32** inside a panel or a row (select, search, row button), **28** compact (chip, segmented tab, pager button, extra-small button), **44** on touch (a phone, `pointer: coarse`, every customer page) |
| Tag | 22; Kbd 18; avatar 28 (20, 24, 32, 36, 40, 44, 52, 56 for a context); checkbox and radio 16 (a 44 hit area on touch); toggle 32 by 18; icon 16 |
| Sidebar | 240 wide, links 30 high, sub-links 28 |

On touch every interactive control is 44 by 44 (section 12). A Tag or a Status is not
interactive and stays small.

## 6. Radii, borders, shadows

| Thing | Radius |
|---|---|
| Volt button (three square corners; the fourth is the notch) | `--radius-control` 2 |
| Kbd, the Sample mark, a checkbox | `--radius-control` 2 |
| Button (other kinds), Tag, field, select, search, chip, tab, menu item, thumb | `--radius-sm` 4 |
| Banner, segmented-control frame, inset tile | `--radius-ui` 6 |
| **Panel**, Stat, the Carbon band, a phone card | `--radius-md` 8 |
| Dialog | `--radius-dialog` 10 |
| Dot, avatar | `--radius-round` |
| A toggle's track and knob | half its height: the only pill in the product |

A chip is 4, not a pill. A customer page uses the same radii: no 14 to 28 px pills, steppers
or language buttons.

- **Borders.** A panel is `--surface` with a 1 px `--line` border; rows inside it are
  separated by a 1 px `--line`. A **field or a select** has a 1 px `--line-strong` border
  (3:1 against the surface); a **button or a chip** has a 1 px `--control-line`. An error
  border is `--bad`. A dashed slot is 1 px dashed `--line-strong`. No box-shadow ring used as
  a border, no double borders.
- **Focus** is the focus token, 2 px, offset 3 on a control (2 elsewhere), on every control,
  including a field (the drawings do not show it). A drawer and a pane never remove it.
- **Shadows.** Only a menu, a popover and a dialog, with `--shadow-float`. A panel, a drawer, a
  Stat and the band have none; `--shadow-lift` is not used on a panel.
- **Scrim.** One value, `--scrim`, behind a dialog or a full-screen sheet. A laptop drawer
  has no scrim.

**Site:** keeps nearly square controls, the 45° cut as its one gesture, and "rounded panels
and pills are not ALYR". Product panels are the exception, on purpose.

## 7. Colour

- **Surfaces:** `--canvas` (white in light) for the page, `--surface` for a panel,
  `--surface-subtle` for a table header, a hover, a selected row, a footer and a well. The
  page is told from a panel by its hairline, not a shadow.
- **Text:** `--text`; `--text-muted` for secondary text, **placeholders and every sentence**;
  `--text-faint` for mono labels, timestamps and separators only, never a sentence or a
  placeholder.
- **The one-Volt rule.** Volt means one of four things, as on the site: the main action, the
  current state, confirmed progress, one strategic signal. In the product that is: the **one
  Volt button** (section 10), a **Volt dot** (below), a **Steps** tick or a **Timeline** dot
  for what has just become true, the sub-navigation's current marker, and today's bar or
  point in a chart. Never a Volt Tag, a Volt fill behind text, a number disc, a chart series,
  a pulse.
- **Status meanings** are in the table below. A status is always beside a word, never colour
  alone.
- **Text on a soft fill** uses `--ok-text` and `--warn-text` (4.5:1). Status colour is never
  decoration and never an alarm: no red number at 28 px for its own sake, no flashing, no red
  or green page. A status hue is a state of one thing, next to its word.
- **Selection.** A selected row, a current tab in a list and a hover are `--surface-subtle`.
  `--volt-wash` is for the live "now" row or line only (the current time in a day view).
- **Charts.** Ghost series and idle bars `--control-line`; the series `--text`; today's bar or
  last point **Volt** with a 1 px `--text` ring; an age bar is text, strong, warn, bad. No
  other Volt in a chart.
- **Shop colour.** The six `--shop-*` colours appear only on a shop's own marks: its monogram,
  a thumbnail, a customer page's primary button (section 17). Never on ALYR's chrome.
- **WhatsApp colours** (`--wa-*`) only inside a drawn chat bubble. No WhatsApp logo or green
  anywhere else; the line is named in words, with a neutral chat icon.

| Colour | Dot or fill | Means | Examples |
|---|---|---|---|
| Volt | a 7 px dot, `Status` only | happening now, or just done | Here now, line connected, today, just paid |
| Green | `--ok`, `--ok-soft` | healthy, finished, settled | Paid, Delivered, Done |
| Amber | `--warn`, `--warn-soft` | waiting, or late | Waiting 4 min, Unpaid, Due today, Window closes |
| Red | `--bad`, `--bad-soft` | failed or blocked | Not delivered, Payment failed, Refused |
| Grey | `--surface-subtle`, `--text-muted` | neutral | Draft, Closed, Cancelled, Off |
| Hollow ring | `--strong` ring | not applicable or not connected | Not connected, Off |
| Ink | `--text` fill, `--text-inverse` | a state of the platform, not of an object | Staff only (back office) |

## 8. The Carbon band

At most **one per page**, on a dashboard-layout page only (Home, the money overviews, back
office Overview). Never in a drawer, a dialog, a customer page or a phone card.

- `--band` fill (Carbon; it lifts in dark and takes a `--dark-line` hairline where it meets
  the page), radius 8, padding 24, four equal figures with 1 px
  `--dark-line` dividers at their start (padding 0/24).
- Figure 32/36 `--ui-figure` 600 in `--on-band`; label mono 11 `--on-band-quiet`; delta mono
  12/500 in `--on-band-ok`, `--on-band-warn` or `--on-band-bad`; an idle spark stroke
  `--band-mark`; a spark's last point Volt.
- The band's **top inline-end corner is cut** by `--cut-band` (28 px) in the canvas colour,
  mirrored in Arabic (the Command Fold's nod). It is the only decoration.
- On a phone the four figures sit two by two.
- A page with a band has no row of Stat tiles beside it and no banner above it.
- Where a figure is counted by rule, the band says so in one line under it or in the panel
  footer ("By rule: ...").

## 9. The "Sample" mark

A business that is a sample (the demo and test businesses) carries the mark **once per screen**:
in the sidebar head after the shop's name on a laptop, in the app bar on a phone, in a
customer page's shop header. A real business never shows it. The mark is "Sample" / «مثال»,
mono 11 in capitals (not 9), 18 high, a 1 px `--strong` border, radius 2, `aria-hidden`; a
sample screen's first line for screen readers says the data is made up. The workspace
response has no flag for it yet (a request for it is open): the kit's shell takes a `sample` prop and the foundation
owner files the request. The back office never shows it.

## 10. Buttons

One button component with five kinds (`Button`, `IconButton`; catalogue in `components.md`).

| Kind | Look | Use |
|---|---|---|
| **volt** | `--volt` fill, `--on-volt` text 13/600, padding 0/20, radius 2, **notch** | The one main action of the screen |
| **dark** | `--text` fill, `--text-inverse` text | A form's save or add inside a panel, a drawer or a dialog, when the screen's Volt belongs to something else. At most one per panel |
| **line** | no fill, `--text` text 13/500, 1px `--control-line`, radius 4 | The default secondary action |
| **quiet** | no fill, no border, `--text-muted` | Dismiss ("Cancel", "Close", "Keep it"), a tertiary action |
| **bad** | no fill, `--bad` text, `--control-line` border | An action that ends something or cannot be undone from the screen; always behind a confirm dialog |

- **One Volt button per screen**, and it belongs to the topmost layer: while a drawer is open
  the page's main button is drawn as `line`, and the drawer's footer has the Volt; behind a
  dialog's scrim the page is inert and the dialog's primary is the one. A button that cannot
  be pressed is a `line` button, never a grey Volt. When a bottom action bar is up (phones),
  the title row's Volt is not drawn.
- **Volt on navigation.** A Volt button may navigate only when that step is the screen's one
  main next step and nothing on the screen changes data (Home's "Open the 3 unpaid orders", a
  drawer's "Open conversation"). A button repeated on every row of a table is never Volt: it is
  `line` or a link. (A table whose first row shows a Volt "Open" is wrong.)
- **Volt or bad on a confirm.** A dialog's primary is **Volt** when it records a fact (Mark
  paid, Mark as refunded, Confirm booking). It is **bad** when it ends something or cannot be
  undone here (Cancel order, Forget customer, Switch off, Make the credit note).
- **Dismissing** is `quiet`: "Cancel", "Close" or "Keep it" in every dialog, drawer and form.
- **The notch.** The volt kind's **top inline-end corner** is cut at 45°, as on the site, and
  mirrored in Arabic by a `[dir="rtl"]` clip-path (`clip-path` does not flip). 9 px
  (`--cut-notch-sm`) at 28 to 36 px high, 12 px (`--cut-notch`) at 44. The other three corners
  are 2 px. **Every other kind is a 4 px rectangle with no cut:** a Volt notch beside
  rectangles on one screen is the design; pills and a 999 px radius on any new button are not.
- **Icons.** A `line` or `quiet` button may carry one 16 px icon before its label (Export,
  Print, Download, Add); an icon-only button is 32 square (28 in a pager, 44 on touch) with an
  accessible name. **Never an icon, an arrow or a spinner on a Volt button.** On the **site**
  the Volt button and its twin are their words only (D-150).
- **Loading.** The button keeps its label, or becomes the doing-word ("Saving"), is
  `aria-busy`, and cannot be pressed twice. A `line` button may show a 14 px spinner; a Volt
  button never does.
- **States.** Hover: Volt `--volt-hover`, other kinds `--surface-subtle`. Pressed: Volt
  `--volt-pressed`. Focus: the ring (section 6). Disabled: `--text-faint`, no hover, and say
  why beside it when it is not obvious.
- Labels say what happens ("Mark paid", "Send reminders"), in sentence case; never "Submit",
  "OK", "Yes". The words of a confirm are the verb of the action.

## 11. Icons

One icon set in `_ui/`, drawn on the **24 px grid** in one line with **square ends and mitred
corners**, rendered at **16 px** (`--ui-size-icon`) with the stroke that reads about 1.5 px at
that size (the icon owner fixes the number; screens never set one). Default colour
`--text-muted`; `--text` for the current item. No fill, no two-tone. A direction arrow or
chevron flips in Arabic (`.ico-flip`); ▲▼, the logo, clocks and checks do not. The five
older icon sets are replaced as screens move (`components.md`). Unicode arrows and "×" in text
are not icons: use the icon.

## 12. Responsive

Three tiers, using the tokens' existing breakpoints (no new ones):

| Width | Shell | Content |
|---|---|---|
| `laptop` (62 rem) and up | Sidebar 240 at the inline start | Layouts as drawn; side column 400 beside the main column |
| `tablet` (48 rem) to laptop | Sidebar closed behind a menu button in the top bar | One column; a dashboard's side column falls below the main one; the drawer is a full-height sheet |
| Below `tablet` (**phone**) | Top app bar (52) and a **tab bar** of five: Home, Inbox, Orders, Bookings, More, 11 px labels, each 44 high at least | Cards, one pane at a time, a bottom action bar |

- **Phone cards.** A table becomes **one card per row**: radius 8, padding 14, hairlines
  inside, the status Tag at the inline end of the first line, money in mono 500. Every column
  that carries meaning stays (who handles it, the status, the amount, the age). A table that
  must scroll sideways shows an edge fade; the page itself never scrolls sideways at 320 in
  either language.
- **44 px.** Every interactive control is at least 44 by 44 on a phone and on `pointer:
  coarse`: buttons, icon buttons, chips, tabs, rows, menu items, checkboxes (the box stays 16,
  the hit area is 44), sidebar links, pager buttons. The component carries it, never a screen.
- **Inputs are 16 px and 44 high** below 48 rem and on a coarse pointer, so a phone does not
  zoom; 13 px and 36 high above that.
- **Bottom action bar.** On a phone the screen's main action moves to a bar fixed above the
  tab bar (its Volt button full width, 44); a drawer's or dialog's footer becomes full-width
  stacked buttons, the primary on top. Only one Volt is on screen.
- **Drawer on a phone** is a full-screen page with a back arrow in its header; the URL still
  names it.
- **Customer pages** are phone first: single column, at most 480 px wide and centred above
  that; checked at 320 and 390.

## 13. RTL

- Logical CSS only: `margin-inline`, `padding-inline`, `inset-inline-*`, `border-inline-*`,
  `text-align: start`. One RTL selector, `[dir="rtl"]`, and only for what a logical property
  cannot mirror: `clip-path` (the Volt notch and the band's cut), transforms, gradients, masks,
  `transform-origin`. Never `:dir()`, `[lang]` or `:lang()` for layout.
- The sidebar, the drawer, a table's columns, a pager and a stepper mirror: the sidebar is on
  the right, the drawer opens from the left, the first column is on the right. A pager's
  arrows and a breadcrumb's separator flip.
- **Time runs right to left in Arabic charts** (week bars, hour grids, age bars, a
  sparkline's direction). Tick labels, numbers and ranges stay left to right inside
  `<bdi dir="ltr">`.
- Money, order and booking numbers, phone numbers, "ALYR" and product names, a run of Latin
  text and every number range sit in `<bdi>`. A phone number is never mirrored and never
  reordered.
- The language button at the foot of the sidebar shows the other language's name ("ع" in
  English, "EN" in Arabic). `lang` and `dir` go on the screen's root; `<html lang="en">` stays
  (a known gap).
- Every string exists in both languages in a copy file or `T = {en, ar}`; the drawings are
  English only, so the longest Arabic string is tested in each layout at the smallest width.
  Arabic is a draft until the native review; say so in the PR.

## 14. Dark

- Values come from the tokens only. A component has no dark rule of its own; a colour that
  changes gets a token with both values.
- The Carbon band lifts a step through `--band` and keeps a hairline against the page;
  `--volt-ink` turns to Volt itself as text; soft status fills are the darker pair; the
  scrim, `--shadow-float` and `--control-line` have dark values.
- The product follows the stored `alyr-theme` choice, else the device. A theme switch inside
  the product is not added without the founder.
- Before sign-off the gallery shows Home and one dense table in dark.

## 15. States

Every screen draws each of these that applies; the checklist asks for them.

| State | Rule |
|---|---|
| **Empty, first run** | A **dashed slot** (1 px dashed `--line-strong`, radius 8) that says what will appear and the one action that makes it true: "Your first order shows here", with the button. Only for something the product can do today (D-039). Never zeros, never an empty chart, never a cartoon |
| **Empty, filtered or searched** | `Empty`: a 15/600 title, one 13 muted sentence (at most 380 wide) and a `quiet` "Clear filters". No illustration |
| **Loading** | Skeleton rows in `--surface-subtle` at the loaded row heights, so nothing shifts. No spinner over a page, no "Loading..." text (a live region says it for screen readers). A poll never shows a skeleton again and never re-animates or moves the scroll position |
| **Error** | A `bad` Banner under the title with the reason in the person's words and a "Try again" action; field errors beside the field in `--bad` 12 px with the reason; a failed row is a red Status with its reason. Never a toast alone, never a code, never "Something went wrong" without what to do |
| **Offline** | One `warn` Banner: what is on screen was loaded at a time, and that changes cannot be saved until the connection is back. Save buttons are `line` and cannot be pressed. Say only what is true: no promise to retry unless it does |
| **Confirm** | A dialog of 520 for an action that ends something: the title is the question ("Cancel order 1043?"), the body says what happens and what does not ("Nothing is deleted"), footer on `--surface-subtle`: `quiet` dismiss then the action, right-aligned (mirrored), the action last |
| **Saved** | A toast at the foot, `role="status"`, one at a time, with **Undo** whenever the change can be undone. An error is never a toast alone |
| **No permission** | The control or nav item is absent. A direct address shows an `Empty`: "This is for owners and admins." with a link home. Money an agent may not see is never sent by the server, so it is never drawn and then hidden |
| **Stale** | A caption "Updated 09:40" in the screen's clock; a figure never says "ago" on a screen nobody reloads |

## 16. Roles

| Who | Sees |
|---|---|
| Owner, admin | Everything, including shop-wide money and margin |
| Staff with the agent role | The work in front of them and **per-order totals only**. Aggregates (open orders total, spent, owes, band figures) and margin are owner and admin only, **enforced on the server**; the screen never receives them |
| ALYR staff (`/ops`) | Every client and counts, never a shop's conversations or customer messages |
| A shop's customer | One order or booking by a signed link, first names only, no phone numbers |

People are listed alphabetically: no ranking of staff, no league table.

## 17. Customer pages (`/s`, `/b`, `/pay`, `/t`, `/d`)

- The shop leads: its monogram and name in the header, the shop's colour behind the monogram.
- **The primary button is the shop's colour** (a `--shop-*` fill with white text at 4.5:1),
  44 high, full width on a phone, radius 4, **no notch and no Volt**. If the business has no
  colour set yet (the field does not exist today; a request for it is open), use the `dark` kind.
- **Footer: "Set up by ALYR"** (`--text-muted`, with the symbol). Never "Powered by".
- No pills, no mono capitals eyebrow ("BOOK FROM YOUR CHAT" is gone), no WhatsApp green or logo,
  a language switch in the frame, the customer's own language from the link.
- Money from the shared price helper (`QAR 24`, «24 ر.ق»); the stand-in pay page says "Test
  payment page. No money moves." The Sample mark sits in the header on a sample shop.

## 18. Back office (`/ops`)

The same kit with a variant: the sidebar head reads "ALYR back office" with a mono "INTERNAL"
line, no Sample mark, the footer shows the staff member and "Platform admin", and the top bar's
state "Staff only" is an `ink` Tag, **not Volt**. English only today. It shows counts and
states, never a conversation.

## 19. Words in the product

- Every string is in `T = {en, ar}` or the area's copy file; components carry no text.
- Honest wording is unchanged ([honesty.md](../alyr-design/honesty.md)): none of "AI", "smart",
  "assistant", "bot", "predicts", "forecast", "health score", "magic", "powered"; no "coming
  soon", "beta" or "new" badge inside a screen. The replacements that were decided are in
  [format.md](../alyr-design/format.md) ("Replacement wording").
- A number the product counted by rule says how, in a panel footer: "By rule: ...". The ALYR
  Agent dashboard keeps its RULE line until it is restyled.
- Formats (money, times, dates, ids, empty values) are in `format.md`; one helper per format.

## 20. When a rule is missing

Stop. File a one-line request (what, why, proposed value) where the lane keeps requests, use
the nearest existing token or component meanwhile, and say so in the PR. Never fork a
component and never write a one-off value. The owner of the shared files adds the rule to
this page before a second screen uses it.

## 21. What the redesign changed from the old rules

So nobody "fixes it back". Each row: the old rule, where it was, the new rule, and which file
was edited in the same change. "Open" means undecided: do not rely on it. Dates are 13 Nov 2026.

| # | Topic | Old rule and its file | New rule (product only unless it says Site) | Edited |
|---|---|---|---|---|
| C1 | Panel shape | "Rounded panels and pills are not ALYR" (`alyr-design/SKILL.md` section 1 point 4; `tokens.md` radius row) | Product panels: `--radius-md` with a hairline; dialogs `--radius-dialog`. **Site** keeps the rule | SKILL.md, tokens.md |
| C2 | Shell chrome | A raised "sheet" with `--shadow-lift` around the page (`_workspace/shell.css`; `components.md` "Workspace shell") | White canvas, hairline panels, no shadows, a sidebar with an end hairline | components.md (the CSS is replaced by the kit's shell) |
| C3 | Numerals | "Figures are Instrument Sans with tabular digits, not mono" (`alyr-design/SKILL.md` section 3; this skill's "Money" and "Dense type scale") | Hybrid: mono for identifiers, times, dates, phone numbers and money in cells and key-value rows; tabular Instrument Sans for figures from 24 px and for amounts inside sentences (section 5, `format.md`). **Site** keeps Sans figures | SKILL.md (both), tokens.md |
| C4 | Volt notch on product buttons | "Whether product buttons take the 45° notch is open; do not mix shapes on one screen" (this skill; `components.md` "Product today"; `tokens.md` and `design/README.md` "Not decided yet") | Volt only, the **top inline-end** corner, 9/12 px, mirrored; every other kind a 4 px rectangle (section 10) | all four, plus `docs/brand.md` |
| C5 | Icons on buttons | "No icon or arrow on a button, on any page" (`alyr-design/SKILL.md` section 1 point 11; `components.md`; D-150) | Product: an icon allowed on `line` and `quiet` and on icon-only buttons, never on Volt. **Site** unchanged (D-150 amended for the product by D-180) | SKILL.md, components.md |
| C6 | Icon style | 24 px grid, 1.7 px, square ends, mitred (`alyr-design/SKILL.md` section 4; `components.md` Icon) | Same geometry, rendered at 16 px with a stroke reading about 1.5 px; the drawing kit's 16-box, 1.4 px, round-cap set is retired and redrawn | SKILL.md, components.md |
| C7 | Pills | Pills are not ALYR; `.sh-pill` at radius 11 (`shell.css`) | No pills in the product: Tag, chip and tabs are radius 4; customer pages too | components.md |
| C8 | Colour for state | Volt's four meanings; status hues "always beside a word"; "Red and green alarms" under Don't (this skill) | One written rule: Volt dot is happening now or just done, green healthy, amber waiting, red failed (section 7). The Don't is about alarms, not state | this skill |
| C9 | Light page and Carbon band | Light first, Carbon for command moments; "no row of big stats" is the homepage's | No conflict. One band per page, `--cut-band`, status tokens on the band (sections 4, 8) | none |
| C10 | Weights | 400/500/600; 700 on the homepage hero only | No conflict; mono 400/500 only | none |
| C11 | Arabic face | IBM Plex Sans Arabic (`alyr-design/SKILL.md` section 3) | Same. The drawing kit's Noto Sans Arabic is a drawing stand-in, never built | none (the rule already said so) |
| C12 | Type scale | Body is 15 (`--ui-body`) (this skill "Dense type scale"; `globals.css`) | Body 13 `--ui-small`, caption 12, label 11, page title 24; nothing under 11; Arabic one step up (section 5) | this skill, tokens.md |
| C13 | Input size | Inputs 16 px (`--ui-input`), 44 on phones (this skill; `tokens.md`) | 13 px and 36 high above 48 rem and on a fine pointer; 16 px and 44 high below it or on a coarse pointer | this skill, tokens.md |
| C14 | Touch targets | 44 on phones (`alyr-design/SKILL.md` section 8) | Unchanged; the drawings' 28 to 36 are desktop sizes. The component carries 44 | none |
| C15 | Control borders | `--line` is never a control border; controls use `--line-strong` (`tokens.md`) | Fields and selects `--line-strong`; buttons and chips `--control-line` (new) | tokens.md |
| C16 | Faint text | Faint is labels and metadata only (`tokens.md`) | Unchanged, now enforced: placeholders and sentences are `--text-muted` | none |
| C17 | Status text on soft fills | Same pairs as the pills (`globals.css`) | `--ok-text`, `--warn-text` (new) for text on a soft fill | tokens.md |
| C18 | Label tracking | `--tracking-label` .08em | Unchanged: the token everywhere, not 4% or 6% | none |
| C19 | Title tracking and leading | `--tracking-heading` -.03em, `--leading-heading` 1.04; product h1 `clamp(26px, 36px)` (`shell.css`) | Page title 24/30 at -.015em; figures -.02em (new tokens) | tokens.md |
| C20 | Space scale | `--space-1` to `--space-7` (4, 8, 16, 24, 40, 64, 104) (`tokens.md`) | The product adds a UI scale of 2 to 32 and bans 3, 5, 7, 9, 18, 22 (section 5). `--space-*` stays for the site | tokens.md |
| C21 | Sidebar and nav | 16 rem sidebar, 34 px links, active link on a lifted sheet with a 45° sliver (`shell.css`) | 240 px, 30 px links (44 on touch), active link on `--surface-subtle`; a sub-link's current marker is the existing cut sliver, not a square bar | components.md |
| C22 | Page title and eyebrow | h1 `clamp(26px, 36px)` with a mono eyebrow (`shell.css`) | 24/30 title, one muted sentence, no eyebrow | components.md |
| C23 | Shadows | `--shadow-lift` on panels (`tokens.md`) | Only menu, popover and dialog, with `--shadow-float` | tokens.md |
| C24 | Scrim | None defined | `--scrim` (new), one value | tokens.md |
| C25 | Empty states | "Structure drawn as dashed slots ... never zeros" (this skill) | Both: a dashed slot for first-run objects, `Empty` for filtered or searched lists (section 15) | this skill |
| C26 | Selected row | `--volt-wash` is "pale Volt behind the current row" (`tokens.md`) | Selection is `--surface-subtle`; `--volt-wash` only for the live "now" row | tokens.md |
| C27 | Logo | Never retyped; never under 140 px wide, the symbol below (`components.md`) | Unchanged. Sign-in, sign-up and the shell use `Logo` or `Symbol`, never "ALYR" typed beside the symbol | none |
| C28 | WhatsApp marks | No WhatsApp logo or green on ALYR's surfaces (`honesty.md`) | Unchanged. The drawing kit's `wa` glyph is replaced by a neutral chat icon and the word; `--wa-*` only in drawn bubbles | none |
| C29 | Customer pages | The shop's brand first, ALYR quiet in the foot (this skill); Volt is ALYR's, not the shop's (the shop colours in `tokens.json`) | The primary button is the **shop's colour**; footer "Set up by ALYR", never "Powered by" (section 17) | this skill |
| C30 | "Ask ALYR" | No assistant wording (`honesty.md`) | Renamed to what happens (`format.md` "Replacement wording") | honesty.md pointer, format.md |
| C31 | "At risk" | No health score or prediction (`honesty.md`) | Name the counted signal ("Payment overdue", "No sign-in for 7 days") | format.md |
| C32 | "Free replies" | "Free replies for 24 hours" must not be claimed (`honesty.md`) | "Typed replies allowed for 23 more hours" or "Window open until Fri 09:27" | format.md |
| C33 | Sample names | Fictional, checked, family names never prominent (`honesty.md` section 5) | **Open.** The retired and unchecked names stay out of every screen; the manual check is the founder's | none |
| C34 | Prices and setup fee | No setup fee (D-092); prices only from the price list | Decided: no setup fee anywhere; a price on a screen comes from the price list, never typed. **Open:** which figures the drawings show | none |
| C35 | Pay-ALYR screens | Not covered | **Open.** Billing, pay to go live, bank details and card checkout for ALYR's own fee are drawn but not built: no route, no nav item | none |
| C36 | Copy house style | En dash in ranges, "items" not SKUs, "your team" not "agents" (`voice.md`) | Ranges `07:00–22:00`; empty value "None", not an em dash; "Code" not "SKU"; the staff role "Agent" is kept as a role name, never "agents" in a sentence | voice.md, format.md |
| C37 | Rule line | "RULE · owed 30+ days..." in mono (`honesty.md`; `agent-dashboard.md`) | Product panels write "By rule: ..." as a sentence in the panel footer. The Agent dashboard keeps its RULE line until restyled | honesty.md |
| C38 | Status colours on Carbon | Not defined | `--on-band-ok`, `--on-band-warn`, `--on-band-bad` (new); no warm tint of a fill used as text | tokens.md |
| C39 | Dark theme | Dark values exist for every token | Unchanged; Home and one dense table are drawn in dark before sign-off (section 14) | none |

### Decisions taken in this document (not drawn, easy to change)

These close gaps the drawings leave. Change them here if the founder sees otherwise:
the three-tier breakpoints (section 12); the content column cap and its centring (section 3);
the Volt-on-navigation rule and Volt versus bad on a confirm (section 10); `quiet` for every
dismiss (section 10); `dark` for a save inside a panel (section 10); an `ink` Tag for "Staff
only"; the Arabic step-up rule (section 5); the loading and offline wording rules (section 15).
