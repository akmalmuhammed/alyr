# Verification: the matrix and the tools

Look at the work; do not assume it. Every check below caught a real defect at least once
(audit 4.2). `alyr-design-review` says when to run the full set and when a lean pass is
enough.

## The matrix

| Axis | Values |
|---|---|
| Pages or screens | every one you changed, plus every page that shares a changed component (the header, footer, contact block and `site.css` are on every page) |
| Language | English and Arabic |
| Width | 1440 and 390; 320 for anything with a layout; spot checks at 1024 and 1280 where a grid changes (the reviews once missed 1024–1280) |
| Theme | light and dark, passed explicitly every time |
| Motion | normal, and reduced motion |
| Scripts | with and without JavaScript |
| States | every menu open; every contact state you touched; the offer switch on and off if prices are near; empty, first-week, quiet and stale for product screens; each sample in a switch |

## Commands

```bash
# what CI runs (api lint and tests, web lint, types, audit, build)
scripts/check.sh
# the web part only, as CI does it: types before build, in a clean checkout
cd apps/web && pnpm lint && pnpm exec tsc --noEmit && pnpm build
# the published site: static export, deferred scripts, _headers, a grep for API addresses
bash scripts/build-site.sh      # writes apps/web/out-site/
# the site's own commands, from apps/web (scripts/site/; docs/site-audit/05-tooling-log.md)
pnpm site:check     # build-site.sh, EN/AR copy parity, banned words and prices, internal links
pnpm site:a11y      # axe on every page (1440 and 390, both themes), Lighthouse mobile on / and /ar
pnpm site:shots     # screenshots of every page into apps/web/.shots/<commit>/
pnpm site:serve     # out-site as Cloudflare serves it, compressed, on a free port
pnpm site:dev       # next dev on a free port from 3101, with its own output folder
```

## Preview servers

- **Never port 3100** and never the checkout `D:\alyr whatsapp`: the laptop's demo and other
  sessions use them. Never the shared `alyr` database or port 8000.
- A dev server in your own worktree, with its own output folder and a free port of your own:
  `pnpm site:dev` from `apps/web` picks a free port from 3101 (never 3100), uses
  `.next-dev-<port>` and puts back `apps/web/tsconfig.json`, which Next rewrites. Delete
  `.next-dev-<port>` at the end. By hand:
  `ALYR_DIST_DIR=.next-preview pnpm exec next dev -p 31NN`, then `git checkout` the
  tsconfig before every commit.
- For the final checks, serve `apps/web/out-site` (after `build-site.sh`) with
  `pnpm site:serve`. It **compresses** (brotli or gzip), applies `_headers` and maps `/chat`
  to `chat.html`. Without compression Lighthouse read LCP 6.2 s for a page that is 2.3 s
  behind Cloudflare.
- **Stop the server before rebuilding** (`build-site.sh` deletes `.next`), and stop every
  server you started when you finish.

## Screenshots: headless Edge

The in-app browser's screenshots are unreliable here (hidden pane, cropped, animations
stalled). Use the committed script. It moved from `docs/site-redesign/baseline/` on 24 Oct
2026, and the old path still forwards. `pnpm site:shots` runs it over every page, both widths
and both themes, against the served build.

```bash
node scripts/site/shoot.mjs <url> <width> <height> <out.png> \
  --scheme=light|dark [--full] [--reduced-motion] [--at=#section --offset=120 --settle=1600] \
  [--wait=ms] [--scale=n] [--as-scrolled] --profile=C:\t\<you>prof
```

- **Always pass `--scheme`.** The founder's Windows is in dark mode, so a capture without it
  is dark.
- **One Edge profile per agent** (`--profile=C:\t\<name>prof`, a short path: Edge fails
  silently with long ones). The script stops only Edge processes whose command line names
  its profile; never stop all `msedge`. A stray child from an earlier run makes the next run
  attach to the old page: stop processes matching your profile.
- localStorage persists in the profile per origin: clear or set `alyr-theme` before each
  theme scenario.
- Full-page captures show every section as it looks once read and lay out
  `content-visibility` sections; a sticky figure is painted once in a full-page shot (an
  artefact, not a bug). Use `--at` for a section in place.
- Taking screenshots can stall CSS animations: read timing in a separate run that takes
  none (DevTools `Runtime.evaluate`).
- Git Bash turns a lone `/` argument into a Windows path: set `MSYS_NO_PATHCONV=1`.
- Save screenshots in the work's folder under `shots/` and **do not commit them**.

## Probes the script does not have yet

`shoot.mjs --eval="<expression>"` prints the value of an expression once the page has
loaded. The probes below are not committed yet. Until one is, write it as an `--eval` or as a
short DevTools script beside your captures (outside the repo):
- **320 overflow:** `document.documentElement.scrollWidth === 320` at 320 × 700 in both
  languages, and the sticky bar fully on screen.
- **Targets:** every interactive element at least 44 × 44 at 390.
- **Motion timing:** when each part of an entrance becomes visible, after navigation.
- **Element compare:** the Agent component on the site against `/agent-sample`, computed
  type and colour of every `ag-` element, both themes and languages.
- **Nothing else changed:** computed styles of every element, old `out-site` against new.

## Accessibility

- **axe-core 4.14, zero serious or critical** (aim for none at all), on the built site, at
  the top and after scrolling to the end, with `content-visibility` forced visible (otherwise
  half-arrived items report contrast). `pnpm site:a11y` does this with the `axe-core` pinned
  in `apps/web`; `C:\t\tools` is no longer needed. Large-text contrast is 3:1.
- **Text under a CSS filter** (the drawn chat bubbles) is skipped by axe: scan its contrast
  directly.
- Keyboard: Tab through every control, open and close every menu with Enter, Space and
  Escape, focus returns to the button.

## Performance (site pages)

Lighthouse mobile, simulated throttling, against the compressed `out-site`, two or three
runs; report the lowest: Performance ≥ 90, Accessibility 100, CLS < 0.05, LCP < 2.5 s.
`pnpm site:a11y --no-axe --pages=/,/chat --runs=3` runs the pinned Lighthouse 13 on Edge
(or `CHROME_PATH`) and fails below that budget.

Style work counts before the first paint: a selector whose rightmost part is an `:is()` holding
descendant selectors (`.afig[data-feed] :is(.ag-summary, .ag-need small, …)`) is matched
against every element of the page, and it cost the homepage 150 ms of simulated LCP (25 Oct
2026, D-058's build). Write such lists out, one selector each, so each keys on its own class.
To find what moved LCP, swap one built file at a time between two `out-site` copies served side
by side (`serveSite({ port, out })` in `scripts/site/serve.mjs`) and run Lighthouse on each.

## Words and claims

- Read every changed line, `aria-label`, alt text, meta description, social card and
  caption against [honesty.md](honesty.md) and `docs/status.md`.
- `pnpm site:check` checks the copy and the built pages for the AI words (read from
  [honesty.md](honesty.md) section 1), "coming", "soon", Payroll, "Early access", and prices
  while the offer is off. A true use goes in `scripts/site/allow/banned.json` with its
  reason. It does not judge meaning, so still read the lines.
- Grep the copy files for the retired names and "QAR" on Arabic pages.
- Grep for retired sample names after any rename (`Sadaf|Nasma|صدف|نسمة`).

## Cloud sessions

No Edge, axe or Lighthouse there, and no founder's laptop. A cloud session can run
`scripts/check.sh` (after `scripts/cloud-setup.sh`) and `pnpm site:check`, and must say in
its report that screenshots, axe and Lighthouse were not run.

## CI and merging

- `gh pr checks --watch | tail` hides the exit code and returns at once when no check has
  registered, so a following merge goes in before CI. Wait with
  `gh run watch <run-id> --exit-status`, unpiped. Merging is not the builder's job unless
  told; it needs green CI.
