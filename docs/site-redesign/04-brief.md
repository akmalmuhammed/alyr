# ALYR homepage 2026: build brief

16 Oct 2026. The creative director's decisions for the builder. Read this first, then the files it points to.

**Order of authority.** `00-founder-decisions.md` beats everything. Then this brief. Then `03-product-truth.md` (what may be shown or claimed). Then `02-messaging.md` (the words). Then `01-design-research.md` (how it looks and moves). Where this brief says "as 02 §3.4" or "P5", build exactly that unless this brief changes it.

**Scope.** The homepage in English (`/`) and Arabic (`/ar`), desktop and phone, light and dark. Shared pieces (`Shell.tsx`, `site.css`, `brand.tsx`, `copy.ts`, `site.ts`, `SiteMotion.tsx`, `opengraph-image.tsx`) may change, but `/chat` and `/ar/chat` must look and work as they do today. Do not touch `(product)` screens or the API.

---

## 1. The idea in one line

**A working drawing of an owner's business.** Paper canvas, a visible construction grid, hairline rules, a mono FIG caption on every drawing, and real ALYR screens drawn at true scale with the product's real wording. Volt appears only where something becomes true. Motion is the fold: things arrive along the 45° diagonal, settle, and one Volt signal confirms them, once. Nothing is decoration; even the honesty labels are design (01 §5).

What separates ALYR from Ramp-like pages (01 §4.7): the 45° cut corner, the Carbon band where the product works, real chat screens, solid and dashed rules with meaning. Use all four.

## 2. Founder decisions, applied

| Item | On the page |
|---|---|
| Price | "From QAR 449 a month", in the hero facts and in 3.6 |
| Setup | "Setup from QAR 1,500, quoted at your visit." Replace every `[setup fee]` in 02 |
| Term | "Month to month. Stop at the end of any month." (02 §3.6 and the FAQ answer) |
| First month | 02 §3.6 money-back copy and the defaults under it: first month's subscription refunded, not the setup fee; one agreed result counted in the workspace over 30 days from go-live; the owner shares the chat link and QR codes in the first week. Build it. It goes live only after the founder confirms the terms are in the agreement (a check at publish time, not a code flag) |
| Founder | No name, no photo, anywhere. Remove "Akmal, founder" from 3.7 and keep the sentence without it: "The person who visits you sets you up and answers when you message." No P11 photo |
| Contact | WhatsApp is not live. Build all three states from `site.ts` (P12), and ship the **email state**: hello@alyr.qa. The WhatsApp state turns on by itself when `NEXT_PUBLIC_ALYR_WHATSAPP` is set |
| Seats | Say "sign-ins for your team" with no number. Do not say unlimited |
| Training | "Training at your counter", no language promise. The product itself is Arabic and English, and the hero fact says so |

Every remaining **[F]** or **[G]** in 02 that this table does not settle: leave it out of the page and list it in the PR description.

## 3. The demo business

One invented business on every homepage figure (03's C-list found three across the site). Make it **a bakery and cafe** that both sells and books: counter and tray orders through the order page, and **cake tastings booked one at a time** (bookings serves one customer at a time per shop today, so this is a true use).

- Pick a name with a Latin and an Arabic form. Search the web and confirm no Doha or Qatar business uses it; note the check in the PR.
- Prices on its items are samples and the caption says so.
- Staff: keep "Yusuf" as the person looking after orders (03 §2.2 uses "Looked after by Yusuf").
- Every figure carries a FIG caption ending "SAMPLE, FICTIONAL BAKERY" (Arabic: its own wording, no caps, no tracking).
- `/chat` keeps its own demo for now; aligning it is a later PR.

## 4. The sections

Build the ten sections of 02 §3 in that order with 02's final English copy and the layouts in 01 §2. Changes and decisions:

**3.1 Hero.** P1 + P2. Headline "Go digital. Without the IT team." The figure: the real order page in a phone frame ("What would you like?", steppers, the bar "3 items · QAR …"), and behind it, offset along 45°, the record "Order 1043 · New · Looked after by Yusuf". The + and − steppers work: real `<button>`s with Arabic and English `aria-label`s, the bar total updates, announced through a polite live region, capped at 9 per item. The timing plan in P1 is the target. Phone: no `100vh`; headline, body, button, reply line and the three facts above the fold at 390 × 844, then the top of the phone frame clipped at 45°. Facts are one ruled row, never numbered.

**3.2 The problem.** As 01 §2. Use the day-and-time markers ("Fri 13:10") only on lines that describe a moment; never as quotes, never with faces. The closing line is the page's one two-tone statement (P6), which replaces the word-by-word lighting. "Who it's for" as tags on one rule.

**3.3 What ALYR does (the Carbon band).** P4 then P5 on desktop: the five ALYR Chat modules as the scrolling text, the sticky figure changing state (order page; pay link and "Received QAR … for order #1043. Thank you."; tracking page; inbox thread with "Yusuf took this conversation"; booking a cake tasting). The pay step shows the stand-in page's own label, "Test payment page. No money moves.", or no payment screen at all: there is no gateway (03). Phone: each module a row with its own small crop, no sticky. Then "Also in your workspace" in three ruled columns, then the product rail: ALYR Chat on a solid rule, two unnamed slots on dashed rules, and 02's "More products will join…" line. The entry into this band is the page's one signature transition (P16): three dark planes along 45°, about 600 ms, CSS only.

**3.4 How it works.** Four steps on a rail whose hairline fills Volt as each step enters view; step 4 opens into the Sunday report as a chat bubble in mono, captioned SAMPLE FIGURES, with only the sections a bakery would have (03 has the real format). Phone: a vertical rail like the tracking page.

**3.5 What is included.** As 01 §2: two ruled checklists and the "Ask ALYR" button joined by a 45° hairline to the back-office queue row. "When you need more" under a dashed rule. Drop "AI assistants" (02 claims row 29).

**3.6 Price and the first month.** Two objects only: the price sheet (P9) and the agreement page (P10). The money-back promise holds this section's one Volt mark; "No commission" is Carbon. Amounts never break (`<bdi>`, `nowrap`), tabular figures.

**3.7 Trust.** "New company. No shortcuts." Heading, body and the six facts as a 3 × 2 ruled grid with mono labels, and beside them the same customer page in English and Arabic, mirrored (phone: a snapping pair). No photo. Do not render empty slots for the CR number, payment provider or Meta status; build the rows as data in `site.ts` that appear only when a value is set.

**3.8 Questions.** P13: native `<details>`, an `id` per question, heading sticky on desktop, first question open on phones. Answers follow section 2 of this brief.

**3.9 Final call to action.** Full-bleed Carbon, the Command Fold symbol large and unaltered, the contact block in its live state. In the email state: the address in mono, a button that opens mail with a short prefilled subject from `copy.ts`, and "A person from ALYR replies." No response time promised.

**3.10 Footer.** P14 sign-off: brand line, one row of links, the legal row with the not-affiliated-with-Meta line readable. "Built in Qatar." beside the live Doha time (after hydration). No CR slot.

**Throughout.**
- **Contact action.** One Volt button style everywhere, with the 45° notch (P12). Header keeps a compact contact button on phones. Phone sticky bar appears once the hero button leaves the screen and hides when 3.9 is in view, with `env(safe-area-inset-bottom)`. The "being set up" box from today's site is gone; the pending state, when used, is a status line with a hollow grey dot, never styled as an error or a disabled button.
- **Anchors.** `Shell.tsx` on `/chat` links to `#services`, `#approach`, `#contact`. Either keep those ids on the matching new sections or update the links in the same PR, so no link lands nowhere. The language switch keeps the section (`/ar#price`).
- **OG image.** Update `opengraph-image.tsx` to the new headline and check it renders.

## 5. Design system changes

Adopt 01 §5's extensions and record them in `docs/brand.md`: the fluid type scale (display `clamp(2.75rem, 1.4rem + 5vw, 5.5rem)`), 8 px rhythm, `--volt-wash` and the hollow pending dot as the only additions to colour, dashed rule = not yet true, the 45° cut corner, FIG captions, tabular figures for money. No second accent colour. Logo, symbol and wordmark unchanged.

## 6. Do not

Everything in 01 §3: no gradients, glow, glass, bento icon cards, logo walls, counters, ratings, testimonials, tilted 3D phones, AI sparkles, stock photos or Gulf clichés, WebGL, loaders, scroll-jacking, carousels, pop-ups, emoji, numbering on things that are not steps. No WhatsApp logo or WhatsApp green; nothing that implies ALYR is WhatsApp or Meta. No claim in 03's "must not claim" table: no customers, no live gateway, no own-number connect, no AI. No npm dependencies beyond those in section 9. No `100vh` heroes.

## 7. Engineering rules

- Every word, `aria-label`, caption and alt text in `copy.ts`, English and Arabic. `/ar` has no English except "ALYR", product names that stay Latin, and the email address. Arabic: display line height 1.25, body 1.7, no letter-spacing or uppercase, Western digits for money and times, `<bdi>` around money, order numbers and "ALYR".
- Logical CSS only. Mirror every `clip-path` and diagonal under `[dir="rtl"]`, because clip-path does not flip.
- Static export must keep working: no server code; anything live (clock, steppers, observers) runs after hydration and the static HTML is complete without it.
- `prefers-reduced-motion: reduce` shows the composed end state of every motion. No-JS shows every section in full.
- Contrast AA everywhere, focus rings visible (`:focus-visible`), targets at least 44 px on phones, no horizontal scroll at 320 px.
- Keep the homepage's own JavaScript small: a few client components, and only the motion stack in section 9.

## 8. Workflow

- Work only in the worktree `D:\alyr-home`, branch `aly-56-homepage-2026`. Never touch `D:\alyr whatsapp`, `D:\alyr-portal` or `D:\alyr-reports`, and never use port 3100 (other sessions).
- Preview: from `D:\alyr-home\apps\web` run `ALYR_DIST_DIR=.next-preview pnpm exec next dev -p 3101` in the background. Next rewrites `apps/web/tsconfig.json`; `git checkout` it before every commit and delete `.next-preview` at the end.
- Screenshots with headless Edge: `node D:\alyr-home\docs\site-redesign\baseline\shoot.mjs <url> <w> <h> <out.png> [--full] [--wait=ms] [--scale=n] [--scheme=dark] [--reduced-motion] [--as-scrolled]`. Stop stray Edge processes only by command line matching `*shots*prof*`, never all msedge. The in-app browser's screenshots are unreliable here.
- Save the final set to `D:\alyr-home\docs\site-redesign\shots\`: `/` and `/ar` at 1440 × 900 and 390 × 844, first screen and full page; one dark full page per language; one reduced-motion full page; `/chat` and `/ar/chat` at 1440 first screen to prove nothing broke.
- Commit in stages (hero, problem, Carbon band, the rest, polish), so the work survives if you stop. Keep a short running log in `05-build-log.md`: what is done, what is next, open questions.
- Before the PR: `pnpm lint`, `pnpm build` in `apps/web`, then `bash scripts/build-site.sh` from the repo root succeeds and `apps/web/out-site/index.html` and `ar/index.html` exist.
- Docs in the same PR: a decision entry in `docs/decisions.md` (the next free number; it is D-032 as of now, check again before committing, and add the index row) recording the 16 Oct product-first, paid-from-day-one decision and the table in `00-founder-decisions.md`; replace the Prices row in `docs/status.md`; the brand changes in `docs/brand.md`.
- Stage files by name. Commit `docs/site-redesign/00`–`05*.md` and `baseline/shoot.mjs`; do not commit `_playbook-extract.txt`, `baseline/*.png` or `shots/*.png`.
- Push the branch and open a pull request titled "Homepage redesign 2026 (ALY-56)" with the screenshots listed, the name check, and every open [F]/[G] item. Do not merge. Do not deploy; publishing to alyr.qa needs the founder's yes.

---

## 9. Motion and tech (added 16 Oct, after the founder's follow-up)

The founder wants an agency-grade motion layer and has approved installing what it needs. This section replaces "no new dependencies" and "no animation libraries" wherever they appear above.

**Stack.**
- **GSAP**: `gsap@3.15.0` and `@gsap/react@2.1.2` in `apps/web`, exact versions. GSAP's standard no-charge licence covers ALYR (its one restriction is for products that compete with Webflow's visual builder). Use ScrollTrigger and SplitText from the package. Import them only in homepage client components, and load the scroll choreography with a dynamic `import()` after first paint, so it never delays the first screen.
- **CSS for everything CSS can do**: the hero entrance (it must run before hydration, so CSS keyframes, not GSAP; the headline's two lines are separate spans in the markup), hovers and presses, `linear()` spring easings, `@starting-style`, `@property` for animated fills, and scroll-driven animations inside `@supports (animation-timeline: view())` where they are simpler than ScrollTrigger.
- **Cross-document View Transitions** (`@view-transition { navigation: auto }`) for the English–Arabic switch and links between `/` and `/chat`: the header and logo stay put while the content changes along the diagonal. CSS only; other browsers simply navigate.
- **Instrument Sans with its width axis** (`axes: ["wdth"]` in `next/font`), so display type settles from slightly condensed to normal width as it reveals. Latin only; Arabic type does not stretch.
- **No smooth-scroll library** (Lenis or similar): native scroll keeps anchors, find-in-page, keyboard and phone scrolling exactly as owners expect. No WebGL, canvas or Three.js.

**The motion system.** Record it in `docs/brand.md` as tokens: durations 120 / 240 / 480 / 720 ms; two eases (`--ease` for things arriving, a `linear()` spring for things the visitor presses); one travel vector at 45°, mirrored in RTL; 60 ms stagger. Every animation uses them.

**Choreography.** Each move says something; none is there for its own sake.
- **Hero:** the two headline lines rise out of a mask with the width settle; the phone arrives; the order record slides in along 45°; one Volt dot. On the steppers the quantity rolls (old digit out, new digit in) on the spring, and the bar total rolls with it.
- **Problem:** each row's rule draws in from the start edge as it enters; the statement's muted half resolves after the strong half.
- **Carbon band:** the three-plane fold on entry; the sticky figure changes state with a 45° clip-path wipe; the progress rule fills Volt with scroll.
- **How it works:** the rail fills Volt with scroll; the Sunday report bubble arrives line by line, once.
- **Price:** the digits of 449 slot in once from below; the agreement's blank line draws, then the Volt tick lands.
- **Trust:** the English and Arabic pages part from one centre line, mirrored.
- **Questions:** height animates with `interpolate-size`; the opened rule flashes Volt.
- **Final call to action:** the Command Fold's three planes assemble along their gaps, once.
- **Pointer, desktop only** (`pointer: fine`): the primary button leans 2–3 px toward the cursor. No custom cursor, no tilting figures.

**Rules that hold.**
- **SplitText:** lines and words only. Never split Arabic into characters; that breaks letter joining. Use `aria: "auto"` so screen readers get whole sentences, and re-split on resize.
- **Nothing hidden in the HTML.** An inline script in `<head>` adds a `motion` class before paint, only when reduced motion is not requested. Start states exist only under that class, and a 2.5 s failsafe removes the class if the motion code never loads. No flash, and no blank page without JavaScript.
- **Reduced motion:** no GSAP timeline runs; the end state shows.
- Animate only `transform`, `opacity`, `clip-path` and font variation, never layout properties. Clean up every ScrollTrigger on unmount (`useGSAP`).
- **Budget, measured on the built site** (`out-site` served locally): Lighthouse mobile Performance ≥ 90, Accessibility 100, CLS < 0.05, LCP < 2.5 s, and under 70 KB gzipped of JavaScript added by this work. Put the numbers in the PR.

**Checking tools.** Install them outside the repo (for example `C:\t\tools`), not in `package.json`: `lighthouse`, run against headless Edge through `CHROME_PATH`; and `axe-core`, injected into the page by the headless Edge script, run on `/` and `/ar`. Zero serious or critical axe issues.
