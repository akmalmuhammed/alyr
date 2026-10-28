# ALYR launch videos: the video studio plan

| | |
|---|---|
| **Category** | marketing |
| **Date** | 2026-10-18 |
| **Status** | Partly superseded |
| **Where it lives** | Video studio folder, not in git: `D:/alyr-video/PLAN.md`. Copy in `docs/research/sources/video-studio/PLAN.md` |
| **Lane** | Growth |

## Question it answered
How can ALYR make launch films in code with Claude, what makes them good rather than generic "AI video", and what launch kit should be made in what order?

## Key findings
- The studio is code only. Remotion 4.0.536 renders the real React product components, such as the Agent dashboard. HyperFrames 0.8.169 (Apache 2.0) makes fast cut-downs and kinetic type, and has self-checks (`lint`, `check`, `snapshot`, `inspect`, `beats`). FFmpeg sits in `bin/`.
- Privacy settings: HyperFrames telemetry is off and its `publish` script, which uploads to HeyGen, was removed. Nothing leaves the machine until the founder publishes. Remotion is free up to 3 people and needs a company licence at 4 or more.
- What separates good Claude-made video from slop (research, Oct 2026): work in stages (style, script, still storyboard, motion, sound); draw with the real brand system and the real product; have Claude render and check its own frames; give time to read; let sound drive the cuts; plan several rounds of feedback. Generic AI copy and everything moving at once fail.
- Reading rule: a line stays on screen for its word count ÷ 3 seconds, plus 1 second. Mix to −14 LUFS for social.
- The brand rules applied to video: Paper first, Carbon for command moments, Volt only as a signal, arrive along 45° on expo.out, the fold as the only transition, neutral drawn chats with no WhatsApp logo.
- A launch kit, not one video: a 60–75 s hero "Your business just got an agent.", a 15–20 s teaser, one 30–40 s film for each product, 4–8 s loops, a founder note shot in a real Doha shop, captions and stills.
- A 10-step workflow with founder approval at the still storyboard ("the cheapest moment to change your mind"), and a reusable brief format for asking Claude for a film.
- The gate before posting: the CR exists (selling on social needs MOCI's e-commerce licence, which needs a CR); no prices, offer or money-back promise until then; every claim true on the day; ALYR's own WhatsApp number before a "Message us" call to action; a native Arabic review.
- Founder choices it raised: voice (none, the founder, or an AI voice), music (a licensed library at about €10–15 a month, generated, or composed in code), English first or both together.

## What we decided because of it
- Phase 0 (tools installed, branded test renders) is done. The three product films of 18 Oct (`films/CREATIVE.md`) came from it.
- No D-number. The CR gate matches D-034.

## What changed since, and conflicts
- The hero line "Your business just got an agent." (D-037) was replaced by D-047, then by D-048 ("The tech team your business never had."). The 24 Oct film direction (`films/DIRECTION.md`) replaces the launch kit with a 90 s hero "The other job" and six product films.
- "Which look" is settled: Carbon and Volt (D-040).
- The founder note conflicts with D-043 (brand speaks, no founder name or face).
- Showing Payroll on a dashed line and things as "coming" conflicts with D-039 and D-046: Payroll is not shown until built, and nothing "coming" is shown.
- FIG captions were replaced by the single "Sample" mark (brand.md, 24 Oct).
- The 24 Oct direction recommends voice actors and a commissioned composer, not "no voiceover" and library music.
- Still valid: the tool setup, the workflow, the reading rule and the posting gate.

## Use it for
- Setting up or running the video studio, and the step-by-step workflow for a code-made film.
- The pre-posting gate and the reusable film brief format.
