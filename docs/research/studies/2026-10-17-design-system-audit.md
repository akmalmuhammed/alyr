# Design system audit: every token, component and rule ALYR had built

| | |
|---|---|
| **Category** | design-brand |
| **Date** | 2026-10-17 |
| **Status** | Partly superseded |
| **Where it lives** | `docs/design-system/00-audit.md` on main (written on branch `aly-design-system`, Linear ALY-126) |
| **Lane** | Site and brand |

## Question it answered
What design values, components, content rules and review steps already existed across the site, the product, the report card and the emails? How should they become one design system, held in one token file and enforced by Claude Code skills? The audit was read-only.

## Key findings
- There was no token source. Values were copied by hand into 11 places: site, drawings, Agent, four product stylesheets, the report card and the emails. Their source was a branch that must never be merged.
- Colour drift. There were 13 near-black greys where the brand names three. `--canvas` meant Paper on the site but #eceee9 in the workspace. There was an unnamed grey ramp for text on Carbon, Volt-wash alpha between .18 and .22, and status colours (ok, warn, bad, danger) that existed only in the product. One customer page used WhatsApp green, which the site rules out.
- Type drift. The three faces were loaded three ways, and the emails used Arial. There were about 25 site font sizes, a product scale of 24+ px values with half pixels, and 15 line heights each on the site and in the product.
- Motion and focus drift. `--ease` and `--spring` were different curves under the same names. There were two duration scales in one file, endless pulses in the product (against "plays once"), and three focus styles.
- The mark's polygons were copied in 7 files. There were 5 icon components with 5 stroke weights, and the workspace screens were redrawn on the site by hand. Small helpers were duplicated (initials ×4, qar ×3).
- Content rules already decided, gathered in one table: voice, who speaks, the no-AI word list, the playbook's never-say list, honesty and captions, must-not-claim, prices behind the offer switch, contact states, Arabic register, currency and digits, `<bdi>`, gender, product names, plurals, RTL marks and fictional names.
- The process that worked, run twice (homepage, suite): founder decisions, research, product truth, messaging, brief, build log, two independent critiques, rulings, then a fix pass. Product truth was the most valuable step.
- Checks and what each caught: screenshots in both languages at 1440 and 390, a 320 px overflow probe, axe-core, a direct contrast scan, Lighthouse (Performance 90 or more, LCP under 2.5 s; without compression LCP read 6.2 s), a claims pass and a name search. Ten recurring failures, each turned into a rule.
- Proposal: one DTCG token file with three tiers (primitives, semantic with light and dark, component). A Node generator would write CSS, TypeScript and Python. A drift check in CI would catch colour literals, dark-mode rules outside the tokens, off-scale values and mark copies. Nine skills (`alyr-design` plus content skills and `alyr-design-review`) and a Figma mirror.
- Three questions only the founder could answer: close ALY-61 (Carbon and Volt or cobalt); whether product buttons take the 45° notch and follow the site's theme switch; and where the master lives.

## What we decided because of it
- D-040 (17 Oct) cites this audit. It chose Carbon and Volt, put every value in `design/tokens.json`, added `scripts/tokens-build.mjs` and `scripts/design-check.mjs`, and made product screens use the same tokens and follow the site's theme switch.
- The proposed skills were built: `alyr-design`, `alyr-site-page`, `alyr-product-screen`, `alyr-whatsapp-message`, `alyr-email`, `alyr-generated-image`, `alyr-print`, `alyr-deck-and-social` and `alyr-design-review` (`brand.md`). Step 1 is logged in `docs/design-system/01-tokens-log.md`.

## What changed since, and conflicts
- **The token file landed at a different path.** It is `design/tokens.json`, not the proposed `design/tokens/alyr.tokens.json`. Exceptions live in `design/allow.json`.
- **Still open in D-040:** whether product buttons take the 45° notch, and the Arabic spelling of the name.
- **FIG captions, listed as a component and rule, were replaced** by a "Sample" mark in each drawing's chrome (founder, 24 Oct, `docs/site-audit/00-decisions.md`).
- **The product order and Payroll changed.** "Chat, Bookings, Agent, Accounts, Payroll" became Chat, Bookings, Agent, Accounts, Shelf, Docs, with Payroll off the site (D-046). That settles the conflict it flagged between D-039 and Payroll's "coming" row.
- **The verification tools moved into the repo.** shoot.mjs, axe and Lighthouse were under `C:\t\`; they moved into `scripts/site/` in the 24 Oct tooling work.
- **The audit itself never opened the codex branch's files,** so the original `tokens.css` was not compared.

## Use it for
- Understanding why `design/tokens.json`, the generator and the design check exist, and what each one replaced.
- The content-rules table, as a single list of decided writing rules with their sources.
- The recurring-failures table, before a design review.
