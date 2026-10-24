# Site audit, DX: how safely a person or an agent can change the public site

| | |
|---|---|
| **Category** | design-brand |
| **Date** | 2026-10-24 |
| **Status** | Current |
| **Where it lives** | `docs/site-audit/02-dx.md` on main. Decisions in `00-decisions.md`, the fixes in `05-tooling-log.md` (Linear ALY-223) |
| **Lane** | Site and brand |

## Question it answered
How easy and safe is it to change, build, check and publish alyr.qa, and what should change first? The audit was read-only: a timed build, scans of the compiled copy, trial merges and fetches of the live site.

## Key findings
- The code itself is careful: typed copy, generated and drift-checked tokens, loud post-processing and thorough skills. The risk is around the code.
- P0: what was live could not be traced to a commit. The live H1 existed only on PR #105, the top of a stack of four open site PRs (13, 16, 20 and 22 commits ahead of main). The local build's chunk hashes differed from live. The documented rollback ("redeploy the previous out-site") could not work, because `build-site.sh` deletes out-site and nothing archives it.
- P0: CI gated nothing. All 10 open PRs failed every job in 4 to 5 s because of billing, and nothing had merged since #94. `check.sh` needs PostgreSQL.
- P0: the build that ships never ran in CI. CI ran `pnpm build`, not `build-site.sh`, so the copy out of Next's internal folders, the script-defer regex, the social-card check and the API-address grep were untested. A Next security upgrade (PR #108) could break them, and that would only show at publish time on the founder's laptop.
- P1: `copy.ts` was 4,248 lines, with each Arabic line about 1,900 lines below its English twin. That made 6,088 lines and 2,484 strings across three copy files, touched by 25 commits. TypeScript checks keys but not list lengths or optional fields. Parity held "by care": 0 length mismatches.
- P1: there was no automated claims or banned-word lint. The scan found 3 "soon" in English and 3 in Arabic, all legitimate only through gating.
- P1: a new product page needed a 10-step checklist and about 19 files. The page list was kept twice (`site.ts` and `build-site.sh`), so a forgotten page builds but is not published.
- P1: deploying was a manual `npx wrangler deploy` with no pinned version and no previews. The verification tools (shoot.mjs, probes, axe, Lighthouse, the brotli server) lived in `docs/` or outside the repo.
- P2: `build-site.sh` deletes `.next` under a running dev server; a non-default distDir rewrites `tsconfig.json`; and ports clash between sessions. Timings: build 41 s, tsc 2 s, lint 16 s, design-check 1 s, so speed is not the problem.
- Top five: deploy from GitHub Actions with PR previews, production behind the founder's approval, a commit stamp and rollback; unblock CI and add a site job; one `pnpm site:*` command set; move the tools into `scripts/site/`; split `copy.ts` per page with English and Arabic side by side.

## What we decided because of it
- The founder approved the top five on 24 Oct (`00-decisions.md`). A tooling agent built the deploy workflow, the CI site job (the real build, copy parity, banned words, link check), the `pnpm site:*` commands with wrangler pinned, and the tools in `scripts/site/`.
- The `copy.ts` split was deferred until after both branches merge, as a separate refactor.

## What changed since, and conflicts
- Applied (per `05-tooling-log.md`): `site-deploy.yml` with a preview per PR and a `production` environment, `version.txt` and a build meta tag, wrangler pinned at 4.150.0, a site-deploy runbook, `pnpm site:check` in CI and `check.sh`, and shoot.mjs moved to `scripts/site/`.
- Not verified at the time: no workflow had run on GitHub (Actions was blocked by billing) and no Cloudflare call was made. Check the runbook and `docs/status.md` for the current state.
- Still open: the `copy.ts` split.

## Use it for
- Before changing the build, the deploy or the site's checks: why each step exists and what it guards.
- Adding a new product page (the 19-file footprint and the double page list).
- The list of traps (ports, tsconfig rewrites, Edge profiles) when a site build fails strangely.
