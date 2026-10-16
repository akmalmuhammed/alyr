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

## Open questions

(filled in as they come)
