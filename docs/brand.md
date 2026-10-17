# ALYR brand in this repository

ALYR is the company. The WhatsApp product is its first product (decision D-023). This page says where the brand lives, which rules the public site follows, and what is still open. It is a pointer, not a copy of the design system.

## Where the source is

The approved design system (v1.0) and strategy are on the branch `codex/alyr-native-foundation`, under `ALYR_Main/ALYR_Design_System` and `ALYR_Main/ALYR_Brand_HQ`. **Never merge that branch into `main`.** It shares no history with `main` and contains other projects. Copy the asset you need and say where it came from.

| In this repo | Copied from the design system |
|---|---|
| `apps/web/app/_site/brand.tsx` (logo, symbol, icons) | `02_Logo_System/01_Master_SVG`, `03_Icon_System/UI_Icons_SVG` |
| `apps/web/app/_site/site.css` (colors, type, motion) | `06_UI_UX_System/Design_Tokens/tokens.css` |
| `apps/web/app/icon.svg` | `04_App_and_Favicon/02_Favicon/favicon.svg` |
| `apps/web/app/_site/fonts/InstrumentSans-SemiBold.ttf`, `IBMPlexMono-Regular.ttf` (the social card only, read at build time; SIL Open Font Licence) | `asset-continuity-web/public/alyr/fonts/` on the same branch |

## Two brand sources, not yet reconciled

The founder's **Brand & Growth Playbook** (a Claude Docs document in the founder's account, 11 Oct 2026) sets the positioning, voice, content and sales plan, and describes a different visual identity from the design system. The public site currently uses the playbook's words on the design system's look. See decision D-025 for exactly what was taken and what was held back.

## Rules the public site follows

- **Logo.** Drawn point for point from the master artwork, with one change: the founder had the R redrawn on 12 Oct 2026 (full stem, chamfered bowl, tighter counter). The master SVGs on the design-system branch, and everything made from them (cards, letterhead, social covers), still carry the old R and need regenerating; the new R also needs the designer's proof before print or trademark filing. Never retyped, redrawn, stretched or recolored. Carbon on light, white on Carbon, each with the Volt plane. The horizontal logo is never narrower than 140 px; below that, use the symbol.
- **Volt means one of four things:** the main action, the current state, confirmed progress, or one strategic signal. Never body text on a light surface, never a decorative background.
- **Type.** Instrument Sans for Latin, IBM Plex Sans Arabic for Arabic, IBM Plex Mono for small labels and identifiers. Arabic is never letter-spaced and is set with looser line height than Latin.
- **Layout.** Light first, Carbon for command moments, rules and whitespace before cards, asymmetry over centering.
- **Motion.** One signature gesture: things arrive along the logo's 45° diagonal, settle, and one Volt signal confirms them. Everything plays once, except what follows the scroll (the two progress rules on the homepage). Hover movement is 1 to 2 px. With reduced motion, nothing travels and nothing plays by itself. Two figures on the ALYR Chat page are allowed to keep moving, because they explain the product: the demo and the how-it-works flow. Both play only while on screen, can be paused, and stay still with reduced motion. The homepage's motion system is below.
- **Voice.** Sentence case, short and declarative, name the result. No "Learn more", no "unlock", no "supercharge".
- **Honesty.** No invented metrics, logos or testimonials. Sample screens are labelled as samples and use a fictional business.
- **Words.** Every word is in `apps/web/app/_site/copy.ts`, in English and Arabic. Components hold no text.

One deliberate addition: `--line-strong` in `site.css` is darker than the design system's strong border, which is only 2.1:1 on Paper and too faint for controls.

## Extensions adopted with the 2026 homepage (ALY-56)

The homepage is "a working drawing of an owner's business" (`docs/site-redesign/04-brief.md`). These are additions to the design system, recorded here; the logo, symbol and wordmark are unchanged, and there is still one accent colour.

| Extension | Rule |
|---|---|
| Fluid type scale | Display `clamp(2.75rem, 1.4rem + 5vw, 5.5rem)` at 1.0 (on two-column widths also capped at `min(5.75vw, 5.2rem)`, and at `5.1vw` between 62 and 84 rem where copy and figure take six columns each, so the headline ends before the hero plate); H2 `clamp(2rem, 1.3rem + 2.6vw, 3.25rem)`; H3 1.375rem; body 1.0625rem at 1.55; mono 0.75rem, tracked +0.08em in English only. Arabic: same sizes, display 1.25, body 1.7, never tracked or set in capitals |
| Rhythm | 8 px steps: 8, 16, 24, 40, 64, 104; sections `clamp(3.5rem, 7vw, 6rem)`; section rules leave `clamp(2rem, 4vw, 3.5rem)` below them |
| Colour, two additions only | `--volt-wash` (the product's pale Volt, for the current row) and `--pending`, a hollow grey dot for something not yet available. The pending contact state is a status line with that dot, never an error box or a disabled button |
| Solid and dashed rules | A solid rule is true today; a dashed rule is a slot waiting to become true (the next products, "When you need more", the agreement's blank) |
| The 45° cut corner | On the main button (the arrow sits under it and moves 1 px along the diagonal when pressed), its outlined twin (`btn-line`, a 1.5 px line along the same notch, for a second way in further down the page), the drawn phones, the agreement, the shop monogram and the hero plate. Every cut and diagonal is mirrored in Arabic, because `clip-path` does not flip |
| The fold | The page's signature: three Carbon planes with the symbol's gaps (a 6 px Paper line across and a 6 px line down the 45° diagonal), at the entry to the Carbon band and again at the top of the closing call. The page shows through the gaps, so the fold stays drawn |
| The hero plate | The hero figure sits on a Carbon plate with its top start corner cut at 45° (6 rem) and a 0.5 rem Paper slit along the same angle above the order record |
| `--band` | The full-bleed Carbon of the band, the plate and the closing call: Carbon in light mode, `#1d2024` in dark mode so it still stands apart from the dark page; the header turns `--band` at 92 % while it sits over one |
| FIG captions | Every product drawing has a mono caption on a hairline ending in a tick: "FIG 01 · what it shows · SAMPLE, FICTIONAL BAKERY" (Arabic: its own words, no capitals) |
| One sample business | Qirfa Bakery / مخبز قرفة on every homepage figure, with sample prices said so |
| Money | Tabular figures; amounts and "ALYR" sit in `<bdi>` and never break (`Text.tsx`) |
| Drawn chats | A neutral chat with no messaging app's logo or colours |
| Dark mode | The homepage follows the device into dark mode; the ALYR Chat page stays light because it has no dark design |

### Motion system (homepage)

- **Tokens** (`site.css`): durations `--dur-1` 120 ms, `--dur-2` 240, `--dur-3` 480, `--dur-4` 720; `--ease` `cubic-bezier(.16, 1, .3, 1)` for things arriving (`expo.out` in GSAP); `--spring`, a `linear()` spring for things the visitor presses; `--stagger` 60 ms; one travel vector at 45° (`--travel`, `--dir` is -1 in Arabic).
- **Stack.** CSS for the hero's entrance (it runs before hydration), hovers, presses, springs and one-shot arrivals keyed on `.is-in`. GSAP 3.15 with ScrollTrigger and SplitText (`Choreography.tsx`) loads after the page's load event, only when motion is wanted: it says when things arrive, splits headings into lines (never characters, and Arabic headings are not split), scrubs the two progress rules and leans the main buttons 2 to 3 px toward a fine pointer. Cross-document View Transitions keep the header still while the next page arrives along the diagonal. No smooth-scroll library, no WebGL.
- **Nothing hidden in the HTML.** A script in `<head>` adds `motion` before the first paint unless reduced motion is asked for; start states exist only under that class, and a 2.5 s failsafe removes it if the motion code never loads; hydration replaces that with a 10 s one, so a slow phone keeps its motion. Reduced motion runs no timeline and shows every end state.
- **Budget** (Lighthouse mobile on the built site): Performance at least 90, Accessibility 100, CLS under 0.05; JavaScript added by the motion layer under 70 KB gzipped.

## Open before the site goes public

| Item | Owner |
|---|---|
| ALYR's own WhatsApp number (`NEXT_PUBLIC_ALYR_WHATSAPP`) so the call to action is "Message us on WhatsApp". Until it is set the pages offer hello@alyr.qa (the default of `NEXT_PUBLIC_ALYR_CONTACT_EMAIL`); set that to an empty value and they say the line opens soon. The founder confirms the address forwards | Founder |
| Which look is ALYR's (ALY-61). The price is decided (D-033); "live in 48 hours" and a free pilot stay off the site (D-025) | Founder |
| Native review of all Arabic copy | A native reviewer |
| Check every product claim on the page against what is live (see `docs/status.md`): keeping your number, payment links through your own gateway, and the product on Meta's platform are designed and built on the simulator, not yet running live | Founder |
| Hosting for the site. Vercel's free plan forbids commercial use; Cloudflare, where the domain already is, allows it | Founder |
| Legal company name and its Arabic form, trademark clearance, privacy notice and terms pages | Founder |
| Leftovers of the earlier styling in the product: `/login` shows "Alyr" in the old plain style, and the `/whatsapp` demo header says "Alyr · Demo 1". The rest of the product screens are on ALYR tokens | Product lane |
