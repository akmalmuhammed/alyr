# Site audit, AX: what AI assistants and coding agents read on alyr.qa

| | |
|---|---|
| **Category** | design-brand |
| **Date** | 2026-10-24 |
| **Status** | Current |
| **Where it lives** | `docs/site-audit/03-ax.md` on main. Decisions in `00-decisions.md`, the fixes in `04-ux-build-log.md` and `05-tooling-log.md` (Linear ALY-223) |
| **Lane** | Site and brand |

## Question it answered
Two questions. Would an AI assistant reading alyr.qa come away with true facts about ALYR? And can a coding agent working on the repo tell what is live and follow the site's rules?

## Key findings
- What worked: the static HTML carries all the meaning (everything but the clock). Each page has one H1, native `<details>` questions, correct canonical and hreflang on all 14 pages, and honest meta descriptions. robots.txt lets AI user agents in.
- P0 (A1): sample numbers read as ALYR's own results. The first H2 on `/` and `/agent` was the sample dashboard ("50 orders, QAR 8,520… sales up 20%"). About 400 words of sample figures came before the "fictional bakery" caption, 20 KB later in the HTML. An assistant could say "ALYR raised a Doha bakery's sales 20%". Fix: caption first, no headings inside sample figures, and `data-nosnippet`, which Google honours for AI features.
- P0 (A2): nothing stated briefly what is true today. There was no `llms.txt`, no markdown copy and no JSON-LD. Inline React data was 61% of the homepage's 417 KB, and the product list appeared three times before the H1. The audit noted that Google says no AI text files are needed and no major assistant says it reads `llms.txt`, so the gain is uncertain but cheap.
- P0 (B1): live, branches and skills disagreed. Live ran unmerged PR #105, while main's skill still said "Payroll is listed as coming". An agent starting from main would rebuild things the 21 Oct rulings removed.
- P0 (B2): the site's honesty rules were prose, not checks. No automated test covered prices while the offer is off, AI words, "coming", Payroll or FIG captions.
- P1: no markdown twins; no structured data (it proposed Organization, WebSite, Service, FAQPage and Breadcrumb, with no prices, ratings, legal name or address before the CR); AI crawler settings in Cloudflare not verified; "ALYR Agent" sounds like AI (add "fixed, written rules… not an AI model"); sample names could read as real customers; no AGENTS.md, and CLAUDE.md lacks site rules; docs drift.
- Table of wrong conclusions an AI would draw today: "ALYR grew a bakery's sales 20%", "Qirfa Bakery uses ALYR", "ALYR Agent is an AI assistant", "ALYR Docs is available now", "Payroll is coming", "customers can pay by card".
- Appendix: a draft `llms.txt` true on 24 Oct. It says prices are not published, payment links run on a test page, samples are fictional, and the WhatsApp line is not open.
- Sources: llmstxt.org and Google Search Central (fetched), the crawler pages of OpenAI, Anthropic, Perplexity and Cloudflare (through search summaries), and trade press on Cloudflare's "Markdown for Agents".

## What we decided because of it
- The founder approved its top five on 24 Oct (`00-decisions.md`): machine-safe marking of samples and JSON-LD, built by the site agent; `llms.txt`, `llms-full.txt` and a markdown copy of each page generated at build, by the tooling agent. Honesty is unchanged: sample numbers must never read as ALYR's results "to people or to machines".
- Applied: each sample figure opens with a screen-reader caption saying the names and numbers are made up, the figures sit in `data-nosnippet` boxes, and the Agent dashboard renders no headings on the site (stage 1). JSON-LD is generated from the copy (stage 6). `llms.txt` and the markdown copies come from `scripts/site/llms.mjs` (tooling stage 5).

## What changed since, and conflicts
- The FIG captions it treats as the sample marker were replaced by the "Sample" mark in each drawing's chrome on the same day (`00-decisions.md`).
- Still for the founder: Cloudflare AI crawler settings and whether to allow training crawlers (A5).
- B1 (main behind live) has since been resolved: the PR stack, including the live commit c2998ac, is now on main. Check `docs/status.md` and `/version.txt` for what is live now.

## Use it for
- Any change to the site's machine-readable layer: JSON-LD, `llms.txt`, markdown copies, robots and crawler settings, and the honesty limits on each.
- Checking a new sample figure or number does not read as a real result.
- The "what an AI would wrongly say" table, as a regression list.
