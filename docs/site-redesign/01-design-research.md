# ALYR homepage: design research

16 Oct 2026. Input for the creative director's build brief, next to `02-messaging.md` (copy, decided) and `03-product-truth.md` (what may be shown). This page is about how the page looks and moves.

**Sources.** **Seen**: rendered in the built-in browser on 16 Oct 2026 (Linear, Stripe, Ramp, Mercury, Lama Lama, Why Zero, Tamara Arabic, Careem Arabic; Linear's hero and most of Stripe's sections did not paint). **Read**: page text through a fetcher, so layout comes from structure, not pixels (Attio, Granola, Mercury, Tabby Qatar, Foodics Arabic, Awwwards' Sites of the Month). **Reported**: earlier knowledge, not checked today.

**Geometry used throughout.** In `brand.tsx` the Command Fold is 190 × 160 units: three planes, a 10-unit gap, and the cut between the two lower planes at **45°**, top inline-end to bottom inline-start. "Along the diagonal" means 45°, mirrored in Arabic.

---

## 1. Patterns

### P1. Hero: the copy beside a working product
- **Seen at.** Ramp (seen): headline, an email field and a lime button at the start, an HTML-drawn invoice below. Attio (read): a transcript panel beside an agent chat, in HTML. Granola (read): one note as "My notes" and "Enhanced".
- **Looks.** Headline and one action at the start; a product surface at true scale at the end, cropped by the grid so it reads as part of something running. No people, no illustration.
- **Why.** The visited owner has seen ALYR on their own phone. Recognising the same screen says "real, and the same company" without customers.
- **Build.** Columns 1–6 and 7–12, top-aligned. HTML and CSS on the product's tokens copied into `site.css` (03 §4.4); words in `copy.ts`, so `/ar` gets an Arabic screen; logical placement mirrors it. Reduced motion: the end state.
- **ALYR's own.** A phone with the real order page ("What would you like?", steppers, "3 items · QAR …"); behind it, offset along the diagonal, "Order 1043 · New · Looked after by Yusuf". Once: title sweep 0–480 ms; body and button rise 8 px at 300 ms; phone at 600 ms; record slides in along 45° at 900 ms; Volt dot on "New" at 1,350 ms. Let the drawn steppers work (a little React updating the total): Why Zero (Site of the Month, Sep 2026, seen) asks you to draw a zero; ALYR lets you build a small order.

### P2. Phone first screen: headline, button, price, then a peek
- **Seen at.** Mercury (seen, narrow pane): headline, email field and button, product below. Foodics Arabic (read): a floating WhatsApp button and phone number.
- **Looks.** At 390 × 844: eyebrow, a two-line headline near 44 px, three lines of body, a full-width button, the reply line, the facts as three ruled lines, and the top 140 px of the phone frame above the fold.
- **Why.** Most visits are on a phone, standing up, often shown to a partner.
- **Build.** No `100vh` hero; content sets the height. Keep a compact *Message us* in the phone header (today it hides below 30 rem). Body 17 px at 1.5.
- **ALYR's own.** The phone frame is clipped at 45° where it meets the fold, so the first screen ends on the brand angle.

### P3. Real screens in HTML, captioned like engineering figures
- **Seen at.** Linear captions its drawings "FIG 0.2", "FIG 0.3" in small mono (seen). Lama Lama (Site of the Month, Jul 2026, seen) brackets its mono labels: "[ FEATURED WORK ]". Ramp draws documents in HTML on a grey panel (seen).
- **Looks.** A mono line, 11–12 px, at a figure's corner, on a hairline ending in a tick.
- **Why.** Every ALYR screen must say "sample, fictional". As a footnote that reads as an apology; as a caption it reads as precision.
- **Build.** `<figcaption class="fig">FIG 01 · ORDER PAGE · SAMPLE, FICTIONAL CAFE</figcaption>`. Arabic: no uppercase or tracking, `--arabic` at 500, the number in `<bdi>`.
- **ALYR's own.** One fictional cafe on every figure (today the site uses three businesses), named in `copy.ts` and checked not to be a real Doha business.

### P4. The chat becomes a record
- **Seen at.** Granola's raw-to-enhanced note; Attio's chat command producing records (both read).
- **Why.** The owner's pain is "orders on paper". A chat line becoming a row with a status and a name is the offer in a glance.
- **Build.** Two layers in one grid cell; reveal the record with a `clip-path: polygon()` whose leading edge is a 45° line, 480 ms on `--ease`. Mirror the polygon under `[dir="rtl"]` (clip-path does not flip). Reduced motion: both states, joined by a 45° hairline and a flipping arrow (`.ico-flip`).
- **ALYR's own.** Only real sequences (03 §2.2): *Place an order* → "Here is our order page. Pick what you need: …" → "Order #1043 received." → the workspace row. Never one free-text message becoming several records (C1).

### P5. A stepped story with a sticky figure
- **Seen at.** Attio's five numbered tabs, each with its own screen (read); Linear's intake → plan → build → ship sections, each with a drawn screen (read, partly seen).
- **Looks.** Desktop: text scrolls; the figure stays and changes as each step crosses mid-screen. Phone: each step has its own small figure.
- **Why.** Owners follow processes in order. Four or five stops; more is a tour.
- **Build.** `position: sticky`; no scroll-jacking. One `IntersectionObserver` (`rootMargin: "-45% 0px -45% 0px"`) sets `data-step`; CSS swaps states with opacity and a 6 px rise, 280 ms. The progress rule may use `animation-timeline: view()` inside `@supports` (Chromium; Safari 26 reported). No-JS and reduced motion: each step shows its own static figure.
- **ALYR's own.** The progress rule is the tracking page's track (Order received → Confirmed by the shop → Ready for collection → Complete), filling in Volt: "confirmed progress", a use the brand allows.

### P6. The two-tone statement
- **Seen at.** Linear: "A new species of product tool." in white, the rest grey, around 48 px (seen). Stripe's hero and Ramp's "Join 85,000…" do it in dark and grey (seen).
- **Why.** The problem section's closing line is the turn of the page; two tones land it without another heading.
- **Build.** `<p class="statement"><strong>…</strong> …</p>`, `text-wrap: balance`, about 22 ch a line. It replaces word-by-word lighting; `SiteMotion` lights only the first `[data-statement]`, so use none or one.
- **ALYR's own.** The muted half resolves along the diagonal 120 ms after the strong half.

### P7. A visible grid; rules before cards
- **Seen at.** Linear's hairline sections and figure frames (seen); Ramp's dot grid (seen); Vercel's grid with crosses at intersections (reported). The current ALYR hero already has faint lines and ticks.
- **Why.** "Precision industrial minimalism" needs one device to do the work of decoration.
- **Build.** The grid shows only as section rules, rules between items and a cross where rules meet; content sits on it, not in boxes. A 12-column `.wrap` grid; rules are `border-block-start`; ticks are 9 px SVG crosses placed with `inset-inline-start`.
- **ALYR's own.** **Solid rule = true today; dashed rule = a slot waiting to become true** (payment provider, CR number, the next products). Honesty becomes a visual language.

### P8. Live details, only true ones
- **Seen at.** Ramp's mono eyebrow with a ticking payments counter and an "Agents at work today" ticker (seen); Stripe's "Global GDP running on Stripe" counter (seen).
- **Why.** Live figures signal a running system, but only when real. ALYR has none and must not imitate them.
- **ALYR's own.** The true live thing is time: "Doha 16:20" in the drawn workspace top bar (a real product detail) and in the footer, via `Intl.DateTimeFormat` with `timeZone: "Asia/Qatar"`, filled in after hydration so the static HTML stays valid.

### P9. Price as a spec sheet
- **Seen at.** Mercury states "$0/month" and fees in its sections with numbered footnotes per claim (read). Linear and Raycast pricing pages: big price, plain ruled inclusions (reported).
- **Looks.** One very large number, currency and period in small mono; under it a ledger: label at the start, value at the end, rules between.
- **Why.** No competitor in 02 §1 shows a QAR price. Seeing the "449" heard at the counter, fees spelled out, proves page and person agree.
- **Build.** A `<dl>` grid (`1fr auto`); `font-variant-numeric: tabular-nums` (check Instrument Sans has `tnum`, else Plex Mono for figures). Each amount in `<bdi>` with `white-space: nowrap`, so "449 ر.ق" never breaks.
- **ALYR's own.** "No commission" stays Carbon; the section's one Volt mark goes to the money-back promise.

### P10. The pilot drawn as the agreement
- **Seen at.** No benchmark homepage does this. Craft reference: Ramp's HTML invoice (seen), a document rather than a card.
- **Looks.** A page from the agreement: a ruled form, a blank where the agreed result goes, "30 days from go-live", a folded corner.
- **Why.** It turns "no customers yet" into "we carry the risk", and shows the mechanism instead of a badge.
- **Build.** `clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 100%)`, mirrored in RTL; a dashed `border-block-end` for the blank. Small print only once the terms are in the agreement [F].
- **ALYR's own.** The corner is the 45° fold. On entry the blank draws once (480 ms), then a Volt tick lands by "your money back".

### P11. Trust before customers: a person, checkable facts, open disclosures
- **Seen at.** Mercury pins "Mercury is a fintech company, not an FDIC-insured bank" in a bar at the foot of its hero (seen). Tabby Qatar and Foodics Arabic name their central-bank licences (read). Granola signs off "Made with ♥ in Shoreditch" (read).
- **Looks.** Plain statements, each checkable; one face; disclosures readable, not grey 10 px.
- **Why.** In Doha, buying from a person is normal; from an unknown website, not. A face and a name beat a logo wall ALYR cannot have.
- **Build.** A real photo imported from code, plain `<img>` with dimensions and `loading="lazy"`, WebP under 120 KB. Facts as a 3 × 2 ruled grid with mono labels. Designed now, hidden until true: a dashed row of slots in the 02 §3.7 order (CR number, first named business, Meta Tech Provider, payment provider).
- **ALYR's own.** Beside the founder, the same customer page in English and Arabic, mirrored: "both first" in one glance.

### P12. A WhatsApp-first action that does not pretend to be WhatsApp
- **Seen at.** Foodics' floating WhatsApp button (read); competitors' WhatsApp-green buttons (02 §1).
- **Looks.** One Volt button, always "Message us on WhatsApp", a drawn chat glyph, no WhatsApp logo; under it the prefilled message as a draft bubble. On phones a fixed bottom bar with the same button, shown once the hero button leaves the screen, hidden while the final call to action is visible.
- **Why.** It answers "what do I type?" and "will a bot answer?" before the tap.
- **Build.** `wa.me` with a fixed `?text=` from `copy.ts`. The bar: `position: fixed; inset-block-end: 0` plus `env(safe-area-inset-bottom)`, toggled by the header's observer. Three states from `site.ts`: WhatsApp (button); email only (mailto button, address in mono); neither (a status line with a hollow grey dot, never styled as an error or a disabled button).
- **ALYR's own.** The arrow sits in a small 45° notch at the inline end; on press it moves 1 px along the diagonal.

### P13. Questions as a ruled list
- **Seen at.** Mercury keeps FAQs in its nav and Granola has none on the homepage (read); Linear's and Stripe's pricing pages use ruled accordions (reported).
- **Looks.** Desktop: heading sticky at the start, questions at the end as full-width ruled rows with a plus that becomes a minus. Phone: full width, rows at least 56 px.
- **Why.** The objections are specific; plain questions say "we have heard this at the counter".
- **Build.** Native `<details>`: works without JavaScript and with find-in-page. Height animates with `interpolate-size: allow-keywords` and `::details-content` where supported, else opens instantly. An `id` per question, so the founder can send a link to one answer.
- **ALYR's own.** The opened question's rule turns Volt for 480 ms (current state), then settles to Carbon.

### P14. The footer as a sign-off
- **Seen at.** Granola's one-line sign-off; Linear's and Attio's columns with a legal row; Tabby's licence line (all read).
- **Why.** Four pages exist; a mega-footer looks padded. The not-affiliated line must be readable.
- **Build.** Three grid rows (brand line, links, legal); legal lines in mono 12 px, `--text-muted` (#5f666d on #f6f7f3 is about 5.4:1, a pass).
- **ALYR's own.** "Built in Qatar." beside the live Doha time; a dashed slot for the CR number.

### P15. Arabic and English, both first
- **Seen at.** Tamara Arabic (seen): a centred, very heavy Arabic headline in two tight lines, but round sticker chips that the Arabic overflows. Careem Arabic (seen): arrows mirror, but the hero campaign and cookie banner are English. Foodics Arabic (read): Western digits, Latin product names inside Arabic, kashida in headings.
- **Why.** An Arabic-speaking owner notices at once when Arabic is set as squeezed English, or when English leaks onto the Arabic page.
- **Build.** Arabic display line height 1.25 (English 1.0), body 1.7, no letter-spacing, no kashida. Size containers to content; never fixed circles or pills (the Tamara failure). `<bdi>` around money, order numbers and "ALYR". Western digits in money, as the product writes it ("449 ر.ق", "QAR 1,850"); no Eastern digits for prices or times (C8). Every string on `/ar` in Arabic, including captions, `aria-label`s and the pending state (the Careem failure). The language link lands on the same section (`/ar#price`).
- **ALYR's own.** Every 45° cut and the diagonal reveal mirror, so the gesture reads forward in both directions.

### P16. Small confirmations, and one signature transition
- **Seen at.** Lama Lama (seen): a loader dash, then a wipe of blocky geometric tiles before an oversized headline. Raycast and Linear: instant hovers, keyboard hints (reported).
- **Why.** Small confirmations (1–2 px hover lifts, strong focus rings, underlines that draw in, a tick that lands once) make the page feel built; nothing jumping makes it feel trustworthy.
- **Build.** `:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px }`; underline via `background-size` from `0 1px` to `100% 1px`, origin flipped in RTL; `@starting-style` for one-shot entrances; all inside `prefers-reduced-motion: no-preference`.
- **ALYR's own.** One transition, used once: entering the Carbon band, three dark planes sweep in along 45° with the symbol's gap, about 600 ms, CSS only. No loader anywhere: the page is static HTML and should simply appear.

---

## 2. The ten sections

12 columns on desktop (max 80 rem), 4 on phones; start and end are logical.

**3.1 Hero.** *Desktop:* P1. Headline about 88 px in two lines; body, button, reply line; the facts as one ruled row with vertical rules, not numbered. Figure in 7–12, caption `FIG 01 · SAMPLE SCREENS, FICTIONAL CAFE`, faint grid kept. *Phone:* P2; the sticky button starts here.

**3.2 The problem.** *Desktop:* heading sticky in 1–5; the seven lines in 6–12 as ruled rows at 20–22 px, optionally each with a quiet mono day-and-time marker ("Fri 13:10") so the list reads as a week in the shop, never as quotes: no faces, no quotation marks. Then the closing line as a full-width two-tone statement (P6). "Who it's for" as plain tags on one rule, the "soon" tag dashed. *Phone:* heading, rows, statement at about 28 px.

**3.3 What ALYR does (the Carbon band).** *Desktop:* heading and body in 1–7. Then P5: the five modules scroll at the start; the sticky figure is a workspace sheet (real navigation, Orders screen) with the phone over its corner. Each module brings up its real screen: order page; pay link and "Received QAR … for order #1043. Thank you."; tracking page; inbox thread with activity lines ("Yusuf took this conversation"). Bookings needs something a cafe books one at a time (a catering tasting, say), or stays text only. Then "Also in your workspace" in three ruled columns, and a product rail: ALYR Chat solid, two dashed unnamed slots, "More products will join…". *Phone:* a phone screen, then each module as a row with its own crop; no sticky.

**3.4 How it works.** *Desktop:* a four-step rail; the hairline under the numbers fills Volt to the current step. Steps 1–3 are text with a line glyph; step 4 opens into the Sunday report as a chat bubble in mono, caption `SAMPLE FIGURES`, showing only the cafe's products (Orders, Team inbox), as the real report does. The go-live note in mono under the rail. *Phone:* a vertical rail on the start edge, like the tracking page.

**3.5 What is included.** *Desktop:* heading and body in 1–7; the two ruled checklists in 1–4 and 5–8; in 9–12 the setup checklist with *Ask ALYR*, joined by a 45° hairline to a row in ALYR's back-office queue ("Help request · change Friday hours · Open"). "When you need more" below a dashed rule. *Phone:* lists, then the figure with the line vertical.

**3.6 Price and the first month.** *Desktop:* two objects only, the price sheet (P9) in 1–6 and the agreement (P10) in 7–12, the button under both. Price about 120 px on desktop, 72 px on phones. *Phone:* price, ledger, agreement, button.

**3.7 Trust without customers.** *Desktop:* founder photo at 4:5 in 1–4; the English and Arabic customer pages in 5–8; heading, body and six facts in 9–12 (or the facts full width below if long). Dashed slots ready, hidden. *Phone:* photo, heading, facts, then the two customer pages as a snapping pair.

**3.8 Questions.** P13: heading sticky in 1–4, questions in 5–12. *Phone:* full width, first question open.

**3.9 Final call to action.** Full-bleed Carbon, not an inset card. Headline on two lines in 1–8; button, draft bubble, "A message commits you to nothing."; the Command Fold large in 9–12, unaltered. All three contact states drawn. *Phone:* the symbol small, above the headline.

**3.10 Footer.** P14 on Paper. *Phone:* stacked rows, 44 px targets.

---

## 3. Ten things that look dated or generic in 2026

1. **Gradient ribbons, aurora meshes, glow orbs.** Stripe's ribbon is Stripe's; anyone else's looks borrowed.
2. **Bento grids of icon cards,** like today's services grid and "Careful by design".
3. **Logo walls, "trusted by", ratings, live counters.** Forbidden here anyway.
4. **Tilted 3D phones, glass panels, a laptop in a landscape** (Mercury, seen): a scene, not a product.
5. **AI sparkles and "AI-powered" chips.** Untrue here (D-012).
6. **Stock photos and Gulf clichés:** skylines, dhows, coffee pots, arabesque as decoration.
7. **WebGL, loaders, scroll-jacking.** Why Zero and Lama Lama open on loaders (seen); wrong for a phone in a busy shop.
8. **Pop-ups over content.** Stripe, Mercury and Careem all showed cookie banners; ALYR sets no cookies.
9. **Testimonial carousels and auto-rotating sliders.**
10. **"01 02 03" on things that are not steps; emoji eyebrows in pills.**

---

## 4. The current homepage, critiqued

From `baseline/home-en-1440-first-screen.png` and `home-en-1440-full.png`, most important first.

1. **The product is not on the first screen.** The hero figure lists services; ALYR Chat is the fifth row.
2. **The main button does not ask for the message.** "See what we do" scrolls to a services grid; "Talk to us" is only in the header, and hides on narrow phones.
3. **The action ends in what looks like an error.** "Our WhatsApp line is being set up. Please check back shortly." sits in a thin bordered box that reads as a disabled button.
4. **The chat figure shows something the product cannot do** (C1).
5. **The first screen splits in two.** The 96 px headline fills the top half; the board starts lower on the end side, leaving the lower start corner empty and the board touching the fold.
6. **No price**, though it is decided and is ALYR's clearest difference.
7. **It sits close to Ramp.** Lime button, faint grid, light canvas, big grotesque headline: at a glance it could be Ramp's hero (seen today). The 45° fold, Carbon moments and real chat screens separate ALYR, and the hero uses none of them.
8. **Cards where rules should be:** the services grid, the "Careful by design" grid, the rounded inset closing panel.
9. **An abstract middle.** "Four steps, one team" and "Careful by design" speak consultant; the scroll-lit statement is four lines on desktop.
10. **Finish:** facts numbered 01–03; "Service" four times; the closing text about 32 px off the content line; three fictional businesses.

---

## 5. Art direction and brand extensions

**Direction.** The page is a working drawing of an owner's business, made by an engineer who respects the owner's time. Paper canvas, a visible construction grid, hairline rules, a mono caption on every figure, and real ALYR screens at true scale with the product's real wording. One Carbon band where the product works, one Carbon panel where the owner acts. Volt appears only where something becomes true: the button, an order marked New, a step confirmed, the money-back promise. Motion is the fold: things arrive along the 45° diagonal, settle, and a single Volt signal confirms them, once, and never under reduced motion. Nothing is decoration; even the honesty labels and the empty slots are design.

**Extensions.**
- **Fluid type scale.** Display `clamp(2.75rem, 1.4rem + 5vw, 5.5rem)` at 1.0; H2 `clamp(2rem, 1.3rem + 2.6vw, 3.25rem)`; H3 1.375 rem; body 1.0625 rem (17 px) at 1.55; small 0.875 rem; mono 0.75 rem, +0.08 em tracking in English only. Arabic: same sizes, display 1.25, body 1.7. *Why:* today's 96 px display pushes the action off the first screen.
- **An 8 px rhythm:** 8, 16, 24, 40, 64, 104; sections `clamp(4rem, 10vw, 8rem)`. *Why:* rules line up across sections.
- **No second accent.** Only the product's pale `--volt-wash` for the current row, and a hollow grey dot for "pending". *Why:* another colour would blur Volt's meaning as the signal.
- **Dashed rule = not yet true.** *Why:* shows what is coming, honestly, and is ownable.
- **The 45° cut corner** on figures, the agreement and the button notch. *Why:* carries the Command Fold into components without touching the logo, and moves ALYR away from Ramp's rounded lime.
- **FIG captions** on every product drawing. *Why:* turns "sample, fictional" into precision.
- **Tabular figures for all money.** *Why:* prices and report figures must align.
