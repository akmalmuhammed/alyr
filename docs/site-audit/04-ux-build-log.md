# 04 · Build log: the site audit's UX and agent-experience fixes

ALY-223. Builder: the Site and brand lane, worktree `D:\alyr-ux`, branch `aly-site-audit-fixes`,
cut from `aly-210-tech-team-homepage` at c22a5e0 (what is live, PR #105). Dev server port 3115;
static servers 3116 (the baseline `out-site`) and 3117 (this branch); Edge profile
`C:\t\uxfixprof`. Probes and the measuring scripts live outside the repo in `C:\t\uxfix`.

Order of authority: `CLAUDE.md`'s hard rules, `00-decisions.md` (the founder, 24 Oct), then
`01-ux.md` and `03-ax.md`, then the skills.

## Baseline (c22a5e0, built here with `build-site.sh`, served compressed)

Page heights in px, light, after a full scroll (the audit's probe). They match the live
measurements in `01-ux.md`.

| Page | en 1440 | en 390 | ar 1440 | ar 390 |
|---|---|---|---|---|
| `/` | 17,716 | 21,380 | 17,467 | 20,429 |
| `/chat` | 8,729 | 10,999 | 8,819 | 10,933 |
| `/bookings` | 8,738 | 11,718 | 9,036 | 11,648 |
| `/agent` | 10,308 | 13,940 | 10,454 | 14,148 |
| `/accounts` | 8,840 | 11,351 | 8,962 | 11,352 |
| `/shelf` | 10,462 | 14,004 | 10,546 | 13,766 |
| `/docs` | 10,709 | 15,024 | 10,688 | 14,552 |

Small-text items by the audit's probe (`C:\t\uxaudit\probe.js`: blocks under 15.5 px or in
mono, outside drawings, captions counted, screen-reader-only text left out), en 1440, each page
with its shared header, menus and footer: `/` 191, `/chat` 129, `/bookings` 112, `/agent` 90,
`/accounts` 118, `/shelf` 127, `/docs` 114, total 881. The audit's inventory counts the same
pages by hand, with the shared items once: 553. Both are given again after the build.

## Stages

### Stage 1 · "Sample" marks in the chrome, machines told first (founder decision 3; `01-ux.md` §0; `03-ax.md` A1)

Done:
- `SampleMark` (`Frames.tsx`, `.mark-sample` in `site.css`): a small outlined mono tag, "Sample" /
  «مثال», from the tokens (`--fs-micro`, `--tracking-label`, `--line-strong`, `--radius-sm`; on
  Carbon `--band-rule` and `--on-band-quiet`). Arabic in Plex Sans Arabic, no capitals, no
  tracking. `aria-hidden`: machines get the figure's first line instead.
- Where each mark went: the homepage hero window's bar (the spotlight and `/agent` keep the
  switch's "Sample business"); every drawn workspace window (`Sheets.tsx` `Frame`, both Bookings
  windows, Credit, Stock and its log, Documents); the Shelf and Docs signature figures' window
  bar; `/agent`'s opened card, which gained the workspace window's bar to carry it; the flow
  figure's tab row, after Pause; a demo tab with no phone, in its panel's top; the ALYR side of
  the homepage's fold split. Drawn phones say "Sample business" / «نشاط توضيحي» under the name
  (`businessMeta` in every demo, the report's `meta`, the X-ray phone).
- Gone: 14 FIG captions, every "Sample conversation with a fictional …" note (demos and
  flows, 9 per language), the spotlight's under line, the second captions under the Bookings
  and Shelf windows, the tab numbers in the demos and flows. Kept, without a number, ending
  "· Sample": the trust pair, the agreement (offer on) and the Docs no-CR foot. `Caption` is now
  `{ text }`; `fig` is `{ sample, business, note }`.
- Machines (A1): each sample figure's first child is an `sr-only` `figcaption` (or `p`): "Sample
  screen of a fictional bakery. The names and numbers are made up; they are not ALYR's results."
  (per sample, `agent.samples.*.fictional`; `fig.note` for Dana Home Services on `/chat`). The
  three kept captions are now the figure's first child, shown below by `.fig-cap-end`. Every
  drawing sits in a `data-nosnippet` box (on a `div`, where Google reads it). The Agent dashboard
  takes `headings={false}` on the site: its titles render as `p`, so no sample number is in the
  page's outline (`_agent/AgentDashboard.tsx`, a small change in the Product lane's file; the
  workspace keeps its headings).
- Skills: `alyr-design` principle 5, §4 and §9; `honesty.md` §4 (the mark, and "machines read
  it first"); `components.md` (the mark and the caption rows); `alyr-site-page` (description,
  Do, Done when); `alyr-design-review` (the review standard); `alyr-product-screen/agent-dashboard.md`
  and `alyr-deck-and-social` (two lines each that still asked for FIG captions).

Decisions while building: one mark per crop was rejected for the homepage products until stage 5
decides the rows (see there). The Docs signature figure's phone keeps "Business account": the
figure is marked once, in its window bar.

### Stage 2 · "Book a check-up" on every page (founder decision 2; `01-ux.md` A1)

Done: `Shell` takes the action from `home.final` (`action` "Book a check-up" / «احجز فحصاً
لنشاطك» as the homepage already had it, `short` "Check-up" below 62rem) unless a page names its
own, so the header button, the closing call's button and the phone's sticky bar say it on the
homepage and all six product pages, in both languages. It is the same `contactLink` (the mail
link in the email state). The price section's button (offer on) says it too. `nav.cta` (the
old "Email us" / "Message us" / "Talk to us" header names) is gone; `contact.email` still names
a contact button that is given no label (none on these pages now).

Not added: a hero button or a sticky bar on the product pages. Their openings have no button
today and the founder's list names the places the homepage has; adding them would push the demo
out of the phone's first screen (`01-ux.md` F1) and add a sticky layer (P1-a). For the founder,
if he meant a new button there too.
