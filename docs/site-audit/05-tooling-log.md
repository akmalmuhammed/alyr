# Site audit 05: tooling build log

The developer-experience and machine-readability tooling that the founder approved on
24 Oct 2026 (`00-decisions.md`, "Tooling agent"). Built in worktree `D:\alyr-tooling` on
branch `aly-site-tooling`, cut from `aly-210-tech-team-homepage` (live, PR #105). Go-live
lane. It does not touch `_site` components or the content of `copy.ts`. The site agent is
changing those in `D:\alyr-ux`. Each stage below is one commit.

## Stage 1: deploy from GitHub Actions

**Built:**
- `.github/workflows/site-deploy.yml`:
  - **Every PR:** builds with `scripts/build-site.sh` and uploads a version of `alyr-site`
    that takes no traffic (`wrangler versions upload --preview-alias pr-<n>`). It posts
    the version URL and the PR's alias URL as one PR comment, updated on each push.
  - **Push to `main`, or "Run workflow":** the `production` job waits for the GitHub
    environment `production` (the founder as required reviewer). Then it runs
    `pnpm site:check`, then `wrangler deploy` tagged with the commit, then reads
    `https://alyr.qa/version.txt` back.
- **Commit stamp:** `scripts/site/stamp.mjs`, called by `build-site.sh`, writes
  `out-site/version.txt` (commit, branch, built, offer) and puts
  `<meta name="alyr-build">` in every page's `<head>`. Uncommitted changes are stamped
  `-dirty`. CI stamps the PR's head commit, not GitHub's merge commit.
- **`wrangler.jsonc`:** `"workers_dev": false` (what production already did: with routes,
  Wrangler's default is false) and `"preview_urls": true`. A new var `PREVIEW` is `"off"`.
- **`site-worker.js`:** when `PREVIEW` is on (previews only), every response carries
  `X-Robots-Tag: noindex, nofollow`. Previews also set `REDIRECT` off. Otherwise the Worker
  would send the workers.dev address on to alyr.qa.
- **Wrangler** is pinned at exactly `4.150.0`, a devDependency of `apps/web`. It was
  released on 13 Oct; the newest is 4.152.0 from 22 Oct, and the older one was picked
  because it has been out for longer. Its install scripts (`esbuild`, `workerd`) are denied
  in `pnpm-workspace.yaml`. They are not needed: `wrangler deploy --dry-run` bundles the
  Worker without them.
- **The manual fallback stays:**
  - `pnpm site:deploy` (`scripts/site/deploy.mjs`) refuses uncommitted or unpushed work;
    it builds and checks, confirms the stamp, asks for a typed `yes`, deploys with the
    commit as tag and message, and reads `version.txt` back.
  - Plain `pnpm exec wrangler deploy` still works as before.
- **Runbook:** `docs/runbooks/site-deploy.md`: the one-time setup (secrets, environment,
  version URLs), how to publish, what is live, and the rollback.

**Why previews are versions of the same Worker:**
- Nothing new to create.
- One address per commit, plus a fixed one per PR.
- It cannot move traffic.

A second Worker would need a config without the alyr.qa custom domains, and would show
only one PR at a time. The runbook gives the full reasoning, and the two caveats: previews
are public unless Access is put on them, and the approval gates the workflow, not the token.

**Checked:**
- `actionlint` 1.7.12: no findings. It was installed in `C:\t\tooling-actionlint` from
  the GitHub release, and its checksum was checked.
- `wrangler deploy --dry-run` and
  `wrangler versions upload --dry-run --var REDIRECT:off --preview-alias pr-1 --tag … --message …`
  both bundle with the new config.
- The flags were read from `wrangler … --help` of the pinned version.
- `WRANGLER_OUTPUT_FILE_PATH`'s `version-upload` entry carries `preview_url` and
  `preview_alias_url`; read in Wrangler 4.150.0's source.
- `pnpm site:build` writes the stamp to all 15 pages.

**Not checked:**
- **No workflow has run on GitHub.** Actions is blocked by billing.
- **No call to Cloudflare was made:** no secrets exist, and there was no deploy.
- **Unknown until Cloudflare is called:**
  - whether the "Edit Cloudflare Workers" token is enough for the custom domains on
    deploy;
  - whether version URLs work with `workers_dev: false` on this account;
  - whether a rollback restores the static files.
- Shell steps inside the workflow were not run, and the jq parsing of the output file was
  not tried on a real upload.
