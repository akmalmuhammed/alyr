# Homepage redesign: build log

Running notes for ALY-56, branch `aly-56-homepage-2026`, worktree `D:\alyr-home`. Newest at the bottom.

## 16 Oct, start

- Read `04-brief.md`, `00`–`03`, the current `_site` code, the product's customer pages and the weekly report modules.
- **Brief changed mid-start:** section 9 (motion and tech) was added after the founder's follow-up. It replaces "no new dependencies" and "no animation libraries". Installed exactly `gsap@3.15.0` and `@gsap/react@2.1.2` in `apps/web` (ScrollTrigger and SplitText come in the `gsap` package). Nothing had been built yet, so nothing needed redoing.
- **Port.** Port 3101 is already taken by a `next dev` started from `D:\alyr whatsapp` (another session). Not touched. This build previews on **3102** instead.
- **Demo business.** "Qirfa Bakery" / «مخبز قرفة» (qirfa is Arabic for cinnamon). Web searches on 16 Oct for "Qirfa" bakery, cafe or restaurant in Doha and Qatar, the Arabic «مخبز قرفة الدوحة قطر», and "Cinnamon" bakery in Doha found no business with the name (the nearest were Cinnabon branches). Not a trademark search.
- **Arabic money in drawings.** The drawn product screens keep the product's own Arabic strings, which write "QAR 38" in chat messages and order rows (`fmt_qar`) and "38 ر.ق" on buttons. Page text uses "449 ر.ق".

## 16–17 Oct, first build (commit 1)

All ten sections are built in one pass, because the shared pieces (copy types, contact states, drawings, motion) had to exist before any section could. Stages after this are polish commits.

- **Files.** `HomePage.tsx` (sections), `Drawings.tsx` and `Frames.tsx` (product screens), `OrderFigure.tsx` (the hero's working steppers), `Contact.tsx` (the three contact states), `HomeMotion.tsx` (sticky bar, language link, sticky story, loads the choreography), `Choreography.tsx` (GSAP: `useGSAP`, ScrollTrigger, SplitText), `DohaTime.tsx`, `Text.tsx` (`<bdi>` for money and ALYR), `fill.ts`, `home.css` (homepage only). `ChatFigure.tsx` is gone.
- **`/chat` is protected by construction.** Its copy and copy types are byte-identical (checked by script). The homepage's styles are in `home.css`, which only the homepage imports, under class names `/chat` does not use. `site.css` lost only the old homepage's own rules; every class `/chat` uses was kept.
- **What `/chat` does share and therefore changes:** the header (nav now What we do · ALYR Chat · How it works · Price, and the compact button stays on phones), the notched Volt button, the closing contact section (full-bleed Carbon, email state) and the footer (sign-off, Doha time). Its own sections are untouched.
- **Dark mode is homepage only** (`:root:has(main[data-page="home"])`), because `/chat` has no dark design.
- **Checked so far:** English at 1440 light and dark (first screen), 390 dark (first screen), the full English page in light, the sticky story at two steps.

## Decisions taken while building

- **Display size.** The brief's clamp, with one extra cap on two-column widths: `min(clamp(2.75rem, 1.4rem + 5vw, 5.5rem), 6.1vw)`, so line 2 never runs into the phone between 992 and 1400 px. At 1440 it is 88 px as specified.
- **Width settle only at 48 rem and up**, where the lines do not wrap. On phones the headline wraps, and animating its width there would move the page (CLS).
- **No-break spaces in "Without the IT team."** so a phone breaks it as "Without the / IT team.".
- **Hero record shows no amount.** "Order 1043 · New · Looked after by Yusuf" and the customer, so it never disagrees with the steppers.
- **Payment step shows no payment screen**, only the chat's pay link and receipt; the caption says the payment page is a test page and no money moves.
- **Drawn chat has no WhatsApp colours.** Neutral paper and bubbles, links in a plain blue, no logo.
- **Sticky bar stays hidden after the closing call too**, so it never covers the footer.
- **Report's Sunday week is 4 to 10 Oct**, a real Sunday to Saturday.
- **Arabic digits.** Western digits for money and times everywhere, including the drawn tracking and booking pages, although the product's own `/t/` and `/b/` pages print Eastern digits through `Intl` `ar-QA` (a product inconsistency, see 03 C8).
- **Capture script.** `baseline/shoot.mjs` now finishes running CSS animations before a full-page capture: Edge repainted the headline's width animation from its first frame in captures beyond the viewport.

## 17 Oct, polish after the first review (commit 2)

Every section checked in both languages at 1440 and 390, light and dark, and with reduced motion. What changed:

- **Phones.** The hero's record card sits under the phone up to 62 rem instead of being hidden. The Carbon band's figures are shorter phones with the shop's strip below them, so nothing is cropped empty. The trust section's English/Arabic pair is a horizontal scroll on phones, so its entrance there is a fade only (a slide fought the scroll snap). The fold planes in the Carbon band are clipped (`overflow: clip`): they pushed the page sideways on phones. Checked: no horizontal scroll at 390 in both languages, and at 320 in Arabic.
- **Captions** run inline with their separators, instead of wrapping as blocks. `rich()` inside a flex row lost or doubled the spaces around ALYR, so its pieces are wrapped in spans.
- **Arabic headings are not split.** SplitText left the full stop alone on a line after the `<bdi>` around "ALYR Chat", and splitting Arabic into characters is ruled out by section 9 anyway. Arabic headings rise and unclip as one block; English headings rise line by line behind a mask. «لـ ALYR» and «بـ ALYR» use a no-break space.
- **Accessibility.** axe flagged the trust pair as a scrollable region without focus: it is now a focusable group with a name and a focus ring.
- **Contact states.** The three states were built and looked at with temporary builds: WhatsApp (test number 97400000000, never committed), email (the default, hello@alyr.qa) and pending (no address: the buttons go and the page says the line opens soon). The temporary builds and their servers are gone.
- **Sticky phone bar** shows once the hero's button has scrolled away and stays hidden from the closing call onwards.

## 17 Oct, performance and the social card (commit 3)

- **First Lighthouse run: performance 85, LCP 3.8 s.** Causes, in order: about 40 ScrollTriggers created at start, SplitText measuring every heading at once, the GSAP chunk loading during the first screen, a 45° clip wipe on the hero record, three Arabic weights and the mono font preloaded on every page.
- **Fixes.** One IntersectionObserver adds `is-in` to everything that arrives when read; ScrollTrigger is kept for the two scrubbed rules only (the band's progress line and the how-it-works rail). Headings are split when they come near the screen, not at start. The choreography chunk loads after the window's `load` event, when the browser is idle. The hero record slides with transform and opacity only. Arabic loads 400 and 600 (500 fell back to 400 in practice). The mono font is not preloaded.
- **Tried and reverted: a font preload per language.** Turbopack shares font preloads across the three root layouts and names font files by their content, so a per-language font module downloaded Arabic twice. Back to one `document.tsx`.
- **Final numbers** (production build served locally, Lighthouse mobile, simulated throttling): `/` performance 92, 92, 92 over three runs; `/ar` 93, 90, 92; accessibility, best practices and SEO 100 on both; LCP 3.2 to 3.3 s; FCP 1.4 s; CLS 0.008 or less; total blocking time 30 to 180 ms. The live alyr.qa scores 90 with LCP 3.4 s on the same machine, so the new page is a little faster than the old one, but LCP is still above the brief's 2.5 s. The LCP element is the hero headline; what is left is font download time under simulated 4G.
- **JavaScript added:** about 48 KB gzipped (190.3 KB against the live site's 142.4 KB, not counting Cloudflare's beacon). The GSAP chunk is 48.4 KB and arrives after `load`, so the first screen does not wait for it.
- **axe-core** (installed outside the repo, `C:		ools`): zero violations on `/` and `/ar`, at 1440 and 390, light and dark, before and after scrolling. `/chat` has two old findings (contrast of the dim statement words, heading order) that this branch did not touch.
- **Social card** now uses the brand's type: Instrument Sans SemiBold and IBM Plex Mono as TTF files in `app/_site/fonts/`, taken from the design-system branch `codex/alyr-native-foundation` (OFL, not merged). The default font in `next/og` spaced the headline unevenly.

## 17 Oct, close-out

- Rebased on `main` after ALY-78 merged (D-032 was taken, so this branch's decision is **D-033**).
- Docs: D-033 in `docs/decisions.md` (the 16 Oct decisions and the founder's table from `00`), the Prices row in `docs/status.md` replaced, `docs/brand.md` (new extensions, the motion system, font files), the lane brief's "Now".
- Final screenshots in `shots/`, taken from the production build. Full-page captures show the composed end state (see the capture script). On wide screens the Carbon band's figure is sticky, so a full-page capture shows it once beside the first module and leaves the rest of the column empty; `home-en-1440-story-payment.png` and `home-ar-1440-story-inbox.png` show it in place at two steps, and the reduced-motion capture shows every module with its own figure.
- Not committed: `baseline/*.png`, `shots/*.png`, `_playbook-extract.txt`.

## Open questions for the founder

1. **Money-back terms.** The page promises the first month's subscription back if the agreed result is missed. That needs to be in the customer agreement before the page goes live.
2. **Arabic review** (ALY-66). Every Arabic line on the page is ours, not a native reviewer's.
3. **hello@alyr.qa.** Confirm it forwards to you (D-029) before the page shows it as the only way in.
4. **WhatsApp number.** When it exists, set `NEXT_PUBLIC_ALYR_WHATSAPP` and every call to action becomes "Message us on WhatsApp".
5. **Setup price.** The page says setup from QAR 1,500; the back office's draft default is QAR 2,500 (D-032).
6. **"We add nothing" on WhatsApp fees.** Third-party sources say Meta bills service replies beyond about 1,000 a month per number from 1 Oct 2026; Meta's own page did not say so when D-028 was written. The page's line (Meta bills its fees directly, ALYR adds nothing) still holds either way, but check before publishing whether any "free" wording needs to go.
7. **"When you need more."** The custom work below the dashed rule (more products, a website, connecting other tools): confirm you want to offer it, and whether any of it needs a licence.
8. **Left out until true** (from `00` and `02`, marked [F] or [G]): clinics and salons as "soon", "your number connected to WhatsApp", "payment account connected", the card fee line, the "Can I keep my number?" question, the licensed provider sentence, "your customer list belongs to you", a go-live date, support hours, Privacy and Terms links, the CR number.
9. **Brand.** The lane brief says no new branded material until ALY-61 picks a system. This was built at your request in the current ALYR system; ALY-61 is still open.
10. **Publish.** Nothing is merged or deployed. The go-ahead is yours.

## 17 Oct, fix pass after the two critiques (06, 07) with the rulings (08)

Port 3102 for the preview (3101 is another session's). Captures with `C:\t\fix\crit.mjs`, the reviewers' stepped-scroll tool copied outside the repo, and `baseline/shoot.mjs`, both with the profile `C:\t\fixprof`.

### Stage 1: copy and claims (commit "fix pass 1")

Done:
- **07 P0-1 `/chat`, option (b):** strings swapped (number agreed at setup, never holds your money, ordinary replies for 24 hours, the inside note, "Why it helps", the Easy and Trusted pillars, the meta description's end). Also, as string fixes: "Tue 14 Oct" is now "Wed 14 Oct" (14 Oct 2026 is a Wednesday), Arabic on `/chat` uses Western digits, the sample names are Mariam Saleh, Khalid Nasser and Omar Ali, and "ALYR adds payments, books and a website" now says more products will join in the order the first businesses ask (06 P2-13). Two more `/chat` strings went for the same reason, beyond the critique's list: the Pay demo caption ("Payments settle in your own gateway account", a must-not-claim in 03 §3) and "in Arabic or English" in `/chat`'s closing body (ruling on P1-5). The Trusted pillar keeps the language with the product, not the person: "A person from ALYR to talk to, a product in Arabic and English, and WhatsApp's official Business Platform."
- **07 P0-2 to P0-4, every P1, P2 1–14,** with the rulings: hero body without the payments sentence; Modern Standard headline «تحوّل رقمياً.» / «بلا فريق تقنية.»; no "in Arabic or English" in `contact.reply` or `final.body`; Aisha Hamad / «عائشة حمد»; monogram «ق»; Latin "Meta" kept; `«إطلاق مبكر»`; one currency rule on `/ar` (amount, then «ر.ق»); «الأصناف: {n}»; ALYR feminine in Arabic; «تتبّع» for tracking; mailto body with the four visit questions; the disclaimer now says "uses the WhatsApp Business Platform … not affiliated with, or endorsed by".
- **New keys:** `how.note` (the early-access line, shown under the steps and under the price), `rail.pending` ("Not named yet"), `price.currencyFirst` (English reads "QAR 449"), `contact.body`, and a question `whatsapp-line` that shows only in the email state. `contact.soon` is gone: the hero and price notes now read "A person from ALYR replies. hello@alyr.qa" (06 P1-4), and "Our WhatsApp line opens soon" appears once, in that question.
- **`fig.fictional`:** 06 says «مخبز غير حقيقي», 07 says «مخبز افتراضي». Took 06's: «افتراضي» also reads as "virtual", an online bakery, and the caption must not be ambiguous about being made up. FIG 01 is "Order page and its record, sample prices".
- **Time formats (06 P2-1, ruling):** each drawn screen prints what the product prints. Tracking `/t/` and booking `/b/` use `en-GB` with a 12-hour clock, so "Wed 4:05 pm" and "4:30 pm" (lowercase is the product's). The workspace inbox prints no time on messages and "16:14" on the activity line. The back office prints `toLocaleString("en-GB")`, so "16/10/2026, 14:05:00". Chat timestamps (the customer's phone) stay "4:02 PM". The page's own text: "Fri 1:10 PM", «الجمعة 1:10 م». Arabic keeps Western digits in drawn screens although the product's `/t/` and `/b/` print Eastern digits through `ar-QA` (listed for the product lane below).
- **`<bdi>` around order numbers** ("#1043", «رقم 1043») in `Text.tsx`, beside amounts and ALYR.
- **Arabic social card: tried and left out.** With IBM Plex Sans Arabic from the design-system branch, `next/og` joins the letters but does not order the words right to left, and measures each word as if its letters stood alone, so word gaps come out uneven even when the words are laid out one by one. Not good enough to send; `/ar` keeps the English card, and the reason is in `opengraph-image.tsx`.

### For the product lane (the operator files the ticket; no product code was changed)

- `fmt_qar` should be language-aware: Arabic messages write "38 ر.ق", not "QAR 38" (07 P1-8).
- `s/[slug]/page.tsx`: «{n} صنف» is wrong Arabic for most numbers; the drawing now uses «الأصناف: {n}» (07 P1-9).
- `seed.py`: "Ahmed Al-Kuwari" is a prominent Qatari family name; use a first and father's name (07 P1-13).
- The inbox label "Assistant" / «المساعد» could read as AI (07, smaller items).
- The setup checklist's "Each one you finish switches more of it on" implies self-serve setup (03 C10).
- The inbox's paused title in Arabic: «أنت من يرد» → «أنت تردّ الآن» (07 P2-13); the drawing uses the new wording.
- `/t/` and `/b/` print Eastern Arabic digits through `ar-QA`, while chat messages use Western digits (03 C8).

### Left from 08 after stage 1

Layout and phone (06 P0-1, P1-3, P1-6 styling check, P1-7, P1-9, P2-2 to P2-5, P2-8, P2-9, P2-11), motion and the fold (06 P0-2, P1-1, P1-2, P1-8, P2-6, P2-10, the fold at the closing call), the hero plate (lift 2), polish, then the checks in 08 and fresh `shots/`.
