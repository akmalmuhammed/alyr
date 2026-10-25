> Copied 2026-10-24 from branch origin/growth-launch-plan, docs/growth/research/04-content-design-and-production.md for the research library. Original kept. Status: Current.

# Content design and production for ALYR (research 04)

Prepared 18 Oct 2026 for the content studio. Research only: nothing was signed up for, uploaded or posted.

## How to read this report

- Every claim carries a source number, for example [S12]. The full list, with links and dates, is at the end.
- **(V)** means the claim was checked against a live page or search result on 18 Oct 2026.
- **(unverified)** means the claim comes from one weak source, sources disagree, or it is from general practitioner knowledge that could not be re-checked in this session. Treat it as a hypothesis to test, not a fact.
- The research hit the shared web-search limit before platform spec pages for X, Snapchat and Meta's Reels safe zones could be read directly. Those numbers come from third-party guides and are marked.
- Figures from vendors (TikTok, Meta, tool makers, SaaS benchmark firms) are commercially motivated. Use them for direction, then test on ALYR's own accounts.

## Summary for ALYR

1. **The format that wins for a brand like ALYR is the editorial carousel**, not the meme and not the avatar. Carousels lead Instagram engagement in Socialinsider's 2026 benchmark (0.55% average versus 0.52% for Reels) [S1] and lead most LinkedIn datasets [S3][S4]. A "working drawing" with a FIG caption is a carousel slide already.
2. **Short vertical video should be product-first and plain**: a real screen (the drawn WhatsApp chat, the dashboard) with a voiceover or a founder face, the key message in the first 3 seconds [S8], burned-in captions, and the 45° arrival as the only motion gesture. Platform data favours native, unpolished-looking creative over studio ads [S9][S10], so "precise but not slick" is the target.
3. **AI should draft, not publish.** Audiences in 2025–2026 punish content they suspect is AI-made: 73% say they would trust such an ad less [S30], and McDonald's Netherlands pulled its AI Christmas ad within three days [S33]. Use AI for scripts, hook variants, storyboards and scratch voiceovers. Keep the published visual layer code-rendered from ALYR's own tokens, where it is exact and needs no AI label.
4. **Two tool facts changed this year.** OpenAI shut down the Sora app on 26 Apr 2026 and the Sora API on 24 Sep 2026, so Sora 2 is no longer an option [S35]. HeyGen open-sourced HyperFrames under Apache 2.0, so local HTML-to-MP4 rendering costs nothing [S46].
5. **The registration gate decides the tool budget.** ALYR cannot pay for anything before the Qatar CR. Most free AI tiers forbid commercial use or add watermarks: ElevenLabs Free needs attribution and is non-commercial [S44], Kling Free is watermarked and non-commercial [S40], HeyGen Free and Runway Free are watermarked [S43][S41], and Veo 3.1 has no free API tier [S34]. Until the CR, published content should be rendered from code (Playwright, HyperFrames, Remotion), all of which are free for ALYR today [S46][S47].
6. **Design every template once, in four variants:** English and Arabic (mirrored, diagonal flipped), light and dark. Use one 1080×1440 master for Instagram and one 1080×1920 master for vertical video, with fixed safe boxes (see "Recommended template set").

---

## 1. Social design trends that perform in 2026

### 1.1 What the data says about formats

| Finding | Source | Status |
|---|---|---|
| Instagram carousels average 0.55% engagement versus 0.52% for Reels and 0.37% for single images (35M posts, 2025 data presented as 2026). A later quarterly section shows carousels 0.50%, Reels 0.48%, images 0.35%. | Socialinsider, 20 Feb 2026, with a later quarterly update [S1] | V, single vendor |
| Reels engagement fell for two quarters in a row in 2026; carousels have held first place in most quarters. | Socialinsider [S1] | V |
| Buffer's 2026 analysis of 52M posts: carousels earn 114% more engagement than single images and 12% more than Reels (cross-platform). | Buffer, via Moneris (date not shown) [S3] | unverified (secondary) |
| A 2026 LinkedIn formats study: a well-built carousel earns about eleven times more reactions than a single image. | Siècle Digital, 30 Apr 2026 [S4] | V, secondary |
| A one-person Buffer test: a week of PDF carousels gave 14,001 impressions and 381 engagements, against 5,033 and 110 for a text-heavy week. The worst carousel was the most text-heavy. | Buffer, 27 Mar 2024 [S2] | V, small sample |
| Instagram's top ranking signals are watch time, likes per reach and sends per reach. Likes weigh more with followers, sends more with non-followers. | Adam Mosseri, Jan 2025, via Social Samosa [S7] | V |
| Instagram gives a carousel a "second chance" in feed when someone scrolls past without swiping. Several guides say the re-show starts on slide 2. | Mosseri via Pulse Advertising [S5]; Planoly [S6] | Second chance V; "slide 2" unverified |
| 2026 B2B video data: 54% of companies now have in-house video teams (36% two years earlier); 62% use or plan to use AI in video. | Wistia State of Video 2026 [S12] | V |
| Long-form B2B video (30–60 minutes) shows about 23% click-through versus about 1% for clips under a minute. | Wistia CEO in DemandGen Report, 2026 [S13] | unverified (secondary Q&A) |
| A third of consumers find brands jumping on viral trends embarrassing; 27% say a trend is only worth joining in its first 24–48 hours. | Sprout Social Index 2025 [S11] | V |

**What it means:** carousels and short video both earn their place, but a small brand with a precise visual system gets the most from carousels (they reward care, and are cheap to render from code). Memes and trend formats carry a real risk of looking try-hard.

### 1.2 Trend by trend, with a verdict for ALYR

| Trend | What is happening | Verdict for ALYR |
|---|---|---|
| **Editorial carousels** | Magazine-like slides: a strong cover, one idea per slide, generous whitespace, numbered pages. Leads the format data above [S1][S3][S4]. | **Core format.** Every slide is a page from a working drawing: cover, FIG plates, a closing slide with one Volt action. |
| **Oversized type** | Design press calls bold, oversized headlines the loudest 2026 trend, often paired with contrasting weights [S57]. | **Yes**, on covers only. Instrument Sans SemiBold at display size; Arabic at the same size with looser leading, never tracked [S56]. |
| **Kinetic typography** | Text that moves with rhythm or scroll; widely used for launch teasers and UI transitions [S57]. | **Restrained yes.** Lines arrive along the 45° diagonal and settle, then one Volt signal confirms. Split by line, never by character, and never split Arabic words [S56]. |
| **UI and product-shot video ("screen recording + voiceover")** | The standard SaaS launch format. Linear hires a "motion storyteller" for product demos and social motion, to set "the benchmark for quality" [S15]. Linear's public changelog has over a thousand followers who share it with non-users [S14]. | **Core format.** Use the drawn screens, not raw screen captures, so every frame is on brand and uses the fictional sample business (Qirfa Bakery). Label samples as samples [S56]. |
| **Lo-fi phone-shot founder video vs polished** | TikTok's own research (a 2021 Lumen study) credits lo-fi ads with gains in consideration and likability, and says "lo-fi does not mean low quality" [S9]. Magna found inauthentic ads were 19% less effective at driving purchase intent [S10]. Wistia notes audiences tolerate imperfect production when the content is strong [S12]. | **Both, with roles.** Akmal on a phone, in person, for trust and sales stories (Gulf owners buy from people). Polished, code-rendered pieces for product truth. Never pass a phone clip through AI "enhancement". |
| **Data-led posts** | One number, one chart, one source line. | **Yes, carefully.** ALYR has a hard rule: no invented metrics [S56]. Use public market data with a mono source line, or ALYR's own data once it exists. |
| **Meme formats** | High reach, high risk; a third of consumers find trend-chasing embarrassing [S11]. | **Rarely.** Only in ALYR's own visual language (a drawn chat with a funny customer message), never stock meme templates. |
| **"Faceless" explainers** | Voiceover over motion graphics. YouTube stopped monetising mass-produced, repetitive content with AI voiceovers and basic slideshow visuals from 15 Jul 2025 [S28]. | **Yes, if crafted.** A faceless explainer is fine when each one is specific and drawn; a templated, AI-voiced series is exactly what platforms now demote. |
| **Split-screen** | Two panes, often "the old way / the ALYR way" or "customer phone / owner dashboard". | **Yes.** Fits the drawn-phone system. In Arabic, mirror the panes so "before" stays at the reading start. |
| **Before/after** | Classic proof format. | **Yes**, with honest samples: "before" is a real pain (a missed WhatsApp order), "after" is the product, both labelled as samples. |
| **Caption styling** | Burned-in captions are standard on muted feeds; styles range from word-by-word pop to calm subtitles. | **Calm captions:** two lines maximum, Paper text on a Carbon box, the current word or key number in Volt at most once per line. No bouncing emoji captions. |
| **Arabic and RTL social design** | Gulf brands increasingly post Arabic-first, not translated English. Tabby's Ramadan campaign with Ehsan (a donation drive with a short animation by Saudi artist Rex Chouk) is a local example of cause-led seasonal content [S19]. Tabby hires for "seasonal and cultural campaigns (such as Ramadan)" [S19]. | **Arabic is a first-class edition, not a translation.** See 1.4. |

### 1.3 Brands doing it well

The descriptions below are partly observation. Only the rows with a source were checked this session.

| Brand | What to learn | Status |
|---|---|---|
| **Linear** | Changelog as marketing: one page per release, a benefit headline, one hero image or video, polished without being over-produced [S14][S58]. A dedicated motion role for product demos and social [S15]. | V (via own blog, job post, third-party review) |
| **Ramp** | A B2B fintech that borrowed consumer tactics: a Super Bowl ad with Saquon Barkley (2024), a stunt reported at 112M social views, and a week-long brainstorm with a former MrBeast social lead [S16]. 2026 job posts focus on launches, executives' personal accounts and micro-influencers [S17]. | V (secondary case study, job posts) |
| **Nothing** | A near-monochrome system with one decorative type element (dot-matrix numerals); blunt, direct copy [S18]. Proves a strict system can still feel playful; in 2026 the brand is pushing "maximalism and personality" [S18]. | V (design summaries, LBB 2026) |
| **Vercel** | Built and open-sourced the code-rendered social card (`@vercel/og`, on top of Satori) [S49]. Its launch posts are typically black-and-white type with product shots. | Tool V; style unverified |
| **Stripe** | Editorial long-form (Stripe Press, annual letters), precise product illustrations and documentation-grade diagrams. | unverified |
| **Raycast, Arc** | Short, crisp UI videos: tight cursor paths, real keyboard sounds, one feature per clip. | unverified |
| **Notion** | Template- and use-case-led social, many creator collaborations. | unverified |
| **Apple** | "Shot on iPhone" proves user-made footage can carry a premium brand when curated tightly. | unverified |
| **Wise, Revolut** | Plain-number posts (fees, rates) and fast product-update reels; Wise's "show the real cost" honesty fits ALYR's "no invented metrics" rule. | unverified |
| **Tabby, Tamara** | Arabic-first, seasonal (Ramadan, Founding Day) content and influencer or UGC work in Saudi Arabia [S19]. | Tabby V; Tamara specifics unverified |
| **Shopify** | Merchant stories: real small-business owners on camera, which is the closest model for ALYR's customers. | unverified |

### 1.4 Arabic and RTL social design rules

From ALYR's own system [S56] plus standard RTL practice (practice items are unverified as external sources were not re-checked):

- **Mirror the whole layout, including the diagonal.** In Arabic the 45° cut and travel direction flip (`--dir` is -1). `clip-path` does not flip on its own, so templates need explicit Arabic geometry [S56].
- **Never letter-space Arabic, never set it in capitals, give it looser leading** (display 1.25, body 1.7 in the site system) [S56].
- **Isolate numbers, prices and "ALYR"** in `<bdi>` so mixed Latin and Arabic never reorder or break [S56].
- **Write Arabic natively.** A Gulf owner should read it as Gulf-friendly Modern Standard Arabic, or as Khaleeji for spoken video, not as translated English. (unverified as a performance claim; it is standard localisation practice.)
- **Choose one numeral style per piece.** Western digits (0–9) and Arabic-Indic digits (٠–٩) are both used in the Gulf; mixing them in one graphic looks careless. (unverified)
- **Render Arabic in a real text shaper.** Chromium (Playwright, HyperFrames, Remotion) shapes Arabic correctly. Satori now uses HarfBuzz, but its bidi support is simplified (see 4.1) [S48].
- **Mono labels in Arabic:** the site's FIG captions in Arabic use their own words, no capitals [S56]. IBM Plex Mono has no Arabic glyphs (unverified), so Arabic FIG captions should fall back to IBM Plex Sans Arabic at a small size.

---

## 2. Hooks and story structure

### 2.1 Short video: the first 1–3 seconds

| Principle | Evidence | Status |
|---|---|---|
| Put the key message or product in the first 3 seconds. TikTok's research found most of its highest-CTR ads did this. | TikTok Auction Ads Creative Tips [S8] | V as a TikTok statement; correlational, method not published |
| Land the hook within 6 seconds; suspense, surprise and emotion work as hook types; a narrative still matters after the hook. | TikTok ads guidance via Promptslove [S8] | V (secondary) |
| Watch time is a top Instagram ranking signal, so retention after the hook matters as much as the hook. | Mosseri, Jan 2025 [S7] | V |
| Sends per reach is Instagram's strongest predictor of reach to non-followers, so make things people forward to a friend ("send this to the shop owner you know"). | Mosseri [S7] | V |
| Pattern interrupts every few seconds and open loops ("the third reply is the one that sells") keep people watching. | Practitioner consensus | unverified |

**A structure for ALYR's 15–40 second product videos** (a hypothesis to test):

1. **0–1 s, the picture is the hook.** Open on the result, not the logo: a phone lighting up with a WhatsApp order at 11:48 pm. No intro card.
2. **1–3 s, say the problem in the customer's words** as on-screen text and voice: "You missed this order because you were asleep."
3. **3–5 s, open a loop:** "Here is what happened instead."
4. **5–25 s, show the product working** as drawn screens, one beat per 2–3 seconds, each arriving on the 45° diagonal.
5. **Last 3 s, one payoff and one Volt signal:** the confirmed order, then the end card with one action. No second call to action.

### 2.2 Carousel first slide

- **The cover is a promise, not a title.** One line, oversized, saying what the reader will get ("Three replies that close a WhatsApp order"). (practitioner consensus, unverified)
- **Make slide 2 work as a second cover**, because Instagram may re-show the post from it [S5][S6].
- **One idea per slide; less text per slide.** In Buffer's test the text-heaviest carousel did worst [S2].
- **Number the slides** (mono, "02/07") to set expectations, and end with a summary slide people can save or send [S7].
- **On LinkedIn, keep documents short:** LinkedIn's own document ads guide recommends under 10 pages [S55].

### 2.3 LinkedIn and X post structures in 2026

**LinkedIn**
- LinkedIn rebuilt its feed ranking with large language models (an engineering post of 12 Mar 2026), building on its 360Brew model, which reads the post and the member's profile together [S20]. Practitioners read this as: stay on a consistent topic that matches the poster's profile, and write for dwell time and real comments rather than bait [S20]. (Interpretation unverified.)
- SocialPilot reports no confirmed ranking change between April and September 2026 [S20].
- **A structure that fits ALYR:** a first line that names a specific owner problem; 3–6 short lines of story or proof; one takeaway; a document carousel or one drawn image; no link in the body if testing shows link posts lose reach (unverified on LinkedIn).
- Post from Akmal's personal profile first; company pages get less reach (practitioner consensus, unverified).

**X**
- X open-sourced its Grok-powered ranking code in January 2026 (github.com/xai-org/x-algorithm), with a large update on 15 May 2026; both feeds are ranked by Grok on predicted engagement [S21].
- Whether external links are penalised is disputed: some guides say yes, one reading of the code says there is no link penalty [S21]. Test it: post native media, and put links in a reply for half the posts.
- Secondary sources describe a per-creator daily cap on how often one account appears in a follower's feed [S21], which argues for fewer, better posts.

---

## 3. Producing on-brand content with AI

### 3.1 Image and video models, as of October 2026

Prices change monthly; check before buying. Status reflects what was found on 18 Oct 2026.

| Tool | Best at | Price signal | Free tier | Commercial terms | Status |
|---|---|---|---|---|---|
| **Google Veo 3.1** (Gemini API) | Short video with native audio | $0.40/s at 720p–1080p, $0.60/s at 4K; Fast $0.10–0.30/s; Lite $0.05–0.08/s. An 8 s 1080p clip costs $3.20 [S34] | None on the API [S34] | Paid API output usable commercially (Google terms not re-read) | Prices V (tracker read 13 Oct 2026) |
| **Gemini image models ("Nano Banana" family)** | Image generation and editing, good at following layouts | $0.034–0.24 per image depending on model and size; batch halves it [S36] | Not confirmed | Not re-checked | Prices V |
| **OpenAI Sora 2** | — | — | — | — | **Shut down.** App closed 26 Apr 2026, API 24 Sep 2026 [S35] |
| **OpenAI GPT Image** (gpt-image-1.5, gpt-image-2) | Text in images, edits | 1.5: about $0.034 (medium) to $0.13 (high) per 1024² image [S37]; gpt-image-2 figures conflict | No | OpenAI terms not re-read | unverified; one source says 1.5 is retired 1 Dec 2026 [S37] |
| **Kling 3.0** | Realistic motion, cheap per second | Paid from about $7–10/month; 6–30 credits per second by resolution and audio [S40] | Daily credits, 720p, watermarked, not for commercial use [S40] | Paid plans include commercial rights [S40] | unverified (resellers disagree) |
| **Runway Gen-4.5** | Controllable video, editing tools | Standard $12–15/month for 625 credits [S41] | 125 one-off credits, watermarked [S41] | Paid plans (terms not re-read) | unverified |
| **Midjourney V8.x** | Art direction, texture, mood | $10 / $30 / $60 / $120 a month [S42] | None | Paid tiers include commercial use; companies over $1M gross revenue need Pro or Mega; only Pro and up have Stealth (private) mode [S42] | V (third-party); no public API |
| **FLUX.2** (Black Forest Labs) | Open weights, local control | API: [pro] $0.03/MP, [flex] $0.05/MP, [max] $0.07/MP [S39] | [dev] is free but non-commercial; [klein] 4B is Apache 2.0 [S39] | Outputs of [dev] reportedly usable commercially, but serving the model needs a licence [S39] | V (official help page plus summaries) |
| **Ideogram** | Typography inside images | Paid from about $8–20/month; API $0.025–0.10/image [S38] | Free outputs are public [S38] | Not re-checked | unverified; versions 4.0/4.5 reported [S38] |

**Fit for ALYR:** ALYR's look is type, rules, drawn screens and two neutrals. None of these models is needed to produce it, and all of them would drift from it. Their real uses are internal: mood boards, storyboard frames, rough b-roll ideas, and testing a concept before rendering it properly in code.

### 3.2 Avatar and voice tools

| Tool | What matters | Status |
|---|---|---|
| **HeyGen** (avatars) | Free: 3 videos a month, watermarked, 720p. Creator about $24–29/month; Avatar IV reportedly 20 credits per minute [S43]. Free API credits reportedly removed in Feb 2026 [S43]. Arabic avatar quality not documented in the sources found. | unverified (sources conflict) |
| **HeyGen HyperFrames** (not the avatar product) | Open source, Apache 2.0. Renders HTML, CSS and seekable animation (GSAP, CSS, Lottie, Three.js) to MP4 frame by frame in headless Chrome, deterministically. Needs Node 22+ and FFmpeg. Local renders use no HeyGen credits [S46]. | V (GitHub, read 18 Oct 2026) |
| **ElevenLabs** (voice) | Free: 10,000 credits a month, non-commercial, attribution required. Starter ($5–6/month) is the cheapest plan with a commercial licence and instant voice cloning; Creator ($22) adds professional cloning [S44]. | V (secondary, Aug 2026) |
| **Arabic voices and Gulf dialect** | No independent test of ElevenLabs on Khaleeji Arabic was found. A Palestinian-Arabic test found v3 much better than earlier models but not proven on complex sentences, and v3 did not seem to support custom voices [S45]. A developer forum says Saudi results on v2 depend on the voice chosen and that there is no documented Saudi voice ID; users complained an Egyptian accent was wrong for Saudi and Dubai listeners [S45]. A Jan 2026 academic benchmark (Habibi) covers Saudi and UAE dialects and claims to beat "the leading commercial model" [S45]. | V for the sources; quality itself unverified |

**Recommendation on voice:** before any AI Arabic voice goes public, run a blind listening test with 3–5 Qatari or Gulf listeners: 10 real ALYR sentences, AI against Akmal's own recording. Publish the AI voice only if it is not picked out as fake. Until then, Akmal records Arabic voiceovers himself; AI voice is for scratch tracks and timing.

**Recommendation on avatars:** do not use an AI avatar of Akmal for customer-facing content. ALYR sells trust to small business owners, and audiences say they trust suspected-AI ads less [S30][S31]. A real 20-second phone clip beats a perfect avatar for this audience. (Judgement, based on the sentiment data in 3.4.)

### 3.3 Platform AI-labelling rules

| Platform | Rule | Date | Status |
|---|---|---|---|
| **Meta** (Facebook, Instagram, Threads) | Users must disclose photorealistic video or realistic-sounding audio that was digitally created or altered, using Meta's label tool; Meta may penalise non-disclosure [S22]. Meta labels AI content it detects through C2PA and IPTC signals as "AI info" [S23]. The label was renamed from "Made with AI" on 1 Jul 2024 after it hit lightly retouched photos; from 12 Sep 2024, content only edited with AI shows the label in the post menu, not on the post [S23]. Ads made with Meta's generative tools get an automatic label under "About this ad" [S24]. | 6 Feb 2024, updated 1 Apr 2025 [S22]; 5 Apr 2024, updated to 23 Oct 2025 [S23] | V |
| **TikTok** | Creators must label realistic AI-generated content (label toggle, sticker or caption); unlabelled AI content may be removed. TikTok auto-labels uploads carrying C2PA Content Credentials and attaches credentials to AI content made with its own tools [S25]. From Nov 2025, an invisible TikTok-readable watermark and a For You "AI content" slider that lets viewers see less AI [S26]. | 9 May 2024 [S25]; 20 Nov 2025 [S26] | V (secondary; TikTok's help page did not load) |
| **YouTube** | Disclose realistic altered or synthetic content (a realistic person's likeness or voice, altered real events, realistic fictional events). Exempt: scripts, ideas, captions, clearly unrealistic or animated content, colour and beauty filters. Labels sit in the description, and on the player for health, news, elections and finance; YouTube may add labels itself [S27]. From 15 Jul 2025, mass-produced, repetitive content is not monetised [S28]. | 18 Mar 2024 [S27]; 15 Jul 2025 [S28] | V |
| **LinkedIn, X, Snapchat** | Not researched in this session (search limit). LinkedIn has shown C2PA "CR" content credentials on images since 2024. | — | unverified |
| **EU AI Act, Article 50** | Deployers who publish deepfakes must disclose them; AI-written text on matters of public interest must be disclosed unless a person has editorial responsibility. Disclosure must be clear at first exposure. Applies from 2 Aug 2026 [S29]. Relevant only if ALYR targets EU audiences. | 2 Aug 2026 | V |

**What ALYR should do:** code-rendered graphics and Akmal's real footage need no label. Anything with a generated image, generated motion, a cloned or synthetic voice, or an avatar gets labelled on every platform, even when the label is optional. Keep each export's source file and tool list in the content log, so a label question can be answered later.

### 3.4 What audiences reward and punish (2025–2026)

- **Punish:** 73% say they would trust an ad less if they suspected AI made it; 63% would be less likely to buy (Harris Poll, 4As, Infillion, 24 Jun 2026) [S30]. 45% of Australians would trust a brand less if its ads were mainly AI-made, and 86% want disclosure (YouGov) [S31].
- **Softening slightly:** in the US the share "not OK" with AI in ads fell from 49% (2024) to 46% (2025) (Attest via eMarketer) [S32].
- **Public failures:** McDonald's Netherlands released an AI Christmas ad on 6 Dec 2025 and pulled it on 9 Dec after criticism of grotesque characters and colour grading [S33]. Coca-Cola's 2025 AI holiday trucks drew criticism for losing warmth, though it was not withdrawn [S33].
- **Platforms are giving viewers a "less AI" option** (TikTok, Nov 2025) [S26] and demonetising mass-produced AI channels (YouTube, Jul 2025) [S28].
- **Reward:** originality, authenticity and relatability are what consumers value most in brands on social (Sprout 2025) [S11]; native, unpolished-feeling creative beats studio ads on TikTok [S9][S10].

**Conclusion:** the "AI slop" problem is visible AI that replaces human judgement: uncanny faces, generic voices, sameness. AI that stays behind the scenes (drafting copy, generating variants that a person picks and refines) carries no visible risk.

### 3.5 Recommended workflow: AI drafts, the brand system renders

```
Brief (Akmal or growth agent)
  -> 1. Script and copy drafts (LLM): 5 hooks, 3 structures, EN and AR written separately
  -> 2. Human pick: Akmal chooses the hook and edits the Arabic himself or with a native reviewer
  -> 3. Content as data: a JSON or MDX file per post (slides, FIG captions, numbers with sources)
  -> 4. Render from code: HTML templates using the site's tokens -> Playwright PNG/PDF;
        HyperFrames or Remotion for video; same fonts, same tokens, light and dark, EN and AR
  -> 5. Automatic checks (CI): safe-zone overlay, contrast, Volt count, caption length, alt text present,
        Arabic shaping screenshot, file sizes, "SAMPLE" label on product figures
  -> 6. Human approval: Akmal sees a contact sheet of every variant; nothing posts without a yes
  -> 7. Akmal posts by hand (agents never post), logging the AI-use and label decision
```

Rules that keep the brand consistent:
- **AI never touches pixels that ship**, except with a deliberate, labelled exception approved by Akmal.
- **Tokens come from one place:** import the site's `site.css` variables into the template package, so a colour change on the site changes every social template.
- **Templates are components with slots** (cover, FIG plate, number, quote, split, end card), not free canvases. An agent fills slots; it cannot invent layouts.
- **Variation lives in content, not style:** test hooks, words and order, never colours, fonts or the diagonal.

---

## 4. Programmatic templating

### 4.1 How teams generate social graphics from code

| Method | How it works | Strengths | Limits | Fit for ALYR |
|---|---|---|---|---|
| **Satori / `@vercel/og`** | JSX and a CSS subset to SVG, then PNG via Resvg or Sharp [S48][S49] | Very fast, serverless, good for per-page link cards | Vercel's docs (16 Jun 2026) say flexbox only, no grid, TTF/OTF/WOFF only, 500 KB bundle [S49]. The current Satori README says it now lays out flex, grid and block with Taffy, shapes text with HarfBuzz and reads WOFF2, but its bidi support is simplified: no `unicode-bidi` embeddings, bracket pairs or reordering with inline elements [S48]. The two docs disagree, so `@vercel/og` may bundle an older Satori. | Keep for the site's OG cards (1200×630). Test Arabic carefully. Not for carousels. |
| **Playwright or Puppeteer screenshots** | Real Chromium renders an HTML page; screenshot to PNG or `page.pdf()` to PDF | Full CSS (grid, `clip-path`, variable fonts), correct Arabic shaping and bidi, same CSS as the site, PDF output for LinkedIn | Needs a headless browser in CI; slower than Satori | **Main still-image engine.** ALYR already uses headless Edge for site screenshots. |
| **HyperFrames** | HTML composition with timing attributes, GSAP/CSS animation, seeked frame by frame in headless Chrome, encoded with FFmpeg; Apache 2.0 [S46] | Same HTML/CSS as the stills, deterministic renders, built for coding agents, free | Young project; no release version shown on GitHub [S46] | **Default for motion** (already set up in `D:\alyr-video`). |
| **Remotion** | React components rendered to video | Mature, strong captions tooling, Lambda rendering | Free for individuals and companies with up to 3 employees; above that $25/seat/month, or $0.01 per render with a $100/month minimum [S47] | Free for ALYR now; plan the licence when the team grows past 3. |
| **Figma REST and plugin APIs** | Export nodes as PNG/SVG/PDF via `GET /v1/images` | Designers can own templates | Reading variables needs an Enterprise plan; low rate limits on Starter (reported 10 requests a minute) [S51]; ALYR's Figma Starter MCP is limited to 20 calls a month (memory note) | Use Figma as the design reference, not the renderer. |
| **Canva Bulk Create** | A design plus a CSV fills many variants | No code | Pro plan and up only ($14.99/month), desktop only [S50]; Canva's text engine and tokens are not ALYR's | Not needed. |

**Recommendation:** one template package (`templates/social`) of HTML components that import the site tokens. Render stills and PDFs with Playwright, video with HyperFrames (Remotion where its captions tooling helps). Keep Satori only for automatic link cards.

### 4.2 Platform sizes and safe zones (2026)

| Placement | Canvas | Safe area and notes | Source | Status |
|---|---|---|---|---|
| Instagram feed and carousel | **1080×1440 (3:4)** | The profile grid now crops every post to 3:4, so 3:4 is the only size the grid does not crop. Some guides still recommend 4:5 (1080×1350) with key content in the centre [S52] | O'Brien Media 25 Feb 2025; quso.ai, inmagic 2026 [S52] | V (third-party; the date of the change is disputed: Jan 2025 or Jan 2026) |
| Instagram Reels | 1080×1920 | Safe area about 996×1400; keep text out of the bottom 250 px or more (caption, audio, buttons) and the top 100–220 px [S53]. The grid cover crops to 3:4 [S52] | adaptlypost 2026; trymypost 30 Mar 2026 [S53] | unverified (guides differ) |
| Instagram Stories | 1080×1920 | Safe area about 1080×1620 (about 150 px clear top and bottom) [S53] | [S53] | unverified |
| TikTok | 1080×1920 | Right action bar 120–164 px; bottom 320–384 px (more for ads, more with long captions); top 108–150 px; left 60 px. Universal safe box about 900×1400 centred [S53] | affroom, adaptlypost, trymypost [S53] | unverified (TikTok publishes overlay files, not numbers) |
| YouTube Shorts | 1080×1920 | Safe area about 984×1500; title and subscribe button sit bottom-left [S53] | [S53] | unverified |
| YouTube thumbnail | **3840×2160 recommended**, 16:9, minimum 640 wide; JPG or PNG; 2 MB on mobile, 50 MB on desktop; needs a verified account [S54] | Shorts thumbnails: 2160×3840, 9:16, desktop Studio only [S54] | YouTube Help, read 18 Oct 2026 [S54] | V |
| LinkedIn single image | 1080×1350 (4:5) or 1200×627 | — | Practitioner standard | unverified |
| LinkedIn document carousel | PDF, **1080×1350 pages** | PDF, DOC, PPT; 100 MB max; 300 pages max; LinkedIn recommends under 10 pages; vertical, horizontal or square; all pages the same size; flatten layers [S55] | LinkedIn document ads guide, read 18 Oct 2026 [S55] | V (pixel size unverified; LinkedIn lists paper sizes only) |
| LinkedIn vertical video | 1080×1920 | Safe area about 1010×1720 [S53] | [S53] | unverified |
| X image | 1600×900 (16:9) or 1080×1080 (1:1) | X's spec page refused access (403) | — | unverified |
| Facebook Reels | 1080×1920 | Safe area about 1080×1520 [S53] | [S53] | unverified |
| Snapchat (Stories, Spotlight) | 1080×1920 | Use the universal vertical safe box; Snapchat-specific numbers not found | — | unverified |
| Link and OG card | 1200×630 | Recommended by Vercel [S49] | [S49] | V |
| WhatsApp Status and Channels | 1080×1920 | Directly relevant for a WhatsApp company; use the universal vertical safe box | — | unverified |

### 4.3 Recommended template set

Each template exists in **English and Arabic** (mirrored, diagonal flipped) and **light and dark**, so four renders per post.

**Masters**

| # | Master | Canvas | Safe box | Exports |
|---|---|---|---|---|
| M1 | **Portrait still** | 1080×1440 | Keep all type and FIG captions inside the centre 1080×1350 band (45 px top and bottom), with 72 px side margins | Instagram feed and carousel (1080×1440); LinkedIn image and PDF pages (crop to 1080×1350); Facebook |
| M2 | **Vertical video and story** | 1080×1920 | x 60–900, y 220–1540 (60 left, 180 right, 220 top, 380 bottom): about 840×1320, which sits inside every platform's reported safe area | Reels, TikTok, Shorts, Stories, Snapchat, WhatsApp Status, LinkedIn vertical |
| M3 | **Landscape** | 1920×1080 (renders 3840×2160 for thumbnails) | 96 px margins; nothing important in the bottom-right corner (YouTube timestamp) | YouTube video and thumbnail, X 16:9, LinkedIn landscape video, website |
| M4 | **Square** | 1080×1080 | 72 px margins | X, WhatsApp shares, profile-safe fallbacks |
| M5 | **Link card** | 1200×630 | 64 px margins | OG cards (Satori, existing site card) |

**Components inside the masters**

1. **Cover**: oversized headline (the promise), mono slide counter, ALYR symbol; Volt only on the one signal.
2. **FIG plate**: a drawn product screen on a Carbon plate with the 45° cut, mono FIG caption ending in a tick, "SAMPLE, FICTIONAL BAKERY".
3. **Number**: one big tabular figure, one line of context, a mono source line (never an invented number).
4. **Quote or owner voice**: an owner's words (real, with permission) in large type.
5. **Split**: before/after or customer/owner, mirrored in Arabic.
6. **Steps**: 3–5 numbered steps on solid rules; dashed rules for "coming".
7. **End card**: one action, one Volt plane, nothing else.
8. **Video lower-third and captions**: a two-line caption box inside the M2 safe box (y about 1180–1480), Paper on Carbon.
9. **Reel cover**: title placed inside the centre 3:4 crop (y 240–1680) so it reads on the grid.

**Video presets (HyperFrames)**: 15 s product beat, 30–40 s explainer, 60–90 s founder story, and a 3–5 s logo sting along the diagonal.

---

## 5. Accessibility and quality

### 5.1 Captions

- **Burn captions into every vertical video**, because most feeds start muted and platform auto-captions for Gulf Arabic are unreliable (both unverified as measured claims; widely held practice).
- **Also upload a sidecar SRT or VTT** where the platform accepts one (YouTube, LinkedIn, Facebook), for screen readers, translation and search. (unverified per platform)
- **Style:** at most two lines; about 32–42 characters a line; each caption on screen at least about 1 second; sentence case; no word-by-word bouncing. (Industry practice from broadcast guidelines such as the BBC's; the BBC page could not be fetched, so unverified.)
- **Position:** inside the M2 safe box, above the bottom UI band, never under the right-hand action bar.
- **Sound labels** for meaningful sounds ("[notification sound]"), in brackets.

### 5.2 Arabic subtitles burned in

- **Render captions in Chromium** (HyperFrames or Remotion) with IBM Plex Sans Arabic, so letters join correctly and bidi is right; check one frame at full size before every export.
- **Right-align or centre**; put punctuation at the visual left end of Arabic lines; wrap numbers, prices and Latin brand names in isolation so they do not jump. (standard RTL practice, unverified)
- **Leading about 1.4–1.7 and no tracking**, matching the site's Arabic settings [S56].
- **Allow more time per Arabic line**: Arabic lines often run shorter in characters but slower to read on video; test with native readers. (unverified)
- **Dialect:** subtitles in clear Modern Standard Arabic travel across the Gulf; speech can be Khaleeji. Decide per video and say so in the brief. (unverified)
- Netflix publishes an Arabic timed-text style guide; the page did not load this session, so its exact limits are unverified.

### 5.3 Contrast

The WCAG 2.2 thresholds are 4.5:1 for normal text, 3:1 for large text and for UI or graphic signals (W3C; known standard, not re-fetched). Contrast values below were calculated with the WCAG formula from ALYR's colours [S56]:

| Pair | Ratio (calculated) | Rule |
|---|---|---|
| Volt `#B7F34A` on Paper `#f6f7f3` | about 1.2:1 | **Never** for text or thin lines; Volt is only a filled plane on light |
| Volt on dark canvas `#0e1012` | about 14:1 | Fine for text and signals in dark |
| Carbon or near-black text on a Volt plane | about 14:1 | Fine: put dark text on Volt, never Volt text on light |
| Light-mode focus green `#6a9320` | — | Use this, not Volt, for thin signals on light [S56] |

Add an automatic contrast check to the template build (axe-core on the HTML before screenshot, as the site already does) [S56].

### 5.4 Alt text and post copy

- **Write alt text for every image** where the platform allows it (Instagram, LinkedIn, X, Facebook). Describe what the drawing shows and its key words, and say "sample screen". (Instagram's alt-text help page did not load; feature availability per format unverified.)
- **Carousels:** one alt text per slide, written from the same content file that renders the slide, so it is never forgotten.
- **Arabic posts get Arabic alt text.**
- **Keep the meaning in the caption, not only in the image**, so the post still works for screen readers and in feed previews.
- **Hashtags in CamelCase** (#WhatsAppForBusiness) so screen readers say them correctly. (standard practice, unverified)

### 5.5 Quality checks before Akmal approves

1. Every element inside the safe box (render the overlay on a proof copy).
2. Contrast passes; Volt used once, for one of its four meanings [S56].
3. Arabic version written, reviewed by a native reader, mirrored, joined letters checked at 100%.
4. Light and dark both rendered.
5. Product figures labelled as samples; no invented numbers, logos or testimonials [S56].
6. Captions burned in and a sidecar file ready; alt text written.
7. AI use logged; label decision made per platform (3.3).
8. File size and format within each platform's limits (for example YouTube thumbnail 2 MB on mobile) [S54].

---

## 6. Open questions and next checks

- Read the official X, Snapchat, Meta Reels and TikTok overlay specs directly (blocked this session by the search limit or a 403).
- Run the Gulf Arabic voice listening test before any AI voice is published.
- Check whether `@vercel/og` in ALYR's Next.js version bundles the Satori with HarfBuzz and grid, then test an Arabic link card.
- Test on ALYR's own accounts: link in body versus link in reply on LinkedIn and X; carousel length 5 versus 8 slides; founder clip versus drawn explainer.
- Confirm Instagram's current 3:4 grid date and whether 3:4 uploads display uncropped in feed on all devices.
- Once the CR exists, decide on one paid voice tool (ElevenLabs Starter is the cheapest with a commercial licence [S44]) and one image model for internal drafts.

---

## Sources

Dates are publication dates where shown; "read" means the date the page was checked.

- [S1] Socialinsider, "2026 Instagram Organic Benchmarks", 20 Feb 2026, with a later quarterly update; read 18 Oct 2026. https://www.socialinsider.io/blog/instagram-benchmarks/
- [S2] Buffer, "I Posted LinkedIn Carousels for a Week", 27 Mar 2024. https://buffer.com/resources/linkedin-carousels-experiment/
- [S3] Moneris, "Why you need carousels for your social posts", citing Buffer's 2026 analysis; date not shown. https://www.moneris.com/en/blog/posts/growth-strategy/why-you-need-carousels-for-your-social-posts
- [S4] Siècle Digital, "Cette étude révèle les formats qui performent vraiment sur LinkedIn en 2026", 30 Apr 2026. https://siecledigital.fr/2026/04/30/cette-etude-revele-les-formats-qui-performent-vraiment-sur-linkedin-en-2026/
- [S5] Pulse Advertising, on Mosseri and carousel reach; date not shown. https://www.pulse-advertising.com/?p=18822
- [S6] Planoly, "Instagram Carousels Are Making a Comeback"; date not shown. https://planoly.com/blog/instagram-carousels-are-making-a-comeback
- [S7] Social Samosa, "Instagram reveals key factors for boosting reach", Jan 2025. https://www.socialsamosa.com/news-2/instagram-reveals-key-factors-for-boosting-reach-8646916
- [S8] TikTok, "Auction Ads Creative Tips" (PDF, undated) https://ads.tiktok.com/business/library/Auction_Ads_Creative_Tips.pdf ; commentary: Promptslove, "50 TikTok Hooks", undated. https://promptslove.com/blog/tiktok-hooks/
- [S9] TikTok for Business, "Performance Fundamentals" (cites a 2021 Lumen study); undated. https://ads.tiktok.com/business/en/blog/tiktok-fundamentals-unlock-full-potential-tiktok-advertising
- [S10] Magna, "Entertaining and authentic TikTok ads perform best with consumers"; date not shown. https://magnaglobal.com/entertaining-and-authentic-tiktok-ads-perform-best-with-consumers/
- [S11] Sprout Social press release on the 2025 Sprout Social Index, 2025. https://sproutsocial.com/insights/press/the-days-of-trend-chasing-are-over-new-research-from-sprout-social-reveals-a-third-of-consumers-think-jumping-on-viral-trends-is-embarrassing-for-brands/
- [S12] Wistia, "Key takeaways from Wistia's 2026 State of Video webinar", 2026. https://wistia.com/learn/marketing/state-of-video-webinar-recap
- [S13] DemandGen Report, "Wistia's Chris Savage on why long-form B2B video is winning", 2026. https://www.demandgenreport.com/industry-news/feature/wistias-chris-savage-on-why-long-form-b2b-video-is-winning-the-demandgenreport-com-qa/53634/
- [S14] Linear, "Startups write changelogs"; date not shown. https://linear.app/blog/startups-write-changelogs
- [S15] Linear, "Motion Storyteller" job listing, 2026. https://jobs.accel.com/companies/linear/jobs/48458808-motion-storyteller
- [S16] Vendry, Ramp case study; about 2024. https://vendry.beehiiv.com/p/ramp
- [S17] Ramp, "Social Media Lead" job listing, 2026. https://jobs.generalcatalyst.com/companies/ramp-2/jobs/92631783-social-media-lead
- [S18] HSE Design, "What is Nothing: communication theory" https://hsedesign.ru/project/what-is-nothing-communication-theory-b028d7ccf6ae46a685ded3dcd536c9b7 ; LBB Online, "Nothing is on a mission to bring maximalism and personality to tech", 2026 https://lbbonline.com/news/Nothing-Is-on-Mission-to-Bring-Maximalism-and-Personality-to-Tech ; Notebookcheck on the logo tease https://www.notebookcheck.net/Nothing-teases-a-rebrand-as-it-unveils-a-new-logo.1208270.0.html
- [S19] Campaign Middle East, "Tabby brings financial freedom in Ramadan"; year not shown. https://campaignme.com/tabby-brings-financial-freedom-in-ramadan/
- [S20] PPC Land, "LinkedIn rebuilds its feed from scratch with LLMs and GPU-powered ranking", Mar 2026 https://ppc.land/linkedin-rebuilds-its-feed-from-scratch-with-llms-and-gpu-powered-ranking/ ; AI Engineer World's Fair 2025, "360Brew" talk https://www.ai.engineer/talks/U0S6CfzAY5c-360brew-llm-based-personalized-ranking ; SocialPilot, "LinkedIn algorithm 2026 (September)" https://www.socialpilot.co/?p=694640
- [S21] Towards AI, "X open-sourced its feed algorithm powered by Grok", 2026 https://pub.towardsai.net/x-open-sourced-its-feed-algorithm-powered-by-grok-e5a13d67e741 ; SocialPilot, "How the X algorithm works in 2026" https://socialpilot.co/blog/twitter-algorithm ; repository https://github.com/xai-org/x-algorithm
- [S22] Meta, "Labeling AI-generated images on Facebook, Instagram and Threads", 6 Feb 2024, updated 1 Apr 2025; read 18 Oct 2026. https://about.fb.com/news/2024/02/labeling-ai-generated-images-on-facebook-instagram-and-threads/
- [S23] Meta, "Our approach to labeling AI-generated content and manipulated media", 5 Apr 2024, updates 10 May 2024, 1 Jul 2024, 12 Sep 2024, 23 Oct 2025; read 18 Oct 2026. https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/
- [S24] Social Media Today, "Meta adds updated disclosure tags for AI-generated ads"; date not shown. https://socialmediatoday.com/news/meta-adds-updated-disclosure-tags-for-ai-generated-ads/824658
- [S25] NBC News, "TikTok will automatically label AI-generated content", 9 May 2024. https://www.nbcnews.com/tech/tech-news/tiktok-will-automatically-label-ai-generated-content-rcna151446
- [S26] Storyboard18, "TikTok introduces controls to let users adjust volume of AI-generated content", 20 Nov 2025 https://www.storyboard18.com/digital/tiktok-introduces-controls-to-let-users-adjust-volume-of-ai-generated-content-84502.htm ; TechSpot https://www.techspot.com/news/110315-sick-ai-slop-feed-tiktok-finally-you-turn.html
- [S27] YouTube Official Blog, "How we're helping creators disclose altered or synthetic content", 18 Mar 2024; read 18 Oct 2026. https://blog.youtube/news-and-events/disclosing-ai-generated-content
- [S28] The Week, "YouTube rolls out new rules to curb AI content", 10 Jul 2025. https://www.theweek.in/news/sci-tech/2025/07/10/youtube-rolls-out-new-rules-to-curb-ai-content-who-is-affected-and-who-is-safe.amp.html
- [S29] EU AI Act, Article 50 (applies 2 Aug 2026); read 18 Oct 2026. https://artificialintelligenceact.eu/article/50/
- [S30] Marketing Brew, Harris Poll, 4As and Infillion on AI fatigue, 24 Jun 2026; read 18 Oct 2026. https://www.marketingbrew.com/stories/harris-poll-ai-fatigue-less-trust-ai-generated-ads-cannes-lions
- [S31] YouGov, "45% of Australians say AI-generated ads would make them trust a brand less"; 2026. https://yougov.com/articles/54818-45-of-australians-say-ai-generated-ads-would-make-them-trust-a-brand-less
- [S32] eMarketer, "Many US adults avoid, distrust brands that use AI ads" (Attest 2025 data). https://www.emarketer.com/content/many-us-adults-avoid-distrust-brands-that-use-ai-ads
- [S33] The Star (Kenya), "McDonald's pulls AI Christmas ad after backlash", 10 Dec 2025 https://www.the-star.co.ke/news/world/2025-12-10-mcdonalds-pulls-ai-christmas-ad-after-backlash ; Storyboard18, Dec 2025 https://www.storyboard18.com/brand-marketing/mcdonalds-pulls-ai-generated-christmas-ad-in-the-netherlands-after-online-backlash-85723.htm ; DesignRush on consumer AI fatigue https://news.designrush.com/mcdonalds-holiday-ad-backlash-consumer-ai-fatigue
- [S34] BenchLM, "Veo 3.1 API pricing", prices read from Google 13 Oct 2026 https://benchlm.ai/media-pricing/veo ; Google, Gemini API pricing https://ai.google.dev/gemini-api/docs/pricing
- [S35] The Decoder, "OpenAI sets two-stage Sora shutdown with app closing April 2026 and API following in September", Mar 2026 https://the-decoder.com/openai-sets-two-stage-sora-shutdown-with-app-closing-april-2026-and-api-following-in-september/ ; Engadget https://engadget.com/ai/openai-is-shutting-down-its-sora-video-generation-app-211023358.html ; BenchLM archived Sora prices (read 11 Sep 2026) https://benchlm.ai/media-pricing/sora
- [S36] BenchLM, "AI media pricing" (Gemini image models read 6–13 Oct 2026). https://benchlm.ai/media-pricing
- [S37] AIReiter, "GPT Image 1.5 API pricing", 2026 https://aireiter.com/blog/gpt-image-1-5-api-pricing ; Unifically, "GPT Image 2" https://unifically.com/de/blogs/gpt-image-2
- [S38] Krea, "What is Ideogram AI: features, pricing and alternatives in 2026" https://www.krea.ai/blog/what-is-ideogram-ai-features-pricing-and-alternatives-in-2026 ; costbench https://costbench.com/software/ai-image-generators/ideogram
- [S39] Black Forest Labs help, "Welcome to the forest" https://help.bfl.ai/articles/7424166364-wip-welcome-to-the-forest ; InVideo, "Flux 2 and Flux Kontext explained", Aug 2026 https://invideo.io/blog/flux-ai-image-generator/
- [S40] Hooked, "Kling AI pricing 2026" https://www.hooked.so/compare/kling-ai-pricing ; CloudZero, "Kling AI pricing" https://www.cloudzero.com/blog/kling-ai-pricing/ ; Shhots https://shhots.ai/blog/kling-ai-pricing/
- [S41] Magic Hour, "Runway Gen-4.5 pricing (2026)" https://magichour.ai/blog/runway-gen-45-pricing ; Creatify, "Runway pricing (2026)" https://creatify.ai/blog/runway-pricing-(2026)-plans-credits-and-what-you-ll-actually-pay
- [S42] AI Productivity, "Midjourney pricing 2026" https://aiproductivity.ai/pricing/midjourney/ ; Tool Directory, reviewed 10 Aug 2026 https://tooldirectory.ai/tools/midjourney-research-lab
- [S43] Costbench, "HeyGen free plan 2026" https://www.costbench.com/software/ai-video-generators/heygen/free-plan/ ; Arcade, "HeyGen pricing in 2026" https://www.arcade.software/post/heygen-pricing
- [S44] BIGVU, "ElevenLabs pricing 2026" https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs/ ; CASRAI, pricing compared (verified Aug 2026) https://casrai.org/guides/murf-play-ht-wellsaid-labs-pricing-compared
- [S45] Salah Adawi, "Generating Palestinian Arabic TTS", Medium https://medium.com/@salahadawi/generating-palestinian-arabic-text-to-speech-tts-salah-adawi-c6b4aaa827c3 ; Vapi support, "Arabic dialects" https://support.vapi.ai/t/27085893/arabic-dialects ; "Habibi: unified-dialectal Arabic speech synthesis", arXiv, Jan 2026 https://www.arxiv.org/abs/2601.13802
- [S46] HeyGen, HyperFrames repository, read 18 Oct 2026 https://github.com/heygen-com/hyperframes ; Noqta, "HeyGen HyperFrames", 2026 https://noqta.tn/en/blog/heygen-hyperframes-html-to-mp4-ai-agent-video-2026
- [S47] Remotion, license pricing (official), read via search 18 Oct 2026. https://www.remotion.dev/docs/license/pricing
- [S48] Vercel, Satori README, read 18 Oct 2026. https://github.com/vercel/satori
- [S49] Vercel, "Open Graph (OG) image generation", last updated 16 Jun 2026. https://vercel.com/docs/og-image-generation
- [S50] Canva pricing (plan comparison snapshot 15 Sep 2026). https://www.canva.com/en_gb/pricing/
- [S51] Figma REST API reference (third-party mirror). https://cdn.jsdelivr.net/npm/figma-code-agent@1.0.2/knowledge/figma-api-rest.md
- [S52] O'Brien Media, "Instagram's January 2025 image size change", 25 Feb 2025 https://obrienmedia.co.uk/?p=145850 ; quso.ai, "Instagram thumbnail size: a 2026 guide" https://quso.ai/blog/instagram-thumbnail-size ; inmagic, "Instagram post size guide 2026" https://inmagic.ai/instagram-post-size/
- [S53] AdaptlyPost, "Social media safe zones 2026" (undated) https://adaptlypost.com/blog/social-media-safe-zones-2026-complete-guide ; TryMyPost, "Social media safe zones and templates: 2026 guide", 30 Mar 2026 https://www.trymypost.com/blog/social-media-safe-zones-templates-2026 ; Affroom, "TikTok safe zone" https://affroom.com/blog/tiktok-safe-zone/
- [S54] YouTube Help, "Add video thumbnails", read 18 Oct 2026. https://support.google.com/youtube/answer/72431
- [S55] LinkedIn Marketing Solutions, "Document ads" ads guide, read 18 Oct 2026. https://business.linkedin.com/marketing-solutions/success/ads-guide/document-ads
- [S56] ALYR internal, `docs/brand.md` (rules as of 17 Oct 2026). `D:\alyr whatsapp\docs\brand.md`
- [S57] Digital Synopsis, "Graphic design trends 2026" https://digitalsynopsis.com/design/graphic-design-trends-2026/ ; G2 Learn, "Top 9 graphic design trends to watch in 2026" https://learn.g2.com/graphic-design-trends
- [S58] ProductLift, "15 best changelog examples from top SaaS companies". https://www.productlift.dev/blog/best-changelog-examples/
