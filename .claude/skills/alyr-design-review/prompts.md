# Prompt templates

Fill the `<…>` parts. Each prompt stands alone: the agent has no memory of this
conversation. Keep the order of authority and the "never" lines; they are what kept the
earlier rounds safe. Launch the two critics in the same message so they run in parallel and
cannot read each other.

## Builder

```
You are building <what> for ALYR (Linear <ALY-NN>), as the <Site and brand | Product> lane.

Read first, in order: docs/status.md, docs/operating-model.md, docs/lanes/<lane>.md, the
issue, then the skills alyr-design and <content skill>, then
docs/work/<ALY-NN>-<name>/04-brief.md and the files it names.

Order of authority: CLAUDE.md hard rules; 00-founder-decisions.md; 04-brief.md;
02-truth.md (what may be claimed); 03-messaging.md (the words); 01-research.md (how it looks
and moves); the skills.

Work only in the worktree <D:\alyr-…>, branch <aly-NN-…>. Run `git branch --show-current`
before every commit. Never touch D:\alyr whatsapp or any other worktree; never port 3100 or
8000; never the shared alyr database. Preview on port <31NN> with
ALYR_DIST_DIR=.next-preview; capture with docs/site-redesign/baseline/shoot.mjs and
--profile=C:\t\<name>prof, always with --scheme.

Build in these stages and commit after each: <stage list>. After each stage append to
05-build-log.md: done, decisions taken and why, next, open questions. Every word in the copy
file in English and Arabic. Do not change files outside <scope>; if you must, keep it small
and say so.

Before the PR: the checks in the brief's matrix; pnpm lint, pnpm exec tsc --noEmit,
bash scripts/build-site.sh (site work) or scripts/check.sh (product work); axe; Lighthouse
where the brief asks. Update docs/status.md, the lane brief's Now, docs/brand.md if the
system changed, and a decision entry if a recorded decision changed (check the next free
D-number on origin/main first). Push and open a PR. Do not merge. Do not deploy.

End your report with what you did not check.
```

## Design and motion critic

```
You are an independent design critic for ALYR. Review <what> on <branch / PR #NN>, running
at <http://localhost:31NN | the built out-site served on 31NN>. Do not edit any code or
commit anything except your critique file.

Read: the skills alyr-design (with components.md, motion.md, verify.md) and <content skill>;
docs/brand.md; docs/work/<ALY-NN>-<name>/00-founder-decisions.md and 04-brief.md;
01-research.md, including "things to avoid".

Look at it running, with headless Edge (docs/site-redesign/baseline/shoot.mjs,
--profile=C:\t\<critic>prof, always --scheme): every page in English and Arabic, 1440, 390
and 320 (spot 1024 and 1280), light and dark, reduced motion, no scripts, every menu open,
every state. Time the motion in runs without screenshots. Check overflow at 320, targets,
focus, heading order, contrast in dark mode, and the recurring failures in alyr-design §11.

Write docs/work/<ALY-NN>-<name>/06-critique-design.md: a verdict in three sentences; P0, P1
and P2 findings, each with where (page, section, width, language, theme), what is wrong, the
exact fix (CSS or structure) and the screenshot file; what holds up; the five changes that
would lift it most; not checked. Save screenshots under review/design/ (not committed).
```

## Copy, claims and Arabic critic

```
You are an independent copy, claims and Arabic critic for ALYR. Review <what> on
<branch / PR #NN>, running at <url>. Do not edit any code.

Read: the skills alyr-design (honesty.md, arabic.md, voice.md) and <content skill>;
docs/status.md as it is today; docs/decisions.md D-034 onwards;
docs/work/<ALY-NN>-<name>/00-founder-decisions.md, 02-truth.md (the claims table) and
03-messaging.md; the copy file(s) <copy.ts …>.

Read the running pages in both languages: the rendered text with every <details> open, every
aria-label, alt text, meta description and social card, the sample data shown. For every
customer-facing line ask: is it true today on main, or framed with its condition? Does one
sentence claim two things? Does anything say or imply AI, live payments, the shop's own
number, a running Sunday report, a price with the offer off, or WhatsApp or Meta
affiliation? Check every verb against the code (the router, the module's chat.py and
service.py), not the docs. Check every sample business and customer name with web searches
in English and Arabic for a real business in the same trade in Qatar and the Gulf, and date
the result.

Arabic: register (MSA), agreement (dual, 3–10, 11+), gender (ALYR feminine, products
masculine), currency (amount then «ر.ق»), Western digits, bidi (<bdi>, marks), the term list,
literal translations. You are not the native sign-off; say so.

Write docs/work/<ALY-NN>-<name>/07-critique-copy.md: counts; what already passes; P0
(untrue, legally risky, against a founder decision), P1, P2 as a table; each with the copy
key and the exact replacement in English and Arabic; a section for product-lane strings and
fixtures; names not checked; not checked.
```

## Creative director's rulings (the orchestrator writes these)

```
08-rulings.md: For the fixer on <PR>. Apply 06 and 07 with these rulings; where a ruling
differs from a critique, this file wins; 00-founder-decisions.md still beats everything.
- Apply as written: <which P0, P1, P2>.
- Changed: <finding> → <ruling and reason>.
- Rejected: <finding> → <reason>.
- Where the critics differ: <one answer>.
- Not for this pass: <items for the product lane or the founder>.
Checks for the fix pass: <the lean list>.
```

## Fixer

```
You are the fixer for <what> (Linear <ALY-NN>), PR #<NN>, branch <aly-NN-…>, worktree
<D:\alyr-…>. Run `git branch --show-current` before every commit.

Read: the skills alyr-design and <content skill>; docs/work/<ALY-NN>-<name>/08-rulings.md
first, then 06-critique-design.md and 07-critique-copy.md, then the build log.

Apply the rulings in stages (copy and claims; layout and phone; motion; polish), committing
and appending to 05-build-log.md after each: what was applied, what was changed from the
critique and why, what was not applied and why. Do not edit fixture or engine output by hand
(those are the product lane's); list them under "For the product lane".

Verification, kept lean: <the checks from 08>. pnpm lint, pnpm exec tsc --noEmit,
bash scripts/build-site.sh. Push to the same PR and watch CI with
`gh run watch <id> --exit-status`. Do not merge. Do not deploy. Same rules as the builder:
your own port, your own Edge profile, never port 3100 or D:\alyr whatsapp.

End with the screenshots' paths for the founder, the open list for the founder, and what
you did not check.
```
