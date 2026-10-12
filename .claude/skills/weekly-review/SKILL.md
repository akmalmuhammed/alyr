---
name: weekly-review
description: Run ALYR's weekly review. Compares the plan with what actually happened, updates docs/status.md and Linear, and reports what the founder must do next.
disable-model-invocation: true
---

# Weekly review

Run this once a week, or when the founder asks "where are we".

1. Read `docs/operating-model.md`, `docs/status.md` and each brief in `docs/lanes/`.
2. Gather the facts for the last seven days:
   - Merged pull requests: `gh pr list --state merged --limit 30`
   - Linear issues in project `Alyr Launch`: what changed status, what is In Progress with no change in a week, everything labelled "Needs Akmal".
   - What is live: `curl` the public site and the API health address named in `docs/status.md`.
3. Find the gaps: an issue marked In Progress that nobody touched; a lane brief whose "Now" section is out of date; a claim in `docs/status.md` that is no longer true; work done with no issue.
4. Fix them: update `docs/status.md`, the lane briefs and the Linear statuses. One branch, one pull request, documents only.
5. Report to the founder, in this order:
   - **Your list:** every "Needs Akmal" issue, in the order to do them, with the one next action for each.
   - **Which gate we are at** (A to E in `docs/operating-model.md`) and what would pass it.
   - **Moved** and **stuck** this week, by lane, one line each.
   - **Next week:** the three lanes to run and the first issue for each.
   - **One thing to stop doing**, if the week shows one.
   - What you could not verify.

Never deploy, message anyone or change product code during a review.
