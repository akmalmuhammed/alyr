# Search and AI visibility

How ALYR gets found, described correctly and contacted, in Google, in the AI assistants (ChatGPT, Gemini and Google's AI Mode, Perplexity, Copilot, Claude) and by AI agents acting for people, in Arabic and English. Decision D-056. Linear epic ALY-227 (ALY-228 to ALY-241; the monthly check is ALY-240). First audit 25 Oct 2026.

## The goal, sharpened

Not "rank across the globe". The goal is: **when an owner in Qatar, or someone asking for them from anywhere, searches or asks an AI, ALYR comes up, is described correctly, and is easy to contact.** Global visibility matters only for AI answers about Qatar asked from abroad, for investors, partners and hires, and later for the GCC. Global keywords ("WhatsApp CRM") are not a target: we would compete with Wati and respond.io for customers we cannot serve.

## Audit, 25 Oct 2026

| Area | Score | Found |
|---|---|---|
| Technical SEO | 90 | Every page open to crawlers; canonical and `hreflang` (en, ar, x-default) on every page; sitemap with both languages; real Arabic pages (`lang="ar"`, `dir="rtl"`); fast, served from Cloudflare in Doha |
| Structured data | 65 | Organization, WebSite, FAQPage, SoftwareApplication, BreadcrumbList, honest by construction. Missing then: profiles (`sameAs`), a contact point, an address (after the CR) |
| AI readiness | 65 | `llms.txt`, `llms-full.txt` and a markdown copy of each page; factual, quotable lines; GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Googlebot and Bingbot all get pages (tested by user agent; real bots are also checked by address, so the Cloudflare setting needs a look) |
| Content | 40 | Seven pages a language and their questions. No pages for what owners search, no sector pages, no original data |
| Authority | 5 | No other site mentions ALYR. A search for "alyr.qa" finds nothing about us |
| Local presence | 0 | No Google Business Profile, Maps, Bing Places or directories |
| Agentic readiness | 35 | Agents can read the site; the only way to reach us is email |
| Measurement | 5 | No Search Console or Bing verification (none in DNS), no AI visibility tracking. **29 Oct:** both verified and the sitemap submitted (ALY-228); AI visibility tracking still to do |
| **Overall** | **~35** | Technically excellent, practically invisible |

A search for "best WhatsApp ordering and booking system for small businesses in Qatar" returns LetsBot's Qatar blog posts and Take App, not ALYR.

## What works in 2026 (the research behind the plan)

- Google's AI Overviews and AI Mode cite pages that already rank. AI Mode works in Arabic across the Arab world. Classic SEO is the base.
- Each assistant cites differently: about 11% of cited domains are shared by ChatGPT and Perplexity. ChatGPT leans on encyclopaedic authority, Google's AI on forums like Reddit, Perplexity on fresh pages. Presence in many places beats one perfect page.
- Recommendations follow what other people say about you: mentions, reviews, directories, forums, press.
- Pages that answer in the first lines, with original numbers, get quoted.
- `llms.txt` does not move rankings (Google ignores it; 97% of such files get no requests). Ours stays: it costs nothing and coding agents read it.
- Cloudflare changed its defaults on 15 Sep 2026: training and agent crawlers can be blocked by default, and blocking training can block Googlebot. Check the setting.
- AI agents are starting to act for people (Gemini in Chrome). WebMCP and NLWeb are emerging, not settled: watch, don't build yet.

## The plan

| Phase | Item | Who | Linear |
|---|---|---|---|
| 0 | Search Console and Bing Webmaster Tools: verify (DNS record, or the tag this PR supports), submit the sitemap | Founder (Google and Microsoft sign-in), then product | ALY-228 |
| 0 | Cloudflare: allow search and agent crawlers in AI Crawl Control; turn on Crawler Hints (tells search engines when a page changes) | Founder or go-live | ALY-229 |
| 0 | ALYR's own WhatsApp number on the site: the contact both owners and agents can use | Founder | — |
| 0 | One identity everywhere: LinkedIn, Instagram, X, YouTube, Crunchbase with the same name, line and link; then listed in `NEXT_PUBLIC_ALYR_SAME_AS` | Founder creates; growth writes the texts | ALY-230 |
| 0 | Google Business Profile as a service-area business (no address shown); the company lane checks it is fine before the CR | Company lane, founder | ALY-231 |
| 1 | Sector pages, English and Arabic: bakeries and home kitchens, salons and barbers, groceries and baqalas, restaurants and cafés, home services, fashion and gifts. Each answers the owner's question first | Site and brand | ALY-232 |
| 1 | Owner guides, English and Arabic, answer-first and dated, from the growth plan's "Owner playbook" | Site and brand, growth | ALY-233 |
| 1 | Gulf Arabic keyword research: the words owners type, not formal Arabic | Growth | ALY-234 |
| 1 | Original data: an anonymised owner survey from the discovery visits ("how many WhatsApp messages after closing?"), with consent; a page others can cite | Customers lane | ALY-235 |
| 2 | Qatar Living and r/qatar: real answers from ALYR's account, disclosed, never spam | Growth, founder approves each | ALY-236 |
| 2 | Partner listings: payment providers' integration pages, QDB, Qatar Chamber; Meta's partner directory once Tech Provider | Company, growth (after the CR) | ALY-237 |
| 2 | Press with real news: the CR, the first shops, the survey | Growth (after the CR) | ALY-237 |
| 2 | Review sites (G2, Capterra, Product Hunt): real reviews only, after the first customers. Wikidata only once there is press | Growth | ALY-237 |
| 3 | An action agents can complete: "Book a check-up" by WhatsApp link and a simple form, labelled for machines | Site and brand | ALY-238 |
| 3 | Every ALYR shop findable by AI: a shop's public page with its own structured data (business, menu, prices), opt-in per shop; its Google Business Profile "Order" link to its ALYR page; "Ordered with ALYR" on the page | Product | ALY-239 |
| 3 | WebMCP and NLWeb: adopt when the standards settle | Product | ALY-238 |
| 4 | GCC: a global domain with country sections, or country domains, decided before the second country; secure a global name now (a purchase, the founder decides) | Founder | ALY-241 |

## Never

- Fake or paid reviews, undisclosed posts, a Wikipedia page we write ourselves.
- "AI", "smart" or "learns" about the product; prices or an offer before the CR (D-034).
- Structured data that says more than the page.

## Measuring, every month

1. Search Console (domain property `sc-domain:alyr.qa`) and Bing Webmaster Tools (verified by the `msvalidate.01` tag from the repo variable `BING_SITE_VERIFICATION`; keep it): impressions, clicks, the queries, pages indexed, in both languages. Check that the sitemap still reads without errors in both.
2. Cloudflare (business account, alyr.qa → AI Crawl Control): AI crawler visits by bot, and any "unsuccessful" requests (ClaudeBot had 2 in the first week after the move).
3. Owner conversations that began with search or an AI (ask "how did you find us?" and log it in the sales tool).
4. **The question set.** Ask each assistant (ChatGPT, Gemini or AI Mode, Perplexity, Copilot, Claude) these, in a fresh chat, and record for each: is ALYR named, is it described correctly, is a competitor named instead.

| # | English | Arabic |
|---|---|---|
| 1 | How can a small business in Qatar take orders on WhatsApp? | كيف يستقبل محل صغير في قطر الطلبات عبر واتساب؟ |
| 2 | Best WhatsApp ordering system for a bakery in Doha | أفضل نظام طلبات واتساب لمخبز في الدوحة |
| 3 | How do I reduce no-shows at my salon in Qatar? | كيف أقلل الحجوزات التي لا يحضر أصحابها في صالوني بقطر؟ |
| 4 | Booking system with WhatsApp reminders in Qatar | نظام حجوزات مع تذكير واتساب في قطر |
| 5 | How do grocery shops in Qatar track customers who buy on credit? | كيف تتابع البقالات في قطر العملاء الذين يشترون بالآجل؟ |
| 6 | Software for owner-run businesses in Qatar | برنامج للمحلات التي يديرها أصحابها في قطر |
| 7 | Who sets up WhatsApp Business API for shops in Qatar? | من يجهّز واتساب للأعمال للمحلات في قطر؟ |
| 8 | Alternatives to delivery apps for restaurants in Doha | بدائل تطبيقات التوصيل للمطاعم في الدوحة |
| 9 | What is ALYR in Qatar? | ما هي ALYR في قطر؟ |
| 10 | Is alyr.qa legit? | هل alyr.qa موثوق؟ |

Add questions as the sales tool shows how owners phrase their problems.
