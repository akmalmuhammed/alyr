# Content design and production: formats, hooks, AI tools, templates and sizes (research 04)

| | |
|---|---|
| **Category** | social |
| **Date** | 2026-10-18 |
| **Status** | Current |
| **Where it lives** | Copy: `docs/research/sources/growth-launch-plan/research/04-content-design-and-production.md` (research library, copied 24 Oct 2026). Original: branch `origin/growth-launch-plan`, `docs/growth/research/04-content-design-and-production.md` (commit 6d1c8d5, 18 Oct 2026, ALY-69). Not merged |
| **Lane** | Growth |

## Question it answered
How should ALYR design and produce social content in 2026: which formats and trends to use, how to hook viewers, how far to use AI, how to render posts from code, and which sizes, safe zones, captions and contrast rules to follow? Written for the content studio. Some platform spec pages could not be read, so those numbers come from third-party guides and are marked.

## Key findings
- **The editorial carousel is ALYR's best format**, not memes or avatars. Instagram carousels average 0.55% engagement vs 0.52% for Reels and 0.37% for single images (Socialinsider, 35M posts). Carousels also lead most LinkedIn datasets; one study found a well-built LinkedIn carousel earns about 11x the reactions of a single image (Siècle Digital, Apr 2026). In a Buffer test, the most text-heavy carousel did worst.
- **Short video should be product-first and plain**: a real or drawn screen, the key message in the first 3 seconds (TikTok's ad research), burned-in captions, and one motion gesture. TikTok's research credits lo-fi ads with gains in consideration; Magna found inauthentic ads were 19% less effective. A third of consumers find brands jumping on viral trends embarrassing (Sprout 2025).
- **A 15 to 40 second video structure to test:** 0 to 1 s the result as the hook (no logo intro), 1 to 3 s the problem in the customer's words, 3 to 5 s an open loop, 5 to 25 s the product working, last 3 s one payoff and one action.
- **AI drafts, it does not publish.** 73% would trust an ad less if they suspected AI made it and 63% would be less likely to buy (Harris Poll, 24 Jun 2026). McDonald's Netherlands pulled its AI Christmas ad after three days (Dec 2025). Use AI for scripts, hook variants and storyboards. Render the visuals that ship from code, which needs no AI label.
- **Tools changed in 2026.** OpenAI shut the Sora app (26 Apr 2026) and API (24 Sep 2026). HeyGen open-sourced HyperFrames (Apache 2.0) for free local HTML-to-MP4 rendering. Remotion is free up to 3 employees. Veo 3.1 costs $0.40 a second at 1080p with no free API tier.
- **The registration gate sets the tool budget.** Most free AI tiers forbid commercial use or add watermarks: ElevenLabs Free, Kling Free, HeyGen Free and Runway Free. ElevenLabs Starter ($5 to 6 a month) is the cheapest voice plan with a commercial licence, for after the CR.
- **Arabic voice.** No independent test of AI voices in Gulf Arabic was found. Recommendation: a blind test with 3 to 5 Gulf listeners before any AI Arabic voice goes public, and no AI avatar for customer-facing content.
- **AI labels.** Meta, TikTok and YouTube require labels on realistic AI video or audio. YouTube exempts animation and AI-assisted scripts. The EU AI Act Article 50 applies from 2 Aug 2026 (only relevant for EU audiences).
- **Rendering from code.** Playwright for stills and PDFs (full CSS, correct Arabic shaping), HyperFrames for motion, Satori only for link cards (its bidi support is simplified). Figma is the design reference, not the renderer (Starter plan limits).
- **Sizes.** Instagram's grid crops to 3:4, so the still master is 1080×1440 with type inside the centre 1080×1350. Vertical master 1080×1920 with a safe box about 840×1320 (60 px left, 180 right, 220 top, 380 bottom). LinkedIn documents should stay under 10 pages (LinkedIn guide). Link cards 1200×630. YouTube thumbnails 3840×2160.
- **Quality rules.** Captions burned in, at most two lines, plus a sidecar file where accepted. Arabic mirrored, never letter-spaced, numbers isolated, rendered in Chromium. Volt on Paper is about 1.2:1, so it is never used for text on light. Alt text for every image.

## What we decided because of it
- Nothing yet. It fed the unmerged growth plan's look, production engine and AI policy.

## What changed since, and conflicts
- The tool and platform facts still hold as of 18 Oct 2026. AI tool prices change monthly, so check them before buying.
- Its design rules follow the Carbon and Volt look, which matches D-040.
- The founder replaced FIG captions with a single "Sample" mark (brand.md, 24 Oct). The source's FIG plate and caption components need updating to that mark. Its "SAMPLE, FICTIONAL BAKERY" label still fits the idea.
- It recommends the founder's face and voice for trust and sales stories. That conflicts with D-043 (on branch `origin/company-introduction`, not merged): no founder face on the site, deck or profiles. Code-rendered pieces and a real voice that is not the founder's would fit both.

## Use it for
- Read the full source before building social templates, choosing AI tools, setting video sizes and safe zones, writing captions or Arabic subtitles, or deciding whether a post needs an AI label.
