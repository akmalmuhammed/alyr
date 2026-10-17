# Site and brand lane

**Mission.** Own what a stranger sees first: the public site, the brand rules, and how the product screens look.

Linear: label `Site and brand` under "Lane", project `Alyr Launch`. Read `docs/operating-model.md` for the rules every lane follows.

## Files this lane owns

- `apps/web/app/_site/`, `(site)/`, `(site-ar)/`
- `apps/web/app/icon.svg`, `opengraph-image.tsx`, `robots.ts`, `sitemap.ts`
- `docs/brand.md`

Anything else belongs to another lane. If a task needs it, keep the change small and say so in the pull request.

## Read before starting

1. `docs/status.md`
2. `docs/brand.md`
3. `docs/decisions.md` D-023 and D-025
4. The founder's Brand & Growth Playbook (a Claude Docs document in the founder's account; ask for access if you cannot read it)

## Now (update this section in the same pull request as the work)

Last updated 17 Oct 2026.

- **Reviewed and fixed, not merged or published (ALY-56, D-034, PR #45):** two independent critiques (`docs/site-redesign/06`, `07`) and the creative director's rulings (`08`) applied on 17 Oct: claims and Arabic fixed on the homepage and `/chat`, the fold with its gaps at the band and the closing call, a Carbon plate under the hero figure, phone crops, 320 px, dark-mode band tone, LCP 2.3 s. What was not applied and why is in `05-build-log.md`. Earlier: Product first, ten sections, one sample business (Qirfa Bakery) on every figure, the price and the money-back first month, contact by email (hello@alyr.qa) with WhatsApp and "opens soon" states built, light and dark, motion (GSAP after the load event, CSS before it). The shared header, contact section, footer and button changed on `/chat` too; `/chat`'s own sections did not. Design notes, build log and the capture script are in `docs/site-redesign/`.
- Before the new homepage can be published: the money-back terms in the customer agreement, a test mail to hello@alyr.qa from outside, the Arabic review (ALY-66), a manual check of the name Qirfa (Instagram, Google Maps, the trademark register), the founder's go-ahead.
- **Merged, not published (ALY-71):** the ALYR Chat page has a moving "how it works" figure (`FlowDiagram.tsx`: a customer's message through WhatsApp into ALYR, what ALYR does in the background, the team's screen, the reply), a list of everything built today, and a sixth demo tab for credit accounts. The homepage teaser names what the product does. The live site shows the 12 Oct version until the founder says publish.
- The site has two pages in each language: a company homepage (`/`) and the ALYR Chat product page (`/chat`), decision D-026. The R in the wordmark was redrawn on 12 Oct; the design system's master files still carry the old one.
- Two brand systems disagree and the founder has not chosen (ALY-61). Do not produce new branded material until that is decided.
- No contact method on the live page (ALY-60). Arabic unreviewed (ALY-66). No privacy or terms pages (ALY-72, Company lane).

## Next, in order

1. ALY-60 contact number and email on the site
2. ALY-66 Arabic review
3. ALY-67 product screens on the chosen look

## Never

- Redraw, retype or recolor the logo. Copy assets from the design system; never merge the branch `codex/alyr-native-foundation`.
- Put a number, client name or promise on the page that cannot be shown to be true today.
- Put words in components. Every word lives in `copy.ts`, in both languages.

## Done means

Checked on screen at phone and desktop width in both languages, lint and build pass, and the founder has approved before any deploy.
