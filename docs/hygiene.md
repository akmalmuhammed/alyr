# Hygiene rules

How ALYR keeps the repository, the docs and the running system clean while many sessions
work in parallel. Every session reads this before its first change; the PR template repeats
the checklist. Written after the 17 Oct 2026 audit (`docs/audit/2026-10-17.md`, ALY-114).

A rule here is not a preference. If a task seems to need breaking one, stop and say so.

## 1. Where things live

| Kind | Place | Rule |
|---|---|---|
| Rules for every session | `CLAUDE.md` | Short. Points here for detail. Layout section matches the real tree. |
| Where we stand | `docs/status.md` | The one hand-over note. Describes `main` only (see 3). |
| Why we decided something | `docs/decisions.md` | Append only. Index row plus entry. Superseded entries are marked, never rewritten. |
| What we build next, in detail | `specs/<nnn-name>/spec.md` | Before building anything larger than one PR. |
| Tools, free limits, swap triggers | `docs/stack.md` | A row for every tool and service. |
| Who holds which account | `docs/access.md` | Every account, its owner, sign-in method, 2FA. Never a password or key. |
| Personal data sent abroad | `docs/data-residency.md` | A row before the first byte leaves (hard rule 2). |
| How to handle an emergency or chore | `docs/runbooks/` | One file per procedure, written so a tired person can follow it. |
| Lane briefs | `docs/lanes/` | Each lane's "Now" section is updated in the PR that changes it. |
| Content and applications | `docs/growth/`, `docs/company/` | Drafts the founder approves. |
| Studies and research (marketing, sales, growth, customers, design, social) | `docs/research/` | A card per study in `studies/` the same day, wherever the study itself lives (Claude Doc, artifact, file); copy to `sources/` anything that could be lost; `current-truth.md` says which answer stands. Run `python docs/research/build_index.py`. |
| Audits | `docs/audit/<date>.md` | Findings with an issue number each. |
| Working notes of one piece of work (briefs, critiques, logs) | `docs/work/<ALY-NN>-<name>/` | Allowed while the work runs. When it merges, keep only what someone will read again; decisions move to `decisions.md`. |
| Release history | `CHANGELOG.md` | A line per merged PR that changes behaviour. |
| Secrets | `apps/api/.env` locally; the key vault in production | Never in git, chat, docs, Linear or screenshots. |

**Never in the repository:** `.env` files, keys, PDFs and scans of personal or company
papers (QID, passport, registration forms), real customer data, files from other projects,
throw-away HTML at the root. `.gitignore` and the pre-commit hook block the common cases;
the rule still applies where they do not reach.

## 2. Every change

1. **One Linear issue, one branch** named `aly-NN-short-name`, in your own git worktree when
   another session is active. Never work on someone else's branch or worktree.
2. **Check the issue number exists** before writing it anywhere. One number, one meaning.
3. **Read the current docs of what you touch** (outside APIs too: check their documentation).
4. **Tests through the real path** (real PostgreSQL, the simulator, HTTP).
5. **`scripts/check.sh` passes** before the PR. It runs what CI runs and turns on the hook.
6. **The PR template is filled in honestly**, including "Not checked".
7. **Merge only on green CI.** Then update the Linear issue with what is still missing.
8. **Delete the branch and remove the worktree** after merge.
9. **Look at `apps/api/migrations/` on `main` again just before you name a migration** and take the next free number. `tests/test_migration_numbers.py` fails when two files share one.

## 3. Docs stay true

- `docs/status.md` describes `main`, not a branch. A PR that cannot merge soon writes its
  status line as "In PR #NN" and the merging session flips it. After every merge the merging
  session reads the status lines the PR touched and corrects any that are now false.
- A decision that replaces another adds "Superseded by D-NNN" to the old index row and a
  one-line "Updated by" note under the old entry.
- A number you claim (tests, issues, prices) is either checked the same day or dated.
- If you find a contradiction, fix it in your PR or open an issue. Never leave it silent.

## 4. Security and privacy, every time

- Hard rules in `CLAUDE.md` first. New tenant table: copy the pattern; the isolation test must pass.
- Settings fail safe: a missing or misspelt value must close something, never open it.
  Developer conveniences check `env == "local"`, never `env != "production"`.
- New route: who may call it (anyone, signed-in staff, owner/admin, ALYR staff)? Write the
  check and a test for the refusal.
- Public links carry unguessable IDs and show the minimum (first names, no phone numbers).
- Logs never contain message bodies, codes, tokens or full phone numbers.
- New outside service: rows in `stack.md`, `access.md` and, if it gets personal data,
  `data-residency.md`, in the same PR.

## 5. Dependencies and tools

- A new dependency needs a one-line reason in the PR. Prefer what is already installed.
- Dependabot opens grouped updates weekly; merge them when CI is green.
- CI runs `pip-audit` and `pnpm audit`; a high-severity finding blocks the merge.

## 6. Branches, worktrees and the shared machine

- GitHub deletes a branch when its PR merges (setting: "Automatically delete head branches").
- Each session works in its own worktree (`git worktree add ../alyr-<name> -b aly-NN-...`) and
  its own database (`alyr_<name>`) and ports; never the shared `alyr` database or port 8000/3100
  that the laptop demo uses.
- Remove your worktree, containers and preview servers when your work merges.

## 7. Releases

- A phase whose demo works is tagged on `main` as `v0.<phase>.0` with its CHANGELOG section.
- Before anything goes live: the go-live checklist in `docs/runbooks/go-live-checklist.md`.

## 8. Reviews

- **Weekly** (operator agent, `weekly-review` skill): status, Linear, stale branches and
  worktrees, Dependabot PRs, failed jobs, upcoming expiries in `access.md`.
- **Before go-live and every quarter:** a full audit like `docs/audit/2026-10-17.md`.
