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

Last updated 21 Oct 2026, with the ALYR Shelf and ALYR Docs pages (ALY-205).

- **ALYR Shelf and ALYR Docs pages, built, not merged or published (ALY-205, D-046, branch `aly-shelf-documents-pages`):** `/shelf` (the Catalog's public name) and `/docs` (Documents), English and Arabic, light and dark, on `ProductKit`. Each has a signature figure in CSS only that plays once and is finished without scripts: "The last one" (two customers, one stock card, one sale) and "A payment becomes paper" (Record a payment, RC-0042 drawn along the fold's diagonal, the PDF in the chat). The paper is live HTML on new `--doc-*` tokens (`Paper.tsx`, `paper.css`), the engine's layout. New drawings: the Stock screen and its log, the order page, the Documents screen, a document's own page, the WhatsApp document bubble. Site-wide: Payroll is off the site, "Set up for you" replaces "Early access", the suite is six products, works-with rows both ways, the stale /accounts, /agent, /bookings and /chat lines, the offer-on price lines. Docs never says it is available. Spec and log in `docs/site-products-2/`. Needs the founder: publishing, the Arabic review (ALY-66), the [F] lines.

- **Design skills (PR #66):** nine Claude Code skills in `.claude/skills/` hold the brand's rules for every medium (`alyr-design` and its reference files; `alyr-site-page`, `alyr-product-screen`, `alyr-whatsapp-message`, `alyr-email`, `alyr-generated-image`, `alyr-print`, `alyr-deck-and-social`; `alyr-design-review` with prompt templates). Token names come from `design/tokens.json` (ALY-126, branch `aly-design-system`). This lane's agent and the Product agent load them. `docs/brand.md` points to them. Print, email and deck rules are derived, not yet used on a real piece.

- **One source of design tokens, built, not merged (ALY-126, D-040, branch `aly-design-system`):** the founder chose Carbon and Volt (ALY-61); the playbook's cobalt is retired. `design/tokens.json` holds every colour (light and dark), face, type scale, space, radius, rule, cut, shadow, motion value, breakpoint, z-index and focus; `scripts/tokens-build.mjs` generates the CSS, TypeScript and Python; `scripts/design-check.mjs` fails CI on a hard-coded hex colour or font name. The site, the Agent, the report card, the emails and the product screens read the tokens. The public site, the report card and the social cards are unchanged (pixel and byte comparisons); the workspace, onboarding and customer pages changed on purpose (Paper canvas, the site's dark greys, one type scale) and now follow the site's theme switch. Next: the workspace's four button systems and five icon sets, then the ratchet for sizes, radii and durations. Log in `docs/design-system/01-tokens-log.md`. The design skills that read the tokens are PR #66.
- **The real Sunday report card on the site, built, not merged or published (ALY-99, D-038, branch `aly-99-report-site`):** the 25-line drawing of the old report is gone. The homepage's step 4 and `/agent`'s report section show the report as the owner gets it: a WhatsApp message on a phone (the `/chat` drawing, light and dark) from the business's line, the API's card image (Carbon on dark, Paper on light; AVIF, WebP, PNG, lazy) and its text with WhatsApp's bold. `/agent`'s follows the Bakery / Salon / Home services switch; Arabic pages show the Arabic card. Alt text from each card's facts in `copy.ts`. Still framed as starting once WhatsApp approves its wording. One product fix is open: the engine's Arabic text needs a right-to-left mark after each bold run (the site adds it for now). Log in `docs/agent-dashboard/12-report-card-log.md`, stage 5.
- **The suite site, merged (PR #53 with PR #50, and #54), not published (ALY-99, D-037):** the homepage opens on "Your business just got an agent." (Arabic «صار لنشاطك من يتابعه عنك.»), eyebrow "ALYR · At work for you", beside the real ALYR Agent dashboard in showcase mode and a live feed of what ALYR did that afternoon for Qirfa Bakery, newest event on top so a rule line is in the first screen; a spotlight with the whole dashboard, numbered callouts and a switch to Dafira Salon or Zilal Cooling; the suite in its order with a crop of each product's real screen; by business; how it works; questions. New pages `/bookings`, `/agent`, `/accounts` (and `/ar/...`) on one product page template, which `/chat` now uses too (`ProductKit.tsx`). A Products menu in the header, the phone menu and the footer. Prices stay off (D-034); the price section and its combinations turn on with the offer switch. Every word in `copy.ts`, light and dark, 1440 to 320 px, without scripts and with reduced motion. Both reviews of 17 Oct applied with the creative director's rulings (`docs/agent-dashboard/09`, `10`, `11`): the hero now says ALYR replies and reminds and ALYR Agent shows what needs you "by rules you can check", no line reads as if card payments are live, the Sunday report is framed as starting once WhatsApp approves its wording; the hero builds in one measured order and its count only goes up; phones show the feed first; the Bookings and Credit screens are cards on phones; each English product page has its own social card. Build log, what was not applied and why, product-lane notes and open items in `docs/agent-dashboard/08-site-log.md`; the rules in `docs/brand.md`, "The suite on the site".
- **Theme switch and dark `/chat`, built, not merged or published (ALY-56, branch `aly-56-theme-switch`):** every public page has light and dark, following the device until the visitor uses a switch in the header (beside the language link; a row in the menu on phones). The choice is remembered and applied before the first paint. The new theme sweeps in along 45° from the switch. `/chat` and `/ar/chat` have a considered dark mode, with the drawn chat in WhatsApp's own dark colours. Dark tokens follow one pattern, two identical blocks (`docs/brand.md`, "Light and dark"). Build log in `docs/site-redesign/09-theme-log.md`. `/chat`'s axe result is clean only together with PR #46 (ALY-97).
- **Published 17 Oct (ALY-56, D-034, PRs #45 and #48), first reviewed and fixed:** two independent critiques (`docs/site-redesign/06`, `07`) and the creative director's rulings (`08`) applied on 17 Oct: claims and Arabic fixed on the homepage and `/chat`, the fold with its gaps at the band and the closing call, a Carbon plate under the hero figure, phone crops, 320 px, dark-mode band tone, LCP 2.3 s. What was not applied and why is in `05-build-log.md`. Earlier: Product first, ten sections, one sample business (Qirfa Bakery) on every figure, the price and the money-back first month, contact by email (hello@alyr.qa) with WhatsApp and "opens soon" states built, light and dark, motion (GSAP after the load event, CSS before it). The shared header, contact section, footer and button changed on `/chat` too; `/chat`'s own sections did not. Design notes, build log and the capture script are in `docs/site-redesign/`.
- Before the suite site can be published: PR #50 merged, the founder's go-ahead, the Arabic review (ALY-66, now about three times the Arabic), a manual check of the names Dafira Salon and Zilal Cooling as for Qirfa (renamed from Sadaf Salon and Nasma Cooling, which are too close to real businesses), a test mail to hello@alyr.qa from outside, and the same manual name check for the other sample customer names (08-site-log, open items). The hero's "it" was settled by the creative director's ruling (ALYR is the agent, ALYR Agent its screen).
- **Merged, not published (ALY-71):** the ALYR Chat page has a moving "how it works" figure (`FlowDiagram.tsx`: a customer's message through WhatsApp into ALYR, what ALYR does in the background, the team's screen, the reply), a list of everything built today, and a sixth demo tab for credit accounts. The homepage teaser names what the product does. The live site shows the 12 Oct version until the founder says publish.
- **Merged, not published (ALY-97):** accessibility fixes on `/chat` and `/ar/chat`, with no change to layout or motion. The only visible change: the statement's unlit words are darker (3.35:1 on the canvas; large text needs 3:1), the three facts under the page title are `h2` instead of `h3`, and on phones the how-it-works step buttons keep their titles as names for screen readers. axe-core finds nothing on either page at 1440 and 390 px.
- The live site has two pages in each language: a company homepage (`/`) and the ALYR Chat product page (`/chat`), decision D-026. With ALY-99 it has five (D-037). The R in the wordmark was redrawn on 12 Oct; the design system's master files still carry the old one.
- The look is decided: Carbon and Volt (D-040, 17 Oct). New branded material follows `design/tokens.json` and the design skills.
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
