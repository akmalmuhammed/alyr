// Runs the two screens ALY-109 added in a real browser: the Catalog's cards on the workspace
// home ("Sold out now", "Low stock"), at phone and laptop width in English or Arabic, light and
// dark, and the back office's Usage view (English only: the console has no Arabic). Headless
// Edge or Chrome over the DevTools protocol, no packages; Node 22.
//
//   node scripts/catalog-reports-browser-check.mjs --lang en \
//        --base http://localhost:31109 --api http://127.0.0.1:8109 --out C:/t/cr \
//        --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API and web app (docs/status.md, "Live testing from the laptop"; never the
// shared database) whose shop is the open demo shop with the Catalog module switched on (a
// `tenant_modules` row for 'catalog'), a few items sold out (some by the switch, some counted to
// nothing) and a few low on stock (`POST /api/items`, `/api/items/{id}/switch`, `/stock`), some
// photos uploaded (`POST /api/media/photos`) and a few earlier months in `media_usage`, one row
// per shop and month. Every check reads the API's own numbers: the cards must equal the rows of
// the lists they open, and the Usage view must show what `/api/admin/media/usage/history` says.
// Start the API with `ALYR_MEDIA_FREE_BYTES` near what is stored to see the 80% and over states
// (the check reads the state from the API). `--axe` is the path to axe-core's axe.min.js;
// without it the accessibility scan is skipped. Axe must find nothing in what ALY-109 built
// (the dashboard, the Usage page); the shell's grey sidebar text (ALY-129) is only listed.
//
// Short folders: Edge fails quietly with long paths, so keep --profile and --out short.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:31109";
const API = args.api ?? "http://127.0.0.1:8109";
const LANG = args.lang === "ar" ? "ar" : "en";
const OUT = args.out ?? `${tmpdir()}/catalog-reports-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/catalog-reports-profile-${LANG}`;
const PORT = Number(args.port ?? (LANG === "ar" ? 9378 : 9377));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What the cards say, in each language (catalog.py).
const WORDS = {
  en: { title: "Catalog", sold: "Sold out now", low: "Low stock" },
  ar: { title: "الكتالوج", sold: "نفدت الآن", low: "مخزون قليل" },
}[LANG];

async function launch() {
  mkdirSync(PROFILE, { recursive: true });
  const proc = spawn(EDGE, [
    "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "--no-first-run",
    "--no-default-browser-check", "--disable-extensions", "--disable-gpu", "--hide-scrollbars",
    "--window-size=375,812", "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  let page = null;
  for (let i = 0; i < 80 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); } catch { /* not up */ }
    if (!page) await sleep(250);
  }
  if (!page) throw new Error("the browser did not start");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let counter = 0;
  const waiting = new Map();
  const heard = new Map();
  const problems = [];
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (m.id && waiting.has(m.id)) {
      const { resolve, reject } = waiting.get(m.id);
      waiting.delete(m.id);
      if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
    } else if (m.method) {
      for (const fn of heard.get(m.method) ?? []) fn(m.params);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++counter;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, fn) => heard.set(method, [...(heard.get(method) ?? []), fn]);
  on("Runtime.exceptionThrown", (p) => problems.push(`exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`));
  on("Runtime.consoleAPICalled", (p) => { if (p.type === "error") problems.push(`console: ${p.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300)}`); });
  await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable"); await send("Network.enable");
  return { send, on, problems, close: async () => { try { await send("Browser.close"); } catch { /* gone */ } ws.close(); proc.kill(); } };
}

const browser = await launch();
const { send } = browser;
const failures = [];
const log = (...m) => console.log(`[${LANG}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };

/** Phone (375 wide, touch) or laptop (1280 wide), light or dark. Motion off, so shots are still. */
async function setup(scheme, device) {
  const phone = device === "phone";
  await send("Emulation.setDeviceMetricsOverride", phone
    ? { width: 375, height: 812, deviceScaleFactor: 2, mobile: true }
    : { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setTouchEmulationEnabled", phone ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] });
}
async function js(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function until(expression, what, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await js(expression)) return; } catch { /* the page is changing */ }
    await sleep(120);
  }
  throw new Error(`timed out: ${what}`);
}
async function go(path, wait = 800) {
  const loaded = new Promise((resolve) => browser.on("Page.loadEventFired", resolve));
  await send("Page.navigate", { url: `${BASE}${path}` });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(wait);
  await js("document.querySelectorAll('nextjs-portal').forEach(n => n.remove())");
}
async function shot(name) {
  await js("document.querySelectorAll('nextjs-portal').forEach(n => n.remove())");
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${LANG}-${name}.png`, Buffer.from(r.data, "base64"));
  log("shot", name);
}
/** Press the centre of an element like a thumb or a mouse would, once it has stopped moving. */
async function click(find, wait = 300) {
  const probe = `(() => { const el = (${find}); if (!el) return null; const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const top = document.elementFromPoint(cx, cy); const v = visualViewport; return { hit: !!top && (el === top || el.contains(top) || top.contains(el)), x: (cx - v.offsetLeft) * v.scale, y: (cy - v.offsetTop) * v.scale, cover: top ? top.tagName + '.' + String(top.className).slice(0, 40) : null }; })()`;
  let last = null;
  for (let i = 0; i < 14; i++) {
    const found = await js(`(() => { const el = (${find}); if (!el) return false; el.scrollIntoView({block:'center', inline:'nearest'}); return true; })()`);
    if (!found) throw new Error(`nothing to press: ${find}`);
    await sleep(90);
    const now = await js(probe);
    if (now && now.hit && last && Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5) { last = now; break; }
    last = now;
    if (i === 13) throw new Error(`could not get a clear press on: ${find} (what is on top: ${last && last.cover})`);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: last.x, y: last.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: last.x, y: last.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: last.x, y: last.y, button: "left", clickCount: 1 });
  await sleep(wait);
}
/** Make the workspace read in `to`. The choice is remembered on the device, so a profile that
 * already holds it is left alone. */
async function setLanguage(to) {
  const now = async () => ((await js("document.querySelector('.sh')?.getAttribute('dir')")) === "rtl" ? "ar" : "en");
  await sleep(400);
  if ((await now()) === to) return;
  // On a laptop the language button is in the sidebar; on a phone it is in the palette.
  if (await js("innerWidth >= 900")) { await click("document.querySelector('.sh-lang')", 600); return; }
  await click("document.querySelector('.sh-mtop [aria-label=\"Search or jump to\"], .sh-mtop [aria-label=\"ابحث أو انتقل إلى\"]')", 300);
  await click("[...document.querySelectorAll('.sh-palette button[role=option]')].find(b => /Switch to Arabic|التبديل إلى الإنجليزية/.test(b.textContent))", 600);
}
async function noSideScroll(name) {
  const wide = await js(`(() => { const out = []; const w = innerWidth; if (Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > w) out.push('page ' + document.documentElement.scrollWidth); for (const el of document.querySelectorAll('.sh-scroll, .ops-main')) if (el.scrollWidth > el.clientWidth + 1) out.push(el.className + ' ' + el.scrollWidth + '>' + el.clientWidth); return out.join(', '); })()`);
  check(wide === "", `no sideways scrolling on ${name}${wide ? " (" + wide + ")" : ""}`);
}
/** axe-core on `within` (what ALY-109 built: the dashboard, the Usage page) must find nothing; on
 * the whole page it is only listed, because the shell's grey sidebar and top bar text are
 * known (ALY-129) and not this change's. */
async function axe(name, within) {
  if (!AXE || !existsSync(AXE)) { log("axe skipped: give --axe <path to axe.min.js>"); return; }
  await js(readFileSync(AXE, "utf8"));
  const run = (context) => js(`axe.run(${context}, { runOnly: ['wcag2a','wcag2aa','wcag21aa','best-practice'], resultTypes: ['violations'] }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, nodes: v.nodes.slice(0, 8).map(n => ({ target: n.target.join(' '), html: n.html.slice(0, 140), why: (n.any[0] || n.all[0] || n.none[0] || {}).message })) })))`);
  const mine = await run(`document.querySelector(${JSON.stringify(within)})`);
  writeFileSync(`${OUT}/${LANG}-axe-${name}.json`, JSON.stringify(mine, null, 2));
  check(mine.filter((v) => v.impact !== "minor").length === 0, `axe: no violations in ${within} on ${name} (${mine.length} found)`);
  for (const v of mine) for (const n of v.nodes.slice(0, 4)) log("   axe", v.impact, v.id, n.target, "|", n.why);
  const page = await run("document");
  const shell = page.filter((v) => v.impact !== "minor").flatMap((v) => v.nodes.map((n) => n.target));
  if (shell.length) log(`   (the whole page also has ${shell.length} known shell contrast notes, ALY-129: ${shell.slice(0, 5).join("; ")})`);
}
const api = async (path) => (await fetch(`${API}${path}`, { cache: "no-store" })).json();
const total = async (kind) => (await api(`/api/items?filter=${kind}&limit=200`)).total;

/** The home cards as the page draws them. */
const cards = () => js(`[...document.querySelectorAll('.ag-stock-cards li')].map(li => ({ label: li.querySelector('.ag-kpi-label')?.textContent.trim(), value: li.querySelector('.ag-stock-value bdi')?.textContent.trim(), link: !!li.querySelector('a') }))`);

async function home(scheme, device) {
  await setup(scheme, device);
  await go("/app", 1500);
  await setLanguage(LANG);
  await until(`document.querySelector('.ag')?.lang === '${LANG}' && !!document.querySelector('.ag-stock-cards')`, "the Catalog cards, in the right language", 30000);
  await sleep(500);
  const name = `home-${device}-${scheme}`;
  const shown = await cards();
  const soldOut = await total("sold_out"), low = await total("low_stock");
  check(shown.length === 2 && shown[0].label === WORDS.sold && shown[1].label === WORDS.low, `the two cards are “${WORDS.sold}” and “${WORDS.low}” (${name})`);
  check(Number(shown[0].value) === soldOut && Number(shown[1].value) === low, `the cards say ${soldOut} and ${low}, the rows of the lists they open (${name})`);
  check((await js("document.querySelector('.ag-stock .ag-label')?.textContent.trim()")) === WORDS.title, `the section is headed “${WORDS.title}” (${name})`);
  await noSideScroll(name);
  await js("document.querySelector('.ag-stock').scrollIntoView({ block: 'center' })");
  await sleep(300);
  await shot(name);
  if (scheme === "light") await axe(name, ".ag");
  return { soldOut, low };
}

/** Following a card shows exactly the rows it counted, with that filter pressed. */
async function follow(device, which, expected) {
  await setup("light", device);
  await go("/app", 1500);
  await setLanguage(LANG);
  await until(`document.querySelector('.ag')?.lang === '${LANG}' && !!document.querySelector('.ag-stock-cards')`, "the Catalog cards, in the right language", 30000);
  const index = which === "sold_out" ? 0 : 1;
  await sleep(600);
  check((await js("document.querySelector('.ag')?.lang")) === LANG, `the dashboard is in ${LANG} before the card is pressed`);
  await click(`document.querySelectorAll('.ag-stock-cards li')[${index}].querySelector('a')`, 1500);
  await until("location.pathname === '/app/catalog' && location.search.includes('show=')", "the Catalog opened", 15000);
  check((await js("document.querySelector('.sh')?.getAttribute('dir') ?? document.documentElement.dir")) === (LANG === "ar" ? "rtl" : "ltr"), `the Catalog opens in ${LANG} too`);
  check(await js(`location.search === '?show=${which}'`), `the card opens /app/catalog?show=${which}`);
  await until("document.querySelectorAll('.ct-card, .ct-row').length > 0", "the list", 20000);
  await sleep(800);
  const pressed = await js("[...document.querySelectorAll('.ct-chip[aria-pressed=true]')].map(b => b.textContent.trim())");
  check(pressed.length === 1, `one filter chip is on (${pressed.join(", ")})`);
  const rows = await js("document.querySelectorAll('.ct-card, .ct-row').length");
  check(rows === expected, `${which}: the list shows ${rows} rows, the card said ${expected}`);
  await shot(`catalog-${which}-${device}`);
}

/** The back office's Usage view (English only). */
async function usage(device) {
  await setup("light", device);
  await go("/ops/usage", 1500);
  await until("!!document.querySelector('.ops-usage tbody tr')", "the usage table", 30000);
  const data = await api("/api/admin/media/usage/history?months=6");
  const name = `usage-${device}`;
  check((await js("document.querySelector('h1')?.textContent")) === "Usage", `the page is headed Usage (${name})`);
  const pill = await js("document.querySelector('.ops-meter .sh-pill')?.textContent.trim()");
  const expectedPill = { ok: "Within the free tier", warn: "Past the alert line", over: "Over the free tier" }[data.alert.level];
  check(pill === expectedPill, `the free-tier state reads “${expectedPill}” (${data.alert.level}, ${data.alert.percent}%)`);
  const perShop = await js("document.querySelectorAll('section .ops-usage')[0].querySelectorAll('tbody tr').length");
  check(perShop === data.months[0].shops.length, `${perShop} businesses listed, as the API has (${data.months[0].shops.length})`);
  const monthRows = await js("document.querySelectorAll('section .ops-usage')[1].querySelectorAll('tbody tr').length");
  check(monthRows === 6, `${monthRows} months listed, newest first`);
  check((await js("document.querySelectorAll('section .ops-usage')[1].querySelector('tbody tr td').textContent")).includes("so far"), "the newest month is the one so far");
  await shot(name);
  await noSideScroll(name);
  await js("document.querySelectorAll('section .ops-usage')[1].scrollIntoView({ block: 'center' })");
  await sleep(300);
  await shot(`${name}-months`);
  await js("document.querySelector('.sh-scroll').scrollTop = 0; window.scrollTo(0, 0)");
  await axe(name, ".ops-main");

  // Sorting: by business name, then the other way.
  await js("(() => { const s = document.querySelectorAll('.ops-toolbar select')[1]; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'business'); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await sleep(300);
  const names = () => js("[...document.querySelectorAll('section .ops-usage')[0].querySelectorAll('tbody tr td:first-child')].map(td => td.textContent.trim())");
  const high = await names();
  check(JSON.stringify(high) === JSON.stringify([...high].sort((a, b) => b.localeCompare(a))), "sorted by business, high to low, it runs Z to A");
  await click("[...document.querySelectorAll('.ops-toolbar button')].find(b => /High to low|Low to high/.test(b.textContent))", 300);
  const low = await names();
  check(JSON.stringify(low) === JSON.stringify([...low].sort((a, b) => a.localeCompare(b))), "the other way, A to Z");
  // An earlier month.
  await js("(() => { const s = document.querySelectorAll('.ops-toolbar select')[0]; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, " + JSON.stringify(data.months[2].month) + "); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await sleep(300);
  const caption = await js("document.querySelectorAll('section .ops-usage')[0].querySelector('caption').textContent");
  check(caption.includes(new Date(Date.UTC(Number(data.months[2].month.slice(0, 4)), Number(data.months[2].month.slice(5)) - 1, 1)).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })), `an earlier month shows its own table (${caption})`);
  await shot(`${name}-earlier`);
}

try {
  const first = await home("light", "phone");
  await home("dark", "phone");
  await home("light", "laptop");
  await home("dark", "laptop");
  if (first.soldOut) await follow("phone", "sold_out", first.soldOut);
  if (first.low) await follow("phone", "low_stock", first.low);
  if (first.soldOut) await follow("laptop", "sold_out", first.soldOut);
  if (LANG === "en") {
    await usage("phone");
    await usage("laptop");
    await setup("dark", "laptop");
    await go("/ops/usage", 1500);
    await until("!!document.querySelector('.ops-usage tbody tr')", "the usage table", 30000);
    await shot("usage-laptop-dark");
    await setup("dark", "phone");
    await go("/ops/usage", 1500);
    await until("!!document.querySelector('.ops-usage tbody tr')", "the usage table", 30000);
    await shot("usage-phone-dark");
  }
  check(browser.problems.length === 0, `no script errors in the console${browser.problems.length ? ": " + browser.problems.slice(0, 3).join(" | ") : ""}`);
} catch (error) {
  failures.push(String(error.message ?? error));
  log("STOPPED", String(error.stack ?? error).split("\n").slice(0, 4).join(" / "));
  try { await shot("stopped"); } catch { /* the page is gone */ }
} finally {
  await browser.close();
}
log(failures.length ? `${failures.length} failed: ${failures.join("; ")}` : "all checks passed");
process.exit(failures.length ? 1 : 0);
