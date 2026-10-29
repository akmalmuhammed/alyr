# Release: how a change reaches production

Written 30 Oct 2026 (ALY-269, from the go-live audit of 29 Oct). Going back is a separate
page: [rollback.md](rollback.md). The public site's own details (Cloudflare, previews) are in
[site-deploy.md](site-deploy.md).

## What was wrong, and the rule now

Before this page, a push to `main` that touched the web app published alyr.qa within a minute,
and `deploy-gcp` would deploy any commit, including one whose tests had failed. The
`production` environment named the founder as reviewer, but nobody was set as one, so the
approval never happened. Nothing was tagged and the CHANGELOG was never cut.

The rules now, all enforced by the workflows except the last:

1. **Nothing publishes on a push or a merge.** Production changes only when someone runs
   `deploy-gcp` (the app) or `site deploy` (alyr.qa) by hand.
2. **Only from `main`, and only a commit whose `ci` run finished green.** The run that counts
   is the push run on that exact commit, not the pull request's run: that one tested a merge
   with an older `main`.
3. **Every release has a version `v0.x.y` whose CHANGELOG section is cut.** The version is
   checked before anyone is asked to approve, and the commit is tagged only after the deploy
   passed its health checks.
4. **The founder approves each release in GitHub** (environment `production`). The Cloudflare
   secrets can only be read by that approved job.
5. The workflows cannot enforce this one: **a merge into `main` needs green CI** (branch
   protection, below).

| What | How to publish | Checks, in order |
|---|---|---|
| The app: API, worker, web app on Google Cloud | Actions → **deploy-gcp** → Run workflow | gate → approval → deploy and health checks → tag |
| The public site, alyr.qa (Cloudflare Worker `alyr-site`) | Actions → **site deploy** → Run workflow | gate → approval → build, `pnpm site:check`, deploy, read `/version.txt` back → tag |
| A preview of the site, per pull request | Automatic | none: alyr.qa does not change |
| Fallback when GitHub is down | `infra/gcp/push-images.sh` and `setup.sh apps <tag>`; `pnpm site:deploy` | the founder at the keyboard. Tag by hand afterwards: `scripts/release.sh tag v0.x.y <sha>` |

## Cutting a release

1. **Pick the commit.** It is the newest commit on `main`, so wait until `ci` is green on it:
   `gh run list --workflow ci --branch main --limit 3`. The `api` job takes about 35
   minutes. The deploy takes `main`'s tip at the moment you start it.
2. **Pick the version.** `v0.<phase>.<n>` (docs/hygiene.md, section 7): the next `n` for an
   ordinary release, `v0.<phase+1>.0` when a phase's demo works. The last one:
   `git tag --list 'v0.*' --sort=-v:refname | head -n 1`. A version is used once, ever. There
   are no tags yet: the CHANGELOG's `0.1.0` and `0.2.0` sections (Oct 2026) were never tagged,
   so the first release under this procedure is `v0.3.0` or later (`release.sh` refuses a
   version that is not newer than the newest section).
3. **Open the release PR.** On a branch off `main`:

   ```bash
   scripts/release.sh cut v0.x.y
   ```

   This turns `## Unreleased` in `CHANGELOG.md` into `## v0.x.y (date)` and leaves an empty
   `## Unreleased` above it. Commit only `CHANGELOG.md`, title the pull request `Release
   v0.x.y`, and merge it on green CI like any other.
4. **Wait for `ci` on the merge commit** (about 35 minutes), and **merge nothing else
   meanwhile.** Anything merged after the cut sits under `## Unreleased`, and the gate
   refuses that: those changes would ship without a version. If it happens, cut again.
5. **Run it.**

   ```bash
   gh workflow run deploy-gcp.yml --ref main -f version=v0.x.y -f deploy=true
   gh workflow run site-deploy.yml --ref main -f version=v0.x.y     # only if the site changed
   ```

   or Actions → the workflow → Run workflow → branch `main`, the version.
6. **The gate runs first** (about a minute) and either passes or says exactly what is wrong
   (table below). Only then does GitHub ask the founder: **Review deployments →
   `production` → Approve and deploy.**
7. **After the health checks pass, the `tag` job tags the commit** `v0.x.y`. Check with
   `git ls-remote --tags origin v0.x.y`. When both workflows ship the same version from the
   same commit, the second finds the tag and does nothing.
8. **Write what is live** in `docs/status.md`: the version, the short commit, the date. The
   `deploy-gcp` run's summary lists the revisions that served before this release: keep them
   until the next release, they are the way back ([rollback.md](rollback.md)).

If the deploy fails after the approval, nothing is tagged. Look at the log, fix in a pull
request, and cut the **next** version; do not reuse the number.

### When the gate says no

| The message says | It means | Do |
|---|---|---|
| `Releases go from main` | The workflow was started on another branch | Run it with `--ref main` |
| `No ci run on main for …` | The push run has not started or does not exist | Wait a minute and run again |
| `ci is still in_progress …` | `ci` has not finished on this commit | Run again when it is green |
| `ci ended 'failure' …` | The commit failed its own tests | Fix on a branch, merge, cut the next version. A failure that passes on re-run is a flaky test: re-run the job in `ci`, then run the release again |
| `the newest cut section … is vX, not vY` | The version you typed is not the newest section | Type the right version, or cut `vY` first |
| `changes are still under '## Unreleased'` | Something merged after the cut | Cut again (`scripts/release.sh cut`) and ship that |
| `the tag … already exists on another commit` | The version was used for a different commit | Cut the next version |

### A fix that cannot wait

It takes the same path: a pull request with the fix and its own `scripts/release.sh cut`
line (or two pull requests), merge, wait for `ci`, run the release. When production is
hurting now and 35 minutes is too long, **roll back first** ([rollback.md](rollback.md)),
then fix properly. The laptop fallback is for a day GitHub is down, not for skipping `ci`.

## One-time setup: GitHub settings (Needs Akmal, about 15 minutes)

Claude cannot change repository settings and did not. Run these from any terminal signed in to
`gh` as the founder (`gh auth status`). Nothing here prints a secret.

**1. `production`: the founder approves, and only `main` can deploy.**

```bash
gh api -X PUT repos/akmalmuhammed/alyr/environments/production --input - <<'JSON'
{
  "prevent_self_review": false,
  "reviewers": [{ "type": "User", "id": 70023886 }],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
}
JSON
gh api -X POST repos/akmalmuhammed/alyr/environments/production/deployment-branch-policies \
  -f name=main -f type=branch
```

`70023886` is `akmalmuhammed`'s GitHub user ID (`gh api users/akmalmuhammed --jq .id`).
"Prevent self-review" stays off because the founder is the only reviewer and starts the run
himself. Then, in the browser, **Settings → Environments → production**, untick **Allow
administrators to bypass configured protection rules**: the API cannot set that one.

**2. `preview`: an environment of its own, with no reviewer.**

```bash
gh api -X PUT repos/akmalmuhammed/alyr/environments/preview
```

**3. Protect `main` and require `ci`.** The names are the jobs of the `ci` workflow. Do not
add `preview` or `production` (those are site-deploy jobs) or `rehearsal` (it only runs when
the images change).

```bash
gh api -X PUT repos/akmalmuhammed/alyr/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["api", "web", "api-worker", "site", "secrets"] },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

`enforce_admins: true` is the point: the rule holds for the founder too. If a red `ci` ever
blocks something urgent, take protection off for that merge in Settings → Branches, then put it
back. `"strict": false` does not make a branch rebase before merging. Whether to require that
(or a merge queue) is OPS-14: with a 35-minute `ci` it costs a rebase and a wait on every merge.

**4. Delete merged branches, and turn on secret scanning with push protection.**

```bash
gh api -X PATCH repos/akmalmuhammed/alyr -F delete_branch_on_merge=true \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```

**5. Move the Cloudflare secrets** from the repository to the environments. GitHub never shows
a secret's value again, so it cannot be moved: it is typed again, hidden, at each prompt. Make
the tokens first (site-deploy.md, step 1), then:

```bash
gh secret set CLOUDFLARE_API_TOKEN  --env production --repo akmalmuhammed/alyr
gh secret set CLOUDFLARE_ACCOUNT_ID --env production --repo akmalmuhammed/alyr
gh secret set CLOUDFLARE_API_TOKEN  --env preview    --repo akmalmuhammed/alyr
gh secret set CLOUDFLARE_ACCOUNT_ID --env preview    --repo akmalmuhammed/alyr
```

Then open any pull request that touches `apps/web` and check that the preview address is
posted. Only then remove the repository-level pair:

```bash
gh secret delete CLOUDFLARE_API_TOKEN  --repo akmalmuhammed/alyr
gh secret delete CLOUDFLARE_ACCOUNT_ID --repo akmalmuhammed/alyr
```

and **roll the old token in Cloudflare** (My Profile → API Tokens → Roll): for as long as it
was a repository secret, a workflow on any branch could read it. Put the new value in
`production`. The `preview` token is a second, new one with fewer permissions
(site-deploy.md, step 1). Previews can be switched off at any time by deleting the two
`preview` secrets: the build still runs and nothing is uploaded.

## What only a real run can prove

Nothing in the release path has run on GitHub yet. Checked by hand: actionlint on all the
workflows, the CI lookup against real runs of this repository, `release.sh` against a scratch
repository, `rollback.sh` against a stand-in `gcloud`. First real run to watch: the gate, the
approval prompt, whether `deploy-gcp`'s account may move the worker pool's instance split, and
the tag push.
