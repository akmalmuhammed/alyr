# The product UI kit

`apps/web/app/_ui/`: the shared React components for the product (workspace, back office,
customer pages). Not a route. Every class is `.u-*`; everything the kit draws sits inside a
`<UiRoot>` (class `u`), which carries the token aliases, the language and the direction, so
nothing depends on the workspace shell's `.sh`. The public site (`_site`) does not use it.

- Import the components from `_ui` (`index.ts`) and the styles once from `_ui/ui.css`.
- Values come from `design/tokens.json` only (see `.claude/skills/alyr-design/tokens.md`). No hex,
  no colour function, no font name in the kit. Dark is the tokens turning; a component has no dark rule.
- Direction is by logical properties. `[dir="rtl"]` appears only for a clip-path (the Volt notch,
  the band's cut), an icon that points along the line, and Arabic type (one size up, its own
  faces, no capitals, no tracking in labels).
- Targets are 44 px under 48 rem and on coarse pointers; inputs are 16 px text there so phones do
  not zoom. Focus is a 2 px ring in `--focus` (Volt in dark and on Carbon).
- Components hold no words. Every string is a prop, from the screen's own copy file in both languages.
- Gallery (development only, 404 in production): `/ui-kit?lang=ar&theme=dark`.
- Numbers: identifiers, times, phone numbers and money in tables and key-value rows are mono
  (`.u-mono`, or `mono` on `KV`); figures 24 px and up and amounts inside sentences are Instrument
  Sans with tabular figures (`.u-fig`). Money and ranges go in `<bdi>`.

## Group 1: controls and content blocks

| Export | Use | Never |
|---|---|---|
| `UiRoot`, `useUi`, `useUiHost` | The root of kit content: `.u`, `lang`, `dir`; `useUiHost()` is the element dialogs, drawers, menus and toasts draw into (not `document.querySelector(".sh")`) | Nesting roots with different languages |
| `UiIcon` | The glyphs the kit draws itself (24 grid, square ends, mitred, 16 px). `icon` props take any node, so the shared icon set replaces it | A second icon set in a screen |
| `Button` | `kind` volt / dark / line / quiet / bad; `size` xs 28, sm 32, md 36, touch 44; `loading` (grey with a Volt dot, same words), `disabled`, `href`, `block` | An icon or arrow on `volt` (a type error); two Volt buttons in a view; a disabled Volt (drawn as an outline); a spinner |
| `IconButton` | One icon, `label` required (name and tooltip), `bare` for a header close | An icon with no `label` |
| `Tag` | A state of an object in a table or header: tone ok / warn / bad / n / ink / volt, dot optional | Colour with no word; a "New" or "Beta" badge on a feature |
| `Status` | Dot and a word in a cell: volt now or just done, green healthy, amber waiting, red failed, hollow ring off | A dot alone |
| `Dot` | The round mark of a state, decorative | The only carrier of a meaning |
| `Chip` | An independent filter (`aria-pressed`), optional `count` | Choosing one view out of several (use `Tabs`) |
| `Tabs` | Segmented tabs: views of the same data. Arrow keys follow the writing direction | Navigation between pages |
| `UTabs` | Underline tabs: list status tabs (tab list) or detail-page sections (links, with `href`) | More than about seven tabs |
| `Field` | Visible label, one control, hint, error, `optional`; names the hint and error by `aria-describedby`, sets `aria-invalid`. Give it a kit control | A placeholder as the label; a plain element when there is an error (it receives `invalid`) |
| `Input`, `Textarea` | The text controls; `prefix` and `suffix` in mono inside the box | |
| `Select` | A native select; `variant="filter"` with a visible `label` for a row of filters | A custom listbox |
| `Search` | A search box: `label` names it, `clearLabel` adds the clear button, `landmark` once per page | A placeholder that is the only name |
| `Kbd` | A key cap in mono | |
| `Toggle` | An on/off switch (`role=switch`), 44 px target; children name it and say the state | A switch with no word for its state where it matters |
| `Check`, `Radio` | In their own label so the row is the target; `indeterminate` on `Check` | A radio group outside a `FormSection` |
| `FormSection` | A fieldset with a legend, help and error for a group of controls | |
| `Panel`, `PanelHeader`, `PanelBody`, `PanelFooter` | 8 px radius, hairline, no shadow; header 52 px with a `level`; footer is the mono "By rule: ..." note on a quiet fill; `clip` when it holds a table or filled rows | A shadow; a card inside a card |
| `Stat` | A number tile: mono label, 28 px figure, delta, line, optional chart as children | Counting anything itself |
| `Band`, `BandItem` | The Carbon band, one per page, top inline-end corner cut, up to four figures | A second band; status colours other than its own |
| `KVList`, `KV` | Definition rows; `mono` for identifiers, times, phones and money | `mono` on words ("Included") |
| `Banner` | A line of state under the title: tone ok / warn / bad / n, one action. Bad is `role=alert` | More than one per page; an alarm with no count |
| `Empty` | The empty state of a filtered or searched list | A first-run object (use `DashedSlot`) |
| `DashedSlot` | A first-run object: dashed outline, hollow dot, what will appear here | Something the product cannot do today |
| `Timeline` | Events with a hairline and a dot each, mono meta ("09:38 · pay link") | |
| `Steps` | Numbered steps, done (Volt check) / current / to do; `stateLabels` for screen readers | Volt on a step that has not happened |
| `Avatar` | Initials in a circle; `tone="ink"` for the signed-in person | A system avatar; a person's photo |
| `Thumb` | An item photo, or one of six shop colours with initials | |
| `PageTitle` | The title row: 24 px title, one muted sentence, a right slot for actions | An eyebrow; hero type |
| `SectionLabel`, `Section` | The small mono caps label; a labelled block with an optional right link | |
| `Meter` | A thin bar for a share of a whole; `label` names it | A bar with no figures beside it |

Pure logic (class builders, tab keys, field ids, initials, colours) is in `variants.ts` and tested by
`variants.test.mjs` (`pnpm test`).

## Group 2: data display, overlays, charts, calendar and icons

Gallery: `/ui-kit/data?lang=ar&theme=dark` (development only, 404 in production). Styles: `ui-data.css`.
Layers draw into `useUiHost()` (the `UiRoot` element); while a modal layer is open the rest of that root is
`inert`, so put the whole screen inside the root.

| Export | Use | Never |
|---|---|---|
| `Table`, `BulkBar` | Mono caps headers, 52 px rows (`density="compact"` 44), sorting (`sort`, `onSortChange`), selection with shift-range and a header checkbox, a "more" menu per row (`rowActions`), keyboard row focus (arrows, Home, End, Page keys, Enter opens, Space selects), skeleton rows (`loading`), `empty` when there are no rows, and under 48 rem a list of cards (`phone` slot on a column: kicker, tag, title, amount, body, foot, foot-end; `phoneCell`, `showOn`). `caption` names it. | Sorting inside it (hand it rows in order, or use `sortRows`); a page-level sticky header together with `scrollX` (see requests.md); words of its own |
| `Pager` | Where you are and two arrows under a list; `pageRange` writes the range | |
| `Drawer` | Detail of one thing from the inline-end edge (left in Arabic), 440 or `wide` 480; `mode="docked"` sits beside a list (no scrim, no trap); a bottom sheet under 48 rem | A drawer inside a drawer for the same job; a footer with two main buttons |
| `Modal`, `ConfirmDialog` | A 520 dialog, 10 px radius, float shadow, footer on a quiet fill; `ConfirmDialog` names the act, safe choice first and focused, `destructive` draws the confirm as `bad`, scrim does not dismiss | "Yes" or "OK" as the button; a confirm for something that can simply be undone (use a toast with Undo) |
| `Menu`, `ContextMenu` | A list of actions from a button (the trigger is yours and must spread the props it gets) or from a right-click; arrows, Home, End, typing, Escape; `tone: "bad"` rows, separators, group labels, shortcut key caps | A destructive item that acts at once; a ContextMenu as the only door to an action |
| `ToastProvider`, `useToast` | One provider per screen inside the root; `push({ text, tone, meta, undo, key })`: three show at once, the rest wait; 4.5 s, 8 s for a problem, 9 s with Undo; pauses on hover and focus; polite live region, a problem is announced at once | A toast as the only record of something that matters; a toast for a field error |
| `Skeleton`, `SkeletonRows`, `SkeletonText` | A grey bar where something will be, same height as the real thing | Shimmer, pulse, a spinner |
| `Spark`, `Area`, `Bars`, `Ring`, `Stack` | Plain SVG and CSS charts; `summary` (a sentence, both languages) is required and is read by screen readers; Volt marks only today (`signal`, `today`); time runs right to left in Arabic | Volt as a fill; a chart with no figures beside it; a tooltip |
| `CalendarGrid` | A day: time axis, a column per person or bay, bookings placed by start and length (CSS, 72 px an hour), overlap lanes, off-hours shading, the now line, free stretches (`freeSlots`), sideways scroll with the axis fixed, legend. `formatTime` is the one place a time is written | Fetching or polling (the screen does); a Volt block |
| `HourHeat` | Bookings (or anything counted) by day and hour as a real table, four steps, closed hours flat, the now line | Colour as the only carrier: every number is text with a count label |
| `Composer` | A growing multi-line field, Reply / Note switch, counter, send hint, a tools slot, the send button (Volt for a reply, dark for a note); `closed` switches it off with the reason; Ctrl or Cmd Enter sends | A saved reply sent without the person pressing send |
| `Workbench` | List, main and context panes filling their height, each scrolling alone; three panes from 62 rem (of the workbench itself), two below, one under 48 rem (`pane`) | Content padding (panes draw their own headers edge to edge) |
| `PhoneFrame` | A 390 frame for the gallery; the Table's cards switch on inside it | Use in the product |
| `Icon` | One glyph by name (the drawing kit's `IC` names, plus `chat`, `undo`, `mail`); 24 grid, square ends, mitred corners, `currentColor`, 16 px; `size` sm 12, md 16, lg 22; `aria-hidden` unless `label`; `right`, `left`, `arrow`, `send` mirror in Arabic | A WhatsApp logo or lookalike (`wa` is a plain chat bubble); the `robot` glyph (reads as AI) |

Pure logic, each with a `node --test` file: `tableLogic.ts` (sort, selection, row focus, page range),
`calendarLayout.ts` (times, placement, overlap lanes, free gaps, now line), `chartScale.ts` (points,
fractions, stack shares), `heat.ts` (levels), `toastQueue.ts` (the queue and its timings).
