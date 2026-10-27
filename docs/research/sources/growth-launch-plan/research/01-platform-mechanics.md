> Copied 2026-10-24 from branch origin/growth-launch-plan, docs/growth/research/01-platform-mechanics.md for the research library. Original kept. Status: Current.

# Research 01: how each platform distributes content in 2026

Growth lane, 18 Oct 2026. Compiled from 4 research passes run in parallel; each keeps its own sources, dates and limits. The shared web-search budget ran out partway through every pass, and Reddit and X could not be read, so facts marked **unverified** need checking before they are quoted. `docs/growth/plan.md` uses what is here.

---

## Instagram and Threads

Most of the core facts trace back to primary sources: Meta's ranking system cards, Meta Newsroom, Instagram's creator site and Meta's help pages. Some items could only be traced to secondary sources; I've marked those **unverified**.

**Two gaps:** the shared web-search budget (200 calls per turn, across all agents) ran out partway through. After that I could only open URLs I already had. So three Instagram items went unresearched: the best Reel length, captions/subtitles, and Stories benchmarks beyond one Buffer figure. Threads posting times and frequency also went unresearched, and the Threads items listed under "Unverified" at the end could not be checked. You can raise `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` or send a follow-up to continue.

---

### INSTAGRAM

#### 1. What Instagram itself says about ranking

**Top signals, January 2025.** Mosseri said "the top three signals that matter most for ranking are watch time, likes and sends." He told creators to track average watch time, likes per reach and sends per reach. He also said "likes are slightly more important for connected content, and sends are slightly more important for unconnected content." Connected means followers; sends matter more for reaching new people. [Social Media Today, "Instagram shares algorithm insights", https://www.socialmediatoday.com/news/instagram-shares-algorithm-insights-2025/738034/, 22 Jan 2025]

- The popular claim that sends weigh "3–5x likes" has no Instagram source. **Treat it as unverified.** [dataslayer.ai summary of conflicting attributions, https://www.dataslayer.ai/blog/instagram-algorithm-2025-complete-guide-for-marketers, updated 2026]

**Each surface has its own ranking (Meta system cards).**
- **Reels.** The system predicts several things:
  - Whether you watch less than 3 seconds. Inputs include how many viewers watched at least 3 seconds and how often the Reel was skipped within 2 seconds.
  - Whether you watch more than 95% of a Reel, compared with Reels of the same length.
  - Whether you comment, reshare, share off Instagram, follow the author or use the audio.
  - The card does not mention originality or watermarks.
  [Meta Transparency Centre, Instagram Reels Chaining system card, https://transparency.meta.com/features/explaining-ranking/ig-reels-chaining/, updated 11 Nov 2025]
- **Recommended posts in Feed.** One input is "post informativeness", meaning an LLM assesses content quality. Others are time spent in Reels, profile clicks, comments, and audio-on behaviour. [Meta Transparency Centre, IG Feed Recommendations system card, https://transparency.meta.com/features/explaining-ranking/ig-feed-recommendations/, updated 29 Jun 2026]
- Separate cards exist for Feed, Stories, Explore, Search, Suggested Accounts, Notifications and Comments. [Meta Transparency Centre index, https://transparency.meta.com/features/explaining-ranking/, accessed 18 Oct 2026]
- Hootsuite's summary of those cards says Explore predicts following the creator, viewing for at least 5 seconds and finishing 95% of a video. [Hootsuite, "Instagram algorithm tips for 2026", https://blog.hootsuite.com/instagram-algorithm/, 15 Jul 2026]

**Small creators.** Instagram's February 2025 ranking update aims to "give creators of all sizes a way to break through." Distribution is based on how content performs, not on follower count. [Instagram Creators blog, https://creators.instagram.com/blog/helping-creators-of-all-sizes-break-through, 26 Feb 2025]

**Originality rules.**
- **April 2024:**
  - When identical copies exist, only the original is recommended. Copies get a label linking to the original.
  - Accounts that repeatedly post others' content without materially changing it are dropped from recommendations.
  - Content must have "no visible watermarks" to be eligible.
  [Instagram Creators, "Helping Creators Find New Audiences", https://creators.instagram.com/recommendations-and-Originality, 30 Apr 2024]
- **30 April 2026 (new):** the rule now covers photos and carousels, not just Reels.
  - Followers still see an aggregator's posts. The account loses recommendations across the app.
  - Watermarks, speed changes and screenshots with credit do not count as original.
  - Commentary, humour, voiceover and creative edits do count.
  [TechCrunch, https://techcrunch.com/2026/04/30/instagram-restricts-reach-of-content-aggregators-in-new-crackdown/, 30 Apr 2026]
  - One outlet says eligibility comes back after posting mostly original content for 30 days. **Unverified.** [WebProNews, https://www.webpronews.com/instagrams-aggregator-purge-original-creators-gain-ground-as-repost-empires-crumble/, 2026]
- **Watermarks:** your own logo is fine; a TikTok, CapCut or Canva logo reduces reach. This comes from a Mosseri clip. [Social Media Today, https://www.socialmediatoday.com/news/instagram-clarifies-including-your-own-logo-on-a-reel-is-ok/730852/, 2024]

**Trial Reels.**
- Rolled out 10 December 2024. A trial Reel is shown to non-followers first. Metrics arrive in about 24 hours. You can then share it to followers, or let Instagram share it automatically if it performs well within 72 hours. [TechCrunch, https://techcrunch.com/2024/12/10/instagram-rolls-out-trial-reels-that-arent-shown-to-a-creators-followers/, 10 Dec 2024; Instagram Creators, https://creators.instagram.com/blog/instagram-trial-reels]
- Trial Reels can now be scheduled. [Social Media Today, https://www.socialmediatoday.com/news/instagram-allows-creators-to-schedule-trial-reels/816549/, 2026]
- Eligibility sources disagree. Instagram's Reels page says you need a professional account. Social Media Today says 1,000+ followers and a public account. [creators.instagram.com/reels vs SMT above]
- A cap on trial Reels per 30 days was added in 2026; Metricool's tracker gives no exact number. [Metricool, https://metricool.com/instagram-news/, 16 Oct 2026]

**Format and product changes**

| Change | Date | Source |
|---|---|---|
| Carousels up to 20 items, up from 10 | 8 Aug 2024 | [MobileSyrup, https://mobilesyrup.com/2024/08/08/instagram-20-photos-videos-single-post/] |
| Reels up to 3 minutes, up from 90 seconds | Jan 2025 | [Engadget, https://www.engadget.com/social-media/instagram-swoops-in-with-3-minute-reels-and-rectangular-profile-grids-as-the-tiktok-ban-gets-real-201316339.html] |
| Profile grid switched to rectangles, same announcement | Jan 2025 | [Business Today, https://www.businesstoday.in/technology/news/story/instagram-head-announces-big-changes-3-minute-reels-and-new-look-for-profile-grid-461527-2025-01-21, 21 Jan 2025] |
| Public posts from professional accounts (18+) indexable by Google and Bing by default, with an opt-out. Stories and Highlights not indexed. | 10 Jul 2025 | [PPC Land, https://ppc.land/instagram-content-becomes-searchable-on-google-starting-july-10/; Metricool, https://metricool.com/instagram-indexing-on-google/] |
| Google Search Console gained Instagram reporting; open to all accounts 29 Jul 2026 | 7 Jul 2026 | [Keywords Everywhere tracker citing Google Search Central, https://keywordseverywhere.com/news/instagram-algorithm-updates/, checked Sep 2026] |
| Hashtags capped at 5 per post or Reel (tests in 2025 had gone as low as 3) | 18 Dec 2025 | [Social Media Today, https://www.socialmediatoday.com/news/instagram-implements-new-limits-on-hashtag-use/808309/, 18 Dec 2025] |
| Reposts, Friends Map and Friends tab | 6 Aug 2025 | [Keywords Everywhere tracker citing Meta Newsroom] |
| "Your Algorithm" in Reels: US first, then global English | 10 Dec 2025 | [GSMArena, https://m.gsmarena.com/instagram_now_lets_you_see_and_control_your_algorithm-news-70654.php] |
| "Your Algorithm" in Explore | Apr 2026 | [Keywords Everywhere] |
| "Your Algorithm" in the main Feed | 10 Jun 2026 | [Keywords Everywhere citing SMT; The Next Web, https://thenextweb.com/news/instagram-your-algorithm-central-experience-mosseri, 28 Jun 2026] |

- **Instagram's statement on the hashtag cap:** fewer, targeted hashtags "can improve both your content's performance and people's experience."
- **Mosseri on hashtags:**
  - They "don't work" to increase reach.
  - Later the same year: they don't boost visibility, but they help say what a post is about.
  [same SMT article]
- **Your Algorithm** lets users pick topics, not accounts. One tracker dates the Reels launch to October 2025 instead; the dates conflict.
- **iPad app:** listed in Metricool's 2025 tracker, but the page gives no exact date. [Metricool, https://metricool.com/instagram-news/]

**Other 2026 changes**
- **Instagram for TV:** Fire TV in the US from 16 Dec 2025; expanded 22 Jun 2026. [Meta Newsroom, https://about.fb.com/news/2025/12/instagram-for-tv/; https://about.fb.com/news/2026/06/instagram-for-tv-gets-bigger-with-new-ways-to-watch-together/]
- **Instants** (disappearing photos), 13 May 2026. [Meta Newsroom, https://about.fb.com/news/2026/05/instants-share-in-the-moment/]
- **Meta One** subscription, 15 Sep 2026:
  - Prices: Essential from $14.99, Advanced from $49.99, Expert from $149, Max from $499.
  - Advanced and above can put **clickable links in organic posts and Reels**. Advanced allows 4 posts plus 4 Reels a month, Expert 8 + 8, Max 12 + 12. Essential gets a verified badge and a link page with up to 20 links.
  - Meta says plans are "available globally", but its help page says it is in limited testing and "not available everywhere yet." Whether Qatar has it is **unverified**.
  [Meta Newsroom, https://about.fb.com/news/2026/09/introducing-meta-one-subscription-service-more-features-ai/, 15 Sep 2026; Meta Help, https://www.meta.com/help/subscriptions/960854640235758/]
- **Mosseri's ranking principles video, September 2026:** originality, recency, reaching non-followers with small creators' posts, and larger ranking models. The details are reported only second-hand. **Unverified.**
- **Chronological feed:** in September 2026 Mosseri argued against dropping ranking and said very few Australian users choose the chronological feed. [Social Media Today, https://www.socialmediatoday.com/news/instagram-chief-warns-against-eliminating-algorithms/830130/, Sep 2026]
- **Metricool's 2026 tracker** also lists:
  - a Reels-first feed test
  - Insights redesigned to show share rate and skip rate
  - per-slide carousel captions
  - Mosseri saying scheduling Reels doesn't hurt reach
  - Mosseri saying long captions don't affect reach
  The page gives no exact dates for these. [Metricool, https://metricool.com/instagram-news/, 16 Oct 2026]
- **Skip Rate** in Insights counts people who scroll away within 3 seconds. This is the official hook metric. [Metricool tracker, 2025 section]

#### 2. Independent data

**Engagement by format.**

*Socialinsider* (35M posts, 447,613 pages; engagement measured per follower) [https://www.socialinsider.io/blog/instagram-benchmarks/, 20 Feb 2026, updated with Q3 2026 data]:

| Format | 2025 | Q3 2026 |
|---|---|---|
| Carousels | 0.55% | 0.50% |
| Reels | 0.52% | 0.48% |
| Images | 0.37% | 0.35% |

- At 1–5K followers, average views per post: carousels 993, Reels 580, images 417.
- Brands post about 8 Reels, 5 carousels and 7 images a month.
- Follower growth for 1–5K accounts fell from 38% to 22% between 2024 and 2025.

*Buffer* (engagement measured per reach) [Buffer, https://buffer.com/resources/data-best-content-format-social-media/, 19 Mar 2026; https://buffer.com/resources/state-of-social-media-engagement-2026/, 5 Mar 2026]:

| Format | Median engagement rate |
|---|---|
| Carousels | 6.9% |
| Stories | 5.1% (small sample, n=520) |
| Images | 4.4% |
| Reels | 3.3% |

- Reels reach 1.36x as many people as carousels and 2.25x as many as images (data from Jan 2022–Oct 2024).
- Instagram's median engagement fell from 7.3% in 2024 to 5.4% in 2025.
- Replying to comments goes with about 21% more engagement.

*Metricool* (24.4M posts, 375K accounts, Jan–Feb 2025 vs Jan–Feb 2026) [https://metricool.com/press-release-instagram-study-2026/, 16 Jun 2026]:
- Reels get more than 4x the interactions of single images.
- Carousels get 9x the saves of single images.
- Single-image reach fell 21.96% year on year.
- Average Reel watch time rose to 8.5 seconds.
- Posts with at least one hashtag got 31.7% fewer views. This is a correlation, not proof that hashtags hurt.
- Questions go with 36.7% more comments.
- Only 21% of accounts under 10K followers grew.
- Most views arrive within 3 days.

**Where the sources disagree:** they measure engagement differently (per follower vs per reach). All of them rank carousels first for engagement. Reels lead on reach, and on interactions in Metricool's data.

**Posting frequency (Buffer, about 2.1M posts from 102K accounts; feed posts only, Stories excluded).** Compared with 1–2 posts a week, reach per post was:
- about 12% higher at 3–5 posts a week
- about 18% higher at 6–9
- about 24% higher at 10+

Buffer calls 3–5 posts a week the sweet spot; gains shrink above that. [Buffer, https://buffer.com/resources/how-often-to-post-on-instagram/, 13 Aug 2025]

**Best times. These are all audience-dependent, and the sources disagree:**
- Buffer (9.6M posts): Thursday 9am, Wednesday 12pm, Wednesday 6pm. Wednesday is the best day. [https://buffer.com/best-time-to-post-on-instagram, 2026]
- Hootsuite (1M+ posts): for example Monday 3–9pm, Wednesday 5pm. [https://blog.hootsuite.com/best-time-to-post-on-instagram, 14 Jul 2026]
- Sprout (about 2B engagements): Tuesday–Wednesday midday to evening; weekends weakest. [https://sproutsocial.com/insights/best-times-to-post-on-instagram/, updated Mar 2026]
- None of them uses Gulf time zones or Gulf audiences. Use your own Insights.

**Not covered because the search budget ran out:** best Reel length, captions/subtitles data, and Stories benchmarks beyond Buffer's 5.1%. Mosseri's Reels basics list "3 minutes or less" and captions. [Hootsuite, 15 Jul 2026]

#### 3. Specs for 2026

- **Feed portrait:** 1080x1350 (4:5). [Buffer, https://buffer.com/resources/instagram-image-size/, 2026]
- **Grid:** shows thumbnails at 3:4. Sprout recommends uploading at 1080x1440. Sprout's own text also lists 1080x1350 as "3:4", which is a mistake. [Sprout, https://sproutsocial.com/insights/social-media-image-sizes-guide/, 15 Oct 2026]
- **Square:** 1080x1080. **Landscape:** 1080x566. **Profile photo:** 320x320. [Buffer]
- **Reels and Stories:** 1080x1920 (9:16).
  - Keep the top 14% (about 250px) and bottom 20% (about 340px) clear of text. [Sprout]
  - Buffer says about 250px top and bottom.
  - Stories safe area is 1080x1610. [Sprout]
- **Carousels:** 20 items; the first image sets the crop. [Sprout; Buffer]
- **Reels:** 3 to 180 seconds when posted. [Metricool tracker 2026, Reels guide]
- **Hashtags:** 5. [SMT, 18 Dec 2025]
- **Caption length (2,200 characters):** long-standing limit, **not re-verified this session.**

#### 4. Penalties and what isn't eligible for recommendation

Instagram lists content that stays on the platform but is not recommended. The ones relevant to a business account are [https://creators.instagram.com/recommendations-and-Originality, 30 Apr 2024]:
- clickbait and engagement bait
- low-quality or repurposed content
- visible watermarks
- exaggerated health claims
- misleading business models
- regulated products
- political or social-issue content

You can check status, appeal, and see whether repeated violations have made the whole account ineligible in Account Status. [Instagram Help, https://help.instagram.com/539126347315373]

**Links:**
- No clickable caption links unless you pay for Meta One Advanced or above.
- Bio links, Story link stickers and DMs stay free. [Meta Help, above; ValueYourNetwork, https://www.valueyournetwork.com/en/meta-one-business-links/, 2026]

**AI content:**
- Meta reads C2PA and IPTC "AI-generated" metadata.
- Users **must** disclose photorealistic video or realistic audio that was digitally created or altered. Meta "may apply penalties" if they don't.
- [Meta Newsroom, https://about.fb.com/news/2024/02/labeling-ai-generated-images-on-facebook-instagram-and-threads/, 6 Feb 2024, updated 1 Apr 2025]
- The visible "AI info" label name was not confirmed on that page.
- **31 August 2026:** profiles that feature an AI-generated person must use the "AI-generated profile" label. If not, they lose recommendations. Using AI only for editing or graphics is exempt. [MediaNews4U, https://www.medianews4u.com/instagram-renames-ai-creator-label-to-ai-generated-profile-limits-reach-of-unlabelled-ai-profiles/, 1 Sep 2026; Implicator, https://www.implicator.ai/instagram-will-cut-the-reach-of-ai-personas-that-skip-its-new-label/]

---

### THREADS

**How it ranks (Meta system card).**
- Three stages: gather posts from accounts you follow plus some public posts, look at signals, then rank by predicted value to you.
- What it predicts:
  - likes and replies
  - clicks on the post or the author's profile
  - time on the post and on its own page
  - scrolling past without engaging
- Inputs include past engagement over 1 hour to 84 days, like-to-impression ratio, and engagement by viewer country.
- "Following" view: only accounts you follow, newest first.
- [Meta Transparency Centre, https://transparency.meta.com/features/explaining-ranking/ig-threads-feed/, updated 7 Mar 2025]
- Reposts are not listed as a prediction on the card.

**Users.**

| Figure | Date | Source |
|---|---|---|
| 320M monthly users | Jan 2025 | [TechCrunch, https://techcrunch.com/2026/01/21/threads-rolls-out-ads-to-all-users-worldwide/] |
| 350M monthly users | Apr 2025 | [same] |
| 400M+ monthly users | Aug 2025 | [TechCrunch, https://techcrunch.com/2025/08/12/threads-now-has-more-than-400-million-monthly-active-users/] |
| 500M monthly users | 16 Jun 2026 | [Meta Newsroom, https://about.fb.com/news/2026/06/meta-launching-new-features-500-million-monthly-threads-users/] |

- **Daily users (Similarweb):** Threads 141.5M on mobile vs X 125M. On the web X is far ahead, about 145M daily visits vs 8.5M. [TechCrunch, https://techcrunch.com/2026/01/18/threads-edges-out-x-in-daily-mobile-users-new-data-shows/, 18 Jan 2026]

**Features.**
- **Post length and text attachments (4 Sep 2025):**
  - Posts are 500 characters.
  - You can attach up to 10,000 characters of formatted text.
  - Links show "prominently" in the attachment. Meta says to put the link in the post body.
  - Attachments are not indexed by Google.
  [Meta Newsroom, https://about.fb.com/news/2025/09/attach-text-threads-posts-share-longer-perspectives/; TechCrunch, https://techcrunch.com/2025/09/04/threads-challenges-x-by-offering-free-support-for-up-to-10k-characters-plus-prominent-links/]
- **DMs (1 Jul 2025):**
  - 18+ only; not end-to-end encrypted.
  - Group chats of up to 50 and EU availability added 15 Oct 2025.
  - Message requests have links disabled.
  [Meta Newsroom, https://about.fb.com/news/2025/07/introducing-messaging-highlighted-perspectives-threads/; TechCrunch, https://techcrunch.com/2025/07/01/threads-gets-its-own-dms-as-app-distances-itself-from-instagram/]
- **Communities:**
  - Launched 2 Oct 2025 with 100+ topics. Meta creates them; users can't.
  - They build on topic tags, which have no "#".
  - 200+ topics by 15 Dec 2025.
  - Out of beta 16 Jun 2026.
  [Meta Newsroom, https://about.fb.com/news/2025/10/introducing-threads-communities-find-your-people/; TechCrunch, https://techcrunch.com/2025/10/02/threads-takes-on-x-with-new-communities-feature/]
- **Feed controls:**
  - "Dear Algo" (11 Feb 2026): changes your feed for 3 days. US, UK, Australia and New Zealand only. [https://about.fb.com/news/2026/02/threads-dear-algo/]
  - "Your Algo" (Jun 2026): adds Canada. [Meta Newsroom, Jun 2026]
- **Ads:**
  - Tests in the US and Japan began Jan 2025.
  - Global advertisers from Apr 2025.
  - All users worldwide from 21 Jan 2026.
  - Formats: image, video (including 4:5) and carousel.
  [TechCrunch, 21 Jan 2026]
  - Advertisers no longer need a linked Instagram account (2026). [Metricool tracker]

**Benchmarks vs X (Buffer).**
- Median engagement in 2025: Threads about 3.6% (down 18%), X about 2.5–2.8% (up 44%).
- Replying goes with **42% more engagement on Threads**, the largest effect of any platform; X is +8%.
- [Buffer, https://buffer.com/resources/state-of-social-media-engagement-2026/, 5 Mar 2026]
- By format: video 5.55%, images 4.55%, text 2.79%, **links 2.34% (lowest)**. [Buffer, https://buffer.com/resources/data-best-content-format-social-media/, 19 Mar 2026]

**Unverified:**
- Whether Threads downranks links. I found no statement from Threads either way. Buffer's data only shows link posts get the least engagement.
- One topic tag per post.
- Arabic interface and availability in Qatar or MENA. Local Communities launched only for Japan, Korea and Taiwan, and the feed controls are English-market only.
- Media specs (number of items, video length).
- Best posting times and frequency for Threads.

---

### Takeaways for ALYR (B2SMB, Qatar)

1. **Use carousels to teach and Reels to reach new people.** A how-to carousel ("5 WhatsApp replies that save a shop 2 hours a day") gets the most engagement and saves. Short Reels find new owners; test them first as Trial Reels with non-followers. Aim for 3–5 posts a week.
2. **Make posts people forward.** Sends drive reach to non-followers, so design posts an owner would send to a partner or staff group. Win the first 3 seconds, since Skip Rate and the under-3-second check measure exactly that. Reply to every comment.
3. **Post only original material.** Use your own footage, screens and voiceover. Export without CapCut, Canva or TikTok watermarks; your own logo is fine. Don't repost memes or customer posts without adding something. Disclose realistic AI video, and avoid AI-generated presenters unless labelled.
4. **Write captions for search.** Use a professional account so posts get indexed by Google. Put English and Arabic keywords in the bio, captions and alt text. Use at most 5 specific hashtags; they label topics but don't add reach.
5. **Send traffic to WhatsApp for free.** Captions can't link without Meta One, and you don't need to pay for it at this stage. Use the bio link, Story link stickers and DM prompts that lead to a WhatsApp chat. Treat Threads as a cheap side channel: image or video posts, frequent replies, links in the post body. Don't plan around Threads features that are limited to English-speaking markets.

---

## TikTok, YouTube Shorts and Snapchat

**How this was gathered.** The shared web search limit of 200 searches ran out partway through. After that I could only open pages whose addresses I already knew. TikTok's own Support and Community Guidelines pages could not be read (they returned no body text), so some TikTok rules rest on older TikTok newsroom posts or on third-party sites. Anything I could not confirm is marked **UNVERIFIED**. Where a point comes only from my own background knowledge, it says "not checked this session." If the gaps matter, a follow-up search session could fill them.

---

### 1. TikTok

#### 1.1 How TikTok says it ranks videos
- TikTok groups its signals into three kinds:
  - **What you do:** likes, shares, accounts you follow, comments, videos you make.
  - **What the video contains:** captions, sounds, hashtags.
  - **Your device and account settings:** language, country, device type. These carry less weight because users don't actively choose them as preferences.
  [TikTok Newsroom, "How TikTok recommends videos #ForYou", https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you, 18 Jun 2020]
- **Strong vs weak signals.** Finishing a longer video from start to end is a strong signal. Being in the same country as the creator is a weak one. Follower count and an account's past hits are "not direct factors". [same, 18 Jun 2020]
- **Not recommended:** duplicated content, videos the viewer has already seen, spam, and videos just uploaded or still under review. [same, 18 Jun 2020]
- **Caveat:** this is the most recent primary explanation I could read. TikTok's current Support page on this topic redirected to a page that showed no content.

#### 1.2 For You feed eligibility
- TikTok's guidelines contain separate standards for what can appear in the For You feed. A mirror of the guidelines showed "updated 13 September 2025", but I could not read the current official text.
- **Unoriginal or re-uploaded content:** a business blog says TikTok added a section saying unoriginal and low-quality content is pushed off the For You feed, and that re-uploads from other platforms are detected. Treat as **UNVERIFIED (secondary)**. [Online Optimism, https://onlineoptimism.com/blog/updates-tiktoks-community-guidelines, date not shown]
- **Account-level restriction:** creators who repeatedly break the feed standards can have their whole account made temporarily ineligible, and can appeal. [Scripps/KTNV, https://www.ktnv.com/tiktok-to-start-banning-problematic-content-from-its-for-you-feed, 2024]

#### 1.3 Search
- **"Search value" is a payout metric.** TikTok's Creator Rewards Program pays on four metrics: originality, play duration (watch time plus finish rate), search value (based on popular search terms), and audience engagement. TikTok points creators to its Creator Search Insights tool. [TikTok Newsroom, "Introducing the new Creator Rewards Program", https://newsroom.tiktok.com/introducing-the-new-creator-rewards-program?lang=en, 18 Mar 2024]
- **Creator Search Insights** shows trending searches and "content gaps" (topics people search for but few videos cover). [Influencer Marketing Hub, https://influencermarketinghub.com/tiktok-trend-insights-creator-analytics/, date not shown]
- **Search analytics** show per-post search views, search impressions, average click-through rate and average search ranking. [Metricool, https://metricool.com/?p=162127, Nov 2024]
- **Usage claim:** "nearly three-quarters of users search at least once daily". **UNVERIFIED**: the original study is not named. [Influencer Marketing Hub, same]
- **Search ads** (the search-ads toggle and search-ads campaigns): **UNVERIFIED**, not researched before the search limit.

#### 1.4 Creator Rewards Program (paying creators for views)
- **Rules:**
  - Videos must be "over a minute long".
  - Creator must be 18 or older, with 10,000 followers and 100,000 views in the last 30 days.
  - Must be a personal account (not a business account), in good standing.
  [TikTok Newsroom, 18 Mar 2024, same URL as above]
- **Qualified views:** third-party guides say these must come from the For You feed, last at least 5 seconds, and not be marked "not interested". **UNVERIFIED**. [Toptal, https://www.toptal.com/creator/post/how-to-join-the-tiktok-creator-rewards-program, date not shown]
- **Qatar, UAE and Saudi Arabia: not confirmed, probably not available.**
  - Most third-party lists name about 7–8 countries: US, UK, Germany, France, Japan, South Korea, Brazil, with Canada and Mexico disputed. None include a Gulf country. [Metricool, https://metricool.com/tiktok-creator-fund/; Toptal, same]
  - One guide says Saudi Arabia and the UAE are eligible. The sources disagree. [search summary, multilogin.com, 2026]
  - The separate *Effect* Creator Rewards (paying for AR effects, not videos) does include Qatar and Saudi Arabia. [Yahoo Finance via search, ~2024]
  - The program is for personal accounts only, so it doesn't apply to an ALYR brand account anyway.

#### 1.5 Formats
- **Long videos:** TikTok tested 60-minute uploads with a small group in May 2024. [TechCrunch, https://techcrunch.com/2024/05/16/tiktok-upload-60-minute-videos, 16 May 2024]
- **What TikTok's developer documentation says** (applies to apps posting through TikTok's API):
  - Publish length: 3 minutes for all creators, 5 or 10 minutes for some.
  - Files up to 4 GB; MP4, WebM or MOV; 23–60 fps; 360–4096 px.
  - Photos: JPEG or WebP, max 1080p, 20 MB each.
  [TikTok for Developers, "Content Posting API – Media Transfer Guide", https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide, accessed 18 Oct 2026]
  - **This conflicts** with third-party claims of a universal 60-minute upload limit and 10 minutes when recording in the app. [blitzcutai.com, 2026]
- **Photo mode up to 35 photos:** found only in one 2026 third-party blog. **UNVERIFIED**.
- **TikTok Notes:** **UNVERIFIED**. I could not check whether it is still running.

#### 1.6 US ownership change, and whether it affects MENA
- The TikTok USDS Joint Venture closed on 23 Jan 2026:
  - ByteDance keeps 19.9%.
  - The venture will "retrain, test, and update the content recommendation algorithm on U.S. user data", hosted in Oracle's US cloud.
  - The global TikTok company's US entities handle "global product interoperability" (keeping the US app connected to the global app), plus shopping, ads and marketing.
  [TikTok Newsroom, "Announcement from the new TikTok USDS Joint Venture LLC", https://newsroom.tiktok.com/announcement-from-the-new-tiktok-usds-joint-venture-llc?lang=en, 23 Jan 2026]
- Oracle, Silver Lake and Abu Dhabi's MGX each hold 15%. [DatacenterDynamics, https://www.datacenterdynamics.com/en/news/tiktok-us-spin-off-finalized-led-by-oracle-silver-lake-and-mgx/, 23 Jan 2026]
- **Effect on MENA:** nothing found says the retraining touches non-US feeds. My inference is that MENA stays on the global system.

#### 1.7 TikTok Shop in the Gulf
- As of mid-2026 Saudi Arabia had no local Seller Center; Saudi shoppers are reached only through cross-border sellers.
- A Q1 2027 launch in Saudi Arabia, South Korea and Australia has been reported by Ebrun. TikTok has not confirmed it.
- Saudi Arabia has about 28 million monthly TikTok users.
  [EcomCrew, https://www.ecomcrew.com/tiktok-shop-is-reportedly-eyeing-saudi-arabia-south-korea-and-australia-for-early-2027/, updated 18 Aug 2026]
- Qatar and UAE status: **UNVERIFIED**. Vendor blogs that list the UAE as live are not authoritative.

#### 1.8 2025–26 changes in viewer controls and AI
- **AI-content control:** a setting inside "Manage topics" lets users choose how much AI-generated content appears in their For You feed. It turns AI content up or down rather than removing it, and was announced as a test.
- **Invisible watermarks** ("a watermark that only we can read") are being added to AI content made with TikTok tools such as AI Editor Pro, and to uploads that carry C2PA Content Credentials (the industry standard that marks content as AI-made).
- Over 1.3 billion videos had been labelled as AI-generated.
- Creators must label realistic AI-generated content.
  [TikTok Newsroom, "More ways to spot, shape and understand AI-generated content", https://newsroom.tiktok.com/more-ways-to-spot-shape-and-understand-ai-content?lang=en, 19 Nov 2025]
- A later regional TikTok post says over 3 billion videos are now labelled. [TikTok Newsroom SSA, https://newsroom.tiktok.com/tiktok-ssa-shares-more-ways-to-spot-shape-and-understand-ai-generated-content?lang=en-ZA, date not captured]

#### 1.9 Independent data
**Engagement rate (sources disagree because they divide by different things):**
- 2.01% median, measured against followers; TikTok was the highest of all platforms. Median posting is 1.98 videos a week. [Quid/Rival IQ, "2026 Social Media Industry Benchmark Report", https://www.quid.com/knowledge-hub/resource-library/blog/2026-social-media-industry-benchmark-report, 5 Mar 2026]
- 3.75–4.40% measured against views, depending on account size. Accounts with 1–5K followers: 4.40% in 2025. Views per post fell about 23% year on year. Brand posting rose about 40%. [Socialinsider, "TikTok benchmarks", https://www.socialinsider.io/social-media-benchmarks/tiktok, 22 Apr 2026; data Jan 2024–Dec 2025]
- Socialinsider's own pages conflict with each other (2.50% vs 3.73%). They show brands posting about 15 times a month. [Socialinsider, https://www.socialinsider.io/social-media-benchmarks, 16 Jan 2026]
- Hootsuite's 2026 figure of 1.5% comes via a secondary site: **UNVERIFIED**.

**Posting frequency:**
- 11.4 million posts from more than 150,000 accounts. Compared with posting once a week, views per post rise 17% at 2–5 posts a week, 29% at 6–10, and 34% at 11 or more.
- The typical (median) post stays flat at about 460–506 views. The top 10% of posts rise from 3,722 to 14,401 views. More posting raises the ceiling, not the floor.
- Buffer's advice is 2–5 posts a week.
  [Buffer, https://buffer.com/resources/how-often-should-you-post-on-tiktok/, 8 Oct 2025]

**Video length:**
- 6 million brand videos, Jan–Jun 2026. Highest engagement rate: 15–30 seconds (6.0%). Most median views: 2–3 minutes (11,136 views). [Socialinsider, https://www.socialinsider.io/blog/how-long-are-tiktok-videos/, 10 Jul 2026]
- 1.1 million videos. Videos over 60 seconds got at least 43.2% more reach and 63.8% more watch time than 30–60 second videos. Buffer adds that the hook and quality matter more than length. [Buffer, https://buffer.com/resources/longer-tiktoks-get-more-views-data/, 17 Mar 2025]

**Best times:**
- 7.1 million posts. Best single slot: Sunday 9 am. Best day: Saturday. Evenings 6–11 pm are generally strongest. [Buffer, https://buffer.com/resources/best-time-to-post-on-tiktok, 14 Sep 2026]
- Sprout Social favours Tuesday–Thursday, 2–6 pm (via search summary, **UNVERIFIED**).
- **Gulf caveat (my note):** these studies use Western weekly patterns. The Qatar weekend is Friday–Saturday, so use TikTok Studio's follower-activity data instead.

**Hook in the first 3 seconds:**
- More than 63% of the ads with the highest click-through rate show their key message in the first 3 seconds.
- 40% of the ads with the highest view-through rate use text overlays.
- Vertical video gets a 25% higher 6-second watch-through rate.
- **Note the date: this research is from 2020 and is about ads.**
  [TikTok for Business, "9 creative tips to drive auction ad performance", https://ads.tiktok.com/business/en-US/blog/9-creative-tips-to-drive-auction-ad-performance, 21 Oct 2020]

**Photo carousels vs video (sources directly contradict each other):**
- Metricool: video gets 5x more views and 6x more interactions than images. 7 in 10 views come from the For You feed. Based on 2.3 million posts. [Metricool, "TikTok Study 2026", https://metricool.com/tiktok-study/, 12 May 2026]
- Fanpage Karma: carousels get 3% more reach and 81% higher engagement rate than video, but about a third fewer shares. Based on about 700,000 posts, Jan–May 2025. [Fanpage Karma, https://www.fanpagekarma.com/insights/carousel-vs-video-performance-tiktok-instagram/, date not shown]

**Hashtags vs keywords:** **UNVERIFIED**. There is no primary data. TikTok's own signal is "search value" (section 1.3).

#### 1.10 Specs
- **Format:** 9:16, 1080×1920 is the standard working size. TikTok's ad minimum is 540×960.
- **Ads:** up to 10 minutes, 500 MB or less.
- **Safe zone:** it depends on caption length. TikTok publishes **separate left-to-right and Arabic right-to-left safe-zone files**.
  [TikTok Ads Help, "Auction In-Feed Ad Specs", https://ads.tiktok.com/help/article/video-ads-specifications, updated Jun 2026]
- **Safe zone in pixels (secondary sources only):**
  - Socialync: keep the top 240 px, bottom 660 px and 120 px on each side clear. It says these are TikTok's figures.
  - Spilno: top about 130 px, bottom 480–560 px, right about 140 px.
  - Use the official template. [https://www.socialync.io/tools/safe-zones/tiktok; https://spilnoagency.com.ua/en/instructions-us/tiktok-ads-creative-sizes-2026, 2026]
- **Caption length:** 4,000 characters, per third-party sources; some tools still cap at 2,200. **Not confirmed by TikTok**. [replug.io, recurpost.com, 2026]

#### 1.11 Penalties
- **Duplicated content and spam** are not recommended. [TikTok Newsroom, 18 Jun 2020]
- **Reposts from other platforms** are ineligible for the For You feed (secondary source). [Online Optimism, as above]
- **AI content:** must be labelled if realistic. TikTok detects it through C2PA metadata and invisible watermarks. [TikTok Newsroom, 19 Nov 2025]
- **Watermarks, engagement bait, and commercial-content disclosure:** I could not read TikTok's primary text. **UNVERIFIED**.
- **Bio link rules:** sources conflict (business accounts only, all accounts, or 1,000+ followers). **UNVERIFIED**. [replug.io, 2026]

---

### 2. YouTube Shorts

#### 2.1 How YouTube says it works
- **Length:** Shorts can be up to 3 minutes. [YouTube Help, "Upload YouTube Shorts", https://support.google.com/youtube/answer/10059070, accessed 18 Oct 2026]
- **View counting:** from **31 March 2025**, a Shorts view counts every time a Short starts or replays, with no minimum watch time. The old metric is now called "Engaged views". Partner Program eligibility is based on engaged views. [same]
- **General recommendation signals:** viewing behaviour, likes, dislikes, subscriptions, feedback, satisfaction surveys, and channel quality. Shorts are not mentioned specifically. [YouTube, "How YouTube Works – Recommendations", https://www.youtube.com/howyoutubeworks/product-features/recommendations/, undated]
- **CEO letter (21 Jan 2026):**
  - Shorts average 200 billion views a day.
  - Image posts are coming into the Shorts feed.
  - YouTube will reduce low-quality, repetitive "AI slop".
  - Creators will be able to make Shorts using their own likeness.
  - Creators will be able to add a link to a brand's site in Shorts.
  [YouTube Blog, https://blog.youtube/inside-youtube/the-future-of-youtube-2026/, 21 Jan 2026]
- **Not confirmed this session:**
  - "Viewed vs swiped away" as a ranking signal.
  - Statements by Todd Sherman (Shorts product lead).
  - Removal of clickable links from Shorts in August 2023, and the "related video" link.
  - Veo in Shorts.
  The August 2023 link removal is from my background knowledge only.

#### 2.2 Monetisation
- **Partner Program entry:** 1,000 subscribers plus either 4,000 watch hours in 12 months or 10 million Shorts views in 90 days. Shorts-feed hours don't count toward the 4,000. [YouTube Help, https://support.google.com/youtube/answer/72851, accessed 18 Oct 2026]
- **Qatar, the UAE and Saudi Arabia are all on the Partner Program availability list.** [YouTube Help, https://support.google.com/youtube/answer/7101720, accessed 18 Oct 2026]
- **How Shorts revenue is shared:**
  - Ad revenue goes into a pooled Creator Pool.
  - Creators keep 45%, paid on engaged views. Non-original views don't count.
  - **New: from 1 Feb 2027 a channel needs 10 million qualified Shorts views in 90 days to earn Shorts revenue for a given month.**
  [YouTube Help, https://support.google.com/youtube/answer/12504220, accessed 18 Oct 2026]

#### 2.3 Independent data
- YouTube's median engagement rate is 0.21% across all YouTube content, not Shorts specifically; YouTube is new to that report. Food has the highest engagement; Tech and Financial Services trail. [Quid/Rival IQ, 5 Mar 2026]
- Shorts-specific benchmarks for length and frequency: **UNVERIFIED**. The Socialinsider and Buffer pages I tried returned nothing.

#### 2.4 Specs
- Vertical video, up to 3 minutes, max upload resolution 1080p. [YouTube Help 10059070]
- Safe zones: **UNVERIFIED**.
- Title 100 characters and description 5,000 characters: standard YouTube limits from background knowledge, **not checked this session**.

#### 2.5 Penalties
- **"Inauthentic content" (15 Jul 2025):** YouTube renamed its "repetitious content" policy. It covers mass-produced, templated or repetitive content, including slideshows with little narrative and AI made from generic templates with no original perspective. YouTube says such content was already ineligible for monetisation.
- **Reused content:** clip compilations, videos compiled from other platforms, and reactions with no commentary are not monetisable. Permission from the original creator does not make it eligible. The policy applies to the whole channel.
  [YouTube Help, "YouTube channel monetization policies", https://support.google.com/youtube/answer/1311392, accessed 18 Oct 2026]
- **AI disclosure:**
  - Must disclose: realistic altered or synthetic content.
  - No disclosure needed: animation, minor edits, or AI-assisted scripts and thumbnails.
  - YouTube can label automatically through its own AI tools, C2PA metadata, or detection.
  - Creators who repeatedly fail to disclose face content removal or Partner Program suspension.
  - Disclosure by itself does not limit reach or monetisation.
  [YouTube Help, https://support.google.com/youtube/answer/14328491, accessed 18 Oct 2026]
- **Watermarks:** **UNVERIFIED** for YouTube.

---

### 3. Snapchat

#### 3.1 Distribution and programs
- **Spotlight posting:** you must be 16 or older, in a region with Spotlight enabled, and the video must be **at least 5 seconds**. You can add a description, location and #topic. Spotlight posts go to your Story by default and can appear in Search. [Snapchat Support, "How do I submit Snaps to Spotlight?", https://help.snapchat.com/hc/en-us/articles/7012288096532, accessed 18 Oct 2026]
- **Maximum Spotlight length:** **UNVERIFIED**.
- **Old Spotlight Rewards Program ended on 31 Jan 2025** and was replaced by the unified Monetization Program. [Snapchat Support, https://help.snapchat.com/hc/en-us/articles/7012310905876, accessed 18 Oct 2026]
- **Monetization Program (by invitation):**
  - 50,000 followers.
  - 15,000 hours of view time in the last 28 days, at least 3,000 of them from Spotlight.
  - Must be a Snap Star.
  - From 7 May 2026, at least 100 hours of Spotlight view time is needed to qualify for maximum rewards.
  - Spotlight videos must be **at least 30 seconds** to earn.
  [Snapchat Support, "About Snapchat's Monetization Program", https://help.snapchat.com/hc/en-us/articles/14669003687444, accessed 18 Oct 2026]
- **Gulf payout eligibility: Qatar, the UAE, Saudi Arabia, Kuwait, Bahrain and Oman are all eligible** for Stories midroll ads, Spotlight rewards and Lens rewards. [Snapchat Support, https://help.snapchat.com/hc/articles/7012298096788, accessed 18 Oct 2026]
- **Business Public Profiles** (created in Ads Manager):
  - Stories, Spotlight, Snap Map, Highlights, Promote, Insights.
  - Website or catalogue link, and location.
  - Case study: Elevenparis got 11 million organic Spotlight views in 2 months, and 94% of its new subscribers came from Spotlight.
  - The page does not state the price. "Free" is **UNVERIFIED**.
  [Snapchat for Business, https://forbusiness.snapchat.com/public-profiles, accessed 18 Oct 2026]
- **Profile features:** any Public Profile can add a website and public email, and show subscriber count. No follower threshold is stated. [Snapchat Support, https://help.snapchat.com/hc/en-us/articles/7012318643220, accessed 18 Oct 2026]
- **Sponsored Snaps** (ads delivered into the Chat inbox):
  - Users can reply, and brands can set an auto-response.
  - Opened Sponsored Snaps drive 20% higher purchases per full-screen view (Snap internal data, 2025).
  - 85% of Snapchatters use Chat regularly (2024 survey).
  - Discount and offer ads are restricted.
  [Snapchat for Business, https://forbusiness.snapchat.com/advertising/sponsored-snaps, accessed 18 Oct 2026]
- **Saved Stories and Snap Star details:** **UNVERIFIED** beyond the above.

#### 3.2 Gulf reach
These are advertising-reach estimates, not monthly active users. Sources: DataReportal Digital 2026 reports for [Qatar](https://datareportal.com/reports/digital-2026-qatar) (8 Nov 2025), [Saudi Arabia](https://datareportal.com/reports/digital-2026-saudi-arabia) (8 Nov 2025) and [UAE](https://datareportal.com/reports/digital-2026-united-arab-emirates) (5 Nov 2025).

| | Snapchat | TikTok (18+) | YouTube | Instagram |
|---|---|---|---|---|
| Qatar | 1.24M (39.5%) | 2.95M (114% of adults, flagged as implausible) | 2.31M (73.8%) | 1.70M (54.3%) |
| Saudi Arabia | 25.3M (72.9%) | 38.6M (154% of adults) | 27.5M (79.2%) | 18.2M (52.4%) |
| UAE | 5.13M (44.9%) | 12.5M (135% of adults) | 8.37M (73.3%) | 8.05M (70.5%) |

TikTok's figures above 100% are anomalies in TikTok's own ad tool. **Snapchat is huge in Saudi Arabia but much smaller in Qatar.**

#### 3.3 Specs
- **Ads:** 9:16. Snap's listed resolution is 720×1280. Length 3–180 seconds. Brand name 25 characters, headline 34 characters.
- **Sponsored Snaps:** under 10 seconds recommended; chat message up to 500 characters.
  [Snapchat for Business, "Ad formats", https://forbusiness.snapchat.com/advertising/ad-formats, accessed 18 Oct 2026]
- Organic 1080×1920, safe zones in pixels and caption limits: **UNVERIFIED**.

#### 3.4 Penalties
These come from Snap's Content Guidelines for Recommendation Eligibility (released 13 May 2024). Each of the following is ineligible for recommendation:
- **Unoriginal content:** reposts you didn't meaningfully transform, low-effort reactions, and near-duplicates.
- **Low quality:** blurry or letterboxed video, wrong orientation, missing audio.
- **Engagement bait:** demands for likes or shares, teasers that never pay off, tricks that force rewatching.
- **Off-platform links and QR codes:** generally ineligible. Links to other social or messaging apps are prohibited.
- **Promoting other platforms:** a username shown with another platform's name or logo counts as account promotion and is ineligible.
- **Undisclosed commercial content.**
- **AI made outside Snapchat:** wholly AI-generated content made outside Snapchat **ranks below human-made content even when disclosed**.

[Snap, https://www.snap.com/content-recommendation-guidelines, released 13 May 2024; Snap Values, https://values.snap.com/policy/content-guidelines-recommendation-eligibility/recommendation-eligibility/quality, accessed 18 Oct 2026]

**Note for WhatsApp promotion:** a CTA such as "message us on WhatsApp" with a logo or link may be treated as promoting another platform on Snapchat (this is my reading of Snap's guidelines).

---

### 4. Where sources disagree
- **TikTok engagement rate:** 1.5% (Hootsuite, unverified) vs 2.01% (Rival IQ, measured against followers) vs about 4% (Socialinsider, measured against views).
- **Best TikTok length:** shorter wins on engagement rate, longer wins on views and reach.
- **Carousels vs video:** Metricool says video wins 5–6x; Fanpage Karma says carousels get 81% higher engagement.
- **Posting times:** Buffer says weekends are best; Sprout Social (unverified) says weekdays.
- **TikTok maximum length:** 3/5/10 minutes per TikTok's developer docs vs 60 minutes per blogs.
- **Creator Rewards in the Gulf:** sources split.

### 5. Takeaways for ALYR (a small B2B brand selling to Qatar businesses)
1. **For Qatar now, focus on TikTok and YouTube; add Snapchat for Saudi Arabia later.** YouTube reaches about 74% of Qatar's population and Snapchat about 40%. Snapchat reaches 73% of Saudi Arabia, so it matters when ALYR expands there. Business Public Profiles are cheap to keep running in the meantime.
2. **Make one vertical master, original and without watermarks.** Use 9:16 at 1080×1920 and keep text inside a conservative safe area (about 240 px top, 660 px bottom, 120 px on each side). Use TikTok's Arabic right-to-left safe-zone file for Arabic text. Upload natively to each platform with no cross-platform watermarks. Vary each video meaningfully: all three platforms penalise templated, near-duplicate content (YouTube's 15 Jul 2025 "inauthentic" policy and Snap's 2024 guidelines).
3. **Post 2–5 times a week, put the value in the first 3 seconds, and write in searchable keywords.** Use on-screen text and captions that match what Qatar business owners actually search for, such as "WhatsApp catalog" in English and Arabic, checked in Creator Search Insights. Make 15–30 second clips for engagement and 1–3 minute demos for reach. Test carousels for step-by-step explainers.
4. **Plan links around each platform's rules.**
   - TikTok: bio link (which accounts qualify is unconfirmed).
   - YouTube Shorts: no clickable link (background knowledge, not confirmed). Point viewers to a long-form demo; brand links in Shorts are coming per YouTube's January 2026 letter.
   - Snapchat: put the link on the profile, not inside Spotlight posts. Avoid WhatsApp logos in Spotlight. Sponsored Snaps into the Chat inbox look a lot like WhatsApp, but paid ads would wait until after the Qatar commercial registration (CR), under ALYR's registration gate.
5. **Treat AI-made video carefully.** Animated motion graphics from ALYR's video studio (D:\alyr-video) don't need a YouTube AI disclosure. Realistic AI people or scenes must be labelled on TikTok and YouTube. On Snapchat, fully AI-generated video made outside the app is ranked down even when labelled, so keep real human footage of Akmal and actual customers at the centre.

**Still unverified, suggested for a follow-up search session:**
- TikTok: the official For You eligibility text, bio-link rules, search ads, whether Notes still exists, the 35-photo limit, and whether TikTok Shop is live in Qatar or the UAE.
- YouTube: Shorts links and the related-video feature, Veo in Shorts, Todd Sherman's statements, and Shorts benchmarks.
- Snapchat: maximum Spotlight length, Saved Stories, whether Public Profiles cost anything, and Snap's own Gulf user numbers.

---

## LinkedIn and X

**Limits of this research:**
- The shared WebSearch budget ran out partway through. After that I could only fetch URLs I already knew.
- help.x.com and help.twitter.com both returned 403, so every X Help Centre figure below is second-hand.
- Items marked **unverified** are ones I could not confirm from a source I actually read.
- The Hootsuite algorithm page contained embedded text addressed to AI tools. I ignored it and used only its factual content.

---

### LINKEDIN

#### 1. How ranking works, according to LinkedIn

**The new feed system (March 2026)**
- LinkedIn rebuilt its feed on two parts:
  - an LLM-based retrieval layer that matches member and post "prompts" (profile, skills, work history, and posts the member engaged with);
  - a "Generative Recommender" transformer that reads more than 1,000 of a member's past interactions in order. [LinkedIn Engineering, "Engineering the next generation of LinkedIn's Feed", https://www.linkedin.com/blog/engineering/feed/engineering-the-next-generation-of-linkedins-feed, 12 Mar 2026]
- The ranker predicts click, skip, long dwell, like, comment and share. [same]
- Popularity counts are fed in as percentile buckets. When raw counts were passed as plain text, the model effectively ignored popularity (correlation -0.004). [same]
- LinkedIn says relevant posts on breaking news now surface "within minutes, not hours". It also plans to "reduce repetitive, click-driven posts and filter out engagement bait" and to downrank recycled thought leadership. [Social Media Today, https://www.socialmediatoday.com/news/linkedin-updates-its-feed-algorithm/814638/, 12 Mar 2026]

**360Brew**
- 360Brew is a 150B-parameter, decoder-only model covering more than 30 prediction tasks. The paper calls it a "research pre-production model" and compares it only on offline metrics. [arXiv 2501.16450, https://arxiv.org/abs/2501.16450, v1 27 Jan 2025, v4 23 Aug 2025]
- All four versions of the paper are now marked **withdrawn** on arXiv, because of a licence issue.
- **Sources disagree:** SocialPilot says the 12 Mar 2026 engineering post "announced 360Brew's deployment" [https://www.socialpilot.co/blog/linkedin-algorithm, Aug 2026]. That post does not mention 360Brew. Treat "360Brew runs the feed" as **unverified**. The confirmed system is the LLM retrieval plus Generative Recommender stack.

**Dwell time, comments, saves**
- Dwell is an official ranking objective ("long dwell"). [LinkedIn Engineering, 12 Mar 2026]
- Comments are now ranked by how relevant they are to each viewer. LinkedIn's Q2 report showed time spent in comments up 18% year on year. [Social Media Today, https://www.socialmediatoday.com/news/linkedin-updates-feed-display-to-drive-more-post-replies-and-comments/827394/, 9 Aug 2026]
- Authors can now pin comments. [LinkedIn Pressroom, https://news.linkedin.com/2026/new-ways-to-build-meaningful-connections, 15 Oct 2026]
- LinkedIn's own posting advice:
  - post 2–3 times a week;
  - "Consistency is one of the biggest drivers of reach";
  - reply to comments within the first hour;
  - engagement in the first 24 hours affects distribution;
  - Articles should be 800–1,200 words;
  - don't open a post with hashtags, because the first line generates the post's URL.
  [Social Media Today, https://www.socialmediatoday.com/news/linkedin-shares-tips-on-effective-posting/824780/, 8 Jul 2026]
- "Knowledge and advice" as a named priority, and "relevance over virality" statements by Laura Lorenzetti: **unverified**, because I could not retrieve the primary quotes. The March 2026 relevance and anti-bait language above is the current official equivalent.

**AI slop, automation and pods**
- The "Seems like AI slop" feedback option launched in August 2026. More than 1M members used it in its first two weeks, and views of content classed as AI slop fell 40%.
- LinkedIn says it catches "hundreds of thousands" of automated comment attempts a day.
- "Enhance your post" is being replaced with a proofreader that keeps the member's voice.
  [LinkedIn Pressroom, https://news.linkedin.com/2026/how-linkedin-is-tackling-ai-slop, 15 Sep 2026]
- Tim Jurka (LinkedIn VP Engineering) says the AI-slop classifiers now cover all posts distributed beyond a member's immediate network, with 94% precision. [Social Media Today, https://www.socialmediatoday.com/news/linkedin-exec-offers-insight-into-the-battle-against-ai-slop/832576/, 8 Oct 2026]
- A LinkedIn Newsroom statement of 12 Mar 2026 on comment automation, pods and unauthorised tools is cited second-hand. [Blck Alpaca, https://blckalpaca.at/en/knowledge-base/social-media/social-media-algorithms-distribution/linkedin-company-page-or-personal-profile-reach, 2026]

**Feed and product changes in 2026**
- A "Network feed" (connections and follows only) is in test in the US, India, UK and Australia. [LinkedIn Pressroom, 15 Oct 2026]
- Suggested topic feeds are in test. [Social Media Today, https://www.socialmediatoday.com/news/linkedin-tests-suggested-feeds/823722/, 24 Jun 2026]
- Collaborative posts let members and Company Pages co-create a post. [LinkedIn Pressroom, https://news.linkedin.com/2026/introducing-collaborative-posts-now-available-to-members-and-company-pages-on-linkedin, 2026, exact date not shown]

**Video**
- Video watch time was up 36% year on year (stated December 2024).
- Short-form video creation is growing at twice the rate of other formats.
- Paid video grew almost 30% year on year in Q1 2026 (CEO Daniel Shapero).
- The video tab and video carousel are returning to more markets. The immersive video feed (US since December 2024) is expanding to Canada, the UK and Australia.
- LinkedIn's advice is 2–5 posts a week, two of them video.
  [Social Media Today, https://www.socialmediatoday.com/news/linkedin-shares-video-creation-tips-based-on-platform-trends/821050/, 25 May 2026]
- In-Stream Ads (creator pre-roll revenue) are in a US test. [LinkedIn Pressroom, 15 Oct 2026]
- BrandLink details: **unverified** (the product page returned 404).

**Not verified in this pass:**
- Creator mode removal (my recollection is March 2024).
- Newsletter distribution behaviour.
- An official LinkedIn statement on whether links are penalised. I found no primary statement. Independent data on links is in section 2.

#### 2. Independent data

**Formats: median engagement rate (Buffer, 2025 data)**

| Format | Engagement rate |
|---|---|
| Document/carousel | 21.77% (strong ones above 41%, weak ones about 5.4%) |
| Video | 7.35% |
| Image | 6.52% |
| Link | 3.81% |
| Text | 3.18% |

- Overall LinkedIn median is about 6.1%, down about 5% year on year.
- Replying to comments lifted engagement by about 30%, and 83% of profiles did better when they replied.
[Buffer, State of Social Media Engagement 2026, https://buffer.com/resources/state-of-social-media-engagement-2026/, 5 Mar 2026]

**Company pages: engagement by impressions (Socialinsider, 1.3M posts from 16,645 pages, 2024 → 2025)**

| Format | 2024 | 2025 | Change |
|---|---|---|---|
| Document | 6.10% | 7.00% | +14% |
| Multi-image | 6.60% | 6.45% | -2% |
| Video | 5.60% | 6.00% | +7% |
| Image | 4.85% | 5.30% | +9% |
| Text | 4.00% | 4.50% | +12% |
| Poll | 4.40% | 4.20% | -5% |
| Link | 3.30% | 3.25% | -2% |

- Video views per video fell about 36% year on year.
[Socialinsider, https://www.socialinsider.io/social-media-benchmarks/linkedin, 16 Mar 2026]

**Reach multipliers (AuthoredUp)**
- Personal profiles: polls 1.64x, documents 1.45x, images 1.18x, video 1.10x, text 0.88x.
- Company pages: documents 1.40x, images 1.21x, polls 1.19x, video 1.05x, text 0.42x.
- Average reach down 34% in 2025.
- One save ≈ 5x the reach of one like and ≈ 2x a meaningful comment.
- Replies between commenters ("indirect comments") give up to 2.4x reach.
- Hashtags had no impact on reach, and more than 6 can hurt.
- Sweet spot 800–1,000 characters; writing above a 10th-grade reading level gets over 35% less reach.
- Post 3–5 times a week, no more than once every 24 hours.
[AuthoredUp, https://authoredup.com/blog/linkedin-algorithm, 27 Sep 2025, metadata says updated Aug 2026]

**Do polls work? Sources disagree.** AuthoredUp shows polls top for personal reach. Socialinsider shows poll engagement falling (-5%; Q2 → Q3: 4.5% → 3.6%).

**Document carousels in 2026:** still live and still the top or near-top format in all three datasets above. I found no evidence that native document posts were removed.

**Van der Blom, Algorithm Insights (paywalled; all figures second-hand):**
- 2025 edition: 1.8M posts, ~400k profiles.
  - Views -47%, engagement -39%, follower growth -42% [SocialPilot, Aug 2026].
  - **Conflicting figures** for the same edition: -50%, -25%, -59% [LeadMagic, https://leadmagic.io/gtm-skills/linkedin-algorithm, 2026].
  - Company pages get 1–2% organic reach.
  - At least three different commenters in the first 60 minutes gives about 5.2x reach.
  - Top creators' share of the feed rose from 15% to 31% (2022 → 2025).
  [Blck Alpaca, 2026]
- 2026 edition (7th): 1.3M posts, 80k profiles.
  - Documents about 1.39x reach.
  - A link in the post body costs 25–60% of reach, depending on profile type.
  - 34% of top posts are under 600 characters.
  - No hashtags does 5–10% better.
  - Company-page reach up about 33%. This **conflicts** with the 2025 edition's 1–2% figure.
  [LeadMagic, 2026]
- Another secondary source quotes the 2026 edition as "a single external link reduces median reach by 18.8%". [Vivian Voss, https://www.vivianvoss.net/blog/linkedin-reach-you-did-not-earn; the page would not load, so **unverified**]

**External links: how big is the penalty? Sources disagree.**

| Source | Figure |
|---|---|
| Van der Blom 2026 | 18.8% (second-hand) or 25–60% (second-hand) |
| DigitalApplied, cited by SocialPilot | about 60% |
| AuthoredUp | one link gives the lowest reach; link in first comment is "low penalty"; link in post with preview on is "highest penalty" (no numbers) |

**Comment length:** no quantified data found (**unverified**).

**Best times (local time)**
- Buffer (4.8M posts): best day Wednesday, then Thursday and Friday; peak window 3–8 pm on weekdays; mornings and weekends weakest. [Buffer, https://buffer.com/resources/best-time-to-post-on-linkedin/, 9 Sep 2026]
- Sprout Social: Tuesday–Thursday, 11 am–5 pm. [Sprout Social, https://sproutsocial.com/insights/best-times-to-post-on-linkedin/, 31 Mar 2026]
- Both datasets are global and assume a Mon–Fri week. Qatar's working week is Sun–Thu, so local timing has to be tested.

**Employee advocacy:** the common multipliers (+561%, 8x, 7x) all come from vendors or self-reports with no verifiable primary data. [Blck Alpaca, 2026]

#### 3. Specs
- Post limit: 3,000 characters. [LinkedIn Help, https://www.linkedin.com/help/linkedin/answer/a528176]
- Documents: up to 300 pages and 1M words; media files up to 100 MB; images up to 36 MP. [LinkedIn Help, https://www.linkedin.com/help/linkedin/answer/a564109]
- Video: up to 15 minutes, 75 KB–5 GB, aspect ratio 1:2.4 to 2.4:1 (so 9:16 vertical is supported), 256x144 to 4096x2304. [LinkedIn Help, https://www.linkedin.com/help/linkedin/answer/a548372]
- Images: 1200x627 (landscape or link preview), 1080x1080 (square). Company logo 400x400, company cover 1512x256. [Sprout Social, https://sproutsocial.com/insights/social-media-image-sizes-guide/, 15 Oct 2026]
- 1080x1350 portrait: **unverified**. Neither Sprout nor Hootsuite (1 Oct 2026) lists it.
- "See more" cut-off (~140–210 characters): **unverified**.

#### 4. Penalties
- Professional Community Policies:
  - "Don't do things to artificially increase engagement."
  - Don't "agree with others ahead of time to like or re-share" (this covers pods).
  - Synthetic media is allowed only with clear disclosure.
  - Enforcement can "limit the visibility", label, or remove content.
  [LinkedIn, https://www.linkedin.com/legal/professional-community-policies, undated, © 2026]
- C2PA "Content Credentials": an icon on images and videos shows provenance, including whether AI was used. In select countries members can self-attest that media is AI-made. [LinkedIn Help, https://www.linkedin.com/help/linkedin/answer/a6282984]
- Tagging: "5+ people = spam" appears with no source (LeadMagic). **Unverified.**

---

### X (TWITTER)

#### 1. How ranking works, according to X

**2023 open-source heavy-ranker weights** [twitter/the-algorithm-ml, https://github.com/twitter/the-algorithm-ml/blob/main/projects/home/recap/README.md, snapshot 5 Apr 2023]

| Action | Weight |
|---|---|
| Favourite (like) | 0.5 |
| Retweet | 1.0 |
| Reply | 13.5 |
| Good profile click | 12.0 |
| Good click | 11.0 |
| Good click v2 | 10.0 |
| Reply engaged by author | 75.0 |
| Video playback 50% | 0.005 |
| Negative feedback | -74.0 |
| Report | -369.0 |

- The Blue-verified 4x/2x multipliers from the 2023 code: **unverified** (I could not locate them in the current file).

**2026 Grok-based system**
- xai-org/x-algorithm was open-sourced on 20 Jan 2026. X Engineering: "powered by the same transformer architecture as xAI's Grok model". Musk: "We know the algorithm is dumb and needs massive improvements." [Decrypt, https://decrypt.co/355108/elon-musks-x-open-sources-grok-powered-algorithm-driving-for-you-feed, 20 Jan 2026]
- Major code releases followed on 15 May, 13 Aug and 14 Aug 2026. [OpenTweet changelog, https://opentweet.io/x-algorithm-changes, 2026]
- The final score is a weighted sum of predicted probabilities. Other rules in the code:
  - the score is cut for repeat posts from the same author and for out-of-network posts;
  - authors with low impressions get a boost toward a target position;
  - posts older than 48 hours are filtered out;
  - the README says Premium is not a ranking parameter.
  [xai-org/x-algorithm README, https://github.com/xai-org/x-algorithm, updated to 18 Sep 2026]

**Current default weights** [param.rs, https://github.com/xai-org/x-algorithm/blob/main/home-mixer/params/param.rs, read 18 Oct 2026]

| Action | Weight |
|---|---|
| Favourite | 0.66 |
| Repost | 1.0 |
| Share | 2.0 |
| Follow author | 4.0 |
| Reply | 5.0 |
| Quote | 5.0 |
| Share via DM | 5.0 |
| Reply boost when author and viewer follow each other | 15.0 |
| Share via copy link | 20.0 |
| Open link | 0.2 |
| Dwell | 0.05 |
| Not interested | -52.272 |
| Mute author | -58.8 |
| Block author | -31.2 |
| Report | -234.0 |

- The code says these multiply probabilities, not raw counts, and are runtime-overridable defaults.
- "Not interested" was -43.2 on 29 Aug 2026, so the weights do change. [frameos, https://frameos.studio/blog/twitter-algorithm, 2026]

**Grok and the feeds**
- Musk said Grok "will literally read every post and watch every video (100M+ per day)" within 4–6 weeks. [Fast Company ME, https://fastcompanyme.com/co-design/xs-ux-update-wants-to-save-your-links-from-social-medias-black-hole/, 22 Oct 2025, statement 19 Oct 2025]
- The Following feed is now Grok-ranked by default (30 Nov 2025). [SocialPilot citing Social Media Today, https://www.socialpilot.co/blog/twitter-algorithm, Sep 2026; secondary]
- "Tune your feed via Grok": **unverified**.
- Mutuals boost: Nikita Bier said mutual-follow data "was missing from the algo". [TechCrunch, https://techcrunch.com/2026/07/13/x-just-tweaked-its-algorithm-to-make-it-more-friendly-less-battleground/, 13 Jul 2026]
- Reply downvotes for Premium (March 2026). [SocialPilot citing Social Media Today; secondary]

**Links**
- Oct 2025: Bier said links "have lower engagement and we are trying to fix that", and X tested an in-app browser. Musk: "Posting a link with almost no description will get weak distribution." [Social Media Today, https://www.socialmediatoday.com/news/x-formerly-twitter-testing-links-in-app-link-post-penalties/803176/, 19 Oct 2025]
- 28–29 Jul 2026: Bier told Mark Zuckerberg "you do not need to put the links in replies anymore". Musk: "We haven't [penalised links] for over a year." [PPC Land, https://ppc.land/x-drops-year-old-link-penalty-musk-tells-zuckerberg-on-platform/, 30 Jul 2026]
- **Sources disagree:**
  - Buffer measured link posts from regular accounts at 0% median engagement after March 2025.
  - An October 2024 test cited by PPC Land found 94% fewer views on link posts.
  - OpenTweet (28k posts, mostly small accounts) found no impressions penalty.
  - The Jan 2026 code had no link-click prediction (PPC Land, https://ppc.land/how-xs-algorithm-silently-kills-your-links-without-explicitly-penalizing-them/, 21 Jan 2026), but the current code includes OpenLinkWeight 0.2.
  - Link posting through the API now costs $0.20 per post. [TechCrunch via OpenTweet, 16 Apr 2026]

**Premium and the new X Subscription**
- "The X Subscription" launched 12–13 Oct 2026: Free, Plus $8, Premium $30, Super $100, Ultra $200. Plus includes the checkmark and longer posts. It is rolling out US first, and existing plans continue. [Yahoo Finance, https://finance.yahoo.com/technology/ai/articles/spacex-bundles-grok-x-cursor-000517004.html, 13 Oct 2026; Social Media Today, https://www.socialmediatoday.com/news/x-launches-unified-subscription-packages/832924/, 13 Oct 2026]
- Reply prioritisation for paid tiers: no official numbers. **Unverified** (help.x.com returned 403).
- Articles opened to all Premium tiers on 7 Jan 2026 (Premium+-only since March 2024). [PiunikaWeb, https://piunikaweb.com/2026/01/07/x-articles-premium-nikita-bier-updates/, 7 Jan 2026]
- Accounts without Premium: 50 posts, 200 replies, 500 DMs and 400 follows per day. Paying accounts are exempt. [MediaNama, https://www.medianama.com/2026/05/223-x-imposes-daily-limits-unverified-users-what-changes/, 18 May 2026]

**X in Qatar:** ad reach 650k (20.8% of population), down 11.2% year on year. LinkedIn is 1.80M (57.5%), up 12.5%. [DataReportal Digital 2026 Qatar, https://datareportal.com/reports/digital-2026-qatar, 8 Nov 2025]

#### 2. Independent data
- **Premium vs regular reach** (Buffer, 18.8M posts, 71k accounts): median impressions per post are under 100 for regular accounts, about 600 for Premium and over 1,550 for Premium+. Regular-account median engagement fell to 0% by March 2025. Buffer notes this is correlation, not proof that paying causes it. [Buffer, https://buffer.com/resources/x-premium-review/, 2 Oct 2025]
- **Engagement by format and tier** [Buffer, https://buffer.com/resources/links-on-x/, 14 Oct 2025]:

| Format | Regular accounts | Premium accounts |
|---|---|---|
| Text | ~0.40% | ~0.90% |
| Video | ~0.25% | ~0.85% |
| Image | ~0.20% | ~0.42% |
| Link | 0% | ~0.28% |

- **2025 medians across all accounts:** overall about 2.8% (up 44%, which Buffer says may be a metric artefact). By format: text 3.56%, image 3.40%, video 2.96%, link 2.25%. Replying to comments adds about 8%. Weeks with no posts hurt growth. [Buffer, 5 Mar 2026]
- **Rival IQ:** X engagement rate down 48% and posting frequency down 33% year on year. [Rival IQ, https://www.rivaliq.com/blog/social-media-industry-benchmark-report/, 25 Feb 2025]
- **Best times** (8.7M posts): Tuesday 9 am, Wednesday 9–10 am; evenings and Saturday are worst. [Buffer, https://buffer.com/resources/best-time-to-post-on-twitter-x/, 13 Mar 2026]
- **Posting frequency:** 3–5 posts a day is an unsourced recommendation (SocialPilot). **Unverified.**

#### 3. Specs
- Long posts up to 25,000 characters for subscribers. [X Help, quoted via search results; help.x.com returned 403]
- 280 characters for free accounts: standard and unchanged, but not re-verified in this pass.
- Up to 4 photos, or 1 GIF, or 1 video per post. [X API docs, https://docs.x.com/x-api/media/quickstart/best-practices]
- Video length: **sources disagree.**

| Source | Free / default | Premium |
|---|---|---|
| X API docs | 20 min, 8 GB | 125 min, 16 GB |
| X Help, quoted second-hand | — | ~3 hours, 8 GB |
| Third-party guides | 2:20 (in-app) | — |

- Images: 16:9 or 1:1 recommended; Hootsuite lists 1280x720 landscape. [Hootsuite, https://blog.hootsuite.com/social-media-image-sizes-guide/, 1 Oct 2026]
- 1600x900: **unverified**.
- Article length limits: **unverified**.

#### 4. Penalties
- Mutes, blocks, reports and "not interested" carry large negative weights (see the table above).
- "Under the Hood" shows the labels on an account that may limit reach, including legal withholding. It is available to accounts at least one year old with more than 10 posts in the previous month. [Social Media Today, https://www.socialmediatoday.com/news/x-shares-more-insight-into-penalties-impacting-post-reach/830972/, 21 Sep 2026]
- X added a liveness check against bots. [Social Media Today, 8 Oct 2026, headline only]
- API replies are allowed only when the original author mentioned or quoted the replier. [X API changelog via OpenTweet, 23 Feb 2026]
- Synthetic-media policy, engagement-bait rules, and any "unoriginal content" or reply-spam crackdown: **unverified** (Help Centre blocked).

---

### Takeaways for a small B2B brand in Qatar
1. **Put LinkedIn first, led by founders, with the Company Page in support.** LinkedIn reaches 1.8M people in Qatar and is growing; X reaches 650k and is shrinking. The Company Page vs personal reach figures conflict (1–2% reach vs +33%), but every dataset ranks people above pages. Use Akmal's personal profile as the main channel and repost through the page. Try collaborative posts.
2. **Make document carousels and short native video the core formats.** Documents lead in Buffer, Socialinsider and AuthoredUp alike. LinkedIn itself suggests 2–5 posts a week with two videos. Keep the writing plain (around a 4th-grade reading level), roughly 600–1,000 characters, with no hashtag openers.
3. **Treat the first hour as conversation time.** Reply to every comment and pin the best one. Write posts people will save, such as checklists and WhatsApp template examples. Saves are worth about 5x a like and replies about +30%. Never use pods or automated comments: LinkedIn now classifies everything that travels beyond your own network.
4. **Keep links out of the post body on LinkedIn.** Put the substance in the post and the link in a comment or in your profile. Every independent dataset shows single-link posts underperform, even though the size of the penalty is disputed.
5. **On X, keep it minimal.** Use X to reply to and quote Gulf tech and SME voices, where replies (5.0), and replies between mutual follows (15.0), are weighted most. Write text-first posts. Only buy the $8 Plus tier if you commit to X; free-account median engagement is about 0%. Schedule for the Sun–Thu working week and test local timing, because Buffer and Sprout times assume a Mon–Fri week.

---

## Facebook, WhatsApp Channels and cross-platform benchmarks

**Research limits:** The shared web-search budget ran out partway through (200 searches per turn across all agents), so the later checks used direct page fetches only. WhatsApp Help Center pages came back with only their titles, so FAQ details marked "via Kanal" are second-hand. The Metricool 2026 study and the full Emplifi and Later reports sit behind sign-up forms, which I did not fill in. Anything I could not check against a primary source is marked **unverified**.

---

#### 1. Facebook

##### 1.1 How ranking works, per Meta

- **Four steps: inventory, signals, predictions, relevance score.** The inventory is posts from friends, followed Pages and joined Groups, with posts flagged for breaking Community Standards removed. A lightweight model cuts this to about 500 posts. Those are scored and sorted, and the feed is mixed so several videos don't run back to back. [Meta Transparency Center, "Facebook Feed AI system", https://transparency.meta.com/features/explaining-ranking/fb-feed/, updated 6 Oct 2026]
- **Prediction types Meta names:** scrolling past rather than engaging, skipping, tapping "Interested", opening a story full screen, viewing the list of people who reacted, strong intent to engage with a group's posts, clicking an external link *and staying on that site*, and strong intent to interact with friends or groups. Comments and shares appear only as input signals, not as named predictions. The page never uses the term "meaningful interactions" (Meta's older wording). [same page]
- **Signals include:** who posted it, your past interactions with them, the format (photo, video or link), and how many friends reacted. [same page]
- **Recommended (unconnected) content is ranked by a separate system.** Feed blends the connected and recommended systems, plus ads. [Meta, "How AI influences what you see", https://about.fb.com/news/2023/06/how-ai-ranks-content-on-facebook-and-instagram/, 29 Jun 2023] Mozilla criticised Meta for never defining what this "balanced" mix means. [Mozilla Foundation, "This is not a system card", https://www.mozillafoundation.org/en/blog/this-is-not-a-system-card-scrutinising-metas-transparency-announcements/, 2023]
- **Share of feed that is recommended:** in the US in Q2 2026, 36.6% of Feed views came from unconnected or recommended posts. Friends supplied 20.2%, followed Pages 14.8%, Groups 14.6% and other sources 13.8%. **Posts without a link took 98.9% of views; posts with a link took 1.1%.** [Meta Widely Viewed Content Report, Q2 2026, https://transparency.meta.com/data/widely-viewed-content-report/, covers 1 Apr to 30 Jun 2026] This is US data only; no Qatar or GCC equivalent exists.
- **Earnings-call signals:**
  - AI recommendations raised Facebook time spent by 5% in Q3 2025. [MediaNama, https://www.medianama.com/2025/10/223-meta-q3fy25-earnings-call-ai-engagement-adverts-zuckerberg-superintelligence/, 30 Oct 2025]
  - In Q1 2026, Facebook global video time rose more than 8%, the biggest gain in four years. Same-day posts made up more than 30% of recommended Reels across Facebook and Instagram. Meta said it is building LLM-based recommender systems. [MediaNama, https://www.medianama.com/2026/05/223-llm-based-recommenders-ads-ai-agents-metas-growth-strategy-q1-fy26-earnings-call/, May 2026]
  - Q4 2025 "25% more same-day Reels" and Q2 2026 "video time +9%" come from search snippets only (nasdaq.com timed out, aol.com returned 404): **unverified**.
- **All videos are now Reels.** Announced 17 Jun 2025 and rolled out over the following months. Reels "will not be subject to any restrictions on length or format", with examples from 30-second vertical clips to horizontal episodes of 20+ minutes. The Video tab became the Reels tab, and video and Reels metrics merged into Reels Insights (3-second and 1-minute views kept). [Meta for Creators, https://creators.facebook.com/blog/making-it-easier-to-create-videos-on-facebook, 17 Jun 2025]
- **Friends tab ("OG Facebook").** Launched late March 2025, US and Canada only at launch. Tom Alison, who heads the Facebook app, framed it as a return to the early network, but Meta said recommendations stay in the Home feed. [9to5Mac, https://9to5mac.com/2025/03/27/og-facebook-is-back-with-big-change-to-facebooks-iphone-app/, 27 Mar 2025] Whether it has reached Qatar: **unverified**.
- **Originality enforcement (14 Jul 2025).** Accounts that repeatedly reuse others' videos, photos or text without credit lose monetisation for a period and get **reduced distribution on everything they post**. Duplicate videos are demoted, and Meta is testing links from copies back to the original.
  - Meta's advice: post mostly content you made yourself; adding a watermark or compiling clips does not count as original; avoid third-party watermarks and very short low-value clips; captions without links, minimal capitals and **five or fewer hashtags** do better.
  - Enforcement so far: about 500,000 spammy accounts actioned and about 10M impersonator profiles removed in the first half of 2025.
  - [Meta for Creators, "Combating unoriginal content", https://creators.facebook.com/blog/combating-unoriginal-content, 14 Jul 2025]
- **Link-post limit test (from about 16 Dec 2025).** Some Professional-mode profiles and Pages without Meta Verified (from $14.99/month) are capped on organic posts with links, reportedly 2 a month based on a screenshot.
  - Not limited: links in comments, affiliate links, and links to Facebook, Instagram or WhatsApp. Publishers are excluded.
  - [TechCrunch, https://techcrunch.com/2025/12/17/facebook-is-testing-a-link-posting-limit-for-professional-accounts-and-pages, 17 Dec 2025]
  - Sources disagree on the cap: one report says it varies by account. [MediaNama, https://www.medianama.com/2025/12/223-meta-pay-wall-urls-facebook-posts-verified-subscribers/, Dec 2025]
  - Whether the test has ended or expanded: **unverified**.

##### 1.2 Independent Facebook data

- **Socialinsider 2026** (25M posts from 130,683 Pages, Jan 2024 to Dec 2025; engagement measured against fans):
  - Average engagement 0.15%, flat year on year.
  - 2025 by format: status 0.20%, album 0.18%, Reel 0.18%, image 0.15%, link 0.05%.
  - Brands posted 22% less. Albums led on views and shares at every Page size.
  - Q3 2026 update: album 0.10%, image 0.08%, status 0.10%, link 0.05%.
  - The page contradicts itself: the text says Reels lead while the table puts status posts first.
  - [Socialinsider, https://www.socialinsider.io/social-media-benchmarks/facebook, 23 Mar 2026]
- **Buffer 2026** (engagement measured against reach): Facebook median about 5.6%. By format: images 5.20%, video 4.84%, text 4.76%, links 4.43%. [Buffer, https://buffer.com/resources/state-of-social-media-engagement-2026/, 5 Mar 2026]
- **Emplifi:** Facebook median engagement stable at 1–2%, with Live video getting about 4× the engagement of links and 6× that of images. The method is not disclosed. [Emplifi, https://emplifi.io/resources/blog/social-media-benchmarks, undated, covers to Q4 2025]
- **Posting frequency:** Rival IQ puts the Facebook median at just under 3 posts a week, the lowest in its six-year view. [Quid/Rival IQ 2026, https://www.quid.com/knowledge-hub/resource-library/blog/2026-social-media-industry-benchmark-report, 5 Mar 2026] Socialinsider has Facebook brand volume at 24 posts a month in 2025, down 48%. [Socialinsider, https://www.socialinsider.io/social-media-benchmarks, 16 Jan 2026]
- **Page reach decline:** I found no 2025–26 primary dataset that measures it directly; the 1.1% link-view share above is the best proxy. Rival IQ's 2025 edition reported Facebook engagement down 36% year on year. [Rival IQ, https://www.rivaliq.com/blog/social-media-industry-benchmark-report/, 25 Feb 2025]

##### 1.3 Specs

- **Feed image (Meta ads guide; no organic spec is published):** 4:5 at 1440×1800, JPG or PNG, up to 30 MB, at least 600×750. Primary text 50–150 characters; headline 27 characters. [Meta Ads Guide, https://www.facebook.com/business/ads-guide/update/image/facebook-feed, accessed 18 Oct 2026] Note this is 1440×1800, not the commonly quoted 1080×1350; both are 4:5. 1:1 is still accepted within the guide's 3% aspect-ratio tolerance only for 4:5-adjacent sizes, so treat 1:1 as **unverified** here.
- **Reels:** no length or format limit since the June 2025 change (source above). The 9:16 format and the safe zones are **unverified**: the Reels ads-guide page returned 404. Common practice is 1080×1920 with the top ~14% and bottom ~35% kept clear.

##### 1.4 Penalties

- **Engagement bait:** posts that explicitly ask for votes, shares, comments, tags or reactions for anything other than a specific call to action. Exceptions are missing people or property, fundraising, petitions, showing support for an issue, and disaster or emergency information. [Meta, https://transparency.meta.com/features/approach-to-ranking/content-distribution-guidelines/engagement-bait/, accessed 18 Oct 2026]
- **Types of content Meta demotes:** clickbait links, engagement bait, fact-checked misinformation, and content likely to break Community Standards. [Meta, https://transparency.meta.com/features/approach-to-ranking/types-of-content-we-demote/, updated 2 Jul 2025]
- **Meta's own pages disagree on originality.** In Jul 2025 Meta removed 14 distribution guidelines (including "Domains with Limited Original Content" and "Unoriginal News Articles"), and "Pages Posting Unoriginal Videos" had already been dropped in Oct 2023. [Meta CDG changelog, https://transparency.meta.com/features/approach-to-ranking/cdgs-changes-corrections/, 2 Jul 2025] Yet the 14 Jul 2025 Creators post says unoriginal content *is* demoted. In practice, originality is now enforced through the creator/monetisation system rather than a listed guideline.

##### 1.5 AI labelling across Facebook, Instagram and Threads

- **Labels:** "AI info" is applied when Meta detects industry-standard indicators or the user discloses. "Made with AI" was renamed "AI info" on 1 Jul 2024. From 12 Sep 2024, content only *edited* with AI shows the label in the post menu, while fully generated content shows it openly. Meta may add a more prominent label for high-risk deceptive content. Images made with Meta AI say "Imagined with AI". [Meta, https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/, 5 Apr 2024, updated 23 Oct 2025]
- **Disclosure is required** for photorealistic video or realistic-sounding audio, and "we may apply penalties if they fail to do so". Images are detected through C2PA and IPTC metadata. [Meta, https://about.fb.com/news/2024/02/labeling-ai-generated-images-on-facebook-instagram-and-threads/, 6 Feb 2024, updated 1 Apr 2025]
- **GCC:** these Meta policies apply worldwide. I could not check any Qatar- or GCC-specific AI-content law (search budget exhausted): **unverified**.

---

#### 2. WhatsApp Channels

##### 2.1 Discovery and features

- **Updates tab:** holds Channels and Status, and is "used by 1.5 billion people a day". That figure covers the whole tab, not Channels alone. [WhatsApp Blog, https://blog.whatsapp.com/helping-you-find-more-channels-and-businesses-on-whatsapp, 16 Jun 2025]
- **Money features announced 16 Jun 2025:**
  - Channel subscriptions: followers pay a monthly fee for exclusive updates.
  - Promoted Channels: paid visibility in the directory.
  - Ads in Status: ads that open a chat with the business.
  - Ad targeting uses country or city, language, channels followed and ad interactions. Personal messages, calls and groups are not used.
  - No per-country rollout dates were given. [same]
- **Channels page:** discovery is through the directory, and notifications are muted by default. Admins can send voice messages, polls and stickers, and share the channel link or QR code in Status and chats. Follower lists are private; a follower's phone number is visible only to admins who have them saved as a contact. Subscriptions "may not be available to all users". [WhatsApp, https://www.whatsapp.com/channels, accessed 18 Oct 2026]
- **Directory and ranking (Help Center FAQs as quoted by Kanal, not directly verified):**
  - The directory can be sorted by new, popular or most active, filtered by country and language, and the region can be changed.
  - WhatsApp does not accept requests to be added to Explore, recommendations or suggestions.
  - Recommendation signals: updates, follower count, reactions, how often a channel posts, similarity to popular channels, and **the viewer's location and language, which have the biggest influence**.
  - Up to 16 additional admins. A real phone number is required; channels cannot be run from the Business API.
  - Verified channels are a Meta Verified for Business perk (1 on Business Standard up to 10 on Business Max); public verification requests are not accepted.
  - [Kanal, https://getkanal.com/blog/whatsapp-channels-feature-guide, read Oct 2026, citing faq.whatsapp.com/962978635456336, /630432792316720, /794229125227200 and /3872729742954601]
- **Sharing as a growth route:** a channel link can be sent to up to 5 chats or groups at once, and individual posts can be forwarded (via Kanal, citing faq.whatsapp.com/2490388581320854; **unverified**).
- **Channel analytics:** reportedly follower count, reactions and poll responses only; no open rate or click-through. Kanal states this without citing WhatsApp: **unverified**.
- **User numbers:** the latest Meta-stated Channels figure is 500M+ monthly users in late 2023. [Siasat, https://www.siasat.com/whatsapp-channels-crosses-500-mn-monthly-active-users-2880087/, 2023] I found no newer Meta figure.
- **2026 developments:** Channel quizzes are in beta (limited iOS beta testers). [Apfelpatient, https://www.apfelpatient.de/en/news/whatsapp-is-testing-a-new-quiz-feature-for-channels, 2026] Usernames (3–30 characters) were being prepared as of Oct 2025 [Green-API, https://green-api.com/en/blog/2025/whatsapp-new-features-of-the-past-week-271025/, Oct 2025], but their launch is **unverified**.
- **Qatar:** Channels rolled out globally. Whether promoted channels, subscriptions, Status ads and Meta Verified for Business are available in Qatar is **unverified**. Meta does not publish WhatsApp user counts for Qatar, and DataReportal's Qatar report gives no WhatsApp figure.

##### 2.2 Specs

Text limits, media sizes, video length and document support for channel updates are **unverified**: the official FAQ pages returned only titles, and no second-hand source states them.

##### 2.3 Policy and penalties

- **Prohibited:** illegal content, content causing serious harm, fraud and impersonation, age-inappropriate or sexual content, and regulated or restricted goods. Admins are advised to avoid "too many or low-quality updates".
- **Enforcement ladder:** warning, pausing delivery, removing updates, revoking verification, removal from the directory and search, revoking the invite link, suspension, and banning admins. Repeat violations lead to suspension.
- [WhatsApp Channels Guidelines, https://www.whatsapp.com/legal/channels-guidelines?lang=en, updated 16 Feb 2024]
- **Business terms:** admins are responsible for their content, the WhatsApp Commerce Policy applies, and WhatsApp "may recommend Channels" based on country or language. [WhatsApp Channels Business Terms, https://www.whatsapp.com/legal/channels-business-terms?lang=en, 16 Feb 2024]

---

#### 3. GCC usage data (DataReportal Digital 2026; ad reach is not the same as active users)

| | Qatar | UAE | Saudi Arabia |
|---|---|---|---|
| Population | 3.13M | 11.4M | 34.7M |
| Social media identities | 2.95M (94.3%) | 12.5M (110%) | 38.6M (111%) |
| Facebook | 2.40M (76.6%) | 9.70M (85.0%) | 17.7M (50.8%) |
| YouTube | 2.31M (73.8%) | 8.37M | 27.5M |
| LinkedIn (members) | 1.80M | 10.0M | 12.0M |
| Instagram | 1.70M (54.3%) | 8.05M | 18.2M |
| Messenger | 1.50M | – | – |
| Snapchat | 1.24M (39.5%) | 5.13M | 25.3M (72.9%) |
| X | 650K (−11.2% YoY) | 2.85M | 15.0M |
| TikTok (18+) | 2.95M (114% of adults, flagged as an anomaly) | 12.5M | 38.6M |

Sources: [Digital 2026 Qatar, https://datareportal.com/reports/digital-2026-qatar, 8 Nov 2025]; [UAE, https://datareportal.com/reports/digital-2026-united-arab-emirates, 5 Nov 2025]; [Saudi Arabia, https://datareportal.com/reports/digital-2026-saudi-arabia, 8 Nov 2025].

Qatar year-on-year changes: Instagram +13.3%, Snapchat +19.6%, Facebook +6.7%.

---

#### 4. Cross-platform engagement comparison

| Platform | Socialinsider 2026 (2025 data; by followers, mean) | Rival IQ/Quid 2026 (by followers, median, 18 industries) | Buffer 2026 (by reach, median, 52M posts) | Hootsuite Oct 2026 (by followers, best content type) |
|---|---|---|---|---|
| Facebook | 0.15% | "flat" (no figure given) | ~5.6% | 2.9% |
| Instagram | 0.48% | 0.30% (down from 0.36%) | ~5.5% | 4.2% |
| TikTok | 3.70% (another page version says 2.50%) | 2.01% | ~4.6% | 1.5% |
| LinkedIn | not covered | not covered | ~6.2% | 3.9% |
| X | 0.12% | 0.03% | ~2.5–2.8% | 1.8% |

Sources: [Socialinsider, https://www.socialinsider.io/social-media-benchmarks, 16 Jan 2026]; [Quid/Rival IQ, https://www.quid.com/knowledge-hub/resource-library/blog/2026-social-media-industry-benchmark-report, 5 Mar 2026]; [Buffer, https://buffer.com/resources/state-of-social-media-engagement-2026/, 5 Mar 2026]; [Hootsuite, https://blog.hootsuite.com/average-engagement-rate/, 13 Oct 2026].

**Why the numbers differ:** Buffer divides by reach and only counts Buffer users. Socialinsider and Rival IQ divide by followers, and Rival IQ uses medians of 150 companies per industry. Hootsuite's follower-based figures are about 20× Socialinsider's for Facebook, so its method is evidently different and not disclosed. Emplifi reports TikTok medians of 27.6–35.9% with no stated method. Compare platforms *within* one report, never across reports.

**B2B-relevant figures:**
- Hootsuite, Technology industry: Facebook 1.8%, LinkedIn 3.9%. Professional services: Facebook 2.9%. (Hootsuite, above)
- Buffer formats: LinkedIn carousels 21.77% against link posts 3.81%; Instagram carousels 6.90% against Reels 3.31%, although Reels get 1.36× the reach. (Buffer, above)
- Buffer frequency: weeks with no posts fall below an account's own follower-growth baseline (the "no-post penalty"); 1–2 posts a week is already a meaningful improvement; reach per post drops at high frequency. (Buffer, above)

**Best times (all normalised to the viewer's local time):**
- Buffer: Facebook Thursday 9am, Wednesday the best day. [Buffer, https://buffer.com/resources/best-time-to-post-social-media/, 25 Mar 2026]
- Sprout Social: Facebook Mon–Thu, Tue/Wed 12–8pm; Sunday worst; data from 27 Nov 2025 to 27 Feb 2026. [Sprout Social, https://sproutsocial.com/insights/best-times-to-post-on-social-media/, 31 Mar 2026]
- Hootsuite: Facebook Tuesday 9am; LinkedIn Tue/Wed 4–6am. [Hootsuite, https://blog.hootsuite.com/best-time-to-post-on-social-media/, 19 Nov 2025]
- All three use mostly Western data on a Sat–Sun weekend. My inference: Qatar's weekend is Fri–Sat, so map "midweek" to Sun–Wed or Mon–Wed and test it.

**Not available:**
- Hootsuite Social Trends 2026 is qualitative: AI is now baseline, social search, micro-dramas, employee advocacy. No sample size is stated. [https://www.hootsuite.com/research/social-trends, undated]
- Metricool 2026 (39M+ posts, 1M+ accounts, published 10 Dec 2025) is gated. [https://metricool.com/social-media-study/]
- Later benchmarks returned 404; the Sprout Social Index was not retrieved.

---

#### 5. Practical takeaways for a small B2B/B2SMB brand in Qatar

1. **Keep links out of Facebook posts.** Links get the lowest engagement (0.05%, Socialinsider), only 1.1% of US Feed views go to posts with links, and a link-cap test is running. Put the URL in the first comment, or use a click-to-WhatsApp link, which the test does not limit.
2. **Make it yourself, in albums and short Reels.** Film your own material, use no third-party watermarks or reposts, and five or fewer hashtags. Albums or carousels lead on views and shares; Reels bring reach to people who don't follow you (36.6% of feed is recommended). Ask for one specific action, never "comment YES", which counts as engagement bait.
3. **Post steadily, not heavily.** 2–4 posts a week on Facebook and LinkedIn (medians are about 3 a week), never a silent week, Sunday to Wednesday mornings and evenings Qatar time, then adjust from your own Insights.
4. **Choose platforms by Qatar reach.** Facebook (2.40M) and LinkedIn (1.80M members) for business owners, Instagram (1.70M, +13%) for visual proof, Snapchat for younger consumers. Keep X minimal (650K and shrinking).
5. **WhatsApp Channel: set it up for local discovery and grow it by hand.** Directory placement can't be requested, and viewer location and language weigh most, so name and describe the channel in Arabic and English. Grow it with the QR code and link in Status, chats, invoices and in-person sales. Post a few good updates a week, not many. Polls and voice notes are available. Promoted Channels, subscriptions and Meta Verified are paid, so they fall under ALYR's no-payment-before-CR rule.
