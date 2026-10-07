# Building with Claude Code without getting hurt

Alyr is built by one founder and an AI coding agent. That is fast, and it fails in known ways. This file lists those ways, the guard we have against each, and whether the guard is actually in place. Claude reads this at the start of work and is expected to follow it and to say so when a guard is missing.

Review this list at the end of every phase. Add a row when something bites us.

**Status:** ✅ in place · 🟡 partly · ⬜ not yet

## The register

| # | What goes wrong | How it shows up | Our guard | Status |
|---|---|---|---|---|
| 1 | **"Done" that is not done** | The agent reports success; the feature only works on the happy path, or was never run | Every issue has a "Done when" test. The agent runs the feature, not just the tests, and reports what it did not verify. Phase exit tests run on a real number | ✅ |
| 2 | **Demo-quality internals** | Great first screen, fragile underneath: no retries, no idempotency, lost messages | Job queue and outbox (D-010). Idempotent webhooks and payments, each with a test that sends the event twice | ✅ |
| 3 | **Tenant data leak** | A query without a tenant filter shows one merchant another's customers | The database enforces it (D-002). A test fails if a new table has no policy | ✅ |
| 4 | **Secrets in git or in chat** | A token is committed, pasted into a prompt, or read by the agent | `.env` is ignored. A pre-commit hook blocks token shapes. CI scans every push. Claude is denied permission to read `.env` files. The founder types secrets into `.env` himself | ✅ |
| 5 | **Destructive commands** | A database or branch is wiped by one confident command | Claude's permissions deny force-push, volume deletion and `terraform destroy`, and ask before hard resets. Tests use their own `alyr_test` database. Production credentials are never on the laptop | 🟡 no production yet; rule to keep when it exists |
| 6 | **Outdated or invented APIs** | Code written against a library or Meta API as it was two years ago | Check current docs before using an external API (Context7, vendor docs, the docs bundled with the package). Meta facts are re-checked before each phase and dated in `master-plan.md` | ✅ |
| 7 | **Lost context between sessions** | A new session re-decides something, or contradicts an earlier choice | `CLAUDE.md` (rules), `master-plan.md` (why), `decisions.md` (each choice), `stack.md` (tools), Linear (tasks). Decisions are written down in the same change that makes them | ✅ |
| 8 | **Scope creep** | The agent builds what was not asked, or the founder asks for everything at once | One Linear issue per branch. Anything outside it becomes a new issue, not extra code. The master plan says what we are not building | ✅ |
| 9 | **Unreviewed large changes** | Thousands of lines land on `main`; nobody knows what changed | Branch, pull request, green CI (D-014). The pull request description says in plain words what changed and what was not verified. Run `/code-review` on anything touching money, auth or tenant data | 🟡 started 7 Oct; earlier work went straight to main |
| 10 | **Tests that prove nothing** | Tests mirror the code, mock everything, or assert that functions were called | Tests go through the real path: real PostgreSQL, the simulator channel, HTTP in and out. Compliance files are compared byte for byte with bank-accepted samples | ✅ |
| 11 | **Security holes that look fine** | Missing authorisation check, injectable query, unsigned webhook | Parameterised SQL only. Webhooks verify signatures before anything else. No sign-in means the workspace refuses to run in production. `/security-review` before each phase exit | 🟡 no sign-in yet (ALY-18) |
| 12 | **Editing history that others depend on** | An applied migration is changed; environments drift apart | Applied migrations are never edited (D-003) | ✅ |
| 13 | **Dependency sprawl** | A new package for every small need; abandoned or unsafe ones | Prefer the standard library and what we already have. A new dependency needs a one-line reason in the pull request. Lock files are committed | ✅ |
| 14 | **Duplicate and dead code** | The same helper written three times; old paths left behind | Search before writing. `/simplify` at the end of each phase | ⬜ first run due at Phase 2 exit |
| 15 | **Works on my machine** | Line endings, ports, paths differ between Windows and CI | `.gitattributes` fixes line endings. Fixed ports (API 8000, web 3100). CI runs on Linux on every push | ✅ |
| 16 | **Environment left in a mess** | Background servers die with the session; ports stay taken | `README.md` has the exact start commands. Claude says which servers it left running | ✅ |
| 17 | **Founder cannot follow the code** | The product works but only the agent understands it | Plain-language pull request descriptions and docs. The founder can always ask "explain how X works" and get a walkthrough from the real code | 🟡 ongoing |
| 18 | **Confident wrong facts** | Regulation, pricing or API claims stated as certain | Claims about law, price and platform rules carry a source and a date, and unverified ones are labelled. Legal questions go to a lawyer | ✅ |
| 19 | **Arabic that reads wrong** | Machine-written Gulf Arabic that a native speaker finds odd | Every customer-facing Arabic string is reviewed by a native Gulf speaker before a merchant sees it | ⬜ reviewer not chosen |
| 20 | **Cost surprises** | A free tier is exceeded, or a paid service is added quietly | `stack.md` lists every tool and limit. Nothing paid is added without the founder agreeing | ✅ |
| 21 | **Real data in development** | Customer data copied to a laptop or pasted into a prompt | Development uses the fictional demo shop only. Real exports never enter the repo or a chat | ✅ |
| 22 | **Long sessions drift** | After many hours the agent forgets earlier constraints | Start a new session per phase or large issue; the docs carry the context. Commit small and often | 🟡 habit to build |

## How a piece of work goes

1. Pick one Linear issue. Read its "Done when".
2. If it needs a decision that is not in `decisions.md`, research it, then either decide (and record it) or ask the founder with a recommendation.
3. Branch named after the issue.
4. Check current docs for any outside API involved.
5. Build, with tests through the real path.
6. Run `scripts/check.sh`. Run the feature itself.
7. Pull request: what changed, how it was checked, what was not checked.
8. CI green, then merge. Update the Linear issue honestly, including what is still missing.
9. If something surprised us, add a row to the register above.

## What the founder should do

- Read each pull request description. Ask about anything unclear.
- Try each demo yourself. You are the only real user test we have until alpha.
- Keep secrets out of the chat. Put them in `apps/api/.env`.
- Say "stop" when a session wanders. One issue at a time is faster overall.
- At each phase exit, ask for `/code-review` and `/security-review` if they have not been run.
