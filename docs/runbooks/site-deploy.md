# Site deploy, previews and rollback (alyr.qa)

Written 24 Oct 2026 (site tooling, branch `aly-site-tooling`); corrected 30 Oct 2026
(ALY-269). The public site is plain files served by the Cloudflare Worker `alyr-site`
(`apps/web/wrangler.jsonc`, `apps/web/site-worker.js`), built by `scripts/build-site.sh`.

**What really happened until 30 Oct.** The workflow has run on GitHub since 28 Oct. The
`production` job names the GitHub environment `production`, but that environment had no
required reviewer, so nothing waited for approval: every push to `main` that touched the web
app published alyr.qa within a minute (eight times between 22:49 and 22:52 UTC on 28 Oct),
with no check that `ci` had passed. This page used to say the founder approved each one. He
did not, because nothing asked him.

**What happens now.** A push to `main` publishes **nothing**. alyr.qa changes only when
someone runs the workflow by hand with a release version; the commit's `ci` run must be green,
and then it waits for the founder's approval in `production`. The path is the one in
[release.md](release.md). The approval prompt exists only once the founder has applied the
settings in release.md ("One-time setup"); until then the run goes straight through after the
CI check.

## How it works

| When | What happens | Who says yes |
|---|---|---|
| A pull request is opened or pushed | `.github/workflows/site-deploy.yml` builds the site and uploads it as a new **version** of `alyr-site` that takes no traffic (`wrangler versions upload`), in the environment `preview`. Cloudflare gives it a preview address; the job posts it on the pull request. Without the `preview` secrets it only builds | Nobody: alyr.qa does not change |
| A push to `main` | Nothing | |
| "Run workflow" on `main`, with a version (`v0.x.y`) | The `gate` job checks the commit's `ci` run and that the version is cut in `CHANGELOG.md`. The `production` job then waits for approval, builds, runs `pnpm site:check`, runs `wrangler deploy` and reads `https://alyr.qa/version.txt` back. The `tag` job tags the commit | The founder, in GitHub (environment `production`) |
| The founder's laptop, as a fallback | `pnpm site:deploy` from `apps/web` | The founder, typing `yes` |

Every build names its commit: `out-site/version.txt` (commit, branch, build time, offer
switch) and `<meta name="alyr-build" content="<sha>">` in every page. Every Cloudflare
version carries the short commit as its tag and the full commit in its message. A build
from uncommitted changes is stamped `<sha>-dirty`, and `site:deploy` refuses it.

### Why previews are versions of the same Worker

Three ways were possible: versions of `alyr-site` with Cloudflare's version URLs, a second
"preview" Worker, or Cloudflare Pages. Versions are the simplest that is reliable:

- **Nothing new to create or keep in step.** Same Worker, same `wrangler.jsonc`, same files.
  A second Worker would need its own config without the alyr.qa routes (deploying the
  current config under another name would try to move the custom domains), and one shared
  preview Worker shows only the last pull request.
- **One address per commit and one per pull request.** Each upload gets
  `https://<version-prefix>-alyr-site.<subdomain>.workers.dev`, and the alias
  `https://pr-<number>-alyr-site.<subdomain>.workers.dev` always shows the pull request's
  latest commit.
- **It cannot change alyr.qa.** `versions upload` adds a version without sending it any
  traffic. Only `wrangler deploy`, `wrangler versions deploy` or a rollback changes what
  alyr.qa serves.

Two settings make a preview usable. It is uploaded with `REDIRECT` off (otherwise the
Worker sends every address that is not alyr.qa on to alyr.qa) and `PREVIEW` on, which makes
the Worker add `X-Robots-Tag: noindex, nofollow`.

**Previews are public.** Anyone with the address can open one. It shows unpublished pages,
so a draft line can be seen before the founder approves it. To require a sign-in, put
Cloudflare Access on the preview URLs (step 4). Access is free for up to 50 users.

**What the approval protects.** The Cloudflare token and account ID are *environment*
secrets. The `production` job reads them from `production`, and a job that names that
environment waits for the founder's approval before it can read anything, and only runs from
`main`. A workflow on any other branch cannot reach them. Before 30 Oct they were repository
secrets, readable by a workflow on any branch of this repository.

**What it does not protect.** Previews run unattended, so the `preview` environment holds a
token that any pull request branch of this repository can use. It is a separate token with
fewer permissions, but Cloudflare cannot limit a token to one Worker: "Workers Scripts: Edit"
covers every Worker in the account, not only `alyr-site`. Two ways to close that, both for the
founder to decide: switch previews off (delete the two `preview` secrets), or keep the Workers
that carry production traffic in a Cloudflare account the site token cannot reach (CLD-4).
Pull requests from forks never get the secrets.

## One-time setup (Needs Akmal)

The GitHub environments, the reviewer and the branch rule are in
[release.md](release.md) ("One-time setup"), with the commands. This page covers the Cloudflare
side.

### Step 1: two Cloudflare API tokens and the account ID, as environment secrets

The **production** token (the one that exists today, rolled; see release.md, item 5):

1. Cloudflare dashboard → **My Profile → API Tokens**. Roll the existing token, or create one:
   **Create Token**, template **Edit Cloudflare Workers** (Cloudflare's recommendation for
   GitHub Actions). It grants:
   - Account: Workers Scripts Edit, Workers KV Storage Edit, Workers R2 Storage Edit,
     Account Settings Read, Workers Tail Read;
   - Zone: Workers Routes Edit;
   - User: User Details Read, Memberships Read.
2. Narrow its resources:
   - **Account Resources:** Include → ALYR's account only.
   - **Zone Resources:** Include → Specific zone → `alyr.qa`, and add `alyr.online`. The
     Worker's routes and custom domains are on these two zones.
   - Leave **Client IP Address Filtering** empty, because GitHub's runners have no fixed
     address.
   - Optional: a **TTL**. Then put the renewal date in `docs/access.md`.
3. Copy the token once. Do not paste it anywhere but the prompt in item 6.

The **preview** token, a second one named for what it does (for example `alyr github
preview`): **Create Custom Token** with **Account → Workers Scripts → Edit** and nothing else,
for ALYR's account only. No zone, no R2, no KV. Uploading a version (`wrangler versions
upload`) does not need more. This has not been run: if the first preview fails with a
permissions error, the error names the missing permission; add that one and no more.

4. The **account ID**: dashboard → **Workers & Pages**, in the right-hand column under
   "Account details". (`pnpm exec wrangler whoami` on the laptop also shows it.)
5. Create the environments `production` and `preview` first (release.md, items 1 and 2).
6. Store the four values. Each command asks for the value and hides what you type:

| Environment | Name | Value |
|---|---|---|
| `production` | `CLOUDFLARE_API_TOKEN` | the production token |
| `production` | `CLOUDFLARE_ACCOUNT_ID` | the account ID |
| `preview` | `CLOUDFLARE_API_TOKEN` | the preview token |
| `preview` | `CLOUDFLARE_ACCOUNT_ID` | the account ID |

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN  --env production --repo akmalmuhammed/alyr
   gh secret set CLOUDFLARE_ACCOUNT_ID --env production --repo akmalmuhammed/alyr
   gh secret set CLOUDFLARE_API_TOKEN  --env preview    --repo akmalmuhammed/alyr
   gh secret set CLOUDFLARE_ACCOUNT_ID --env preview    --repo akmalmuhammed/alyr
   ```

7. Delete the repository-level pair (release.md, item 5). Until you do, they still exist and
   the environment copies change nothing.

If the first production deploy fails on the custom domains (`alyr.qa`, `www.alyr.qa`,
`www.alyr.online`) with a permissions error, edit the production token. Add **Zone → DNS →
Edit** for the same two zones. This is not tested: the domains are already attached, so the
deploy should leave them as they are.

The rows for both tokens are in `docs/access.md` and `docs/runbooks/secret-rotation.md`. Put the
TTL or renewal date there if you set one.

### Step 2: the `production` environment with the founder as reviewer

Done with the commands in [release.md](release.md), item 1: **Required reviewers**
`akmalmuhammed`, **Prevent self-review** off (he is the only reviewer and starts the run
himself), **Deployment branches**: only `main`, administrators not allowed to bypass.
Check it under **Settings → Environments → production**. The repository is public, so
required reviewers work on the free plan.

### Step 3: turn version URLs on for `alyr-site`

`wrangler.jsonc` now says `"preview_urls": true` and `"workers_dev": false`, which is what
production already does: alyr.qa only, nothing on workers.dev. Wrangler applies these on
the next `wrangler deploy`. Until that deploy, either:

- turn them on in the dashboard: **Workers & Pages → alyr-site → Settings → Domains &
  Routes → Preview URLs → Enable**;
- or let the first approved production deploy do it.

The account needs a workers.dev subdomain. It is shown under **Workers & Pages → Account
details → Subdomain**; pick one if there is none.

Until this step is done, the preview job uploads the version and says on the pull request
that no address came back.

### Step 4 (optional): put the previews behind a sign-in

**Workers & Pages → alyr-site → Settings → Domains & Routes → Preview URLs → Enable
Cloudflare Access.** Add the founder's email.

## Publish

1. Open the pull request's preview address and check it. Its `/version.txt` names the
   commit.
2. Merge (on green CI). **Merging publishes nothing.**
3. Cut the release and run the workflow: [release.md](release.md), "Cutting a release". In
   short: `scripts/release.sh cut v0.x.y` in a release PR, wait for `ci` on the merge commit,
   then `gh workflow run site-deploy.yml --ref main -f version=v0.x.y` (or Actions → site
   deploy → Run workflow, branch `main`). Only `main` is accepted: a branch is not published
   any more, so look at its preview instead.
4. The `gate` job checks `ci` and the version. GitHub then asks the founder to **Review
   deployments** → `production` → **Approve and deploy**.
5. The job fails if `https://alyr.qa/version.txt` does not name the commit within a minute.
   After that the commit is tagged `v0.x.y`.
6. Write the version, the commit and the Cloudflare version ID in `docs/status.md`. The job's
   log prints the version ID; `pnpm exec wrangler deployments status --config wrangler.jsonc`
   shows it too.

**Build switches (repository variables).** The workflow passes these to the build, in
previews and in production, so a switch is turned on by setting the variable and publishing:
`POSTHOG_PROJECT_KEY`, `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, and
`ALYR_TRY_FREE` (`on` shows the "Try it free" button that leads into the self-serve sign-up,
D-119; unset or anything else builds the site without it). Set `ALYR_TRY_FREE` only after
sign-up is open: [go-live-checklist.md](go-live-checklist.md), "Opening self-serve sign-up", last
step. A build's `/version.txt` says which way the switches went (`offer`, `try-free`), so what is
live can be read from outside.

**The pricing, terms and refund pages need no switch** (ALY-301, D-124). `/pricing`, `/terms`,
`/refund` and their `/ar` pages are built into every publish, and the pricing page shows its prices
whatever `NEXT_PUBLIC_ALYR_OFFER` says. The workflow does not pass that variable, so the homepage's
price section stays off; do not set it until the prepared offer copy has been re-read against D-092
(it still names a setup fee). After a publish: `curl -sI https://alyr.qa/pricing /terms /refund` (and
the `/ar` ones) answer 200, and `/sitemap.xml` lists them.

To publish automatically again after each merge, add a `push` trigger back to
`site-deploy.yml`; with the reviewer in place every push then waits for the founder's
approval. It was taken out on 30 Oct because that is a queue of approvals for unreleased,
untagged commits.

**Manual fallback, on the laptop:**

```bash
cd apps/web
pnpm exec wrangler login        # once; opens Cloudflare in the browser
pnpm site:deploy                # refuses unpushed or uncommitted work, builds, checks, asks "yes"
```

`pnpm exec wrangler deploy --config wrangler.jsonc` on its own still works. **Always name the config:** `apps/web` also holds `open-next.config.ts` for the portal (ALY-224), and without `--config wrangler.jsonc` wrangler treats the folder as an OpenNext app and fails ("Could not find compiled Open Next config"). It does not check the
commit, so prefer `site:deploy`.

## What is live?

```bash
curl -s https://alyr.qa/version.txt          # commit, branch, built, offer, try-free
cd apps/web
pnpm exec wrangler deployments status --config wrangler.jsonc        # the version serving alyr.qa now
pnpm exec wrangler deployments list --config wrangler.jsonc          # every production deployment
pnpm exec wrangler versions list             # every version, previews included
```

`deployments list` has only what was actually published. `versions list` also has every
pull request's preview.

## Roll back

alyr.qa is wrong after a publish:

1. **Find the last good production version:**
   - run `pnpm exec wrangler deployments list --config wrangler.jsonc` from `apps/web`;
   - use the deployment before the bad one;
   - its message reads "Production from <branch>, commit <sha>" or "Manual deploy from …";
   - take the **version ID** shown for it.
2. **Roll back:**

   ```bash
   pnpm exec wrangler rollback <version-id> --message "Back to <sha>: <what was wrong>"
   ```

   Without a version ID, Wrangler goes back to the version deployed before the current one,
   and asks to confirm. Add `-y` only when you are sure.
3. **Check:** `curl -s https://alyr.qa/version.txt` names the good commit. Look at the page
   that was wrong.
4. **Write it down:** in `docs/status.md`, say what is live (commit and version ID) and why
   it was rolled back. If the publish broke something for visitors, follow
   `docs/runbooks/incident-response.md`.

**Never roll back to, or `versions deploy`, a preview version.** Preview versions have
`REDIRECT` off and `PREVIEW` on. On alyr.qa, alyr.online would stop redirecting and every
page would tell search engines not to index it. Take version IDs from `deployments list`,
never from `versions list`.

From the dashboard instead: **Workers & Pages → alyr-site → Deployments**, then the three
dots beside the good version → **Rollback**.

**Limits:**
- Cloudflare rolls back only to the 100 most recently published versions, and every
  preview counts.
- A rollback changes only the Worker and its files. Each version carries its own static
  files, so the old pages come back with it. This has not been tried on `alyr-site` yet.

If the good version is too old, or a rollback is refused, rebuild it from git. The workflow
only publishes `main`, so either:
- revert the bad change on `main` in a pull request and release that
  ([release.md](release.md)); or
- check out the good commit on the laptop and run `pnpm site:deploy` (the commit must be
  pushed), then tag it by hand: `scripts/release.sh tag v0.x.y <sha>` with a new version.

Production builds are also kept as the workflow artifact `out-site-production-<sha>` for 90
days. To publish one as it is:
- download and unzip it into `apps/web/out-site`;
- run `pnpm exec wrangler deploy` from `apps/web`.
