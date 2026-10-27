# The ALYR homepage, read as a Framer studio would

24 Oct 2026. Proposal round only: no code changed, nothing published. Evidence labels:
**[seen]** captured or measured by me, **[read]** in official docs, **[2nd]** secondhand.
Captures: `research/` (references), `research/framer-com/` (framer.com), `audit/` (live
alyr.qa, EN/AR, 1440/390, light/dark, full pages and each section).

## 1. Verdict

1. World-class today: the hero's type (Instrument Sans settling its width axis as the lines rise), the real Agent dashboard on a cut Carbon plate, and the By-business fold, which is a real idea, not a decoration.
2. Rare discipline: 206 KB of JavaScript in 10 files, no images, complete without scripts (framer.com: 138 scripts) [seen].
3. What holds it back is rhythm. Six sections open the same way (cross rule, two-line H2, grey lead, an empty right half), and the same dashboard sentence appears twice ("Week so far: 50 orders…", hero and Agent).
4. The suite, the thing that makes ALYR a tech team rather than "a WhatsApp tool", is shown as six thin rows with stamp-sized crops: the weakest frame on the page.
5. Small rule breaks have crept in: a glowing, looping Volt pulse, drawn Volt buttons, Volt number discs, and two Volt buttons on screen at the closing call.

## 2. Proposals, ranked by impact

Effort: S (a day or less), M (2 to 4 days), L (a week or more). "Framer first" means a motion study in Framer before code.

**P1. Replace the products rows with "One shop, six products", a single frame (§3).**
Why: the founder's most-loved pattern on framer.com, and the clearest way to say "suite". Reference: framer.com "Not just vibes, a full platform" [seen]. Brand: real fragments, 45° cuts, one Sample mark. It bends the 24 Oct "products as six plain rows" (founder decision needed; nothing is pinned, so that rule holds). Effort: L. Performance: CSS only, no new JS. **Framer first: yes, the top candidate.**

**P2. Show the dashboard once.** The hero keeps the dashboard and feed. The Agent section (2,316 px, the page's tallest) drops its second copy of the opening sentence and opens on the parts the hero cannot show: "Needs you now" and the suggestions with their reasons, numbered, with "See the whole screen". Saves about 900 px; framer.com shows each tool once [seen]. Effort: M. Code.

**P3. Vary section openings.** Use three header types, not one:
- full-width H2;
- split, with the H2 at the start and its link on the end column at the H2's baseline (framer.com "Shipped with Framer · See Framer sites" [seen]);
- headline inside the figure's plate.

Cut heading-to-content from about 450 to 280 px at 1440, so content lands in each section's first screen. Effort: M. Code.

**P4. Fix the rule breaks (S each, code, no performance cost):**
- `.fx-pulse` in "One order" is a radial-gradient glow with a literal `rgb(183 243 74 / .45)`, looping every 1.2 s. Replace it with a solid 45° tick that travels once per step.
- The drawn "Pay QAR 38" in the Chat crop is Volt. A drawn button that cannot be pressed is an outline.
- How we work's discs 1 to 3 are Volt; a number disc is never Volt. Use Carbon discs and let the rail carry the Volt progress.
- At the closing call, the header's Volt button and the call's Volt button are both on screen at 1440 [seen]. Make the header the outlined twin while `.cta` is in view, as the sticky bar already does.
- Copy: "ALYR Agent reads the orders…" uses a banned verb. Use "counts" / «يحسب» (Arabic to ALY-66).

**P5. "One order, start to finish" opens empty.** Its first frame is a blank phone, an empty ALYR panel and "Nothing new yet" [seen]. Start on step 1's end state and play forward once 60% of it is in view. Why: a figure judged on its first frame. Brand: plays once, done before 3 s. Effort: S. Code.

**P6. The Volt button, with physics inside the rules.**
- Lean 2 to 3 px toward a fine pointer (allowed).
- On press, the notch closes 2 px through `clip-path` with `--spring`: "the fold closes".
- Focus draws the ring along 45°.

Reference: magnetic buttons, a common award-site pattern; I did not test one on a named site. Brand: no custom cursor, 1 to 3 px. Effort: S. Performance: about 1 KB. Framer first.

**P7. Variable-font settle on section headings.** Every H2 rises by line from a mask while `font-stretch` goes from 88% to 100%, once, as the hero already does. Arabic rises by line only: Plex Sans Arabic has no width axis, and Arabic is never split. Reference: Framer's Kinetic Type plugin, Best Plugin 2025 [read]. Effort: S. Performance: GSAP SplitText is already loaded. Code.

**P8. By business, tightened.**
- At 1440, the seven tab cards (110 px tall) push the fold to y≈515. Make them a 56 px strip of icon and label, so "Today | With ALYR" sits in the first screen.
- On phones the fold rests on "With ALYR", so the visitor never sees "Today". Rest at 50% and sweep once to "With ALYR" when it is read.
- The sticky bar covers the Today and With ALYR controls at 390 [seen]. Hide the bar while the slider is on screen.

Effort: M. Performance: none. Framer first, for the sweep timing.

**P9. Product-to-page transition.** A `view-transition-name` per product lets P1's fragment grow into that page's opening demo; View Transitions already hold the header. Why: continuity sells "one workspace". Brand: along 45°; reduced motion just changes page. Effort: M. Performance: no JS. Framer first.

**P10. The closing call's fold assembles** (S3, §4). Effort: S. Code.

**P11. Phone length.** 16,673 px at 390 (about 20 screens). P1's tiles, two-line Trust rows and P2 bring it under 13,000 px. Effort: M. Code.

**P12. Sticky stack for How we work.** This bends a founder rule (§5). It works like framer.com's Agents section: three cards scroll past a sticky panel (`top: 120px`, 640 px tall) whose content changes with the card [seen]. ALYR's version: the four steps scroll past a pinned "check-up sheet" that fills, from the list, to set up, to the screen, to the monthly review. Effort: M. **Framer first, to decide.**

Not proposed: marquee, shaders, 3D. The award sites earn attention with photography or 3D (turionspace.com, huyml.co [seen]); ALYR's equivalent is the true product at true size.

## 3. What ALYR takes from framer.com

**Structure and type [seen].** Dark only; GT Walsheim Medium headlines (54/44 px, −4% tracking), Inter Variable body; hero with a product video, Agents, bento, Shipped with Framer, Stories, Community, final call; split headers with the action at the end.
Take the split header, one idea per section, the product as the only illustration; leave dark-only, pills, logos and the cookie pop-up.

**Motion [seen].** Arrivals play on entry: Core Web Vitals bars fill, CMS rows load one by one (frames at 0.3 s, 1.2 s and 3.5 s), and the live-visitors count moves from 400 to 413. Hovering a tile only dims its label.
Content is hidden until script (a headless full page shows empty tiles); ALYR's "nothing hidden in the HTML" is better, keep it. Take the small once-only arrivals; leave the loops (`ghostFlow`, 750 ms, infinite).

**How it shows the product [seen].** Real interface fragments with real-looking data, cropped off the tile's edge and faded with `mask-image`. Take the cropping; replace the fade with a hard crop and a 45° cut, because ALYR has no gradients.

**The section the founder named: "Not just vibes, a full platform".** One frame of nine tiles on a 3 × 400 px grid, 1,200 px wide, with rows of 480 and 240 px:

| Row | Tiles |
|---|---|
| 1 | Performance (1×1); CMS (2 wide) |
| 2 | SEO (1 × 2 tall); Collaboration over Localization; Hosting over Security |
| 3 | Analytics (2 wide); A/B Testing |

Each tile: one live-looking fragment and "Name →" 25 px from the bottom corner (only the label links), hairline dividers, one rounded frame. It reads as a map: fragments first, then names. At 390 the tiles stack (`bento-390-*.png`).

### ALYR's version: "One shop, six products"

**Frame.** A Carbon plate (`--band` in both themes, a `--band-edge` hairline in dark) with the 45° cut at the top inline-start corner, in place of the rows. Its chrome is a workspace bar: "QB Qirfa Bakery · SAMPLE / Thursday · 16:20". That is the one Sample mark for the six fragments, since they are one figure set; the skill needs one sentence saying so. Its first line is screen-reader text for machines; the fragments are `inert` inside `data-nosnippet`.

**Grid at 1440 (12 columns, `--wide`), mirrored by logical grid in Arabic:**

| Row | Tiles |
|---|---|
| 1 (440 px) | Chat (8 columns); Bookings (4 columns) |
| 2 (480 px) | Shelf over Docs (4 columns, 240 px each); Agent (4 columns, centred); Accounts (4 columns) |

Hairline seams are `--dark-line`; where a seam crosses the plate's diagonal it breaks with `--cut-fold-gap`.

**Tiles.** Each fragment is drawn from the real screen in the product's words, light paper on Carbon, with numbers from `_agent/samples/` and `home.suite.crops`, never typed:

| Tile | Fragment | Label (name · descriptor) |
|---|---|---|
| ALYR Chat | The team inbox with Sara M.'s "order" and the order page sent back: "3 items · QAR 38", Pay drawn as an outline | WhatsApp orders and team inbox |
| ALYR Bookings | The slot grid 4:00 to 6:30 pm, 4:30 pm chosen (Volt: the current state) | Appointments and reminders |
| ALYR Agent · With every product | "Needs you now · 2 customers waiting for an answer · longest 48 min", then the "Why ·" rule line | Your business in numbers |
| ALYR Accounts | "Owed to you", the age bar, "Send reminders" as an outline | Credit accounts |
| ALYR Shelf · With every product | "Pistachio kunafa cheesecake · QAR 185 · Only 1 left today"; "Saffron milk cake, slice · Sold out" | Items and stock |
| ALYR Docs | The top of receipt RC-0042, Arabic first | Receipts and invoices; no state and nothing about availability (Docs is off for every shop) |

Under the plate, the existing note in full: "Payment links… open a test page; card payments start once a payment provider is connected." Arabic: names stay Latin in `<bdi>`, descriptors from `products.items`, «مثال», «38 ر.ق», Western digits.

**Interaction.** The whole tile is one link (a 44 px target and up), named "ALYR Chat, WhatsApp orders and team inbox".
- With a fine pointer, the fragment moves 2 px along 45°, the arrow 1 px, and the seam becomes `--line-strong`.
- Focus draws the ring.
- On a tap, P9's transition carries the fragment into the product page.

**Motion.** It plays once when 60% of it is on screen, through SiteMotion's `data-sig`. Delays are steps of `--stagger`, it uses `--ease`, it ends by 2.4 s, and the HTML is the end state:

| Time | What happens |
|---|---|
| 0 | The plate arrives 12 px along 45°; the seams draw (`clip-path`) from the top inline-end corner to the bottom inline-start |
| 0.3 s | Chat: the order page appears under "order" |
| 0.7 s | Shelf: "Only 2 left" becomes "Only 1 left today" |
| 1.0 s | Docs: RC-0042 slides out of the fold |
| 1.3 s | Bookings: 4:30 pm takes Volt |
| 1.6 s | Accounts: the age bar fills |
| 2.0 s | Agent: "Done for you" gains 1, with one Volt tick, the frame's single signal |

Draw a link between tiles only where it is built, verified in code first [G]: order → stock, payment → receipt, all → Agent's count. Reduced motion shows the end state.

**Phone (390).** One column in suite order, tiles 240 to 320 px tall, each playing its own beat as it arrives. The Sample bar stays at the top. About 1,700 px, against today's rows.

**Budget.** No new JS beyond the existing IntersectionObserver; under 8 KB of CSS, gzipped; no images; only transform, opacity and clip-path; CLS 0. Lighthouse mobile at 90 or above, unchanged.

## 4. Three signature moments

**S1. The plate unfolds (hero, 1.4 s).**
1. The H1 lines rise and settle in width (as today).
2. At 240 ms the Carbon plate's cut corner draws along 45°.
3. The window arrives along the same diagonal; today it rises straight up, which is off-gesture.
4. The feed's top item, "Needs a look", lands, and its "Why ·" line draws.
5. One Volt tick.

**S2. One shop, six products (P1, §3).**

**S3. The fold closes (closing call, 1.2 s).**
1. Two white planes arrive from the inline-end along 45°.
2. They settle and leave the gap.
3. The Volt plane arrives last.
4. "Book a check-up" is the only Volt on screen.

Plays once. In Arabic, `--dir` mirrors the travel.

## 5. Rules: where I would argue

1. **"Nothing on the homepage is pinned"** (24 Oct) rules out P12, and sticky storytelling is framer.com's strongest device. I would ask for one exception, desktop only, at most 1.5 screens of scroll, static with reduced motion and on phones, decided from a Framer prototype. Founder's call.
2. **The Sample mark, "once per drawing"**, needs a sentence for a frame of six drawings of one shop: one mark in the frame's chrome. This is a fix to the skill in the build PR, not a bend.
3. **I would keep:** no custom cursors, no parallax, no WebGL, no fades and no gradients (the hard crop is more ALYR than Framer's fade), and no marquee. 3D would read as the stock "3D phones" the brand rejects.

## 6. Framer's role

**Recommendation: a prototyping and motion-study canvas only. Not campaign pages for now, and never the site's host.**

- **Bilingual RTL [read].** Framer has a site-wide "Reverse layout" that flips stacks and grids, and a "Layout direction" variable that most properties accept (padding, rotate). Its docs say nothing about per-locale fonts, `clip-path` mirroring or punctuation. A community thread on per-language font size ends with "custom CSS" [2nd].
  Arabic's own font, line heights and mirrored cuts become hand work per property, and "Auto Translate" is machine translation, against "Arabic is written, not translated".
- **Honesty.** banned-words CI, the EN/AR copy parity check, the claims pass and the offer switch all run on `copy.ts` in git. Framer edits bypass every one, with no pull request trail.
- **Tokens and the Agent.** `tokens.json` does not flow into Framer's styles without a sync, which I have not checked. The real `AgentDashboard` would be a second copy as a code component: the drift `components.md` warns about.
- **Hosting and cost [read].** Pro $30 a month, plus $20 per locale a month; keeping alyr.qa on Cloudflare needs a reverse proxy: Pro with Advanced hosting (listed at $200) or Enterprise.
- **Speed and machines [seen].** framer.com hides content until script runs. That costs the static, no-script, crawler-readable page ALYR has today.
- **Maintenance.** Agents work on code through pull requests; a canvas needs a person.

**Use it for:** motion timing, feel and layout studies with the founder in the loop, then rebuild in code from tokens. "New: Framer MCP" is advertised on framer.com's hero [seen]; I have not checked what it can do.

## 7. Prototype first in Framer (once the MCP is connected)

1. "One shop, six products" (P1), at 1440 and 390, EN and AR, with the 2.4 s timeline. **Top candidate.**
2. The By-business fold sweep on phones (P8).
3. The Volt button's press and lean (P6).
4. The product-to-page transition (P9).
5. The How-we-work sticky stack, only to settle the pinning question (P12).

## Not checked

Real Safari or iPhone; hover physics on reference sites other than framer.com's bento; panton.vitra.com (bot check, not bypassed) and i-D's site (capture failed); Framer's per-locale fonts and the MCP's abilities; Lighthouse on alyr.qa today; the order → stock and payment → receipt links in code. No Linear issue was given, so none was updated.
