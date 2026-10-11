# ALYR brand in this repository

ALYR is the company. The WhatsApp product is its first product (decision D-023). This page says where the brand lives, which rules the public site follows, and what is still open. It is a pointer, not a copy of the design system.

## Where the source is

The approved design system (v1.0) and strategy are on the branch `codex/alyr-native-foundation`, under `ALYR_Main/ALYR_Design_System` and `ALYR_Main/ALYR_Brand_HQ`. **Never merge that branch into `main`.** It shares no history with `main` and contains other projects. Copy the asset you need and say where it came from.

| In this repo | Copied from the design system |
|---|---|
| `apps/web/app/_site/brand.tsx` (logo, symbol, icons) | `02_Logo_System/01_Master_SVG`, `03_Icon_System/UI_Icons_SVG` |
| `apps/web/app/_site/site.css` (colors, type, motion) | `06_UI_UX_System/Design_Tokens/tokens.css` |
| `apps/web/app/icon.svg` | `04_App_and_Favicon/02_Favicon/favicon.svg` |

## Rules the public site follows

- **Logo.** Drawn point for point from the master artwork. Never retyped, redrawn, stretched or recolored. Carbon on light, white on Carbon, each with the Volt plane. The horizontal logo is never narrower than 140 px; below that, use the symbol.
- **Volt means one of four things:** the main action, the current state, confirmed progress, or one strategic signal. Never body text on a light surface, never a decorative background.
- **Type.** Instrument Sans for Latin, IBM Plex Sans Arabic for Arabic, IBM Plex Mono for small labels and identifiers. Arabic is never letter-spaced and is set with looser line height than Latin.
- **Layout.** Light first, Carbon for command moments, rules and whitespace before cards, asymmetry over centering.
- **Motion.** One signature gesture: text resolves along the logo's diagonal, then a short Volt signal. Everything plays once. Hover movement is 1 to 2 px. With reduced motion, nothing travels and nothing plays by itself.
- **Voice.** Sentence case, short and declarative, name the result. No "Learn more", no "unlock", no "supercharge".
- **Honesty.** No invented metrics, logos or testimonials. Sample screens are labelled as samples and use a fictional business.
- **Words.** Every word is in `apps/web/app/_site/copy.ts`, in English and Arabic. Components hold no text.

One deliberate addition: `--line-strong` in `site.css` is darker than the design system's strong border, which is only 2.1:1 on Paper and too faint for controls.

## Open before the site goes public

| Item | Owner |
|---|---|
| A contact address for "Request early access" (`NEXT_PUBLIC_ALYR_CONTACT_EMAIL`); until it is set the page says the address is being set up | Founder |
| Native review of all Arabic copy | A native reviewer |
| Check every product claim on the page against what is live (see `docs/status.md`): keeping your number, payment links through your own gateway, and the product on Meta's platform are designed and built on the simulator, not yet running live | Founder |
| Hosting for the site. Vercel's free plan forbids commercial use; Cloudflare, where the domain already is, allows it | Founder |
| Legal company name and its Arabic form, trademark clearance, privacy notice and terms pages | Founder |
| Product screens (`/whatsapp`, `/login`, `/pay`, `/s`) still use the earlier maroon styling, not ALYR tokens | Build |
