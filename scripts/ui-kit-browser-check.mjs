// Looks at the product UI kit's two dev gallery pages in a real browser (Product UI foundation):
//
//   /ui-kit        the core kit: buttons, tags, fields, panels, banners, tabs, empty states
//   /ui-kit/data   tables, drawers, dialogs, menus and charts
//
// Both are built by the kit's agents and return 404 in production. For every page, in English and
// Arabic, light and dark, at 1440 and 390 px wide (16 captures), it
//   - saves the page as PNG slices OUTSIDE the repository (default D:\alyr-redesign-build\shots\kit\),
//   - fails on a console error, an uncaught exception or a failed same-origin request,
//   - fails on horizontal scroll (the page wider than its window),
//   - fails if Arabic did not switch the page to right to left, or dark did not set the theme,
//   - runs axe-core when it is found (apps/web/node_modules, or --axe) and fails on a serious or
//     critical violation.
// A page that answers 404 is SKIPPED with a message, so this can sit in the tree before the
// gallery exists; `--require` turns a skip into a failure once it does. Headless Edge over the
// DevTools protocol (scripts/browser-kit.mjs), no packages. Node 22.
//
//   cd apps/web && pnpm exec next dev -p 31NN          (a port of your own, never 3100)
//   node scripts/ui-kit-browser-check.mjs --base http://localhost:31NN
//        [--out D:/alyr-redesign-build/shots/kit] [--profile C:/t/uikit-prof] [--port 9771]
//        [--lang en|ar] [--scheme light|dark] [--width 1440|390] [--page /ui-kit] [--axe <axe.min.js>]
//        [--require] [--no-axe]
//
// The Edge it starts uses its own profile folder and a debugging port nobody else is on; keep both
// short (Edge fails quietly on long paths). The pages must keep the choice of language in
// localStorage `alyr-workspace-lang` and of theme in `alyr-theme`, as the product does.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./browser-kit.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (args.base ?? process.env.UI_KIT_BASE ?? "").replace(/\/$/, "");
const OUT = resolve(args.out ?? "D:/alyr-redesign-build/shots/kit");
const PROFILE = args.profile ?? "C:/t/uikit-prof";
const PORT = Number(args.port ?? 9771);
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args["no-axe"] ? "" : args.axe ?? resolve(repo, "apps", "web", "node_modules", "axe-core", "axe.min.js");
const REQUIRE = args.require === "true";

const PAGES = ["/ui-kit", "/ui-kit/data"].filter((p) => !args.page || args.page === p);
const LANGS = ["en", "ar"].filter((l) => !args.lang || args.lang === l);
const SCHEMES = ["light", "dark"].filter((s) => !args.scheme || args.scheme === s);
const WIDTHS = [1440, 390].filter((w) => !args.width || Number(args.width) === w);
const HEIGHT = { 1440: 900, 390: 844 };
const SLICE = 1800; // css px per PNG, so a long page is several readable files
const MAX_SLICES = 14;

// ── before anything starts ────────────────────────────────

if (!BASE) {
  console.error("Say where the app runs: --base http://localhost:31NN (start it with `pnpm exec next dev -p 31NN` in apps/web; never port 3100).");
  process.exit(2);
}
const fromRepo = relative(repo, OUT);
if (fromRepo === "" || (!fromRepo.startsWith("..") && !isAbsolute(fromRepo))) {
  console.error(`--out ${OUT} is inside the repository. Screenshots never go in the repo: use a folder outside it.`);
  process.exit(2);
}
if (!existsSync(EDGE)) {
  console.error(`Edge not found at ${EDGE}. Set EDGE_PATH to msedge.exe.`);
  process.exit(2);
}

// Which pages exist? A 404 is a skip (the gallery is not built yet, or this is a production build).
const status = {};
for (const path of PAGES) {
  try {
    const response = await fetch(BASE + path, { redirect: "manual", cache: "no-store" });
    status[path] = response.status;
    await response.body?.cancel();
  } catch (error) {
    console.error(`Nothing answers at ${BASE}${path} (${error.cause?.code ?? error.message}). Start the app first: pnpm exec next dev -p <your port> in apps/web.`);
    process.exit(2);
  }
}
const live = PAGES.filter((p) => status[p] >= 200 && status[p] < 400);
for (const path of PAGES) {
  if (!live.includes(path)) console.log(`SKIPPED ${path}: answered ${status[path]}. The kit's gallery page is not built yet, or this is a production build (the gallery is dev only).`);
}
if (!live.length) {
  console.log("ui-kit check: nothing to look at yet.");
  process.exit(REQUIRE ? 1 : 0);
}
mkdirSync(OUT, { recursive: true });

// ── the run ───────────────────────────────────────────────

const failures = [];
const report = [];
const log = (...m) => console.log(...m);
const fail = (where, what) => {
  failures.push(`${where}: ${what}`);
  log(`FAIL ${where}: ${what}`);
};

const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: 1440, height: HEIGHT[1440], scheme: "light" });
// Requests that failed: same-origin only, so an outside font or analytics call is not ours to fix.
let failedRequests = [];
b.on("Network.responseReceived", (p) => {
  if (p.response.status >= 400 && p.response.url.startsWith(BASE) && !/favicon/.test(p.response.url)) failedRequests.push(`${p.response.status} ${p.response.url.slice(BASE.length)}`);
});

/** A viewport with its own scale: 1, so a slice is as many pixels as css pixels. */
async function view(width, scheme) {
  const mobile = width < 800;
  await b.send("Emulation.setDeviceMetricsOverride", { width, height: HEIGHT[width] ?? 900, deviceScaleFactor: 1, mobile });
  await b.send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 5 });
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] });
  b.scheme = scheme;
}

/** The page as PNG slices of SLICE css px; returns the files and the page's height. */
async function slices(base) {
  // content-visibility sections lay out only near the window; show all of them, with no scroll behaviour.
  await b.js("(() => { const s = document.createElement('style'); s.textContent = '* { content-visibility: visible !important; scroll-behavior: auto !important; }'; document.head.appendChild(s); })()");
  await sleep(250);
  const m = await b.send("Page.getLayoutMetrics");
  const width = Math.ceil((m.cssContentSize ?? m.contentSize).width);
  const height = Math.ceil((m.cssContentSize ?? m.contentSize).height);
  const files = [];
  for (let y = 0, n = 1; y < height && n <= MAX_SLICES; y += SLICE, n++) {
    const r = await b.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y, width, height: Math.min(SLICE, height - y), scale: 1 } });
    const file = `${base}-${String(n).padStart(2, "0")}.png`;
    writeFileSync(file, Buffer.from(r.data, "base64"));
    files.push(file);
  }
  return { files, height };
}

try {
  for (const lang of LANGS) {
    for (const scheme of SCHEMES) {
      // The language and the theme are kept on the device, as the product keeps them; set them once per pair.
      await view(WIDTHS[0], scheme);
      await b.go(BASE + live[0], 200);
      await b.js(`localStorage.setItem('alyr-lang', '${lang}'); localStorage.setItem('alyr-workspace-lang', '${lang}'); localStorage.setItem('alyr-theme', '${scheme}')`);
      for (const width of WIDTHS) {
        await view(width, scheme);
        for (const path of live) {
          const name = `${path.replace(/^\//, "").replace(/\//g, "-")}-${lang}-${scheme}-${width}`;
          const where = name;
          const before = failures.length;
          b.problems.length = 0;
          failedRequests = [];
          await b.go(BASE + path, 800);
          await b.until("document.readyState === 'complete'", "the page to load");
          await b.js("document.fonts && document.fonts.ready.then(() => true)");
          await sleep(300);

          const state = await b.js(`(() => {
            const root = document.documentElement;
            return {
              theme: root.dataset.theme || null,
              rtl: !!document.querySelector('[dir="rtl"]') || root.dir === 'rtl' || getComputedStyle(document.body).direction === 'rtl',
              wide: Math.max(root.scrollWidth, document.body.scrollWidth) - root.clientWidth,
              height: root.scrollHeight,
              text: document.body.innerText.length,
            };
          })()`);
          if (state.text < 40) fail(where, "the page is empty");
          if (state.wide > 1) fail(where, `horizontal scroll: the page is ${state.wide}px wider than the window`);
          if (lang === "ar" && !state.rtl) fail(where, "Arabic did not switch the page to right to left (no dir=\"rtl\")");
          if (lang === "en" && state.rtl) fail(where, "English page is right to left");
          if (scheme === "dark" && state.theme !== "dark") fail(where, `dark was stored but the page's theme is ${state.theme ?? "not set"}`);
          for (const p of [...new Set(b.problems)]) fail(where, p);
          for (const r of [...new Set(failedRequests)]) fail(where, `request failed: ${r}`);

          let violations = null;
          if (AXE && existsSync(AXE)) {
            violations = await b.axe(AXE);
            for (const v of violations ?? []) {
              if (v.impact === "serious" || v.impact === "critical") fail(where, `axe ${v.id} (${v.impact}, ${v.n}): ${v.nodes[0]?.target}`);
            }
          }
          const shot = await slices(resolve(OUT, name));
          report.push({ name, page: path, lang, scheme, width, height: state.height, horizontalOverflow: Math.max(state.wide, 0), axe: violations ? violations.map((v) => `${v.id}:${v.impact}:${v.n}`) : "not run", files: shot.files.map((f) => relative(OUT, f)) });
          log(`${failures.length === before ? "ok  " : "FAIL"} ${name}: ${shot.files.length} slice(s), ${state.height}px tall${violations ? `, axe ${violations.length}` : ""}`);
        }
      }
    }
  }
} finally {
  await b.close();
}

writeFileSync(resolve(OUT, "report.json"), JSON.stringify({ base: BASE, status, report, failures }, null, 2));
if (failures.length) {
  console.error(`\nui-kit check: ${failures.length} problem(s)\n${failures.map((f) => `  ${f}`).join("\n")}\nPictures and report.json are in ${OUT}`);
  process.exit(1);
}
console.log(`\nui-kit check: ${report.length} capture(s) clean. Pictures in ${OUT}`);
