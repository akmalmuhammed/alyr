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

## Stage 2: the CI site job and its checks

**Built:**
- **CI job `site`** in `.github/workflows/ci.yml`:
  - installs and runs `pnpm site:check`;
  - uploads `out-site` as an artifact, even on failure, so a broken build can be looked at;
  - needs no PostgreSQL.
- **`scripts/check.sh`** runs `pnpm site:check` after the web build.
- **`scripts/site/check.mjs`** runs everything below and gives a summary (`--no-build` skips
  the build). The checks:
  1. the real `bash scripts/build-site.sh`;
  2. **`copy-parity.mjs`:** every key in both languages, the same shape and list lengths, no
     empty string. It reads `copy.ts` through `lib/copy.mjs`, which transpiles it and its
     imports with the app's own TypeScript into a temporary folder. `copy.ts` is not
     changed.
  3. **`banned-words.mjs`:**
     - **Where:** the copy, by path, in both languages; then every built page (text,
       word-carrying attributes, and the strings inside the inline page data), the
       sitemap, robots and the machine files.
     - **The AI words** are parsed from `alyr-design/honesty.md` section 1 itself, English
       and Arabic. The Arabic is matched with its article and joined prepositions, and
       with the diacritics stripped.
     - **The other words** are in `banned-words.json`: coming, coming soon, soon, beta,
       under development, early access, Payroll, and their Arabic.
     - **Prices:** ALYR's price shapes (monthly, "from", setup, money back, in English and
       Arabic) may sit only in copy lines the offer switch hides:
       - a question with `offer: true`;
       - `description` beside a `descriptionNoOffer`;
       - `facts` beside `factsNoOffer`;
       - the listed `home.price.**`, `home.trust.closing`, `factsOffer` and `nOffer`.

       In an offer-off build, no price shape and no offer-only line may appear anywhere,
       the JavaScript chunks included.
  4. **`link-check.mjs`:**
     - **What it reads:** every href, src, srcset and og:image; the CSS `url()`s; the
       sitemap and robots; markdown links.
     - **How it resolves them:** the way the Worker serves the folder. A `#section` must
       exist as an id on the target page.
     - It never goes online.
- **Reviewed allowlists**, each entry with its reason. An entry that matches nothing fails,
  so the lists cannot go stale.
  - `allow/parity.json`, 2 entries:
    - the Arabic-only chat avatar letter (`pages.*.demo.avatar`);
    - one deliberate empty cell in `/chat`'s tracking demo.
  - `allow/banned.json`, 16 words:
    - **Customers asking "when are you coming?":** a fictional customer's message in the
      home-services sample, and the owner's day today.
    - **"Soon" on the pending-contact line and the offer-off price answer.** honesty.md
      section 7 allows the first.
    - **"notices" as a noun:** in the STOP reply, `core/consent.py`'s own words.
    - **"reads" as reading records:** the hours, its own records, the workspace.
    - **"knows" / «يعرف» of people:** the team, the customer.

**Today's site passes:**
- 6,534 strings in parity;
- 6,538 copy strings and 64 built files clean;
- 974 internal links resolve;
- about 30 s with the build.

**Proved to fail when it should:**
- **Prices:** an offer-on build, checked as if the offer were off, gives 157 problems.
- **Links:** with `shelf.html` removed and the `#how` id renamed, the link check reports
  48 broken links.

**For the site lane, not changed here:**
- "ALYR Agent reads the orders, bookings, chats and credit…" (`home.spotlight.body`) is on
  the allowlist as reading records, but it is the closest to honesty.md's "reads (meaning
  understands)". "Counts" or "takes" would be safer.
- "Our prices go on this page soon" is allowed as the offer-off answer. honesty.md section 7
  allows "soon" only for the WhatsApp line, so the founder may want it reworded.

**Not checked:**
- the CI job on GitHub (billing);
- the copy loader on Linux (it ran on Windows, Node 22.22);
- link targets on other sites;
- the Arabic matching with words outside the two lists.

## Stage 3: one command set

**Built:** in `apps/web/package.json`. There is no root `package.json`, so run these from
`apps/web` (or `pnpm -C apps/web site:check` from the root).

| Command | What it does |
|---|---|
| `pnpm site:dev` | `scripts/site/dev.mjs`: `next dev` on a free port from 3101 up, never 3100 (`--port=` refuses 3000, 3100 and 8000). Its own output folder `.next-dev-<port>`. Puts `tsconfig.json` back when Next's rewrite is the only change, on stopping and at the next start |
| `pnpm site:build` | `bash scripts/build-site.sh` |
| `pnpm site:serve` | `scripts/site/serve.mjs`: serves `out-site` like Cloudflare (clean addresses, the 404 page, `_headers`, brotli or gzip) on a free port |
| `pnpm site:check` | the build and every check (stage 2) |
| `pnpm site:shots` | `scripts/site/shots.mjs`: serves `out-site` and shoots every page at 1440 and 390, light and dark, into `apps/web/.shots/<commit>/` (ignored by git). Takes `--pages=`, `--sizes=`, `--schemes=`, `--full`, `--reduced-motion`, `--url=` |
| `pnpm site:a11y` | axe and Lighthouse (stage 4) |
| `pnpm site:deploy` | the manual publish (stage 1) |

Wrangler was pinned at exactly 4.150.0 in stage 1.

`shoot.mjs` moved here from stage 4, because `site:shots` needs it:
- `git mv docs/site-redesign/baseline/shoot.mjs scripts/site/shoot.mjs`;
- the old path is now a three-line stub that imports the new one, so every doc that cites
  it keeps working;
- the browser path also honours `CHROME_PATH`.

**Checked:**
- `site:serve` answers 200 with brotli on `/` and `/ar/chat`, 200 on `/version.txt`, `image/png`
  for `/opengraph-image`, 404 for unknown paths and for `/../package.json`, and applies
  `_headers`.
- `site:shots` wrote real pictures, `/` and `/ar/docs` at 390 in both themes. The first try
  failed for two reasons, both fixed:
  - `spawnSync` blocked the local server running in the same process;
  - Git Bash turned `--pages=/` into a Windows path, the known `MSYS_NO_PATHCONV=1` trap.
    The script sets the variable for `shoot.mjs`; from Git Bash, set it yourself for the
    `--pages=` argument.
- `site:dev` started on 3101 (3100 was skipped) and served `/shelf` with 200.
  - `--port=3100` is refused with exit 2.
  - After a hard kill, the next start put `tsconfig.json` back.
- The stub at the old path runs the moved script.

**Not checked:**
- The tidy-up on a normal Ctrl+C. The harness can only kill the process hard; the clean-up
  at the next start was checked instead.
- `site:shots` at full page across all 14 pages.
- `site:dev` on macOS or Linux.

## Stage 4: the tools in the repo

**Built:**
- **`axe-core` 4.14.0 and `lighthouse` 13.5.0**, exact devDependencies of `apps/web`.
  `site:a11y` (`scripts/site/a11y.mjs`) uses them. It:
  - serves `out-site` compressed;
  - runs axe on every page at 1440 and 390, light and dark: scrolled to the end and back,
    `content-visibility` forced visible, `wcag2a`/`wcag2aa`/`wcag21aa` and best practice;
    it fails on serious or critical;
  - runs Lighthouse mobile on `/` and `/ar` (`--pages=`, `--runs=`, `--no-axe`,
    `--no-lighthouse`); it fails below Performance 90, Accessibility 100, LCP 2.5 s or
    CLS 0.05.
- **`C:\t\tools` is no longer needed.**
- **`scripts/browser-kit.mjs`:** Edge's launcher process now hands over to the browser and
  exits at once, and browser-kit took that exit for a failed start. It now counts the start
  as good when our debugging port answers with a page. This affects the product lane's
  browser checks too, which use the same kit; for them it only removes a false failure.
- For the same reason, Lighthouse's `chrome-launcher` is given a fixed free port. Each run
  stops only the Edge processes that use its own profile folder, then deletes the folder.
- `shoot.mjs` moved in stage 3.
- **Skills:**
  - `alyr-design/verify.md` names the commands: `site:check`, `site:a11y`, `site:shots`,
    `site:serve`, `site:dev`. It also gives:
    - the new `shoot.mjs` path;
    - that `--eval` exists (verify.md said it did not);
    - the pinned axe and Lighthouse;
    - what `site:check` covers in words and claims.
  - `alyr-site-page` names `pnpm site:check` and `pnpm site:a11y` in its checklist, and the
    approval-based deploy in place of `npx wrangler deploy`.
  - The other docs that cite the old `shoot.mjs` path keep working through the stub, and
    were left alone.

**Checked:** a full `pnpm site:a11y` on the built site:
- **axe:** no serious or critical issue on all 14 pages, 56 runs;
- **Lighthouse mobile, one run each:** `/` Performance 96, Accessibility 100, LCP 2.41 s,
  CLS 0; `/ar` 95, 100, 2.41 s, 0.

**Not checked:**
- Lighthouse in CI. There is no Edge there, and Lighthouse timing on shared runners is
  noisy, so `site:a11y` is not in the CI job.
- `site:a11y` on Linux or macOS.
- Whether the old `C:\t\tools` copies give the same axe results.

## Stage 5: llms.txt, llms-full.txt and a markdown copy of each page

**Built:** `scripts/site/llms.mjs`, run by `build-site.sh` after `_headers` is written and
before the stamp. It writes into `out-site`:
- **14 markdown copies:** `/index.md`, `/ar.md`, and `/<page>.md` and `/ar/<page>.md` for
  the six products.
  - Each copy is built from `copy.ts`, section by section in the page's order: the
    headings, the lead, the facts, how it works, what's in it, who it's for, works with,
    the questions as the page filters them, and the closing call with the contact in its
    state.
  - Each drawing, demo, flow story, screen and report becomes one line: "[Sample screen of
    a fictional business. The names and numbers in it are made up; they are not ALYR's
    results or a customer's.]" No sample figure is copied.
  - Each copy ends with the address of its page, both languages' copies, the WhatsApp
    disclaimer and "ALYR. Built in Qatar."
- **`llms.txt`:** the shape of `03-ax.md`'s draft, in the llmstxt.org format.
  - The summary is `meta.home.descriptionNoOffer`.
  - The facts come from the copy where the copy says them: the business types, the four
    steps, the WhatsApp disclaimer, the contact state, the sample shop names. The few the
    copy does not say are in `scripts/site/machine-words.json`: no business uses ALYR yet,
    payments, prices not on the site, the samples are fictional.
  - Each product links to its markdown copy, with its meta description and, where the
    truth needs one, a caveat:
    - Bookings: one booking at a time.
    - Agent: fixed rules; the report waits for WhatsApp's approval.
  - The Arabic pages are under "Optional".
- **`llms-full.txt`:** `llms.txt`, then every copy, English first. About 240 KB in all.
- **`stamp.mjs`** puts `<link rel="alternate" type="text/markdown" href="/<page>.md">` in
  each page's `<head>`. It is added after the build, so no `_site` component changed.
- **`_headers`** gives each copy `Content-Type: text/markdown; charset=utf-8` and
  `Link: <page>; rel="canonical"`, and gives `llms.txt` and `llms-full.txt`
  `text/plain; charset=utf-8`. The rules are written one per file, because Cloudflare does
  not document a `*.md` pattern. `site-worker.js` passes the asset responses through
  unchanged, so these headers apply. Previews add only `X-Robots-Tag`.

**Honesty:**
- **No prices, even with the offer on.** The copies always use the offer-off words and drop
  every `offer: true` question.
- **llms.txt says where prices are, never what they are.** With the offer on it points to
  the Price section.
- **No AI words.** The draft's "not from an AI model" was dropped: honesty.md bans AI words
  even in a denial. The Agent line says "fixed, written rules … the owner decides".
- **Docs:** only its own meta description ("Set up for you"); nothing says it is available.
- `banned-words.mjs` and `link-check.mjs` read these files too:
  - every word and price check;
  - every link: 1,164 internal links in 43 files resolve.
- **Offer test:** an offer-on build checked as if the offer were off still flags its HTML
  (122 problems), and nothing in the machine files.
- `banned-words`: an offer-only line now counts only at 40 characters or more. "ALYR Agent
  and ALYR Shelf", a price-section label, also occurs in ordinary lines.

**Checked:**
- `wrangler dev` 4.150.0, locally over HTTPS, with an empty env file, so no `.env` was
  read:
  - `/index.md` and `/ar/chat.md`: 200, `text/markdown; charset=utf-8`, with the canonical
    `Link`;
  - `/llms.txt`, `/llms-full.txt`, `/version.txt`: 200, `text/plain; charset=utf-8`;
    `version.txt` has `no-cache`;
  - `/opengraph-image`: `image/png`;
  - with `PREVIEW` on, every response, 404 included, carries `X-Robots-Tag: noindex,
    nofollow`.
- Read through `/index.md`, `/agent.md`, `/ar/docs.md` and `llms.txt`.

**Not checked:**
- **The same on Cloudflare.**
- **Locally, the canonical `Link` of `/ar/chat.md`** came back rewritten to the local host
  (`/index.md` kept alyr.qa). It looks like the dev server's own rewriting; confirm on a
  preview.
- **The Arabic sample line** («شاشة نموذجية …») is mine. The native review (ALY-66) has
  not seen it.
- **The copies follow today's `copy.ts` shape.** The site agent's fold of "What a check-up
  finds" into "By business" (in `D:\alyr-ux`) changes it:
  - sections whose keys are gone are skipped;
  - a copy shorter than 600 characters, or one without its title, fails the build;
  - after both branches merge, rerun `pnpm site:check` and read `/index.md` again.
- Whether any assistant reads `llms.txt`. `03-ax.md` notes that none says it does.
