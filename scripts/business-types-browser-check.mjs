// Runs what each type of business starts with (ALY-107) in a real browser at phone width, in
// English or Arabic, light or dark, and takes screenshots. No packages: Node 22's built-in
// WebSocket and fetch, and headless Edge or Chrome driven over the DevTools protocol. Node
// 22.18 or newer (it reads the screens' words straight from catalogCopy.ts).
//
//   node scripts/business-types-browser-check.mjs --lang en --base http://localhost:3131 \
//        --out C:/t/bt/shots --profile C:/t/bt/p-en --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API and web app (docs/status.md, "Live testing from the laptop"; never the
// shared database) whose API has ALYR_CATALOG_FOR_NEW_SHOPS=true and ALYR_SIGNUP_OPEN=true on
// its own scratch database. For each type of business it signs up a new owner through the real
// onboarding API (the dev API hands back the email code), puts the session in the browser, and
// looks at:
//   * onboarding's review step ("What you are getting") for the order businesses, or the
//     go-live list for the appointment ones (the Catalog is optional there);
//   * the workspace: the navigation says Menu, Products or Price list; the Catalog opens with
//     the type's samples marked Sample, with their drawn tiles, the banner and the settings
//     the type started with; a sample's sheet; "Remove all samples" in one tap;
//   * travel and documents: no Catalog anywhere.
// It checks the API's own numbers as it goes, runs axe-core on the review, the list, a
// sample's sheet and the settings (with --axe), and exits with an error if anything is wrong.
//
// Short folders: Edge fails quietly with long paths, so keep --profile and --out short.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { COPY } from "../apps/web/app/(product)/_workspace/catalogCopy.ts";
import { COPY as START } from "../apps/web/app/(product)/start/copy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3131";
const LANG = args.lang === "ar" ? "ar" : "en";
const OUT = args.out ?? `${tmpdir()}/bt-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/bt-profile-${LANG}`;
const PORT = Number(args.port ?? (LANG === "ar" ? 9376 : 9375));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const t = COPY[LANG];
const s = START[LANG];
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What each type should show (written here, apart from the code, as the specification).
// `rule` is how a new item starts; `open` are the parts of its form that start open.
const TYPES = {
  restaurant: { name: "Menu", ar: "القائمة", samples: 6, sold: "grey", rule: "switch", open: ["optionsTitle"] },
  bakery: { name: "Menu", ar: "القائمة", samples: 6, sold: "grey", rule: "daily_limit", open: ["scheduleTitle"], lead: true },
  grocery: { name: "Products", ar: "المنتجات", samples: 6, sold: "hide", rule: "count", open: [] },
  shop: { name: "Products", ar: "المنتجات", samples: 6, sold: "grey", rule: "count", open: ["variantsTitle"] },
  fashion: { name: "Products", ar: "المنتجات", samples: 6, sold: "grey", rule: "count", open: ["variantsTitle"] },
  wholesale: { name: "Price list", ar: "قائمة الأسعار", samples: 6, sold: "grey", rule: "count", open: ["groupPricesTitle"] },
  salon: { name: "Products", ar: "المنتجات", samples: 3, sold: "grey", optional: true, rule: "switch", open: [] },
  spa: { name: "Products", ar: "المنتجات", samples: 3, sold: "grey", optional: true, rule: "switch", open: [] },
  clinic: { name: "Products", ar: "المنتجات", samples: 2, sold: "grey", optional: true, rule: "switch", open: [] },
  home: { name: "Products", ar: "المنتجات", samples: 2, sold: "grey", optional: true, rule: "switch", open: [] },
  travel: null,
};
const ONLY = (args.types ?? Object.keys(TYPES).join(",")).split(",");

// ── the browser ──────────────────────────────────────────────────────────────────────────
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

async function setup(scheme) {
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
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
  let seen = "";
  try { seen = String(await js("document.body.innerText")).replace(/\s+/g, " ").slice(0, 300); } catch { /* the page is gone */ }
  throw new Error(`timed out: ${what}; the page says: ${seen}; problems: ${browser.problems.slice(0, 3).join(" || ")}`);
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
async function click(find, wait = 250) {
  const probe = `(() => { const el = (${find}); if (!el) return null; const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const top = document.elementFromPoint(cx, cy); const v = visualViewport; return { hit: !!top && (el === top || el.contains(top) || top.contains(el)), x: (cx - v.offsetLeft) * v.scale, y: (cy - v.offsetTop) * v.scale, cover: top ? top.tagName + '.' + String(top.className).slice(0, 40) : null }; })()`;
  await js("(() => { const a = document.activeElement; if (a && a !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) a.blur(); })()");
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
const norm = "(e => e.textContent.replace(/\\s+/g, ' ').trim())";
const visible = "(e => e.getClientRects().length > 0)";
const layer = () => `(document.querySelector('.ct-sheet') || document)`;
const pressText = (text, tag = "button", wait = 250) =>
  click(`[...${layer()}.querySelectorAll(${JSON.stringify(tag)})].filter(${visible}).find(e => ${norm}(e).includes(${JSON.stringify(text)}))`, wait);
// The workspace remembers its language on the device (ALY-109), and so does onboarding, so the
// language is set once, before the first page, and every page after it reads it.
async function setLanguage() { /* nothing to press: the stored language applies to every page */ }
async function noSideScroll(name) {
  const wide = await js(`(() => { const out = []; const w = innerWidth; if (Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > w) out.push('page ' + document.documentElement.scrollWidth); for (const sel of ['.sh-scroll', '.ct-sheet-body', '.ct-sheet', '.ob-main']) { const el = document.querySelector(sel); if (el && el.scrollWidth > el.clientWidth + 1) out.push(sel + ' ' + el.scrollWidth + '>' + el.clientWidth); } return out.join(', '); })()`);
  check(wide === "", `no sideways scrolling on ${name}${wide ? " (" + wide + ")" : ""}`);
}
async function axe(name, exclude = []) {
  if (!AXE || !existsSync(AXE)) { log("axe skipped: give --axe <path to axe.min.js>"); return; }
  await js(readFileSync(AXE, "utf8"));
  const found = await js(`axe.run(${exclude.length ? JSON.stringify({ exclude: exclude.map((x) => [x]) }) : "document"}, { runOnly: ['wcag2a','wcag2aa','wcag21aa','best-practice'], resultTypes: ['violations'] }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, nodes: v.nodes.slice(0, 8).map(n => ({ target: n.target.join(' '), html: n.html.slice(0, 140), why: (n.any[0] || n.all[0] || n.none[0] || {}).message })) })))`);
  writeFileSync(`${OUT}/${LANG}-axe-${name}.json`, JSON.stringify(found, null, 2));
  check(found.filter((v) => v.impact !== "minor").length === 0, `axe: no violations on ${name} (${found.length} found)`);
  for (const v of found) for (const n of v.nodes.slice(0, 4)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}

// ── a new owner, made through the real onboarding API ────────────────────────────────────
async function post(path, body, cookie = "") {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})), cookie: response.headers.getSetCookie?.().map((c) => c.split(";")[0]).find((c) => c.startsWith("alyr_session=")) ?? "" };
}
async function signUp(kind) {
  const email = `owner-${kind}-${Date.now().toString(36)}@shop.example`;
  const code = (await post("/api/onboarding/code", { email })).data.dev_code;
  const verified = await post("/api/onboarding/verify", { email, code });
  const name = `${kind[0].toUpperCase()}${kind.slice(1)} ${Date.now().toString(36).slice(-4)}`;
  const made = await post("/api/onboarding/business", {
    signup_token: verified.data.signup_token, owner_name: "Hamad", name, name_ar: "الدوحة", type: kind, area: "Al Sadd",
  });
  if (made.status !== 200) throw new Error(`could not create a ${kind}: ${made.status} ${JSON.stringify(made.data)}`);
  const cookie = made.cookie;
  const value = cookie.split("=")[1];
  await send("Network.clearBrowserCookies");
  await send("Network.setCookie", { name: "alyr_session", value, url: BASE });
  return { cookie, name };
}
const apiAs = async (cookie, path, method = "GET", body) => {
  const response = await fetch(`${BASE}${path}`, { method, headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json().catch(() => ({})) };
};
const paint = (text) => (LANG === "ar" ? text.ar : text.en);

// ── the run ──────────────────────────────────────────────────────────────────────────────
try {
  await setup("light");
  await go("/start", 500);
  if (LANG === "ar") await js("localStorage.setItem('alyr-lang', 'ar'); localStorage.setItem('alyr-workspace-lang', 'ar')");

  for (const kind of Object.keys(TYPES).filter((k) => ONLY.includes(k))) {
    const expect = TYPES[kind];
    log(`── ${kind}`);
    const { cookie } = await signUp(kind);
    const mine = (path, method, body) => apiAs(cookie, path, method, body);

    // 1. onboarding: what the shop is getting, in plain words
    const state = (await mine("/api/onboarding/state")).data;
    if (!expect) {
      check(state.catalog === null, "travel: onboarding mentions no catalog");
      await go("/start", 1500);
      check(!(await js("document.body.innerText")).match(/menu|price list|sample|catalog|قائمة|نموذج|تجريبي/i), "travel: the review says nothing about a catalog");
      await shot(`${kind}-start`);
    } else if (!expect.optional) {
      await go("/start", 1800);
      const body = await js("document.body.innerText");
      check(body.includes(s.assisted.catalogTitle), `${kind}: the review step says what the shop is getting`);
      check(body.includes(s.review.title), `${kind}: the review card has its title`);
      check(state.catalog.gets.every((g) => body.includes(g[LANG])), `${kind}: every line of what the shop gets is on the screen`);
      check(body.includes(s.review.samples), `${kind}: the review says the samples are examples`);
      check(!/coming|soon|beta|قريب/i.test(body), `${kind}: the review says nothing is coming`);
      await noSideScroll(`${kind} review`);
      await shot(`${kind}-start`);
      if (kind === "restaurant" || kind === "bakery") await axe(`${kind}-start`);
    } else {
      await mine("/api/onboarding/state", "PATCH", { step: "golive" });
      await go("/start", 1800);
      const body = await js("document.body.innerText");
      check(body.includes(s.golive.catalogSub), `${kind}: the go-live list offers the optional products`);
      check(body.includes(s.golive.catalog(paint({ en: expect.name, ar: expect.ar }))), `${kind}: it is called ${expect.name} and marked optional`);
      await noSideScroll(`${kind} go-live`);
      await shot(`${kind}-golive`);
    }

    // 2. the workspace
    await go("/app", 1800);
    const nav = await js("[...document.querySelectorAll('.sh-tabbar a')].map(a => a.textContent.trim()).join(' | ')");
    if (!expect) {
      check(!/menu|products|price list|catalog|قائمة|منتجات|الكتالوج/i.test(nav.replace(/ALYR products/i, "")), `${kind}: no catalog in the navigation (${nav})`);
      await go("/app/catalog", 1200);
      if (LANG === "ar") { await setLanguage("ar"); await sleep(300); }
      check((await js("document.body.innerText")).includes(paint({ en: "This isn't switched on for your shop.", ar: "هذا غير مفعّل لمتجرك." })), `${kind}: the catalog address opens nothing`);
      await shot(`${kind}-workspace`);
      continue;
    }
    if (LANG === "ar") await setLanguage("ar");
    await sleep(300);
    const tabs = await js("[...document.querySelectorAll('.sh-tabbar a')].map(a => a.textContent.trim()).join(' | ')");
    check(tabs.includes(paint({ en: expect.name, ar: expect.ar })), `${kind}: the navigation says ${paint({ en: expect.name, ar: expect.ar })} (${tabs})`);

    await go("/app/catalog", 1500);
    if (LANG === "ar") await setLanguage("ar");
    await until("!!document.querySelector('.ct-card, .ct-row, .ct-empty')", "the list");
    check((await js("document.querySelector('.sh-main h1')?.innerText")) === paint({ en: expect.name, ar: expect.ar }), `${kind}: the screen's title is ${paint({ en: expect.name, ar: expect.ar })}`);
    const pills = await js("document.querySelectorAll('.ct-card .ct-pill.sample').length");
    check(pills === expect.samples, `${kind}: ${expect.samples} items are marked ${t.sampleTag} (${pills})`);
    const tiles = await js("document.querySelectorAll('.ct-card .ct-sample-art').length");
    check(tiles === expect.samples, `${kind}: each sample has a drawn tile (${tiles})`);
    const priceLabels = await js("[...document.querySelectorAll('.ct-card .ct-price')].map(e => e.innerText).join(' | ')");
    check(priceLabels.split(" | ").every((x) => x.length === 0 || x.includes(t.sampleExamplePrice("").trim())), `${kind}: every price on a sample is called an example`);
    const banner = await js("document.querySelector('.ct-banner.sample')?.innerText ?? ''");
    check(banner.includes(t.samplesBanner(expect.samples)) && banner.includes(t.samplesRemove), `${kind}: the banner says they are samples and offers one step to remove them`);
    const sub = await js("document.querySelector('.sh-main .sh-head p')?.innerText ?? ''");
    check(sub.length > 10, `${kind}: the screen says what it is for (${sub.slice(0, 40)})`);
    check(!/coming|soon|beta|قريب/i.test(await js("document.body.innerText")), `${kind}: the Catalog says nothing is coming`);
    await noSideScroll(`${kind} list`);
    await shot(`${kind}-list`);
    await js("document.querySelector('.sh-scroll').scrollTop = 780");
    await sleep(300);
    await shot(`${kind}-cards`);
    await js("document.querySelector('.sh-scroll').scrollTop = 0");
    if (["restaurant", "bakery", "wholesale", "salon"].includes(kind)) await axe(`${kind}-list`);

    // a dark look and the list view for a couple of types
    if (kind === "bakery" || kind === "wholesale") {
      await setup("dark");
      await sleep(400);
      await shot(`${kind}-list-dark`);
      await axe(`${kind}-list-dark`);
      await setup("light");
    }

    // 3a. a new item starts the way the type of business says
    await pressText(t.add);
    await until("!!document.querySelector('.ct-sheet')", "the add sheet");
    await pressText(t.typeOne, "button", 700);
    await until("!!document.querySelector('.ct-sheet input[name=rule]')", "the item form");
    const started = await js("document.querySelector('.ct-sheet input[name=rule]:checked')?.parentElement.innerText ?? ''");
    check(started.includes(t.rules[expect.rule][0]), `${kind}: a new item starts as “${t.rules[expect.rule][0]}”`);
    for (const part of expect.open) {
      check(await js(`(() => { const s = [...document.querySelectorAll('.ct-sheet summary')].find(x => ${norm}(x).includes(${JSON.stringify(t[part])})); return !!s && s.parentElement.open; })()`), `${kind}: “${t[part]}” starts open on a new item`);
    }
    if (expect.lead) {
      const form = await js("document.querySelector('.ct-sheet').innerText");
      check(form.includes(t.scheduleSet) && (await js("[...document.querySelectorAll('.ct-sheet input')].some(i => i.value === '18:00')")), `${kind}: a new item is ordered a day ahead, before 18:00`);
    }
    await shot(`${kind}-new-item`);
    await click(`document.querySelector('.ct-sheet [aria-label=${JSON.stringify(t.close)}]')`, 400);
    await until("!document.querySelector('.ct-sheet')", "the form closed");

    // 3. a sample's sheet
    await click("document.querySelector('.ct-card .ct-open')", 600);
    await until("!!document.querySelector('.ct-sheet')", "the sample's sheet");
    const sheet = await js("document.querySelector('.ct-sheet').innerText");
    check(sheet.includes(t.sampleSheetTitle) && sheet.includes(t.sampleKeep), `${kind}: the sample's sheet says it is a sample and offers to keep it`);
    check(sheet.includes(t.sampleRemoveOne) && !sheet.includes(t.archive), `${kind}: a sample can be removed, not archived`);
    await shot(`${kind}-sample-sheet`);
    if (kind === "restaurant" || kind === "fashion") await axe(`${kind}-sample-sheet`);
    await click(`document.querySelector('.ct-sheet [aria-label=${JSON.stringify(t.close)}]')`, 400);

    // 4. the settings the type started with
    await click(`[...document.querySelectorAll('button')].filter(${visible}).find(e => ${norm}(e).includes(${JSON.stringify(t.settings)}))`, 600);
    await until("!!document.querySelector('.ct-sheet .ct-type')", "the type's settings");
    await sleep(500);
    const soldOut = await js("document.querySelector('input[name=sold-out-display]:checked')?.parentElement.innerText ?? ''");
    check(soldOut.includes(expect.sold === "hide" ? t.soldOutHide : t.soldOutGrey), `${kind}: sold-out items start ${expect.sold === "hide" ? "left out" : "greyed out"}`);
    await js("document.querySelector('.ct-sheet-body').scrollTop = document.querySelector('.ct-type').offsetTop - 60");
    await sleep(300);
    await shot(`${kind}-settings`);
    if (kind === "grocery" || kind === "spa") await axe(`${kind}-settings`);
    await click(`document.querySelector('.ct-sheet [aria-label=${JSON.stringify(t.close)}]')`, 400);

    // 5. remove every sample in one step
    await until("!!document.querySelector('.ct-banner.sample button') && !document.querySelector('.ct-sheet')", "the banner with its button, the sheet closed");
    await click(`[...document.querySelectorAll('.ct-banner.sample button')].find(e => ${norm}(e).includes(${JSON.stringify(t.samplesRemove)}))`, 900);
    const left = (await mine("/api/items?limit=100")).data;
    check(left.items.length === 0 && left.counts.sample === 0, `${kind}: one tap removed every sample (${left.items.length} left)`);
    check((await js("document.querySelector('.ct-toast')?.innerText ?? ''")).includes(t.samplesRemoved(expect.samples)), `${kind}: it says ${t.samplesRemoved(expect.samples)}`);
    check((await js("!!document.querySelector('.ct-empty')")), `${kind}: the empty list is a designed screen, not a hole`);
    check(left.categories.length > 0, `${kind}: the starting categories stay (${left.categories.length})`);
    await shot(`${kind}-after-remove`);
  }
  check(browser.problems.length === 0, `no console errors or exceptions${browser.problems.length ? ": " + browser.problems.slice(0, 5).join(" || ") : ""}`);
} catch (error) {
  failures.push(String(error.message ?? error));
  log("STOPPED", error.stack ?? error);
} finally {
  await browser.close();
}
if (failures.length) { console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`); process.exit(1); }
log("all checks passed");
