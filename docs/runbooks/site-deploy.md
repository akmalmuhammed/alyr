# Site deploy, previews and rollback (alyr.qa)

Written 24 Oct 2026 (site tooling, branch `aly-site-tooling`). The public site is plain
files served by the Cloudflare Worker `alyr-site` (`apps/web/wrangler.jsonc`,
`apps/web/site-worker.js`), built by `scripts/build-site.sh`.

**Not yet run for real.** GitHub Actions is blocked by billing and the Cloudflare secrets
below do not exist yet, so nothing in this page has run on GitHub or against Cloudflare.
The workflow was checked with actionlint and `wrangler --dry-run` only.

## How it works

| When | What happens | Who says yes |
|---|---|---|
| A pull request is opened or pushed | `.github/workflows/site-deploy.yml` builds the site and uploads it as a new **version** of `alyr-site` that takes no traffic (`wrangler versions upload`). Cloudflare gives it a preview address; the job posts it on the pull request | Nobody: alyr.qa does not change |
| A push to `main`, or "Run workflow" on any pushed branch | The `production` job waits for approval, then builds, runs `pnpm site:check`, runs `wrangler deploy` and reads `https://alyr.qa/version.txt` back | The founder, in GitHub (environment `production`) |
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

**The approval gates the workflow, not the key.** Previews and production use the same
Cloudflare token, because a token cannot be limited to "upload, never deploy". Anyone who
can push a branch to this repository could therefore write a workflow that deploys. Today
that is only the founder and his agents. Pull requests from forks never get the secrets.

## One-time setup (Needs Akmal)

### Step 1: a Cloudflare API token and the account ID, as GitHub secrets

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token**.
2. Use the template **Edit Cloudflare Workers** (Cloudflare's recommendation for GitHub
   Actions). It grants:
   - Account: Workers Scripts Edit, Workers KV Storage Edit, Workers R2 Storage Edit,
     Account Settings Read, Workers Tail Read;
   - Zone: Workers Routes Edit;
   - User: User Details Read, Memberships Read.
3. Narrow its resources:
   - **Account Resources:** Include → ALYR's account only.
   - **Zone Resources:** Include → Specific zone → `alyr.qa`, and add `alyr.online`. The
     Worker's routes and custom domains are on these two zones.
   - Leave **Client IP Address Filtering** empty, because GitHub's runners have no fixed
     address.
   - Optional: a **TTL**. Then put the renewal date in `docs/access.md`.
4. Create it, and copy the token once. Do not paste it anywhere but GitHub.
5. The **account ID**: dashboard → **Workers & Pages**, in the right-hand column under
   "Account details". (`pnpm exec wrangler whoami` on the laptop also shows it.)
6. GitHub → `akmalmuhammed/alyr` → **Settings → Secrets and variables → Actions → New
   repository secret**, twice:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from item 4 |
| `CLOUDFLARE_ACCOUNT_ID` | the account ID from item 5 |

If the first production deploy fails on the custom domains (`alyr.qa`, `www.alyr.qa`,
`www.alyr.online`) with a permissions error, edit the token. Add **Zone → DNS → Edit** for
the same two zones. This is not tested: the domains are already attached, so the deploy
should leave them as they are.

Then add a row for the token to `docs/access.md` and to `docs/runbooks/secret-rotation.md`:
who holds it, where it is stored, and how to replace it.

### Step 2: the `production` environment with the founder as reviewer

GitHub → **Settings → Environments → New environment** → name it `production`:

- **Required reviewers:** `akmalmuhammed`.
- Leave **Prevent self-review** unticked. He is the only reviewer and usually starts the
  run himself.
- **Deployment branches and tags:**
  - "No restriction" while the live site comes from the stacked branch
    (`aly-210-tech-team-homepage`);
  - "Selected branches: `main`" once the stack is merged.

The repository is public, so required reviewers work on the free plan.

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
2. Merge (on green CI), or, while the stack is unmerged, go to **Actions → site deploy →
   Run workflow** and choose the branch.
3. GitHub asks the founder to **Review deployments** → `production` → **Approve and
   deploy**.
4. The job fails if `https://alyr.qa/version.txt` does not name the commit within a minute.
5. Write the commit and Cloudflare version ID in `docs/status.md`. The job's log prints the
   version ID; `pnpm exec wrangler deployments status` shows it too.

**Manual fallback, on the laptop:**

```bash
cd apps/web
pnpm exec wrangler login        # once; opens Cloudflare in the browser
pnpm site:deploy                # refuses unpushed or uncommitted work, builds, checks, asks "yes"
```

`pnpm exec wrangler deploy` on its own still works exactly as before. It does not check the
commit, so prefer `site:deploy`.

## What is live?

```bash
curl -s https://alyr.qa/version.txt          # commit, branch, built, offer
cd apps/web
pnpm exec wrangler deployments status        # the version serving alyr.qa now
pnpm exec wrangler deployments list          # every production deployment
pnpm exec wrangler versions list             # every version, previews included
```

`deployments list` has only what was actually published. `versions list` also has every
pull request's preview.

## Roll back

alyr.qa is wrong after a publish:

1. **Find the last good production version:**
   - run `pnpm exec wrangler deployments list` from `apps/web`;
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

If the good version is too old, or a rollback is refused, rebuild it from git:
- check out the good commit;
- push it as a branch;
- run **site deploy** on that branch and approve it, or run `pnpm site:deploy` on the
  laptop.

Production builds are also kept as the workflow artifact `out-site-production-<sha>` for 90
days. To publish one as it is:
- download and unzip it into `apps/web/out-site`;
- run `pnpm exec wrangler deploy` from `apps/web`.
