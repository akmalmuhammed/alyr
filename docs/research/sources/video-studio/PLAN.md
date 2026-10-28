> Copied 2026-10-24 from D:/alyr-video/PLAN.md for the research library. Original kept. Status: Partly superseded.

# ALYR launch videos: the plan

Written 18 Oct 2026. This folder (`D:\alyr-video`) is ALYR's video studio. Everything here is code: Claude writes the scenes, renders them, and checks the frames. The app repo (`D:\alyr whatsapp`) stays the source of truth for brand, words and product screens. Copy from it; never edit it from here.

## 1. What is installed

| Tool | What it is | Where | Use it for |
|---|---|---|---|
| **Remotion** 4.0.536 | React components that render to video, frame by frame | `remotion/` · Studio: `npm run dev` · render: `npx remotion render <id> <file>` | The hero film and the product films. Because it is React, it can render ALYR's **real** product components (the Agent dashboard, the chat, the workspace window) with the real sample data, not imitations. |
| **HyperFrames** 0.8.169 (HeyGen, Apache 2.0) | HTML + CSS + GSAP pages that render to video. Comes with checks an agent can run on its own: `lint`, `check`, `snapshot`, `inspect`, `beats`, `audio` | `hyperframes/` · `npm run dev`, `npm run check`, `npm run render` | Fast cutdowns, kinetic type, captions, social formats, beat-synced edits, and `capture` of a live web page as material. |
| **Agent skills** | 12 Remotion skills and 10 HyperFrames skills, loaded by Claude on demand | `~/.claude/skills/remotion-*`, `~/.claude/skills/hyperframes*`, `media-use` (global, all sessions) | Best practice for each tool, so a new session gets timing, assets and rendering right the first time. |
| **FFmpeg / FFprobe** | Encoding and probing | `bin/` (self-contained; nothing installed on Windows). Put it on `PATH` for HyperFrames: `export PATH="/d/alyr-video/bin:$PATH"` | Everything. |

**Settings made:** HyperFrames' anonymous telemetry is off, because these are unreleased launch films. Also set `HYPERFRAMES_NO_TELEMETRY=1`. Its `publish` script, which uploads to HeyGen's servers, is removed from `hyperframes/package.json`. Nothing leaves this machine until the founder publishes it himself.

**Licences:**
- Remotion is free for a company of up to 3 people. ALYR is 1, so it's free; at 4 or more people it needs a company licence (remotion.pro).
- HyperFrames is Apache 2.0.
- The fonts are SIL Open Font Licence.

**Proof it works:**
- `out/hyperframes-test.mp4` and `out/remotion-test.mp4` are 4-second tests: the real logo arrives along the 45° diagonal, then the Volt plane and the FIG caption confirm it.
- Frame strips are in `out/hf-strip.png` and `out/rm-strip.png`.

**Not installed: Diffusion Studio.** It's an open-source editor (MPL-2.0) where an agent can watch and listen to **real footage**, cut a timeline, remove filler words and add subtitles. It needs its desktop app (Windows x64 is supported). We only need it once there is real footage, such as the founder in a shop (deliverable 5 in section 4), so install it at phase 5.

## 2. What the research says works (Oct 2026)

Since Opus 5.5 (22 Sep 2026) X is full of videos Claude made. They are not generated pixels. Claude writes a program (Remotion, HyperFrames, Three.js, canvas) that draws every frame, then renders it. What separates the good ones from the slop:

1. **A workflow, not a one-liner.** The viral one-line prompt ("a 15-second motion showreel") gets a flashy, generic reel. People who got something they could ship worked in stages: visual style, then the script, then the storyboard as still HTML frames, then motion, then sound. This is the main lesson.
2. **A real system to draw with.** Brand tokens, real fonts, the real logo and real UI. The good launch films show the actual product. The bad ones invent glowing dashboards.
3. **Claude checks its own frames.** It renders stills at key moments, looks at them, and fixes clipped text, overlaps and contrast before the final render. HyperFrames has this built in: `snapshot`, `inspect`, `check`.
4. **Time to read.** The most common complaint is text that leaves before you can read it. Rule: a line stays on screen for its word count ÷ 3 seconds, plus 1 second.
5. **Sound is half the film.** Cuts land on the beat (`hyperframes beats`). Music ducks under any voice. Mix to −14 LUFS for social.
6. **High effort, several rounds.** Creators ran at extra-high or max effort and still needed several rounds of pointed feedback. Plan for rounds.
7. **Record the real app.** One reliable trick is to have the agent drive the real product (Playwright) and record it, or render the real components.
8. **What fails:** generic AI copy, every word animated differently, everything moving at once, and a look everyone will recognise as "AI video" within months.

**What OpenAI-style launch films do, and why they fit ALYR:**
- Restraint: one idea per shot.
- The real product on screen, at true scale.
- Calm type that arrives and settles.
- One signature motion that runs through everything. ALYR already has its own: **things arrive along the logo's 45° diagonal, settle, and one Volt signal confirms them.**
- No hype, no stock "happy customer" shots. Ending on the mark.

## 3. The creative rules (from `docs/brand.md`, applied to video)

- **Light first**, Paper `#f6f7f3`. Carbon `#15171a` for command moments: the band, the plate, the closing call.
- **Volt** `#b7f34a` means one of four things: the main action, the current state, confirmed progress, or one signal. It is never a background and never decoration.
- **Type.** Instrument Sans for Latin. IBM Plex Sans Arabic for Arabic: never letter-spaced, looser line height, headings never split. IBM Plex Mono for FIG captions, times and IDs.
- **Motion.**
  - Arrive along 45° on expo.out (`cubic-bezier(.16,1,.3,1)`), settle, then one Volt signal.
  - Durations come from the scale 120 / 240 / 480 / 720 ms, with a 60 ms stagger.
  - Mirrored in Arabic: the diagonal runs the other way.
- **Transitions are the fold:** three Carbon planes with the symbol's gaps sweep across along 45°. This is ALYR's equivalent of the OpenAI point.
- **FIG captions** on every product shot: "FIG 01 · what it shows · SAMPLE, FICTIONAL BAKERY".
- **The real product, at true scale,** with the real sample businesses: Qirfa Bakery / مخبز قرفة, Dafira Salon, Zilal Cooling. They are labelled as samples.
- **Drawn chats are neutral:** no WhatsApp logo and no WhatsApp green. We may write "WhatsApp" in words.
- **Honesty:**
  - No invented metrics, customers, logos or testimonials.
  - Only things the product really does. Anything still on the simulator (keeping your own number, payment links through your own gateway) is either not shown or shown as "coming".
  - Payroll appears only on a dashed line with the hollow dot.
- **Voice:** sentence case, short, names the result. Not "unlock", not "supercharge", not "revolutionise".

## 4. What we make (a launch kit, not one video)

| # | Piece | Length · format | Engine |
|---|---|---|---|
| 1 | **Hero film:** "Your business just got an agent." | 60–75 s · 16:9 4K master, English and Arabic | Remotion |
| 2 | Teaser | 15–20 s · 9:16, 1:1, 16:9 | HyperFrames |
| 3 | One film per product: Chat, Bookings, Agent, Accounts | 30–40 s each · 16:9 and 9:16 | Remotion (real components) |
| 4 | Loops: the logo sting, the "Done for you" counter, the live feed | 4–8 s · for posts, the site and WhatsApp Status | HyperFrames |
| 5 | Founder note: Akmal in a real Doha shop, why ALYR exists | 45–90 s · real footage | Diffusion Studio + HyperFrames captions |
| 6 | Captions and stills | Burned-in captions (sound-off viewing) plus SRT files; poster frames for each piece | Both |

### The hero film, beat by beat (first draft for the founder to change)

| Time | Shot | On screen |
|---|---|---|
| 0–4 s | Paper. One message arrives along the diagonal into a neutral chat: "Do you have the date cake for tonight?" A mono time: 07:42 | FIG 01 · a customer writes · SAMPLE, QIRFA BAKERY |
| 4–10 s | More messages from more customers, in Arabic and English. The pace builds and the screen gets busy | "Every business here runs on WhatsApp." |
| 10–13 s | **The fold** sweeps across along 45°. Carbon band | "Your business just got an agent." Volt dot lights once |
| 13–28 s | The real Agent dashboard in its workspace window. The live feed plays the real sample events: menu sent, order confirmed, booking reminder, one item flagged by a rule. "Done for you" counts up | Each event's words exactly as the product logs them |
| 28–40 s | Three quick, real flows, one per product: a booking is made (Bookings), an order goes in (Chat), a balance goes out (Accounts) | One line each, held long enough to read |
| 40–50 s | Switch the sample business: bakery → salon → home services. The same agent, a different business | "Built for Qatar's businesses." |
| 50–58 s | The suite on its ruled rows: Chat, Bookings, Agent, Accounts; Payroll on a dashed rule with the hollow dot | The products' one-liners |
| 58–65 s | The fold closes. The logo arrives along the diagonal and the Volt plane confirms it | alyr.qa · the WhatsApp action once ALYR has its number |

Arabic is its own film, not subtitles: Arabic copy from `copy.ts`, the layout mirrored and the diagonal flipped. It needs a native reviewer before release.

## 5. How each film gets made (the workflow)

1. **Brief and claims check.** What this film says. Check every claim against `docs/status.md`: is it live, on the simulator, or coming?
2. **Script.** Every word on screen, in English and Arabic, from `copy.ts` where possible. Founder approves.
3. **Storyboard as stills.** One still per beat, at the real size, rendered with the real brand kit. **Founder approves before any motion.** It's the cheapest moment to change your mind.
4. **Animatic:** timing with a temporary track and the beat grid (`hyperframes beats`).
5. **Build:** one composition per scene. Review in Remotion Studio or HyperFrames preview.
6. **Claude's own check loop:**
   - render stills at every beat (`snapshot` / `inspect`);
   - check reading time, overlaps, contrast (AA), the Volt rules and the FIG captions;
   - fix, and repeat until clean.
7. **Sound:** music, a few soft sound effects on the Volt signals, the voice if there is one. Duck the music under the voice; mix to −14 LUFS.
8. **Arabic version,** then a native review.
9. **Masters:**
   - 4K and 1080p, 16:9;
   - 1080×1920 and 1080×1080;
   - captions burned in plus SRT files;
   - a poster frame for each.
10. **Founder sign-off.** Publishing is the founder's own action, and only once the gate in section 7 is clear.

**How to ask Claude for a film** (the brief format that works; put it in the session that builds it):

> Role: motion designer for ALYR. Read `D:\alyr-video\PLAN.md` sections 3 and 5 and `D:\alyr whatsapp\docs\brand.md` first.
>
> **Film:** <name>, <length>, <format>.
>
> **Story beats with seconds:** <table>.
>
> **Words on screen, exactly:** <EN and AR>.
>
> **Use:** the brand kit in `remotion/src/brand/`, the real components, the samples Qirfa / Dafira / Zilal.
>
> **Rules:** Volt only as a signal, 45° arrivals on expo.out, reading time (words ÷ 3) + 1 s, nothing invented.
>
> **Process:** storyboard stills first and stop for my approval; then build; render a still at every beat, critique it against the rules, and fix before showing me. Work at high effort.

## 6. Build order (phases, not dates)

| Phase | What | Done when |
|---|---|---|
| 0 | Tools installed, telemetry off, branded test renders | **Done** (this folder) |
| 1 | **The video brand kit:**<br>• tokens, fonts (add IBM Plex Sans Arabic and the other Instrument Sans weights, OFL)<br>• `<Logo>`, `<Symbol>`, `<Fold>` (transition), `<FigCaption>`, `<Arrive>` (the 45° gesture), `<Window>`, `<NeutralChat>`<br>• the real `AgentDashboard` imported from the app in showcase mode<br>• a 6 s logo sting | The sting renders in English and Arabic, and the dashboard renders pixel-identical to `/agent-sample` |
| 2 | Hero film: script and storyboard stills | Founder approves the stills |
| 3 | Hero film in English: animatic, then full with sound | Founder approves |
| 4 | Hero film in Arabic, the teaser, the loops | Native review done |
| 5 | Product films (4) and the founder note (install Diffusion Studio here) | Founder approves |
| 6 | Launch | The gate below is clear |

## 7. The gate before anything is posted

- **The Qatar CR exists.** Selling through social media needs MOCI's e-commerce licence, which needs the CR (see the registration-gate research, PR #47). A launch film is advertising: show **no prices, no offer, no money-back promise** until the CR exists and a lawyer has said yes.
- **Every claim is true on the day it's posted.** If WhatsApp isn't live on Meta for real shops yet, the film shows only what is, or says "coming".
- **ALYR's own WhatsApp number exists,** if the call to action is "Message us on WhatsApp". Until then the end card says alyr.qa.
- **A native speaker has reviewed the Arabic.**

## 8. Decisions for the founder

1. **Voice.** Options:
   - (a) no voiceover: type, music and the product, like the OpenAI and Apple films (recommended for the hero);
   - (b) your own voice;
   - (c) an AI voice (ElevenLabs is paid; the free local Kokoro voice is English only and weak in Arabic).
2. **Music.** Options:
   - (a) a licensed library such as Epidemic Sound or Artlist, about €10–15 a month, paid only for the month you render (recommended: launch films live or die on the track);
   - (b) music generated locally for free (MusicGen; weaker);
   - (c) composed in code (minimal, clean, limited).
3. **Order.** English first, then Arabic (recommended, faster to approve), or both together.
4. **Which look.** The site uses the design-system look while ALY-61 (which look is ALYR's) is still open. The films follow the site unless you decide otherwise.
