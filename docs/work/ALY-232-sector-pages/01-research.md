# Research: sector pages and owner guides

Short on purpose: the visibility plan (`docs/growth/visibility.md`, 25 Oct 2026) did the
search research. This file adds what the pages need and what to avoid. "Read" means a
documented source; "seen" means seen on other sites; "reasoned" means our own reading.

## Patterns

| # | Pattern | Kind | Why | ALYR's version |
|---|---|---|---|---|
| 1 | The owner's question as the H1, the answer in the next two or three sentences | Read (visibility plan: "pages that answer in the first lines get quoted"; Google AI Overviews cite pages that already rank) | Assistants and search snippets lift the first paragraph | H1 "How a bakery in Qatar can take WhatsApp orders without losing them", then a three-sentence answer before anything else |
| 2 | A page per audience that names the audience in the address and title | Seen (software sites' "for restaurants" pages) | Owners search by their trade, in their trade's words | `/for/bakeries`, title "WhatsApp orders for bakeries in Qatar · ALYR" |
| 3 | The problem in the customer's own words before the product | Read (`docs/company/introduction.md`, the sector openers) | An owner recognises the day before believing the fix | "Your day today": four lines in the second person, from the openers; the homepage's day split drawing |
| 4 | Product by product, what it does for this trade, only what is built | Reasoned (`alyr-design/honesty.md`) | A sector page is where claims creep | One row per product with one sentence and a link to its page |
| 5 | Questions with FAQPage markup | Read (site's structured data; Google shows FAQ rich results only for health and government sites, so the value is for assistants, not snippets) | Assistants quote question-answer pairs | Four or five questions per page, from what an owner of that trade asks |
| 6 | Guides that help without the product, dated, with an author | Read (Google's Article structured data guide, updated 8 Sep 2026: `headline`, `datePublished`, `dateModified` with time zone, `author` as Person or Organization with `name` and `url`, `image` that represents the article) | Useful pages earn links and mentions, the biggest gap in the audit (Authority 5) | Three guides, "In short" in the first 100 words, steps that work with the WhatsApp Business app or a notebook, then "With ALYR" last |
| 7 | Breadcrumbs that match the address | Read (schema.org BreadcrumbList, already on product pages) | Search shows the path; visitors climb back | ALYR / By business / Bakeries; ALYR / Guides / title |
| 8 | Markdown copies and `llms.txt` entries | Read (visibility plan: costs nothing, coding agents read it) | Agents read text, not drawings | A copy per page, the sample figure as one labelled line |

## Things to avoid

- Numbers we do not have: "owners lose 30% of orders", "cuts no-shows by half". None.
- Testimonials or "bakeries in Doha use ALYR": no business uses ALYR yet.
- A second slogan per page (content audit pattern 2): the H1 is a plain question turned into a statement.
- Questions outside the Questions section (pattern 4), colon reveals in labels (6), filler (8).
- Competitors by name, delivery apps by name.
- Health, clinics, treatments.
- WhatsApp's logo or green on ALYR's surfaces; "official partner".
- A guide that is an advert: the product comes last, once.
- Keyword stuffing in Arabic; Gulf keyword research is ALY-234 and has not been done, so the
  Arabic uses plain MSA with the words the site already uses (`arabic.md`).

## Sources

- `docs/growth/visibility.md` (branch `aly-visibility`, PR #123), 25 Oct 2026.
- `docs/company/introduction.md` (branch `company-introduction`), 19 Oct 2026.
- Google Search Central, "Article (Article, NewsArticle, BlogPosting) structured data", last updated 8 Sep 2026, read 25 Oct 2026.
- `docs/growth/plan.md` (branch `growth-launch-plan`), "Owner playbook" pillar.
