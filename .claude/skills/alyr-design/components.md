# Component catalogue

Paths are relative to `apps/web/app/` unless they start with `apps/`, `docs/` or `scripts/`.
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
| `Icon` | `_site/brand.tsx` (24 px grid, 1.7 px line, square ends, mitred corners) | Every interface icon | A second icon set. **Product today:** `Icon` in `app/[[...section]]/page.tsx`, `OpsIcon`, `Glyph`, start's `Ico`, the Agent's arrows: five sets, four strokes; converge on this one |
| Signal | `.signal` (`_site/site.css`), the logo's Volt plane | Before a product name in an eyebrow or the product bar | As decoration elsewhere |

## Actions

| Component | File | Use | Never |
|---|---|---|---|
| Volt button with the 45° notch | `.btn .btn-volt` (`site.css`), `ContactButton` (`_site/Contact.tsx`) | The one main action in view. The arrow sits under the notch and moves 1 px along the diagonal on press | Two in one view; Volt for a secondary action; a Volt button that cannot be pressed |
| Outlined twin | `.btn-line`, `ContactButton variant="line"` | A second way in further down a page; the header's button until the hero's has scrolled away | A filled grey button |
| Link with arrow | `.link` (`site.css`) | Going somewhere; the arrow flips in RTL | "Learn more", "Click here" |
| **Product today** | `.btn` (`globals.css`), `.sh .btn` (`_workspace/shell.css`), `.cx-btn` (`_customer/customer.css`), `.ob-btn` (`start/start.css`) | Four systems, no notch, radii to 999 px; `.sh .btn.primary` is Carbon while `globals .btn.primary` is Volt | Adding a fifth. Whether product buttons take the notch is the founder's call (audit 6.4) |

## States and honesty

| Component | File | Use | Never |
|---|---|---|---|
| Pending dot and status line | `.dot-pending`, `.status-line` (`site.css`), `ContactPending` | Something not available yet, said plainly | An error box, a disabled button, a "coming soon" badge on a feature an owner or customer would look for (D-039) |
| Solid rule; dashed rule; section rule with crosses | `.rule`, `.rule-dashed` (`_site/kit.css`) | Above every section; dashed for a slot waiting to become true | Dashed as decoration |
| "Sample" mark | `SampleMark` (`_site/Frames.tsx`), `.mark-sample` (`site.css`) | Every drawn product screen, once, in its own chrome: after the shop's name in a window's `.aw-bar`, at the end of a flow's tab row, in a panel's top when a demo tab has no phone; a drawn phone says `fig.business` ("Sample business") under the name instead. `aria-hidden`: the figure's first line (an `sr-only` `figcaption`, the sample's `fictional` or `fig.note`) says it for machines, and the drawing sits in a `data-nosnippet` box | A second mark on the same drawing; a page-level "everything here is fictional" line instead; a mark on a figure that has the sample switch. A frame of several drawings of one sample business (the homepage's products plate) is one figure set: one mark, in the frame's own chrome, and none on its tiles |
| Caption | `FigCaption` (`_site/Drawings.tsx`), `.cap` (`site.css`) | Only a drawing that needs words: "what it shows · Sample", no FIG number. First child of its figure, shown below with `fig-cap-end` | A caption beside a chrome mark; a caption that wraps to an orphan (it balances) |
| Contact states | `Contact.tsx`, `site.ts` (`CONTACT_STATE`) | WhatsApp when `NEXT_PUBLIC_ALYR_WHATSAPP` is set, else email, else pending; decided at build time | A hand-written mailto or wa.me link; "opens soon" more than once on a page |
| Offer switch | `site.ts` `OFFER_LIVE` | Prices, the hero price, money-back lines, the price question and the Price link | A price anywhere outside it, including meta and social cards (`factsNoOffer`, `descriptionNoOffer`) |
| Trust records | `site.ts` `TRUST_RECORDS` | CR number, payment provider, Meta status: render only when set | An empty slot for one of them |

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
| Footer | `Shell.tsx` | Sign-off, products in order, the disclaimer, "Built in Qatar." with the Doha time |

## Drawings of the product (site)

| Component | File | Use | Watch |
|---|---|---|---|
| Drawn WhatsApp chat | `.wa-*` (`site.css`), `ReportPhone.tsx` | WhatsApp's own chat colours, light and dark, no WhatsApp logo | Read ticks only on messages the drawn person sends; the sent-time grey adjusted for 4.5:1 |
| Phone frame | `Phone` (`Frames.tsx`), `.d-phone` (`drawings.css`) | Customer pages on the site, 45° cut | Content inside never shrinks (`flex-shrink: 0`); it crops like a real phone |
| Customer page chrome | `CxTop`, `CxFoot` (`Frames.tsx`) | Drawn customer pages | A hand copy of `(product)/_customer/Frame.tsx`: when the product changes, change the drawing |
| Workspace window | `.aw-*` (`drawings.css`) | Workspace screens on the site, with the shop monogram (Volt corner) | |
| Drawn workspace screens | `Sheets.tsx`, `Drawings.tsx`, `PageDrawings.tsx` | Product pages, in the product's exact words | Hand copies of `(product)/_workspace/Screens.tsx`: they drift. Prefer a captured sample, as the Agent does |
| Numbered marks and callouts | `.co-n` (`kit.css`), `drawings.css` | Carbon discs with white mono numbers (a Volt ring in dark) | Volt discs: a number is not an action |
| Agent feed and sample switch | `AgentFigure.tsx`, `agentfig.css`, `live.ts`, `ReportSwitch.tsx` | Homepage hero, spotlight, `/agent` | Only events the product performs and logs. A flag shows its title and the dashboard's own line, no rule line under it (founder, 25 Oct 2026). With a feed it is the live sample (D-058, motion.md's one exception): each sample's `live` script in `copy.ts` moves the dashboard through `live.ts`, never by numbers typed into the copy; keep the pause button, the stops and the settled HTML |
| Products frame | `SuiteFrame.tsx`, `suite.css` | The homepage's "One shop, six products": one plate, a tile per product, each one link with a fragment of its real screen. Every tile rests finished; hover, focus or in view replays its moment from the start, once | A second Sample mark; a fade instead of the hard crop; a tile resting on an earlier state; a moment that loops or plays again; a rule line on the Agent tile |

## Shared with the product

| Component | File | Use | Watch |
|---|---|---|---|
| ALYR Agent dashboard | `_agent/AgentDashboard.tsx`, `_agent/agent.css`, `_agent/labels.ts`, `_agent/types.ts`, samples in `_agent/samples/` | The workspace home (`/app`), `/agent-sample`, and the site in `mode="showcase"` with `headingLevel`, `headings={false}`, `ruleLines={false}` and the site's `labels.suggestions` | Themed by `--ag-*`; resets in `:where()`. On the site it is untouched: no `ag-` class elsewhere, page rules stop at `.ag`. **Rule lines:** the product keeps them (`ruleLines` defaults to true); the public site hides them, and every site drawing of a suggestion (the feed, `/agent`'s opened card, the products frame, the report drawn on a phone) leaves the rule line out (founder, 25 Oct 2026). Samples are captured from the engine (`python -m alyr.agent_samples`), never edited by hand |
| Report card | `apps/api/src/alyr/modules/agent/card.py`; site images in `_site/report/` (`scripts/site-report-images.mjs`) | WhatsApp, the site, Meta's template sample | `alyr-generated-image` |
| Social card | `_site/socialCard.tsx`, `opengraph-image.tsx` per English page | Link previews | English only until Arabic is drawn with resvg |
| Words helpers | `_site/Text.tsx` (`lines`, `rich`), `.money`, `.ref`, `.pname`; the Agent's `Rich` | Keep amounts, order numbers and product names whole and in `<bdi>` | |

## Product screens today (to converge)

| Pattern | Where | Note |
|---|---|---|
| Workspace shell | `.sh-side`, `.sh-top`, `.sh-tabbar`, `.sh-palette` (`(product)/app/[[...section]]/page.tsx`, `_workspace/shell.css`); `/ops` reuses it (`ops/Shell.tsx`, `ops/ops.css` overriding by import order) | Sidebar on a laptop, tab bar on a phone |
| Tables, pills, inbox, forms | `globals.css` classes restyled under `.sh-main`; `_workspace/Screens.tsx`, `Team.tsx` | Inputs styled in seven places |
| Customer pages | `(product)/_customer/Frame.tsx`, `customer.css` (`.cx`) | `/s`, `/b`, `/pay`, `/t` |
| Setup checklist | `.sh-setup` (shell), `.ob-checks` (start), `.cx-track` (tracking) | Three step-list designs; pick one when you touch them |
| Charts | Agent week bars with a ghost for last week, hour tints, age bar (`agent.css`); `.agebar` (globals); `.tm-bar`, `.tm-meter` (Team) | Converge on the Agent's vocabulary |
| Duplicated helpers | `initials()` ×4, `qar` ×3, `Linked` ×2, switch ×2, chat bubble ×3, composer ×3, avatar ×4, empty state ×5 | Reuse one when you touch a screen; do not add another |
