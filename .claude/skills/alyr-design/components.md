# Component catalogue

Paths are relative to `apps/web/app/` unless they start with `apps/`, `docs/` or `scripts/`.
**The rows above "Product UI" are the public site's and the shared marks; the redesigned
product's parts are in the "Product UI" section at the end** (13 Nov 2026, D-180).
Use the component before drawing a new one. If a variant is missing, add it to the
component in the lane that owns it, not a copy beside it. Status on 17 Oct 2026: the site
and the Agent follow these; the product screens have their own older versions (marked
**product today**) that the token migration replaces.

## Brand marks

| Component | File | Use | Never |
|---|---|---|---|
| `Logo` (horizontal) | `_site/brand.tsx` | Header, footer, documents. Carbon on light, white on Carbon, always with the Volt plane | Under 140 px wide (use `Symbol`), retyped in a font, recoloured, stretched, outlined, on a photo |
| `Symbol` (the Command Fold) | `_site/brand.tsx` | Small sizes, the closing call, favicon (`icon.svg`), app icons | Altered planes or gaps; used as a bullet |
| The mark's polygons | today copied in seven places (`brand.tsx`, `icon.svg`, `socialCard.tsx`, `apps/api/src/alyr/modules/agent/card.py` LOGO_PLANES, the workspace and ops shells, `_customer/Frame.tsx`) | Take them from the tokens' mark file once it exists, else from `brand.tsx` | Drawing them again by eye. `mail.py` retypes "ALYR" in Arial: a known break, fix with the logo image |
| `Icon` | `_site/brand.tsx` (24 px grid, 1.7 px line, square ends, mitred corners) | Every interface icon on the site. **The product** uses the same geometry in its own set in `_ui/` (planned), rendered at 16 px with a stroke that reads about 1.5 px | A second icon set. **Product today:** `Icon` in `app/[[...section]]/page.tsx`, `OpsIcon`, `Glyph`, start's `Ico`, the Agent's arrows: five sets, four strokes; the kit's set replaces them as screens move |
| Signal | `.signal` (`_site/site.css`), the logo's Volt plane | Before a product name in an eyebrow or the product bar | As decoration elsewhere |

## Actions

| Component | File | Use | Never |
|---|---|---|---|
| Volt button with the 45° notch | `.btn .btn-volt` (`site.css`), `ContactButton` (`_site/Contact.tsx`) | The one main action in view. Its words and nothing else | An icon or an arrow in it (D-150; on a product Volt button too); two in one view; Volt for a secondary action; a Volt button that cannot be pressed |
| Outlined twin | `.btn-line`, `ContactButton variant="line"` | A second way in further down a page; the header's button until the hero's has scrolled away | A filled grey button |
| Link | `.link` (`site.css`) | Going somewhere. With an arrow, which flips in RTL; on the homepage no arrow and a line under its words (`home.css`, D-150). A link with `rich()` words keeps its `<span>`, or flex splits "ALYR Agent" from the rest | "Learn more", "Click here" |
| **Product today** | `.btn` (`globals.css`), `.sh .btn` (`_workspace/shell.css`), `.cx-btn` (`_customer/customer.css`), `.ob-btn` (`start/start.css`) | Four systems, no notch, radii to 999 px; `.sh .btn.primary` is Carbon while `globals .btn.primary` is Volt. **Replaced by `Button` in `_ui/`** (Product UI, below): the Volt kind takes the notch on its top inline-end corner, the other kinds are 4 px rectangles, an icon is allowed on `line` and `quiet` only | Adding a fifth; writing a button class in a screen's CSS |

## States and honesty

| Component | File | Use | Never |
|---|---|---|---|
| Pending dot and status line | `.dot-pending`, `.status-line` (`site.css`), `ContactPending` | Something not available yet, said plainly | An error box, a disabled button, a "coming soon" badge on a feature an owner or customer would look for (D-039) |
| Section rule | `.rule` (`_site/kit.css`) | One plain hairline above a section of the homepage | Crosses at its ends (gone, D-150); a dashed line as decoration: dashed means a slot waiting to become true |
| "Sample" mark | `SampleMark` (`_site/Frames.tsx`), `.mark-sample` (`site.css`) | Every drawn product screen, once, in its own chrome: after the shop's name in a window's `.aw-bar`, at the end of a flow's tab row, in a panel's top when a demo tab has no phone; a drawn phone says `fig.business` ("Sample business") under the name instead. `aria-hidden`: the figure's first line (an `sr-only` `figcaption`, the sample's `fictional` or `fig.note`) says it for machines, and the drawing sits in a `data-nosnippet` box | A second mark on the same drawing; a page-level "everything here is fictional" line instead; a mark on a figure that has the sample switch. A frame of several drawings of one sample business (the homepage's products plate) is one figure set: one mark, in the frame's own chrome, and none on its tiles |
| Caption | `FigCaption` (`_site/Drawings.tsx`), `.cap` (`site.css`) | Only a drawing that needs words: "what it shows · Sample", no FIG number. First child of its figure, shown below with `fig-cap-end` | A caption beside a chrome mark; a caption that wraps to an orphan (it balances) |
| Contact states | `Contact.tsx`, `site.ts` (`CONTACT_STATE`) | WhatsApp when `NEXT_PUBLIC_ALYR_WHATSAPP` is set, else email, else pending; decided at build time | A hand-written mailto or wa.me link; "opens soon" more than once on a page |
| Offer switch | `site.ts` `OFFER_LIVE` | Prices, the hero price, money-back lines, the price question and the Price link | A price anywhere outside it, including meta and social cards (`factsNoOffer`, `descriptionNoOffer`) |

## Page structure (site)

| Component | File | Use |
|---|---|---|
| Header | `.top`, `Shell.tsx` | Sticky; opaque by default, clear at the top only once scripts run; turns `--band` over a Carbon section (`data-on-dark`) |
| Products menu | `ProductsMenu` in `Shell.tsx`, `.pm` (`site.css`) | Native `<details>`; the suite in its fixed order from `PRODUCTS` (`site.ts`); keyboard, Escape, click outside, one menu open at a time |
| Theme switch | `ThemeSwitch.tsx`, script in `document.tsx` | 44 px icon in the header, a row in the phone menu |
| Product bar | `ProductBar` (`ProductKit.tsx`), `kit.css` | Under the header on product pages; no call to action (the header has it) |
| Product page template | `ProductHero`, `FlowSection`, `ScreenBlock`, `InsideBlock`, `WhoBlock`, `WorksBlock`, `QuestionsBlock` (`ProductKit.tsx`) | Every product page (`alyr-site-page`) |
| Tabbed demo | `ProductDemo.tsx` | Product heroes; plays only on screen, can be paused |
| How it works | `FlowDiagram.tsx` | Product pages and the homepage's One order; may keep moving while on screen. Opens on a finished frame (the first story's last step) and plays from step 1 once 60% of it is in view; the signal on the wire is one 45° tick per step, never a looping glow |
| The fold | `.band-fold` (`site.css`) | Into a Carbon band and at the top of the closing call |
| Carbon plate | `.af-plate` (`agentfig.css`), `.product-in` (`site.css`), `.sf` (`suite.css`) | Behind the hero figure; product page openings; the homepage's products. Top start corner cut at 45°, mirrored |
| Closing call | `.cta`, `.cta-mark` | Every page, full-bleed Carbon (`--band`), the fold at its top |
| Sticky contact bar | `.bar` (`site.css`) | Phones under 53 rem once the hero's button has gone; hides the header's Volt button and hides again at the closing call |
| Questions | `.qa` (`kit.css`), native `<details>`, an `id` per question | Every page |
| Footer | `Shell.tsx` | Sign-off, products in order, the trades with a page of their own under their label ("For your business"), Questions and Guides, the disclaimer, "Built in Qatar." |

## Drawings of the product (site)

| Component | File | Use | Watch |
|---|---|---|---|
| Drawn WhatsApp chat | `.wa-*` (`site.css`), `ReportPhone.tsx` | WhatsApp's own chat colours, light and dark, no WhatsApp logo | Read ticks only on messages the drawn person sends; the sent-time grey adjusted for 4.5:1 |
| Phone frame | `Phone` (`Frames.tsx`), `.d-phone` (`drawings.css`) | Customer pages on the site, 45° cut | Content inside never shrinks (`flex-shrink: 0`); it crops like a real phone |
| Customer page chrome | `CxTop`, `CxFoot` (`Frames.tsx`) | Drawn customer pages | A hand copy of `(product)/_customer/Frame.tsx`: when the product changes, change the drawing |
| Workspace window | `.aw-*` (`drawings.css`) | Workspace screens on the site, with the shop monogram (Volt corner) | |
| Drawn workspace screens | `Sheets.tsx`, `Drawings.tsx`, `PageDrawings.tsx` | Product pages, in the product's exact words | Hand copies of `(product)/_workspace/Screens.tsx`: they drift. Prefer a captured sample, as the Agent does |
| Numbered marks and callouts | `.co-n` (`kit.css`), `drawings.css` | Carbon discs with white mono numbers (a Volt ring in dark), on product pages. The homepage's callouts are plain lines that name the part of the screen they are about (D-150) | Volt discs: a number is not an action |
| Agent feed and sample switch | `AgentFigure.tsx`, `agentfig.css`, `live.ts`, `liveStyle.ts`, `ReportSwitch.tsx` | Homepage spotlight, `/agent` (the homepage hero until 28 Oct 2026, D-062) | Only events the product performs and logs. A flag shows its title and the dashboard's own line, no rule line under it (founder, 25 Oct 2026). With a feed it is the live sample (D-058, motion.md's one exception): each sample's `live` script in `copy.ts` moves the dashboard through `live.ts`, never by numbers typed into the copy; keep the pause button, the stops and the settled HTML |
| How we work cards | `HowCards.tsx`, `how.css`, `loops.ts`, `loopStyle.ts` | The homepage's four stages: a Carbon canvas cut at 45° per card with one drawn window of the product and one moment, and a `button` over it to play it again. The HTML is the finished state. Each scene keeps playing on its own cycle (founder, 26 Oct 2026); one Pause control under Improve for the four. The last card's words say that we check again (D-150) | A timer of its own; a second Sample mark or Pause control; a line drawn back to the first card; Volt on anything that has not just become true |
| Products frame | `SuiteFrame.tsx`, `suite.css`, `loops.ts`, `loopStyle.ts` | The homepage's "One shop, six products": one plate, a tile per product, each one link with a fragment of its real screen. Every tile is finished before it is seen; in view its moment plays and keeps playing, each tile on its own cycle, 8 beats apart (founder, 26 Oct 2026); hover or focus replays a resting tile; one Pause control at the bar's end for the six | A second Sample mark or a Pause per tile; a fade instead of the hard crop at the tile's edge; a tile resting on an earlier state; a rule line on the Agent tile |
| Pause control of a looping figure | `LoopToggle.tsx`, `loops.ts`, words in `copy.ts` `loop` | One per looping figure or section (WCAG 2.2.2): "Pause" / «إيقاف» with the demo's icon, a full name that starts with that word (`loop.names`); `hidden` in the HTML, shown by loops.ts once the figure plays, placed out of the flow over room the figure keeps | A site-wide pause in the header; a control that is in the HTML without scripts; one that moves anything when it appears; an icon with no word |

## Shared with the product

| Component | File | Use | Watch |
|---|---|---|---|
| ALYR Agent dashboard | `_agent/AgentDashboard.tsx`, `_agent/agent.css`, `_agent/labels.ts`, `_agent/types.ts`, samples in `_agent/samples/` | The workspace home (`/app`), `/agent-sample`, and the site in `mode="showcase"` with `headingLevel`, `headings={false}`, `ruleLines={false}` and the site's `labels.suggestions` | Themed by `--ag-*`; resets in `:where()`. On the site it is untouched: no `ag-` class elsewhere, page rules stop at `.ag`. **Rule lines:** the product keeps them (`ruleLines` defaults to true); the public site hides them, and every site drawing of a suggestion (the feed, `/agent`'s opened card, the products frame, the report drawn on a phone) leaves the rule line out (founder, 25 Oct 2026). Samples are captured from the engine (`python -m alyr.agent_samples`), never edited by hand |
| Report card | `apps/api/src/alyr/modules/agent/card.py`; site images in `_site/report/` (`scripts/site-report-images.mjs`) | WhatsApp, the site, Meta's template sample | `alyr-generated-image` |
| Social card | `_site/socialCard.tsx`, `opengraph-image.tsx` per English page | Link previews | English only until Arabic is drawn with resvg |
| Words helpers | `_site/Text.tsx` (`lines`, `rich`), `.money`, `.ref`, `.pname`; the Agent's `Rich` | Keep amounts, order numbers and product names whole and in `<bdi>` | |

## Product screens today (to converge)

These are the old product's own versions. The redesign replaces them one section at a time
with the kit in "Product UI" below; until a section is replaced, do not copy them.

| Pattern | Where | Note |
|---|---|---|
| Workspace shell | `.sh-side`, `.sh-top`, `.sh-tabbar`, `.sh-palette` (`(product)/app/[[...section]]/page.tsx`, `_workspace/shell.css`); `/ops` reuses it (`ops/Shell.tsx`, `ops/ops.css` overriding by import order) | Sidebar on a laptop, tab bar on a phone. The raised "sheet" with a lift shadow, the eyebrow above the title and 34 px links are retired by the redesign (`ui-rules.md`, C2, C21, C22) |
| Tables, pills, inbox, forms | `globals.css` classes restyled under `.sh-main`; `_workspace/Screens.tsx`, `Team.tsx` | Inputs styled in seven places |
| Customer pages | `(product)/_customer/Frame.tsx`, `customer.css` (`.cx`) | `/s`, `/b`, `/pay`, `/t` |
| Setup checklist | `.sh-setup` (shell), `.ob-checks` (start), `.cx-track` (tracking) | Three step-list designs; pick one when you touch them |
| Charts | Agent week bars with a ghost for last week, hour tints, age bar (`agent.css`); `.agebar` (globals); `.tm-bar`, `.tm-meter` (Team) | Converge on the Agent's vocabulary |
| Duplicated helpers | `initials()` ×4, `qar` ×3, `Linked` ×2, switch ×2, chat bubble ×3, composer ×3, avatar ×4, empty state ×5 | Reuse one when you touch a screen; do not add another |

## Product UI (the redesign)

The kit for the workspace, the back office, sign-in, sign-up and the customer pages
(`alyr-product-screen/ui-rules.md` has the rules; this section has the parts). It is the
**product only**: the public site keeps the components above. The names are the drawing kit's
(`Btn` is `Button`, `Pn` is `Panel`, and so on); the prop shapes follow the drawing kit and are
the contract the kit's builders implement.

**Status: planned.** Every file below is under `apps/web/app/_ui/` and is built by the kit
changes; each row stays "planned" until its file is merged, then the status here is changed in
the same change. All of it carries the class prefix `.u-` and reads tokens only. If a built file
name or prop differs from this section, the code wins and this section is fixed. A screen that
needs a part that is not here asks for it (`ui-rules.md` section 20); it never copies one.

Every component below handles, without a screen doing anything: logical CSS and `[dir="rtl"]`,
the 44 px touch size, a visible focus ring, both themes from tokens, and English and Arabic text
passed in (a component carries no words).

### Actions

| Component | File (planned) | Props | Sizes and states | Use | Never | RTL and a11y |
|---|---|---|---|---|---|---|
| `Button` | `_ui/Button.tsx` | `label`, `kind` volt, dark, line, quiet, bad; `size`; `icon`; `loading`; `disabled`; `href` | xs 28, sm 32, md 36, touch 44. Hover, pressed, focus, disabled, loading | Rules section 10: the one Volt, dark for a save in a panel, line as the default, quiet to dismiss, bad behind a confirm | A second Volt; an icon, arrow or spinner on Volt; a pill; a button for something not built; "Submit", "OK" | The Volt notch is the top inline-end corner and mirrors. A `href` renders a link, not a button. `aria-busy` while loading |
| `IconButton` | `_ui/IconButton.tsx` | `icon`, `label` (the accessible name), `bare`, `size` | 32; 28 in a pager; 44 on touch | Close, export, print, previous, next, a row's menu | An icon with no accessible name; one icon meaning two things | Direction icons flip. `aria-label` from the copy file |
| `Link` | `_ui/Link.tsx` | `href`, `children` | Body size, a line under it | Going somewhere inside a sentence or a panel | "Learn more", "Click here"; a bare arrow | Arrow flips |

### Status, filters and views

| Component | File (planned) | Props | Sizes and states | Use | Never | RTL and a11y |
|---|---|---|---|---|---|---|
| `Tag` | `_ui/Tag.tsx` | `label`, `tone` ok, warn, bad, n, ink; `dot` | 22 high; 12/500 text on a soft fill, using `--ok-text` and `--warn-text` | A state that is a property of the object in a table row or a header: Paid, Unpaid, Draft | A Volt Tag; a count in a Tag; a Tag you press (that is a Chip) | The word is the content; colour is never alone |
| `Status` | `_ui/Status.tsx` | `label`, `tone` ok, warn, bad, n, volt, off | A 7 px dot and 13 text; `off` is a hollow ring | A live or current state shown as a dot and a word: "Here now", "Line connected". Volt only for happening now or just done | A dot with no word; Volt for "healthy" (that is green) | The dot comes before the word on the start side |
| `Chip` | `_ui/Chip.tsx` | `label`, `on`, `count` | 28 high, radius 4; on is a `--text` fill | A filter you switch on or off in a filter row; the first is "All n" | A status (that is a Tag); more than one row of chips | `aria-pressed`; the count in mono |
| `Tabs` | `_ui/Tabs.tsx` | `items` (label, count), `value`, `onChange` | 28 high tabs in a 3 px frame, radius 6 | Switching the view of the same data: Today, This week, 28 days; Reply or Note | Going to another page; more than five tabs | `role="tablist"`; arrow keys; the order mirrors |
| `UTabs` | `_ui/UTabs.tsx` | `items` (label, count), `value`, `onChange` | Underline tabs; a 2 px `--text` underline on the current one | The status tabs of a list (Open, Waiting, Done) and the sections of a detail page | A Chip row beside them for the same thing | Same as `Tabs` |

### Forms

| Component | File (planned) | Props | Sizes and states | Use | Never | RTL and a11y |
|---|---|---|---|---|---|---|
| `Field` | `_ui/Field.tsx` | `label`, `value`, `placeholder`, `prefix`, `suffix`, `help`, `error`, `lines` | 36 high; 44 and 16 px text on touch; hover, focus (ring), error, disabled; a textarea is lines x 20 + 16 | Every input, with its visible label above | A placeholder as the label; a faint placeholder; an error without words | `aria-describedby` for help and error; prefix and suffix are mono and sit on their own side |
| `Select` | `_ui/Select.tsx` | `value`, `hint`, `options` | 32 high, radius 4, `--line-strong` border | Choosing one of a few values in a filter row or a form | A place switch (there is one place); more than about a dozen options (use Search) | Chevron at the end; the native control on touch |
| `Search` | `_ui/Search.tsx` | `placeholder`, `width`, `shortcut` | 32 high, 260 wide by default | One per page, at the start of the filter row | A second search; a faint placeholder | The icon is at the start side; `role="search"` |
| `Kbd` | `_ui/Kbd.tsx` | `keys` | 18 high, mono 11 | A shortcut in a menu or the search | On a phone | Not announced twice |
| `Toggle` | `_ui/Toggle.tsx` | `on`, `label`, `disabled` | 32 by 18; the knob 14 | A setting that takes effect at once | A choice that needs Save (use `Check`) | `role="switch"`; the knob moves toward the end |
| `Check`, `Radio` | `_ui/Check.tsx`, `_ui/Radio.tsx` | `on`, `label`, `disabled` | A 16 box with a 44 hit area on touch | Several (`Check`) or one (`Radio`) of a short list | A `Toggle`'s job | Native inputs, styled |

### Containers and data

| Component | File (planned) | Props | Sizes and states | Use | Never | RTL and a11y |
|---|---|---|---|---|---|---|
| `Panel`, `PanelHeader`, `PanelFooter` | `_ui/Panel.tsx` | `title`, `sub`, `right`; footer `text`, `right` | Radius 8, 1 px `--line`; header 52; footer on `--surface-subtle` with a mono 11 note | Every group of content on a page; the footer carries "By rule: ..." | A shadow; a panel inside a panel; a header taller than 52 | The right slot mirrors. The title is a heading whose level comes from the host |
| `Pager` | `_ui/Pager.tsx` | `text`, `onPrev`, `onNext`, `hasPrev`, `hasNext` | 44 high, two 28 buttons (44 on touch) | Under a table: "1 to 14 of 14" | An endless scroll with no count | Arrows flip |
| `Table` | `_ui/Table.tsx` | `cols` (label, width, mono, bold, align), `rows`, `rowHeight` 44, 52 or 60, `selected`, `onRow` | Header 36 on `--surface-subtle`; rows 44, 52 or 60; a card per row below 48 rem | The list of a table-plus-drawer screen; money aligns to the end | A row height off the three; a sideways-scrolling table on a phone with no edge fade; a Volt button in every row | Columns mirror. A real table with headers; a selected row sets `aria-selected` |
| `Two` | `_ui/Two.tsx` | `title`, `sub`, `mono` | 13/500 over 12 muted, gap 2 | A cell with a name and a second line | Three lines in a cell | Reading order is title, then sub |
| `KV` | `_ui/KV.tsx` | `k`, `v`, `mono`, `last` | 36 high, a hairline below | A key and its value in a drawer or a panel; the value is mono when it is data | Words in mono ("Included", "No fee") | Key at the start, value at the end |
| `Stat` | `_ui/Stat.tsx` | `label`, `value`, `delta`, `tone`, `spark`, `sub` | Padding 16/20, radius 8; the figure 28/32 | A single number on a page with no Band: a row of at most four | On a page that has a Band | The delta is mono, in `<bdi>` |
| `Band` | `_ui/Band.tsx` | `figures` (label, value, delta, tone, spark) | Four figures, radius 8, the corner cut by `--cut-band` | The one Carbon band of a dashboard-layout page | A second band; a band in a drawer, a dialog or a customer page | The cut mirrors; figures in `<bdi>` |
| `Section` | `_ui/Section.tsx` | `label`, `right`, `children` | A mono label row, then content, gap 12 | A labelled group inside a panel or a drawer | A heading that looks like a panel title | The label is a heading |
| `PageTitle` | `_ui/PageTitle.tsx` | `title`, `sub`, `right` | 24/30 and a 13 muted line | The title row of every page | An eyebrow; two Volt buttons in `right` | The one `h1` |

### Charts

| Component | File (planned) | Props | Sizes and states | Use | Never | RTL and a11y |
|---|---|---|---|---|---|---|
| `Spark` | `_ui/charts/Spark.tsx` | `values`, `width`, `height` | 160 by 28; a 1.5 px `--control-line` line; the last point `--text` (Volt on the band) | The trend inside a `Stat` or a `Band` | An axis; a second series | Time runs right to left in Arabic; a sentence for screen readers |
| `Area` | `_ui/charts/Area.tsx` | `values`, `compare`, `min`, `width`, `height` | A `--text` line with a 7% fill, three `--line` gridlines, the comparison in `--control-line`, the last point Volt with a `--text` ring | A trend with a comparison ("this week, last week") | Gradients; a Volt series | Same |
| `Bars` | `_ui/charts/Bars.tsx` | `values`, `highlight`, `width`, `height` | Gap 4; bars `--control-line`; the highlighted one `--text` (today's: Volt) | Counts per day or hour | More than one highlighted bar | Same |
| `Ring`, `Meter`, `Stack` | `_ui/charts/Ring.tsx`, `Meter.tsx`, `Stack.tsx` | `percent`, `parts` | Ring stroke 5; Meter 3 to 6 high on a `--surface-subtle` track; Stack parts 2 apart (text, strong, warn, bad) | A share, a limit or an age split, always with its number beside it | A chart with no number or no sentence | Same |

### Feedback and layers

| Component | File (planned) | Props | Sizes and states | Use | Never | RTL and a11y |
|---|---|---|---|---|---|---|
| `Banner` | `_ui/Banner.tsx` | `tone` warn, n, bad, ok; `text`; `action` | Padding 10/14, radius 6, a soft fill and a 6 px dot, 13/19 text in `--text` | One notice under the page title: a state of the page that needs attention | More than one per page; one above a `Band`; a Banner for a success (use a toast) | `role="status"`, or `role="alert"` for `bad`; the action is a link or a button |
| `Empty` | `_ui/Empty.tsx` | `title`, `sub`, `action` | Padding 40/24, centred, the sentence at most 380 wide | A filtered or searched list that has no rows | A first-run screen (use `DashedSlot`) | Centred, so nothing to mirror |
| `DashedSlot` | `_ui/DashedSlot.tsx` | `title`, `sub`, `action` | 1 px dashed `--line-strong`, radius 8 | A first-run object the product can make today: "Your first order shows here" | Something not built (D-039); a "coming" slot | Text in the copy file; the action is a button |
| `Timeline` | `_ui/Timeline.tsx` | `items` (text, meta, tone) | A 1 px `--line` rule at the start; a 9 px dot per item (Volt for just done, green, amber, red, grey); meta mono 11 | The history of one order, booking or payment | Navigation; more than a screen of items without "Show more" | The rule is on the start side; times in `<bdi>` |
| `Steps` | `_ui/Steps.tsx` | `steps`, `current` | 22 circles: done is Volt with a check, current is `--text` with the number, to come is a `--control-line` ring | A short ordered flow (setup, a checkout) | A numbered disc outside a flow | `aria-current="step"`; the connectors mirror |
| `Menu` | `_ui/Menu.tsx` | `items` (label, shortcut, tone), `width` | 220 wide, items 32 high (44 on touch), radius 4, `--shadow-float` | A row's or a button's actions | More than about eight items; a destructive item with no confirm | Opens toward the side with room; Escape closes; focus returns |
| `Drawer` | `_ui/Drawer.tsx` | `title`, `body`, `footer`, `width` | 440 wide at the inline end; header 52; body padding 20 gap 16; a footer with its Volt at the end | The quick work on one row of a list, with the list still there | Deep work (use a full page); a second drawer on top of one | Opens from the left in Arabic. Focus moves in, Escape closes, the URL names it. A full-screen page on a phone |
| `Dialog` | `_ui/Dialog.tsx` | `title`, `body`, `footer`, `width` | 520 wide, radius 10, header 56, `--shadow-float`, over `--scrim`; footer on `--surface-subtle` | A confirm, or one short form that must be answered now | Long work (use a drawer); a dialog from a dialog | Focus trapped and returned; `role="dialog"`, or `alertdialog` for a destructive confirm |
| `Toast` | `_ui/Toast.tsx` | `message`, `undo` | One at a time at the foot | The result of a change, with Undo when it can be undone | An error alone; a notice that must be read (use a `Banner`) | `role="status"`; Undo is a button |
| `Skeleton` | `_ui/Skeleton.tsx` | `rows`, `height` | `--surface-subtle` bars at the loaded row height | Loading a list or a panel | A spinner over a page | Hidden from screen readers; a live region says "Loading" |

### People, messages and marks

| Component | File (planned) | Props | Sizes and states | Use | Never | RTL and a11y |
|---|---|---|---|---|---|---|
| `Avatar` | `_ui/Avatar.tsx` | `initials`, `size`, `inverse` | 28 default; initials 600 at 11, 12 or 15; a `--text` fill for the signed-in person | A person in a list, a header, a thread | A photo of a customer; a ranking of avatars | The initials are not announced; the name is |
| `Thumb` | `_ui/Thumb.tsx` | `size`, `colour` (a `--shop-*`), `initials` | Radius 4, the shop colour with white 600 initials | An item's or a shop's mark | A shop colour on ALYR's chrome | Decorative |
| `Bubble` | `_ui/Bubble.tsx` | `text`, `mine`, `meta`, `automatic`, `note` | Padding 8/10, radius 8; sent `--wa-out`, received `--wa-in`; meta mono 11; an automatic reply says so in a caption; a staff note is a dashed warn box | Inside the Inbox's thread only | Anywhere else; a WhatsApp logo | Sent bubbles sit at the end side |
| `SampleMark` | `_ui/SampleMark.tsx` | none | Mono 11, 18 high, a `--strong` border, radius 2 | Once per screen on a sample business | On a real business; twice | `aria-hidden`; the first line says it in words |
| `Logo`, `Symbol` | the one shared mark file (`_site/brand.tsx` until the mark moves to the tokens) | `height` | `Logo` never under 140 px wide | The sidebar head, sign-in, a customer page's foot | Typing "ALYR" beside the symbol | Never mirrored |

### Shell

| Component | File (planned) | Props | Sizes and states | Use | Never | RTL and a11y |
|---|---|---|---|---|---|---|
| `Shell` (`Sidebar`, `TopBar`) | `_ui/Shell.tsx` | `nav` (groups, items, counts), `active`, `variant` workspace or ops, `sample`, `crumbs`, `right` | Sidebar 240; links 30 high; top bar 52; sub-links 28 with the cut sliver as the current marker | Every laptop screen | A nav item for a screen that is not built; a place switch; Volt in the chrome | On the right in Arabic. A skip link; `nav` landmarks; the host for dialogs and toasts is a context, not `document.querySelector(".sh")` |
| `PhoneShell` (`AppBar`, `TabBar`) | `_ui/PhoneShell.tsx` | `title`, `back`, `active` | App bar 52; a tab bar of five, labels 11, each 44 high at least | Below 48 rem | More than five tabs | The back arrow flips; the tab order mirrors |
| `Page` | `_ui/Page.tsx` | `layout` dashboard, workbench or table | Content padding 24 / 28 / 48; the column cap | The wrapper of every screen | A fourth layout | One `h1` |

### Choosing between them

**Tag, Status, Chip, Tabs, UTabs.**

| You want | Use |
|---|---|
| To show the state of one thing in a row or a header, with a fill | `Tag` |
| To show a live or current state as a dot and a word, in a header strip or a line of text | `Status` |
| To let the person switch a filter on or off | `Chip` |
| To switch between views of the same data on one page | `Tabs` |
| To switch between statuses of a list, or between sections of a detail page | `UTabs` |

**Drawer, Dialog or full page.**

| The task | Use |
|---|---|
| Look at or do quick work on one row, with the list still visible | `Drawer` |
| Answer one question now, or confirm something that ends or records | `Dialog` |
| Deep work: several sections, a long form, a thread | A full page with `UTabs` |
| On a phone | The drawer becomes a full-screen page; the dialog stays a dialog |

**Banner.** One per page, under the title, for a state of the page that needs attention (a line
down, a window closing, a missing setting). Not for a success, not for a tip, not above a
`Band`. Two notices are one notice in a list inside a panel.

**Empty or dashed slot.** The first time, with nothing made yet, for something the product can
do today: a `DashedSlot` that says what will appear and carries the one action. After that, a
list that a filter or a search has emptied: `Empty`, with "Clear filters". Never both.

**Toast or Banner.** A toast reports a result that has happened and can offer Undo; a Banner
states a condition that is still true.
