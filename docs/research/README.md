# Research library

Every study ALYR has done on marketing, sales, growth, customers, design and social media,
in one place. Before this library they were spread over Claude Docs, unmerged branches, a
separate video folder and loose files on the laptop (collected 24 Oct 2026, ALY-225).

**Start with [current-truth.md](current-truth.md).** The studies disagree with each other
(price, headline, target customer, founder on screen); that page says which answer stands
today and lists what the founder still has to settle.

## How it is organised

| Folder | What is in it |
|---|---|
| [current-truth.md](current-truth.md) | Today's answer on each topic, the source that decides it, and open conflicts |
| [studies/](studies/) | One card per study: question, key findings, decisions it led to, what changed since, where the full source lives. Template: [studies/_TEMPLATE.md](studies/_TEMPLATE.md) |
| [sources/](sources/) | Full copies of research that existed only off `main` (an unmerged branch, the video studio folder, a text export), so it cannot be lost. Each copy says where it came from |

Full sources that stay where they are:
- **Claude Docs and artifacts** (the founder's claude.ai account; private links in each card).
  The card holds the findings, so the repo does not depend on the link.
- **The repo itself**: `docs/site-redesign/`, `docs/agent-dashboard/`, `docs/site-products-2/`,
  `docs/site-audit/`, `docs/design-system/`, `docs/decisions.md`, `docs/brand.md`, and the
  design rules in `.claude/skills/alyr-*`.

## Rules (also in docs/hygiene.md)
1. **A new study gets a card the same day**, in `studies/`, from the template, then
   `python docs/research/build_index.py` to refresh the table below.
2. **A study done outside the repo** (a Claude Doc, an artifact, a file) is carded with its
   link; if it may disappear, its text is copied to `sources/`.
3. **When a decision overrides a study**, update the card's Status and "What changed since",
   and `current-truth.md`, in the same pull request as the decision.
4. **No personal data in cards or sources**: no real names of customers or prospects, phone
   numbers, ID numbers or registration papers. Fictional demo names are fine.
5. **Never present a superseded study as current** in a site page, deck, post or brief.
   Check `current-truth.md` first.

## Studies

<!-- INDEX:START -->
53 studies. Status: **Current** is in force; **Partly superseded** still has useful parts; **Superseded** is history; **Draft** waits on a decision.


### Strategy and company plans (7)

| Date | Study | Status |
|---|---|---|
| 2026-10-20 | [Alyr payment layer: analysis and strategy](studies/2026-10-20-payment-layer-strategy.md) | Draft (not yet decided) |
| 2026-10-19 | [Solution maps: proven revenue models and a network strategy](studies/2026-10-19-solution-maps.md) | Draft (not yet decided) |
| 2026-10-19 | [WhatsApp and small business revenue models: global study](studies/2026-10-19-whatsapp-revenue-models-global.md) | Draft (not yet decided) |
| 2026-10-17 | [ALYR Agent: the numbers it can compute today (data inventory)](studies/2026-10-17-agent-dashboard-data-inventory.md) | Partly superseded |
| 2026-10-16 | [ALYR company master plan (linked document is empty)](studies/2026-10-16-company-master-plan.md) | Draft (not yet decided). Not assessed: the document at the link holds no text |
| 2026-10-11 | [Qatar go-to-market and scale plan (restaurants first, 18 months)](studies/2026-10-11-qatar-go-to-market-scale-plan.md) | Partly superseded |
| 2026-10-09 | [First business plan (written under the old name BuildStack, for construction software)](studies/2026-10-09-first-business-plan-construction.md) | Superseded |

### Marketing: positioning, messaging, films (13)

| Date | Study | Status |
|---|---|---|
| 2026-10-24 | [ALYR films: the creative brief (prompt)](studies/2026-10-24-films-brief.md) | Draft (not yet decided) |
| 2026-10-24 | [ALYR films: creative direction](studies/2026-10-24-films-creative-direction.md) | Draft (not yet decided) |
| 2026-10-24 | [Hero film draft, "The other job" (repo file)](studies/2026-10-24-hero-film-draft.md) | Draft (not yet decided) |
| 2026-10-24 | [The Other Job (hero film storyboard)](studies/2026-10-24-hero-film-the-other-job.md) | Draft (not yet decided) |
| 2026-10-24 | [ALYR films: the October product films and the 24 Oct creative direction](studies/2026-10-24-video-studio-films-direction.md) | Draft (not yet decided) |
| 2026-10-20 | [ALYR Shelf and ALYR Docs: messaging for the two product pages](studies/2026-10-20-shelf-docs-messaging.md) | Partly superseded |
| 2026-10-20 | [ALYR Shelf and ALYR Docs: product truth for the public pages](studies/2026-10-20-shelf-docs-product-truth.md) | Current |
| 2026-10-19 | [How ALYR introduces itself (company introduction)](studies/2026-10-19-company-introduction.md) | Partly superseded |
| 2026-10-18 | [ALYR launch videos: the video studio plan](studies/2026-10-18-video-studio-launch-plan.md) | Partly superseded |
| 2026-10-17 | [ALYR Agent dashboard and product pages: pattern research](studies/2026-10-17-agent-dashboard-research.md) | Partly superseded |
| 2026-10-17 | [ALYR suite messaging: homepage and the Bookings, Agent and Accounts pages](studies/2026-10-17-agent-suite-messaging.md) | Partly superseded |
| 2026-10-16 | [Homepage messaging and conversion, with the competitor scan](studies/2026-10-16-homepage-messaging-and-competitors.md) | Partly superseded |
| 2026-10-16 | [Product truth for the homepage redesign: what is built and what may be claimed](studies/2026-10-16-homepage-product-truth.md) | Partly superseded |

### Sales: pricing, offer, demos, onboarding clients (4)

| Date | Study | Status |
|---|---|---|
| 2026-10-23 | [Client onboarding plan](studies/2026-10-23-client-onboarding-plan.md) | Partly superseded |
| 2026-10-20 | [Alyr self-serve onboarding audit](studies/2026-10-20-self-serve-onboarding-audit.md) | Partly superseded |
| 2026-10-19 | [Demo shops and five-minute walk-throughs for sales visits](studies/2026-10-19-demo-shops-walkthroughs.md) | Current |
| 2026-10-17 | [Customer agreement notes: what ALYR may not do before its commercial registration](studies/2026-10-17-customer-agreement-registration-limits.md) | Current |

### Growth: channels, content plans, expansion (6)

| Date | Study | Status |
|---|---|---|
| 2026-10-25 | [Keyword map: the words owners in Qatar use, in Gulf Arabic and English](studies/2026-10-25-keyword-map-qatar-owners.md) | Current |
| 2026-10-20 | [Global expansion plan: companies, markets, rules and stages for selling outside Qatar](studies/2026-10-20-global-expansion-plan.md) | Draft (not yet decided) |
| 2026-10-20 | [Growth and content playbook: evidence-graded tactics, ethical game mechanics and a waitlist content plan](studies/2026-10-20-growth-content-playbook.md) | Partly superseded |
| 2026-10-20 | [Selling across the GCC from Qatar](studies/2026-10-20-selling-across-gcc-from-qatar.md) | Draft (not yet decided) |
| 2026-10-18 | [Growth and content plan, version 1 (launch social, content and growth plays)](studies/2026-10-18-growth-and-content-plan.md) | Partly superseded |
| 2026-10-18 | [Who scaled small-business products through content and organic growth, and how (research 02)](studies/2026-10-18-who-scaled-and-how.md) | Current |

### Customers: segments, sectors, markets (4)

| Date | Study | Status |
|---|---|---|
| 2026-10-19 | [Coverage map: what each sector needs and what ALYR has](studies/2026-10-19-coverage-map.md) | Partly superseded |
| 2026-10-19 | [Go-to-market: priority businesses, their tech stack and the solution map](studies/2026-10-19-priority-businesses-tech-stack.md) | Partly superseded |
| 2026-10-18 | [Qatar and the GCC: marketing channels, advertising rules and competitors' social presence (research 03)](studies/2026-10-18-qatar-gcc-market-channels-rules-competitors.md) | Current |
| 2026-10-18 | [Sector playbooks for seven business categories](studies/2026-10-18-sector-playbooks.md) | Partly superseded |

### Design and brand: look, site, audits (14)

| Date | Study | Status |
|---|---|---|
| 2026-10-24 | [Site audit, AX: what AI assistants and coding agents read on alyr.qa](studies/2026-10-24-site-audit-ax.md) | Current |
| 2026-10-24 | [Site audit, DX: how safely a person or an agent can change the public site](studies/2026-10-24-site-audit-dx.md) | Current |
| 2026-10-24 | [Site audit, UX: small text, page length and the path to the action](studies/2026-10-24-site-audit-ux.md) | Current |
| 2026-10-23 | [ALYR homepage, reimagined: your business's tech partner](studies/2026-10-23-homepage-reimagined-tech-team.md) | Current |
| 2026-10-22 | [Alyr homepage improvement table](studies/2026-10-22-homepage-improvement-table.md) | Partly superseded |
| 2026-10-22 | [Alyr homepage and product pages audit](studies/2026-10-22-homepage-product-pages-audit.md) | Partly superseded |
| 2026-10-20 | [ALYR Shelf and ALYR Docs: visual direction](studies/2026-10-20-shelf-docs-visuals.md) | Partly superseded |
| 2026-10-20 | [alyr.qa Site Audit](studies/2026-10-20-site-audit.md) | Partly superseded |
| 2026-10-17 | [Design system audit: every token, component and rule ALYR had built](studies/2026-10-17-design-system-audit.md) | Partly superseded |
| 2026-10-16 | [Homepage design research: patterns, sections and art direction](studies/2026-10-16-homepage-design-research.md) | Partly superseded |
| 2026-10-11 | [alyr Brand & Growth Playbook](studies/2026-10-11-brand-growth-playbook.md) | Partly superseded |
| 2026-10-11 | [alyr Brand Sheet](studies/2026-10-11-brand-sheet.md) | Superseded |
| 2026-10-11 | [Design system v1.0 (codex branch): brand foundation and social rules](studies/2026-10-11-design-system-v1-codex.md) | Superseded |
| 2026-10-11 | [alyr Homepage (cobalt draft)](studies/2026-10-11-homepage-draft-cobalt.md) | Superseded |

### Social media and decks (5)

| Date | Study | Status |
|---|---|---|
| 2026-10-24 | [ALYR Content Design Playbook](studies/2026-10-24-content-design-playbook.md) | Draft (not yet decided) |
| 2026-10-24 | [Slides and social posts: the current rules (alyr-deck-and-social skill)](studies/2026-10-24-deck-and-social-rules.md) | Current |
| 2026-10-18 | [Content design and production: formats, hooks, AI tools, templates and sizes (research 04)](studies/2026-10-18-content-design-and-production.md) | Current |
| 2026-10-18 | [First content drafts: Phase 1 calendar, founder posts and video scripts](studies/2026-10-18-growth-content-drafts-phase1.md) | Draft (not yet decided) |
| 2026-10-18 | [How each social platform distributes content in 2026 (research 01)](studies/2026-10-18-platform-mechanics-2026.md) | Current |
<!-- INDEX:END -->
