# Design system v1.0 (codex branch): brand foundation and social rules

| | |
|---|---|
| **Category** | design-brand |
| **Date** | 2026-10-11 |
| **Status** | Superseded |
| **Where it lives** | Copies in `docs/research/sources/design-system-v1-codex/` (7 files). Originals on branch `origin/codex/alyr-native-foundation`, `ALYR_Main/ALYR_Design_System/01_Brand_Foundation/` (Brand_Strategy, Color_System, Typography, Imagery_and_Art_Direction, Voice_and_Messaging, Fonts/README) and `05_Social_Media/Social_Usage_Rules.md`. Never merge that branch |
| **Lane** | Site and brand |

## Question it answered
What is ALYR's brand: its strategy, colours, type, imagery, voice and social rules? This was the first design system, made before the WhatsApp product was the focus.

## Key findings
- Strategy: the category was "digital transformation, AI-enabled operations and business systems". The promise was "Transform the business. Not just the interface." The vision was the GCC's most trusted transformation partner for ambitious businesses.
- Audiences: GCC founders and family groups with several companies, CEOs and COOs, growth-stage firms, service businesses, and government-adjacent or regulated organisations. These are much larger than today's owner-run shops.
- Personality: precise not cold, premium not ornamental, decisive not aggressive, ambitious not hyperbolic. Message order: outcome, then method, then proof, then technology.
- Colour: Carbon #15171A, Volt #B7F34A, Mist #E9ECEF, Concrete #A7ADB5, plus interface neutrals (canvas #F6F7F3, dark canvas #0E1012, Graphite #2A2E33, muted text #5F666D). Volt means only four things: the main action, the current state, confirmed progress and one short highlight. A composition guide of 70% neutral, 20% Carbon, 8% Mist and Concrete, and 2% Volt. Product-only status colours: success #2D7D46, warning #A96400, danger #B42318, info #1769AA, never shown by colour alone.
- Type: Instrument Sans Variable, IBM Plex Sans Arabic and IBM Plex Mono (mono only for IDs, times and metadata). An 11-step scale from Display 72/44 px to Metadata 12 px. Body at least 16 px. Lines up to about 68 characters. Tabular figures in tables. The wordmark is vector art and is never retyped. Fonts are self-hosted with their licence files.
- Imagery: documentary photos of real work in Qatar and the GCC, and diagrams built from the Command Fold geometry. Avoid robots and "AI future" visuals, handshakes, gradients and glass, skyline clichés, and screenshots with client data.
- Voice: "a senior operating partner", calm, specific and candid. Name the result and use active voice. Calls to action like "Start a transformation audit" and "Book a working session"; avoid "Learn more", "Unlock", "Supercharge". Arabic is written natively in MSA and reviewed by a person.
- Social: the same Carbon avatar with the Command Fold everywhere, and never the wordmark in a circle. Three post formats (point of view, operating model, proof). Sizes 1080×1080, 1080×1350, 1080×1920 (250 px safe margins) and 1200×627. Carbon and monochrome cover 90% of the field, with Volt on the key idea. No emoji strings or hashtag blocks.

## What we decided because of it
- D-025 (11 Oct): the site used the playbook's words on this system's look.
- D-040 (17 Oct): the look stays. That means uppercase ALYR, the Command Fold logo, Carbon, Volt, Paper, the three faces and the 45° cut. The playbook's cobalt identity was retired.
- Its colour values were copied by hand into `site.css` and then into `design/tokens.json`, which is now the source (`brand.md`).

## What changed since, and conflicts
- **The files are superseded; the look is not.** `design/tokens.json` and the `alyr-design` skills now hold every value and rule (D-040, ALY-126). The design-system audit (17 Oct) never compared these files with the tokens.
- **Logo:** the founder had the R redrawn on 12 Oct (full stem, chamfered bowl, tighter counter). The master SVGs on this branch, and everything made from them (cards, letterhead, social covers), still have the old R. The new R needs a designer's proof before print or a trademark filing (`brand.md`).
- **Strategy and audience** are replaced. The category "AI-enabled" and "AI where it creates leverage" conflict with D-035 and D-047: nothing says or implies AI. The large-company and government audiences conflict with D-043 and D-048: every owner-run business, and ALYR as the small business's tech team. The positioning and voice now come from the founder's playbook (D-040).
- **Calls to action:** "Start a transformation audit" has a close successor in "Book a check-up" (D-048).
- **Small changes:** Mist is not a token today. Product status colours exist as `ok`, `warn` and `bad` in the tokens. The type scale was replaced by the site's fluid scale and the product's one px scale (D-040).
- **Still close to current rules:** Volt's four meanings, the imagery "avoid" list, the social sizes and the "never retype the wordmark" rule.

## Use it for
- History of where the Carbon and Volt look came from.
- Social profile and post sizes, as a starting point for the `alyr-deck-and-social` skill. Check against current platform specs.
- Finding the original logo masters (old R) on the branch, when they are regenerated.
