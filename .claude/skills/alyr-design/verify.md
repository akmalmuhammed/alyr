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
```

## Preview servers

- **Never port 3100** and never the checkout `D:\alyr whatsapp`: the laptop's demo and other
  sessions use them. Never the shared `alyr` database or port 8000.
- A dev server in your own worktree, with its own output folder and a free port of your own
  (3101 and up are often taken; check first):
  `ALYR_DIST_DIR=.next-preview pnpm exec next dev -p 31NN` from `apps/web`. Next rewrites
  `apps/web/tsconfig.json`; `git checkout` it before every commit and delete `.next-preview`
  at the end.
- For the final checks, serve `apps/web/out-site` (after `build-site.sh`) with a small Node
  server **that compresses** (brotli or gzip): without compression Lighthouse read LCP 6.2 s
  for a page that is 2.3 s behind Cloudflare. Map `/chat` to `chat.html`, `/ar/chat` to
  `ar/chat.html`.
- **Stop the server before rebuilding** (`build-site.sh` deletes `.next`), and stop every
  server you started when you finish.

## Screenshots: headless Edge

The in-app browser's screenshots are unreliable here (hidden pane, cropped, animations
stalled). Use the committed script:

```bash
node docs/site-redesign/baseline/shoot.mjs <url> <width> <height> <out.png> \
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

The committed `shoot.mjs` has no `--eval`. The reviews ran these with their own scripts
outside the repo; until a probe is committed, write a short DevTools script beside your
captures (outside the repo) for:
- **320 overflow:** `document.documentElement.scrollWidth === 320` at 320 × 700 in both
  languages, and the sticky bar fully on screen.
- **Targets:** every interactive element at least 44 × 44 at 390.
- **Motion timing:** when each part of an entrance becomes visible, after navigation.
- **Element compare:** the Agent component on the site against `/agent-sample`, computed
  type and colour of every `ag-` element, both themes and languages.
- **Nothing else changed:** computed styles of every element, old `out-site` against new.

## Accessibility

- **axe-core 4.14, zero serious or critical** (aim for none at all), injected with
  puppeteer-core into Edge, on the built site, at the top and after scrolling to the end,
  with `content-visibility` forced visible (otherwise half-arrived items report contrast).
  On the founder's laptop the tools are in `C:\t\tools` (another session's folder: require
  by absolute path, do not edit). Large-text contrast is 3:1.
- **Text under a CSS filter** (the drawn chat bubbles) is skipped by axe: scan its contrast
  directly.
- Keyboard: Tab through every control, open and close every menu with Enter, Space and
  Escape, focus returns to the button.

## Performance (site pages)

Lighthouse 12 mobile, simulated throttling, against the compressed `out-site`, two or three
runs; report the lowest: Performance ≥ 90, Accessibility 100, CLS < 0.05, LCP < 2.5 s.
`CHROME_PATH` points at Edge.

## Words and claims

- Read every changed line, `aria-label`, alt text, meta description, social card and
  caption against [honesty.md](honesty.md) and `docs/status.md`.
- Grep the copy files for the AI word list, the retired names and "QAR" on Arabic pages.
- Grep for retired sample names after any rename (`Sadaf|Nasma|صدف|نسمة`).

## Cloud sessions

No Edge, axe or Lighthouse there, and no founder's laptop. A cloud session can run
`scripts/check.sh` (after `scripts/cloud-setup.sh`) and `build-site.sh`, and must say in
its report that screenshots, axe and Lighthouse were not run.

## CI and merging

- `gh pr checks --watch | tail` hides the exit code and returns at once when no check has
  registered, so a following merge goes in before CI. Wait with
  `gh run watch <run-id> --exit-status`, unpiped. Merging is not the builder's job unless
  told; it needs green CI.
