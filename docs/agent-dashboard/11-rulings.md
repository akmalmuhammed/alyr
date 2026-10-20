# Creative director's rulings on the suite site critiques

17 Oct 2026. For the fixer on PR #53. Apply `10-critique-copy.md` now, and `09-critique-design.md` when it lands; this file wins where they differ. `00-founder-decisions.md` still beats everything.

## Copy (10)

- **Apply every P0 and P1.** Apply P2 where it is a string change or a small layout change.
- **P0-1, the hero:** take the critique's version. The eyebrow is "ALYR · At work for you" (Arabic to match). The H1 "Your business just got an agent." stays. The body names who does what: ALYR (through Chat and Bookings) replies and reminds in the chat; ALYR Agent puts what needs you on one screen, by rules you can check. The Arabic H1 is the critique's proposal. The feed's status chip changes to match: it shows ALYR at work, not ALYR Agent sending messages.
- **P0-2, the sample names:** Dafira Salon / «صالون ضفيرة» and Zilal Cooling / «ظلال للتكييف». The product agent is renaming the seeds and recapturing the fixtures on PR #50 (branch `aly-agent-dashboard`). When it is pushed, merge `origin/aly-agent-dashboard` into this branch. Then update every site-side mention: `copy.ts` feeds, captions and monograms. Do not edit the fixture JSON yourself.
- **P1, payments:** no line may read as if card payments are live.
- **"Weekly on WhatsApp"** and any other claim about the Sunday report: the report is built but has never been sent to an owner, and its template needs Meta's approval. Frame it as early access, the way the homepage does elsewhere, or follow the critique's wording if it gives one.

## Design (09)

Apply every P0 and P1, and the P2s that are small. A follow-up message will add rulings if needed.

## Verification for this pass (kept lean, the founder is waiting)

- `pnpm lint`, `pnpm build`, `bash scripts/build-site.sh`.
- Screenshots of the changed sections only, both languages, at 1440 and 390, plus one dark pass of the homepage and `/agent`.
- axe on `/` and `/agent` in both languages.
- Lighthouse mobile on `/` only, unless a change could affect another page's speed.
- Push to PR #53, keep CI green, and append to `08-site-log.md`.
