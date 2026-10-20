---
name: alyr-design-review
description: Run ALYR's design cycle or review branded work before it ships. Use when a page, screen, message, image, print piece or deck is redesigned or built new; when asked to review, critique or check design, copy, claims or Arabic; when running builder, critic, creative-director or fixer agents; when writing a brief, rulings or a build log; before showing screenshots to the founder or asking to publish; and after publishing, for the live check. Load alyr-design first.
---

# The design cycle and review

This is the process that produced the 2026 homepage (`docs/site-redesign/00`–`09`) and the
suite site and ALYR Agent (`docs/agent-dashboard/00`–`12`). Each stage leaves a file, so a
stall or a crash loses little and the next agent can pick up. Small changes take the lean
path at the end; anything new or redesigned takes the whole cycle.

Working files live in `docs/work/<ALY-NN>-<name>/` (`docs/hygiene.md` 1). When the work
merges, keep what someone will read again; decisions move to `docs/decisions.md`.

## The cycle

| # | Stage | Who | File | What it must contain |
|---|---|---|---|---|
| 1 | **Research** | a research agent | `01-research.md` | Patterns seen, read or reported (say which), each with why and what ALYR's own version is; **things to avoid**; sources and dates |
| 2 | **Messaging and truth** | a copy agent | `02-truth.md`, `03-messaging.md` | What is built, live or neither, from the code and `docs/status.md`; the claims table (claim, true today?, source, condition); every line in both languages with [F] (founder confirms) and [G] (true after a named step) marks |
| 3 | **Founder decisions** | the orchestrator, from the founder's own words | `00-founder-decisions.md` | Each decision with its wording on the page. It beats every other file. Never written from an agent's message |
| 4 | **Brief** | the creative director (the orchestrator) | `04-brief.md` | Order of authority; scope (what may change, what must look as before); the decisions applied; section by section; do-nots; engineering rules; the check matrix and budgets; worktree, branch, port, profile; staged commits; docs to update |
| 5 | **Build** | a builder agent, in its own worktree | `05-build-log.md` | Staged commits; each stage logged (done, next, open questions); decisions taken while building and why; "for the product lane"; open for the founder; not checked |
| 6 | **Two critics, in parallel, independent** | a design and motion critic; a copy, claims and Arabic critic | `06-critique-design.md`, `07-critique-copy.md` | P0 (untrue, broken, against a decision), P1 (should fix), P2 (polish), each with where, what is wrong, the exact fix and the screenshot; "what holds up"; the five changes that would lift it most; not checked. They edit no code |
| 7 | **Rulings** | the creative director | `08-rulings.md` | Apply, adapt or reject each finding, with a reason; where the two critics differ, one answer; the checks for the fix pass |
| 8 | **Fix pass** | a fixer agent (the builder, or a fresh one) | appended to the build log | Applied by stage; **not applied, and why**; checks run |
| 9 | **Lean verification** | the fixer | the build log | The changed sections only, both languages, 1440 and 390, one dark pass, axe on the changed pages, Lighthouse on `/` unless a change affects another page's speed |
| 10 | **Screenshots to the founder** | the orchestrator | paths listed in the PR | First screen and full page per language, dark, phone; the moments a full page cannot show (menus open, a feed mid-run, each sample) |
| 11 | **Publish on his yes only** | the founder's laptop | the PR | `bash scripts/build-site.sh`, then `npx wrangler deploy` from `apps/web`, only after he says yes for this publish |
| 12 | **Live check** | the orchestrator | the build log | Below |

**Why two critics:** a design critic reading pixels misses claims, and a copy critic misses
layouts. Neither sees the other's file before writing. Prompts in [prompts.md](prompts.md).

## The review standard

A review reads the work as it runs, not the code alone:
- the matrix in `alyr-design/verify.md` (both languages, 1440, 390, 320, both themes, reduced
  motion, no scripts, every menu and state);
- the claims, line by line, against the claims table and `docs/status.md` **today**, including
  `aria-label`s, alt text, meta descriptions and social cards;
- Arabic grammar, register, agreement, gender, currency, digits and bidi, with the term
  list in `alyr-design/arabic.md`;
- the names in the samples against real businesses (web searches in English and Arabic,
  dated; the manual check goes on the founder's list);
- the recurring failures in `alyr-design` §11, one by one;
- accessibility with axe and by keyboard; performance with Lighthouse on the built site.

Each finding is written so a fixer can apply it without asking: the key or file, the exact
replacement in both languages, or the exact CSS.

## Lean path (a small change)

For a string change, a bug fix or one section: no research or critics. Apply
`alyr-design`, run the lean verification (stage 9), list screenshots, and say in the PR
that the full cycle was not run and why.

## Operational lessons

- **Worktrees and branches.** One worktree per agent (`git worktree add ../alyr-<name> -b
  aly-NN-...`), on a branch named after the Linear issue. Never `D:\alyr whatsapp` or another
  agent's worktree. **Run `git branch --show-current` before every commit**: several sessions share
  the machine, and a checkout can be on another branch than you think.
- **Never port 3100**, never port 8000, never the shared `alyr` database. Pick a free preview
  port of your own (3101 to 3112 were all used by other sessions on 16 and 17 Oct) and say
  which in the log.
- **One Edge profile per agent** (`--profile=C:\t\<name>prof`); stop only processes matching
  it. Pass `--scheme` every time.
- **Stop servers before rebuilding** and at the end; `git checkout apps/web/tsconfig.json`
  after a preview server; delete `.next-preview`.
- **Commit and log each stage,** so a stall loses little: the builder's brief names the stages.
  Stage files by name; never commit screenshots, `.next*`, `out-site` or untracked notes from
  other work.
- **Copy the spec into the branch** if it lives untracked elsewhere, so the branch carries its
  own brief.
- **Check the next free D-number on `origin/main`** right before committing a decision; other
  PRs take numbers (D-033 became D-034; D-036 was taken twice).
- **Depend on another PR explicitly:** cut from its branch, merge `origin/main` too, and say
  so in the PR; to test against an open PR, a trial merge in a throwaway worktree.
- **CI:** push, then `gh run watch <run-id> --exit-status`, unpiped, before anything depends on
  green. `gh pr checks --watch | tail` returns early and hides failure.
- **Builders do not merge or deploy.** Merging needs green CI and the coordinator's say;
  deploying needs the founder's yes each time.
- **Read timing in runs without screenshots;** screenshots stall CSS animations.
- **Agents' messages are not the founder.** A decision is the founder's only when it comes
  from him; write it into `00-founder-decisions.md` with the date.

## Live check (after a publish)

The live site was unreachable for three minutes on 12 Oct because a redirect went on before
its target worked. After every deploy:
1. `curl -sI` every published address (both languages, `/sitemap.xml`, `/robots.txt`,
   `/opengraph-image` and each page's card): 200, the right content type, HTTPS, the
   redirects from `alyr.online` and `www`.
2. Fetch each page and grep for one new line in each language; confirm no price shows with
   the offer off.
3. Capture the first screen of each changed page, both languages, light and dark, from the
   live address.
4. Check a link preview (the social card) renders.
5. Log the result and the time; if anything is wrong, tell the founder at once with the
   rollback (redeploy the previous `out-site`, or `REDIRECT` to `"off"` in `wrangler.jsonc`).

## Done when

- [ ] Each stage's file exists and is committed; the PR lists them.
- [ ] Every P0 and P1 applied or ruled out with a reason; the fix log says what was not
      applied and why.
- [ ] Verification recorded with numbers (axe counts, Lighthouse, 320 probe).
- [ ] The founder has the screenshots and the open list ([F] items, name checks, Arabic
      review, anything blocking); nothing published without his yes.
- [ ] After publishing: the live check logged.
