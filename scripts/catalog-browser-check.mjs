// Runs the Catalog's screens in a real browser at phone width, in English or Arabic, light
// or dark, and takes screenshots. No packages: Node 22's built-in WebSocket and fetch, and
// headless Edge or Chrome driven over the DevTools protocol (ALY-104). Node 22.18 or newer
// (it reads the screens' words straight from catalogCopy.ts).
//
//   node scripts/catalog-browser-check.mjs --photos C:/t/catalog/photos --lang en --items 30 \
//        --base http://localhost:3101 --api http://127.0.0.1:8000 --out C:/t/catalog/shots \
//        --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API and web app (docs/status.md, "Live testing from the laptop"; never the
// shared database) whose shop is the open demo shop with the Catalog module switched on and
// no items yet, and a folder of sample photos (dish-01.jpg ... dish-36.jpg, and phone-01.jpg
// ... for big ones: draw them with a script, never download real ones). `--axe` is the path
// to axe-core's axe.min.js; without it the accessibility scan is skipped.
// What it does: adds the photos on a throttled connection, makes a draft for each, drops the
// connection and retries one photo, walks through the drafts filling in names and prices,
// types one item, searches by an Arabic spelling, flips a switch, edits one item (sale,
// sizes, extra, tag, time), counts the shelf with a difference, runs a bulk price change with
// its preview and undoes it, checks the keyboard, looks at the same screens in dark, with a
// small window (an on-screen keyboard), as an agent and on a laptop. It checks the API's own
// numbers after each step and exits with an error if one is wrong.
// It also covers customer price groups and SKU (ALY-127): a SKU on an item and on two sizes,
// a group made, refused when repeated and renamed in the Catalog settings, a price for the
// group on an item and on a size (saved and shown again), a customer put in the group from the
// inbox, the customer's order page showing the group's price, and the order list showing the
// group and the SKU, at phone width in both languages.
//
// With `--only import` it runs the import and export screens instead (ALY-108), on a shop with
// the Catalog on and no items: the downloads, a file with bad rows (previewed, imported, undone),
// a file of 500 items, the export uploaded again, an Excel template uploaded as it is, a zip of
// photos matched by file name, the same screens in dark, as an agent and on a laptop.
// `--photos` is still needed (the zip holds some of those pictures). Sample files are written
// to --out.
//
// Short folders: Edge fails quietly with long paths, so keep --profile and --out short.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { crc32 } from "node:zlib";
import { COPY } from "../apps/web/app/(product)/_workspace/catalogCopy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3101";
const LANG = args.lang === "ar" ? "ar" : "en";
const ITEMS = Number(args.items ?? 30);
if (!args.photos) { console.error("Give --photos <folder of sample photos>. See the top of this file."); process.exit(2); }
const PHOTOS = args.photos;
const OUT = args.out ?? `${tmpdir()}/catalog-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/catalog-profile-${LANG}`;
const PORT = Number(args.port ?? (LANG === "ar" ? 9366 : 9355));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const IMPORT_ONLY = args.only === "import";
const t = COPY[LANG];
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the menu: a fictional kitchen, in both languages ─────────────────────────────────────
const MENU = [
  ["Chicken shawarma", "شاورما دجاج", 12, "Mains"], ["Beef shawarma", "شاورما لحم", 14, "Mains"],
  ["Falafel plate", "طبق فلافل", 9, "Mains"], ["Mixed grill", "مشاوي مشكلة", 38, "Mains"],
  ["Chicken biryani", "برياني دجاج", 24, "Mains"], ["Lamb machboos", "مجبوس لحم", 32, "Mains"],
  ["Fish and rice", "سمك مع أرز", 28, "Mains"], ["Margherita pizza", "بيتزا مارجريتا", 26, "Mains"],
  ["Beef burger", "برجر لحم", 22, "Mains"], ["Club sandwich", "كلوب ساندويتش", 20, "Mains"],
  ["Hummus", "حمص", 10, "Starters"], ["Tabbouleh", "تبولة", 11, "Starters"],
  ["Fattoush", "فتوش", 12, "Starters"], ["Lentil soup", "شوربة عدس", 8, "Starters"],
  ["Grape leaves", "ورق عنب", 13, "Starters"], ["Spring rolls", "سبرينغ رول", 14, "Starters"],
  ["Cheese fatayer", "فطاير جبن", 12, "Starters"], ["Mutabbal", "متبل", 10, "Starters"],
  ["Kunafa", "كنافة", 15, "Desserts"], ["Umm Ali", "أم علي", 14, "Desserts"],
  ["Baklava", "بقلاوة", 16, "Desserts"], ["Chocolate cake", "كيكة شوكولاتة", 18, "Desserts"],
  ["Ice cream", "آيس كريم", 9, "Desserts"], ["Rice pudding", "مهلبية", 8, "Desserts"],
  ["Karak tea", "شاي كرك", 3, "Drinks"], ["Arabic coffee", "قهوة عربية", 6, "Drinks"],
  ["Lemon mint", "ليمون بالنعناع", 12, "Drinks"], ["Orange juice", "عصير برتقال", 10, "Drinks"],
  ["Laban", "لبن", 5, "Drinks"], ["Water", "ماء", 2, "Drinks"],
];

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
  throw new Error(`timed out: ${what}`);
}
async function go(path, wait = 800) {
  const loaded = new Promise((resolve) => browser.on("Page.loadEventFired", resolve));
  await send("Page.navigate", { url: `${BASE}${path}` });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(wait);
  // The framework's own dev badge is not part of the product.
  await js("document.querySelectorAll('nextjs-portal').forEach(n => n.remove())");
}
async function shot(name) {
  await js("document.querySelectorAll('nextjs-portal').forEach(n => n.remove())");
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${LANG}-${name}.png`, Buffer.from(r.data, "base64"));
  log("shot", name);
}
async function click(find, wait = 250) {
  // Press the centre of the element like a thumb would, but only once it has stopped moving
  // and is really what is under that point (not clipped by the sheet or hidden by another
  // layer). Mouse events are placed on the visual viewport, element boxes are in layout space.
  const probe = `(() => { const el = (${find}); if (!el) return null; const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const top = document.elementFromPoint(cx, cy); const v = visualViewport; return { hit: !!top && (el === top || el.contains(top) || top.contains(el)), x: (cx - v.offsetLeft) * v.scale, y: (cy - v.offsetTop) * v.scale, cover: top ? top.tagName + '.' + String(top.className).slice(0, 40) : null }; })()`;
  // A thumb on a button takes focus away from the field being typed in; a phone's browser
  // keeps scrolling the focused field into view until it does, so leave it first.
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
const pressExact = (text, tag = "button", wait = 250) =>
  click(`[...${layer()}.querySelectorAll(${JSON.stringify(tag)})].filter(${visible}).find(e => ${norm}(e) === ${JSON.stringify(text)})`, wait);
async function fill(label, value, nth = 0) {
  const ok = await js(`(() => { const ls = [...${layer()}.querySelectorAll('label')].filter(l => ${norm}(l) === ${JSON.stringify(label)}); const l = ls[${nth}]; const el = l && document.getElementById(l.htmlFor); if (!el) return false; el.scrollIntoView({block:'center'}); el.focus(); return true; })()`);
  if (!ok) {
    const have = await js(`[...${layer()}.querySelectorAll('label')].filter(${visible}).map(${norm}).filter(x => x.length < 40).slice(-16).join(' | ')`);
    throw new Error(`no field labelled “${label}”; the labels on screen are: ${have}`);
  }
  await clearFocused();
  if (value) await send("Input.insertText", { text: String(value) });
  await sleep(50);
}
/** Empties the focused field the way React sees it (its own setter, then an input event). */
async function clearFocused() {
  await js(`(() => { const el = document.activeElement; const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}
async function files(selector, list) {
  const { root } = await send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector });
  if (!nodeId) throw new Error(`no input ${selector}`);
  await send("DOM.setFileInputFiles", { files: list, nodeId });
}
// The API is asked directly (not through the page), so a check still works while the page's
// network is switched off. The dev shop is the open demo, so no sign-in is needed.
const API = args.api ?? "http://127.0.0.1:8000";
const api = async (path) => (await fetch(`${API}${path}`, { cache: "no-store" })).json();
const items = async (query = "") => (await api(`/api/items?limit=500${query}`)).items;
const sheetText = () => js("(document.querySelector('.ct-sheet')?.innerText ?? '')");
const toast = () => js("[...document.querySelectorAll('.ct-toast')].map(e => e.innerText.replace(/\\s+/g,' ')).join(' | ')");
const scrollSheet = (to) => js(`(() => { const b = document.querySelector('.ct-sheet-body'); if (b) b.scrollTop = ${to === "end" ? "b.scrollHeight" : to}; })()`);
async function openFold(title) {
  const summary = `[...document.querySelectorAll('.ct-sheet summary')].find(s => ${norm}(s).includes(${JSON.stringify(title)}))`;
  await click(summary, 200);
  check(await js(`${summary}.parentElement.open`), `the “${title}” part opens`);
}
async function setLanguage(to) {
  if (to === LANG && LANG === "en") return;
  // On a laptop the language button is in the sidebar; on a phone it is in the palette.
  if (await js("innerWidth >= 900")) { await click("document.querySelector('.sh-lang')", 500); return; }
  const shell = { en: "Search or jump to", ar: "ابحث أو انتقل إلى" };
  await click(`document.querySelector('.sh-mtop [aria-label=${JSON.stringify(shell.en)}], .sh-mtop [aria-label=${JSON.stringify(shell.ar)}]')`, 300);
  await click(`[...document.querySelectorAll('.sh-palette button[role=option]')].find(b => /Switch to Arabic|التبديل إلى الإنجليزية/.test(b.textContent))`, 500);
}
/** Nothing on the page, or in the sheet, scrolls sideways (the phone-width rule). */
async function noSideScroll(name) {
  const wide = await js(`(() => { const out = []; const w = innerWidth; if (Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > w) out.push('page ' + document.documentElement.scrollWidth); for (const sel of ['.sh-scroll', '.ct-sheet-body', '.ct-sheet']) { const el = document.querySelector(sel); if (el && el.scrollWidth > el.clientWidth + 1) out.push(sel + ' ' + el.scrollWidth + '>' + el.clientWidth); } return out.join(', '); })()`);
  check(wide === "", `no sideways scrolling on ${name}${wide ? " (" + wide + ")" : ""}`);
}
async function axe(name, exclude = [], within = "") {
  if (!AXE || !existsSync(AXE)) { log("axe skipped: give --axe <path to axe.min.js>"); return; }
  await js(readFileSync(AXE, "utf8"));
  const found = await js(`axe.run(${within ? JSON.stringify(within) : exclude.length ? JSON.stringify({ exclude: exclude.map((x) => [x]) }) : 'document'}, { runOnly: ['wcag2a','wcag2aa','wcag21aa','best-practice'], resultTypes: ['violations'] }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, nodes: v.nodes.slice(0, 8).map(n => ({ target: n.target.join(' '), html: n.html.slice(0, 140), why: (n.any[0] || n.all[0] || n.none[0] || {}).message })) })))`);
  writeFileSync(`${OUT}/${LANG}-axe-${name}.json`, JSON.stringify(found, null, 2));
  check(found.filter((v) => v.impact !== "minor").length === 0, `axe: no violations on ${name} (${found.length} found)`);
  for (const v of found) for (const n of v.nodes.slice(0, 4)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}

// ── the import and export screens (ALY-108) ─────────────────────────────────────────────

/** A zip with the files stored as they are (no packing), enough for pictures to travel in. */
function zipStored(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, data);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8); head.writeUInt16LE(0x21, 14); head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(data.length, 20); head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(nameBuf.length, 28); head.writeUInt32LE(offset, 42);
    central.push(head, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

const COLUMNS_EN = ["Name (English)", "Name (Arabic)", "Category", "Price (QAR)", "In stock", "Photos"];
const COLUMNS_AR = ["الاسم بالإنجليزية", "الاسم بالعربية", "الفئة", "السعر (ر.ق)", "المخزون", "الصور"];
const csvLine = (cells) => cells.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(",");
function writeCsv(name, rows) {
  const header = LANG === "ar" ? COLUMNS_AR : COLUMNS_EN;
  const path = `${OUT}/${name}`;
  // The byte-order mark is what Excel writes in front of a UTF-8 CSV.
  writeFileSync(path, String.fromCharCode(0xfeff) + [header, ...rows].map(csvLine).join("\r\n") + "\r\n", "utf8");
  return path;
}

async function importChecks() {
  const i = t.imp;
  const sheetPath = writeCsv("messy.csv", [
    ["Chicken shawarma", "شاورما دجاج", "Wraps", "12", ""],
    ["Beef shawarma", "شاورما لحم", "Wraps", "14.50", "10"],
    ["Hummus", "حمص", "Starters", "abc", ""],
    ["", "", "Wraps", "5", ""],
    ["Fattoush", "فتوش", "Starters", "١٢٫٥٠", "3"],
    ["Juice", "عصير", "Drinks", "1.250", ""],
    ["Soup", "", "Starters", "8", ""],
  ]);
  const big = [];
  for (let n = 1; n <= 500; n++) big.push([`Item ${String(n).padStart(4, "0")}`, `صنف ${n}`, `Category ${n % 20}`, String(5 + (n % 90)), n % 3 === 0 ? String(n % 40) : "", ""]);
  const bigPath = writeCsv("items-500.csv", big);
  const zipSheet = writeCsv("with-photos.csv", [
    ["Pita bread", "خبز", "Bakery", "2", "", "pita.jpg, pita-2.jpg"], ["Tea", "شاي", "Drinks", "3", "", ""],
    ["Cake", "كيك", "Sweets", "20", "", "cake.jpg"], ["Pie", "فطيرة", "Sweets", "18", "", "pie.jpg"],
  ]);
  const pics = readdirSync(PHOTOS).filter((f) => /^dish-\d+\.jpg$/.test(f)).sort();
  if (pics.length < 4) throw new Error(`need at least 4 dish-NN.jpg photos in ${PHOTOS}`);
  const read = (f) => readFileSync(`${PHOTOS}/${f}`);
  const zipPath = `${OUT}/photos.zip`;
  writeFileSync(zipPath, zipStored([
    ["pita.jpg", read(pics[0])], ["pita-2.jpg", read(pics[1])], ["Tea.jpg", read(pics[2])], ["cake.jpg", read(pics[3])],
    ["unused.jpg", read(pics[0])], ["notes.txt", Buffer.from("not a photo")],
  ]));
  const previewCounts = () => js("[...document.querySelectorAll('.ct-sheet .ct-imp-counts li')].map(li => li.querySelector('b').textContent.trim()).join(',')");
  const closeSheet = async () => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await until("!document.querySelector('.ct-sheet')", "the sheet closing", 8000);
  };
  const openImport = async () => {
    await click(`[...document.querySelectorAll('.ct-actions button')].find(b => b.textContent.includes(${JSON.stringify(i.open)}))`, 600);
    await until("!!document.querySelector('.ct-sheet')", "the import sheet");
    await sleep(500);
  };
  const choose = async (path) => {
    await files(".ct-sheet input.ct-file", [path]);
    await until("!!document.querySelector('.ct-sheet .ct-imp-counts')", "the preview", 60000);
    await sleep(400);
  };
  const imported = async () => {
    await until("!!document.querySelector('.ct-sheet .ct-finish')", "the import done", 120000);
    await sleep(500);
  };

  await setup("light");
  await go("/app/catalog", 1500);
  await setLanguage(LANG);
  await sleep(500);
  check((await items()).length === 0, "the shop starts with no items");
  check(await js(`[...document.querySelectorAll('.ct-actions button')].some(b => b.textContent.includes(${JSON.stringify(i.open)}))`), "Import / Export is offered even when the shop has no items");
  await shot("60-catalog-empty");

  // 1. the sheet, and the downloads (each link is fetched, as a tap would)
  await openImport();
  await shot("61-import-home");
  await noSideScroll("the import sheet");
  const links = await js(`[...document.querySelectorAll('.ct-sheet a[download]')].map(a => a.getAttribute('href'))`);
  check(links.length === 4, "four download links: the export and the template, each as Excel and as CSV");
  for (const href of links) {
    const got = await js(`fetch(${JSON.stringify(href)}).then(async r => ({ status: r.status, type: r.headers.get('content-type'), disp: r.headers.get('content-disposition'), size: (await r.arrayBuffer()).byteLength }))`);
    check(got.status === 200 && got.size > 200 && /attachment/.test(got.disp ?? ""), `${href.split("?")[0]} downloads (${got.type}, ${got.size} bytes)`);
  }
  check(await js("document.querySelector('.ct-sheet select')?.options.length === 8"), "the template chooser lists the eight kinds of business");
  await closeSheet();

  // 2. a file with bad rows: previewed row by row, then imported without them
  await openImport();
  await choose(sheetPath);
  check((await previewCounts()) === "4,0,0,3", "the preview says 4 will be added and 3 are left out");
  const text = await sheetText();
  check([4, 5, 7].every((n) => text.includes(i.row(n))), "the rows left out are named by their row number in the file");
  check((await items()).length === 0, "looking at the preview saved nothing");
  await shot("62-import-preview");
  await noSideScroll("the import preview");
  await axe("import-preview");
  await scrollSheet("end"); await sleep(200);
  await shot("63-import-preview-bottom");
  await scrollSheet(0);
  await pressText(i.apply(4), "button", 400);
  await imported();
  const first = await items();
  check(first.length === 4 && first.some((x) => x.name === "Fattoush" && x.price === 1250), "the four good rows were added, with the Arabic-digit price read correctly");
  check(first.find((x) => x.name === "Soup")?.status === "draft", "the item without an Arabic name is a draft");
  const movements = await api(`/api/items/${first.find((x) => x.name === "Beef shawarma").id}/stock-log`);
  check(movements.log[0].kind === "opening" && movements.log[0].reason === "Import" && movements.log[0].balance_after === 10, "its stock is in the stock log as an opening count with the reason Import");
  await shot("64-import-done");
  await noSideScroll("the import result");
  await axe("import-done");
  await pressText(i.undo, "button", 1200);
  await until("!!document.querySelector('.ct-sheet .ct-diff')", "the undo", 20000);
  check((await items()).length === 0, "undo took the whole import back");
  check((await api("/api/items/import/last")).last === null, "and there is nothing left to undo");
  await shot("65-import-undone");
  await closeSheet();

  // 3. 500 items from a phone
  await openImport();
  const started = Date.now();
  await choose(bigPath);
  log("preview of 500 items ready in", Date.now() - started, "ms");
  check((await previewCounts()).startsWith("500,0,0,0"), "the preview of 500 items says 500 will be added and none are left out");
  await shot("66-import-500-preview");
  await pressText(i.apply(500), "button", 400);
  await imported();
  log("500 items imported in", Date.now() - started, "ms");
  check((await items()).length === 500, "500 items are in the catalog");
  await shot("67-import-500-done");
  await closeSheet();
  await until("document.querySelectorAll('.ct-card').length > 0", "the grid");
  await shot("68-grid-after-500");

  // 4. the export of those 500, as an Excel file, uploads again as no change
  const exported = await js(`fetch('/api/items/export?lang=${LANG}&format=xlsx').then(r => r.arrayBuffer()).then(b => Array.from(new Uint8Array(b)))`);
  const exportPath = `${OUT}/export.xlsx`;
  writeFileSync(exportPath, Buffer.from(exported));
  await openImport();
  await choose(exportPath);
  check((await previewCounts()) === "0,0,500,0", "the export of 500 items uploads again as 500 with no change");
  check(await js("document.querySelector('.ct-sheet-foot .btn.volt')?.disabled === true"), "so there is nothing to import and the button is off");
  await shot("69-import-export-roundtrip");
  await pressText(i.discard, "button", 500);
  await closeSheet();
  await js("fetch('/api/items/import/undo', {method:'POST'})");
  check((await items()).length === 0, "undo removed the 500 items");

  // 5. an Excel template, uploaded as it is, shows its examples as examples
  const template = await js(`fetch('/api/items/import/template?kind=restaurant&lang=${LANG}&format=xlsx').then(r => r.arrayBuffer()).then(b => Array.from(new Uint8Array(b)))`);
  const templatePath = `${OUT}/template.xlsx`;
  writeFileSync(templatePath, Buffer.from(template));
  await go("/app/catalog", 1200);
  await setLanguage(LANG);
  await openImport();
  await choose(templatePath);
  check((await previewCounts()) === "3,0,0,0", "the Excel template uploads as three items, none wrong");
  check(await js(`[...document.querySelectorAll('.ct-sheet details')].some(d => d.textContent.includes(${JSON.stringify(i.lookTitle(3))}))`), "the three examples are pointed out as examples");
  await shot("70-import-template-xlsx");
  await pressText(i.discard, "button", 500);

  // 6. a zip of photos matched by file name
  await choose(zipSheet);
  await files(".ct-sheet input.ct-file[accept*=zip]", [zipPath]);
  await until(`document.querySelector('.ct-sheet')?.innerText.includes(${JSON.stringify(i.zipMatched(4, 6))})`, "the zip matched", 30000);
  await shot("71-import-zip-matched");
  const withZip = await sheetText();
  check(withZip.includes(i.zipUnused(1)) && withZip.includes(i.zipUnusable(1)), "the zip's unused and unusable files are counted");
  await scrollSheet("end"); await sleep(200);
  await shot("72-import-zip-bottom");
  await scrollSheet(0);
  await pressText(i.apply(4), "button", 400);
  await imported();
  await until(`document.querySelector('.ct-sheet')?.innerText.includes(${JSON.stringify(i.photosDone(4))})`, "the photos added", 60000);
  const withPhotos = await items();
  check(withPhotos.find((x) => x.name === "Pita bread")?.photos.length === 2 && withPhotos.find((x) => x.name === "Tea")?.photos.length === 1, "photos were matched by file name (two on the first item, one on the item of the same name)");
  check(withPhotos.find((x) => x.name === "Pie")?.photos.length === 0 && withPhotos.find((x) => x.name === "Cake")?.cover.state === "ready", "an item whose photo is not in the zip has none, and the others are ready");
  await shot("73-import-photos-done");
  await pressText(i.undo, "button", 1000);
  await until("!!document.querySelector('.ct-sheet .ct-diff')", "the undo of the photo import", 20000);
  check((await items()).length === 0, "undo took the items and their photos off");
  await closeSheet();

  // 7. dark
  await setup("dark");
  await go("/app/catalog", 1200);
  await setLanguage(LANG);
  await openImport();
  await shot("80-dark-import-home");
  await axe("import-home-dark");
  await choose(sheetPath);
  await shot("81-dark-import-preview");
  await axe("import-preview-dark");
  await pressText(i.discard, "button", 500);
  await closeSheet();
  await setup("light");

  // 8. an agent downloads but does not upload
  const agentEmail = "yusuf@alnoor.example";
  const signedIn = await js(`fetch('/api/auth/code', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email: ${JSON.stringify(agentEmail)}})}).then(r => r.json()).then(d => fetch('/api/auth/verify', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email: ${JSON.stringify(agentEmail)}, code: d.dev_code})})).then(r => r.json()).then(m => m.role)`);
  check(signedIn === "agent", "signed in as an agent");
  await go("/app/catalog", 1500);
  await setLanguage(LANG);
  await openImport();
  check(await js("document.querySelectorAll('.ct-sheet a[download]').length === 4"), "an agent can still download the export and the templates");
  check(await js("document.querySelectorAll('.ct-sheet input.ct-file').length === 0") && (await sheetText()).includes(i.readOnly), "but is not offered an upload, and is told why");
  await shot("82-agent-import");
  const refused = await js(`fetch('/api/items/import', {method:'POST', headers:{'content-type':'application/octet-stream'}, body: 'Name'}).then(r => r.status)`);
  check(refused === 403, "and the API refuses an upload from an agent anyway");
  await closeSheet();
  await js("fetch('/api/auth/logout', {method:'POST'})");

  // 9. a laptop
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await go("/app/catalog", 1500);
  await setLanguage(LANG);
  // The 500 items from a laptop, too: preview, import, then undo.
  await openImport();
  await choose(bigPath);
  check((await previewCounts()).startsWith("500,0,0,0"), "on a laptop the preview of 500 items says 500 will be added");
  await pressText(i.apply(500), "button", 400);
  await imported();
  check((await items()).length === 500, "on a laptop 500 items are in the catalog");
  await shot("89-laptop-import-500-done");
  await pressText(i.undo, "button", 1200);
  await until("!!document.querySelector('.ct-sheet .ct-diff')", "the laptop undo", 30000);
  check((await items()).length === 0, "on a laptop undo took them all back");
  await closeSheet();
  await openImport();
  await choose(sheetPath);
  await shot("90-laptop-import-preview");
  await axe("import-laptop", [".sh-side", ".sh-top"]);
  await pressText(i.discard, "button", 500);
  check(browser.problems.length === 0, `no errors in the browser's console (${browser.problems.length})`);
  for (const p of browser.problems.slice(0, 8)) log("   ", p);
}

// ── the run ──────────────────────────────────────────────────────────────────────────────
try {
  if (IMPORT_ONLY) {
    await importChecks();
    throw new Error("__done__");
  }
  const photos = readdirSync(PHOTOS).filter((f) => /\.jpe?g$/i.test(f)).sort();
  const dishes = photos.filter((f) => f.startsWith("dish-")), phone = photos.filter((f) => f.startsWith("phone-"));
  const chosen = [...phone.slice(0, 3), ...dishes.slice(0, Math.max(0, ITEMS - 3))].slice(0, ITEMS).map((f) => `${PHOTOS}/${f}`);
  if (chosen.length < ITEMS) throw new Error(`need ${ITEMS} sample photos in ${PHOTOS}, found ${chosen.length}`);

  await setup("light");
  await go("/app/catalog", 1500);
  await setLanguage(LANG);
  await sleep(500);
  check((await items()).length === 0, "the shop starts with no items");
  await shot("01-empty");

  // 1. add many photos at once; each is shrunk, sent, and made a draft
  await pressText(t.add);
  await until("!!document.querySelector('.ct-sheet')", "the add sheet");
  await shot("02-add-sheet");
  await send("Network.emulateNetworkConditions", { offline: false, latency: 120, downloadThroughput: 600 * 1024, uploadThroughput: 350 * 1024 });
  await files(".ct-sheet input.ct-file:not([capture])", chosen);
  await until("document.querySelectorAll('.ct-up').length > 0", "the first tiles");
  await sleep(2500);
  await shot("03-uploading");
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await until(`document.querySelectorAll('.ct-up.done').length === ${chosen.length}`, "every photo saved", 240000);
  await sleep(500);
  await shot("04-uploaded");
  check((await items("&filter=draft")).length === chosen.length, `${chosen.length} drafts made from ${chosen.length} photos`);
  const first = (await items())[0];
  check(first.photos.length === 1 && first.cover.state === "ready", "each draft has its photo as the cover, ready");

  // 2. the walk-through: a name, a price and a category for each
  await pressText(t.fillInNow(chosen.length));
  await until("!!document.querySelector('#ct-walk-form')", "the first draft");
  await sleep(700);
  await shot("05-walk-empty");
  for (let i = 0; i < chosen.length; i++) {
    const [en, ar, price, category] = MENU[i];
    await fill(t.nameEn, en); await fill(t.nameAr, ar); await fill(t.walkPrice, String(price)); await fill(t.category, category);
    if (i === 0) { await shot("06-walk-filled"); }
    await pressText(i === chosen.length - 1 ? t.walkLast : t.walkSave, "button", 150);
    if (i < chosen.length - 1) await until(`document.querySelector('.ct-sheet-title h2')?.textContent.includes(${JSON.stringify(t.walkTitle(i + 2, chosen.length))}) && document.querySelector('#ct-walk-form input')?.value === ''`, `draft ${i + 2}`, 15000);
  }
  await until("!!document.querySelector('.ct-finish')", "the end of the walk");
  await shot("07-walk-done");
  const made = await items();
  check(made.length === chosen.length && made.every((i) => i.status === "live" && i.price > 0 && i.name_ar), `${chosen.length} items on sale with Arabic names and prices`);
  await pressText(t.walkClose);
  await until(`document.querySelectorAll('.ct-card').length >= ${Math.min(chosen.length, 30)}`, "the grid");
  await sleep(600);
  await shot("08-grid");
  await noSideScroll("the grid");

  // 3. the list, search by an Arabic spelling, filters
  await click("document.querySelector('.ct-seg button[aria-pressed=false]')");
  await sleep(300);
  await shot("09-list");
  await noSideScroll("the list");
  await click("document.querySelector('.ct-seg button[aria-pressed=false]')");
  // The stored word ends in the round ta («كنافة», «مشكلة»); people type it with ha as well.
  const spelled = MENU.findIndex((m) => m[0] === "Kunafa") < chosen.length ? "كنافه" : "مشكله";
  await click("document.querySelector('.ct-search input')");
  await send("Input.insertText", { text: spelled });
  await until("document.querySelectorAll('.ct-card').length === 1", "one result for the variant spelling");
  await shot("10-search-arabic-spelling");
  check((await items(`&q=${encodeURIComponent(spelled)}`)).length === 1, "an Arabic spelling variant finds the item");
  await js("document.querySelector('.ct-search input').focus()");
  await clearFocused();
  await until(`document.querySelectorAll('.ct-card').length >= ${Math.min(chosen.length, 30)}`, "everything again");

  // 3b. a weak connection: two more photos while the network drops, retry one, skip the other
  const extras = [`${PHOTOS}/dish-35.jpg`, `${PHOTOS}/dish-36.jpg`];
  if (extras.every(existsSync)) {
    await pressText(t.add);
    await until("!!document.querySelector('.ct-sheet')", "the add sheet again");
    await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await files(".ct-sheet input.ct-file:not([capture])", extras);
    await until("document.querySelectorAll('.ct-up.failed').length === 2", "both photos failing while offline", 60000);
    await shot("10b-offline-failed");
    await noSideScroll("the add sheet with failed photos");
    check((await js("document.querySelector('.ct-up.failed')?.innerText ?? ''")).includes(t.noConnection), "a failed photo says there is no connection");
    check((await items()).length === chosen.length, "nothing was half-saved while offline");
    await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await pressText(t.retryPhoto);
    await until("document.querySelectorAll('.ct-up.done').length === 1", "the retried photo saved", 40000);
    await pressText(t.skipPhoto);
    await shot("10c-retried");
    check((await items("&filter=draft")).length === 1, "retrying one photo made one draft, skipping the other made none");
    await pressText(t.fillInNow(1));
    await until("!!document.querySelector('#ct-walk-form')", "the extra draft");
    await fill(t.nameEn, "Mint tea"); await fill(t.nameAr, "شاي بالنعناع"); await fill(t.walkPrice, "4"); await fill(t.category, "Drinks");
    await pressText(t.walkLast, "button", 600);
    await pressText(t.walkClose);
    await sleep(500);
  }
  // an item added by typing, with no photo
  await pressText(t.add);
  await until("!!document.querySelector('.ct-sheet')", "the add sheet to type one item");
  await pressText(t.typeOne);
  await until("!!document.querySelector('.ct-sheet input[list=ct-categories]')", "the blank item form");
  await sleep(400);
  await shot("10d-new-item-blank");
  await fill(t.nameEn, "Date cake"); await fill(t.nameAr, "كيكة تمر"); await fill(t.price, "17"); await fill(t.category, "Desserts");
  await pressText(t.save, "button", 800);
  await until("!document.querySelector('.ct-sheet')", "the typed item saved");
  const typed = (await items()).find((i) => i.name === "Date cake");
  check(typed && typed.status === "live" && typed.cover.state === "missing", "an item added by typing has a placeholder tile, never a broken image");
  await sleep(400);
  await shot("10e-typed-item");

  // 4. a switch, with its undo toast
  const target = MENU[0];
  await click(`document.querySelector('.ct-card .sh-switch')`, 500);
  await shot("11-switch-toast");
  check((await items()).some((i) => i.available === false), "the quick switch marks an item sold out");
  await click(`document.querySelector('.ct-toast .btn')`, 600);
  check((await items()).every((i) => i.available), "its undo puts it back");

  // 5. edit one item: a sale, a size, an extra, a tag and opening hours
  await click(`[...document.querySelectorAll('.ct-card .ct-open')].find(b => b.textContent.includes(${JSON.stringify(LANG === "ar" ? target[1] : target[0])}))`, 600);
  await until("!!document.querySelector('.ct-sheet')", "the edit sheet");
  await sleep(500);
  await shot("12-edit-top");
  await noSideScroll("the edit sheet");
  // keyboard: Tab stays inside the sheet, Escape closes it and gives focus back
  check(await js("document.querySelector('.ct-sheet').contains(document.activeElement)"), "focus starts inside the sheet");
  for (let i = 0; i < 60; i++) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  }
  check(await js("document.querySelector('.ct-sheet').contains(document.activeElement)"), "Tab never leaves the sheet");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await until("!document.querySelector('.ct-sheet')", "Escape closing the sheet");
  check(await js("document.activeElement?.classList.contains('ct-open') === true"), "focus goes back to the card that opened it");
  await click(`[...document.querySelectorAll('.ct-card .ct-open')].find(b => b.textContent.includes(${JSON.stringify(LANG === "ar" ? target[1] : target[0])}))`, 600);
  await until("!!document.querySelector('.ct-sheet')", "the edit sheet again");
  await fill(t.salePrice, "10.5");
  await fill(t.skuLabel, "KB-100");
  await openFold(t.variantsTitle);
  await pressText(t.addVariant);
  await fill(t.variantName, "Small"); await fill(t.variantNameAr, "صغير"); await fill(t.variantSku, "KB-100-S");
  await pressText(t.addVariant);
  await fill(t.variantName, "Large", 1); await fill(t.variantNameAr, "كبير", 1); await fill(t.variantExtra, "4", 1);
  await fill(t.variantSku, "KB-100-L", 1);
  await openFold(t.optionsTitle);
  await pressText(t.addGroup);
  await fill(t.groupName, "Extras"); await fill(t.groupNameAr, "إضافات");
  await fill(t.optionName, "Extra cheese"); await fill(t.optionNameAr, "جبن إضافي"); await fill(t.optionExtra, "2");
  await openFold(t.scheduleTitle);
  await pressExact(t.scheduleSet, "label");
  check(await js("!!document.querySelector('.ct-sheet .ct-days')"), "choosing set times shows the days");
  await openFold(t.tagsTitle);
  await pressText(t.tagIdeas[0]);
  check(await js("document.querySelectorAll('.ct-sheet .ct-tags li').length === 1"), "a tag idea was added");
  await scrollSheet(1200); await sleep(200);
  await shot("13-edit-middle");
  await scrollSheet("end"); await sleep(200);
  await shot("14-edit-bottom");
  await pressText(t.save, "button", 800);
  await until("!document.querySelector('.ct-sheet')", "the sheet closing after a save", 15000);
  const edited = (await items()).find((i) => i.name === target[0]);
  check(edited.sale_price === 1050 && edited.variants.filter((v) => !v.is_default).length === 2 && edited.option_groups.length === 1 && edited.tags.length === 1 && edited.schedule.length === 1, "the edit saved the sale, two sizes, an extra, a tag and a time");
  check(edited.sku === "KB-100" && edited.variants.map((v) => v.sku).sort().join() === "KB-100-L,KB-100-S", "the edit saved the item's SKU and its sizes' SKUs");
  await sleep(300);
  await shot("15-after-save");

  // 5b. the SKU is on the card and finds the item, also by a size's code
  check(await js(`[...document.querySelectorAll('.ct-card .ct-sku')].some(e => e.textContent.trim() === 'KB-100')`), "the SKU is shown on the item's card");
  await click("document.querySelector('.ct-search input')");
  await send("Input.insertText", { text: "kb-100-l" });
  await until("document.querySelectorAll('.ct-card').length === 1", "one result for a size's SKU");
  check((await items("&q=kb-100-l")).length === 1, "a size's SKU finds its item");
  await js("document.querySelector('.ct-search input').focus()");
  await clearFocused();
  await until(`document.querySelectorAll('.ct-card').length >= ${Math.min(chosen.length, 30)}`, "everything again");

  // 5c. customer price groups in the Catalog settings: add, refuse a repeat, rename the default
  const groups = async () => (await api("/api/price-groups")).groups;
  const groupName = (g) => (LANG === "ar" ? g.name_ar : g.name);
  await pressText(t.settings);
  await until("!!document.querySelector('.ct-sheet')", "the settings sheet");
  await until(`document.querySelector('.ct-sheet').innerText.includes(${JSON.stringify(t.pgDefault)})`, "the default group in the settings");
  await scrollSheet("end"); await sleep(250);
  await shot("15b-settings-groups");
  await noSideScroll("the settings sheet");
  await axe("settings-groups");
  check((await sheetText()).toLowerCase().includes(t.pgTitle.toLowerCase()) && (await groups()).length === 1, "the settings list the default group, and only it");
  await pressText(t.pgAdd);
  await fill(t.pgNameEn, "Wholesale"); await fill(t.pgNameAr, "الجملة");
  await shot("15c-group-form");
  await noSideScroll("the group form");
  await pressExact(t.pgSave, "button", 900);
  await until(`document.querySelector('.ct-sheet').innerText.includes(${JSON.stringify(LANG === "ar" ? "الجملة" : "Wholesale")})`, "the new group in the list");
  await until("!document.querySelector('.ct-toast')", "the message to go", 15000);
  const afterAdd = await groups();
  check(afterAdd.map((g) => g.name).join() === "Retail,Wholesale" && afterAdd[1].name_ar === "الجملة", "the group was added with both names");
  await pressText(t.pgAdd);
  await fill(t.pgNameEn, "wholesale"); await fill(t.pgNameAr, "x");
  await pressExact(t.pgSave, "button", 700);
  check((await sheetText()).includes(t.errors.price_group_name_taken), "a repeated group name is refused in words");
  check((await groups()).length === 2, "and no second group was made");
  await shot("15d-group-refused");
  await pressText(t.cancel);
  check(await js(`[...document.querySelectorAll('.ct-sheet li.ct-card-form button')].filter(b => ${norm}(b) === ${JSON.stringify(t.pgRemove)}).length === 1`), "only the added group can be removed, not the default");
  await pressText(t.pgRename);
  await fill(t.pgNameEn, "Walk-in"); await fill(t.pgNameAr, "الزبائن");
  await pressExact(t.pgSave, "button", 900);
  await until(`document.querySelector('.ct-sheet').innerText.includes(${JSON.stringify(LANG === "ar" ? "الزبائن" : "Walk-in")})`, "the renamed default group");
  await until("!document.querySelector('.ct-toast')", "the message to go", 15000);
  const renamed = (await groups()).find((g) => g.is_default);
  check(renamed.name === "Walk-in" && renamed.name_ar === "الزبائن", "the default group was renamed");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await until("!document.querySelector('.ct-sheet')", "Escape closing the settings");

  // 5d. a price for the group on the item and on one size, saved and shown again
  await click(`[...document.querySelectorAll('.ct-card .ct-open')].find(b => b.textContent.includes(${JSON.stringify(LANG === "ar" ? target[1] : target[0])}))`, 600);
  await until("!!document.querySelector('.ct-sheet')", "the edit sheet for the group prices");
  await sleep(400);
  await openFold(t.groupPricesTitle);
  await fill(t.groupItemPrice, "9");
  await fill(t.groupSizePrice(LANG === "ar" ? "كبير" : "Large"), "13");
  await scrollSheet(await js("document.querySelector('.ct-sheet details.ct-fold[open] summary')?.getBoundingClientRect().top + document.querySelector('.ct-sheet-body').scrollTop - 80 || 0")); await sleep(250);
  await shot("15e-group-prices");
  await noSideScroll("the prices by group");
  await axe("group-prices");
  await pressText(t.save, "button", 800);
  await until("!document.querySelector('.ct-sheet')", "the group prices saved", 15000);
  const priced = (await items()).find((i) => i.name === target[0]);
  const groupId = (await groups()).find((g) => !g.is_default).id;
  check(priced.group_prices.length === 2
    && priced.group_prices.some((p) => p.group_id === groupId && p.variant_id === null && p.price === 900)
    && priced.group_prices.some((p) => p.variant_id === priced.variants.find((v) => v.name === "Large").id && p.price === 1300),
  "the group's price for the item (QAR 9) and for the Large size (QAR 13) were saved");
  check(priced.price === 1200 && priced.sale_price === 1050, "the normal price and the sale were not touched");
  await click(`[...document.querySelectorAll('.ct-card .ct-open')].find(b => b.textContent.includes(${JSON.stringify(LANG === "ar" ? target[1] : target[0])}))`, 600);
  await until("!!document.querySelector('.ct-sheet')", "the edit sheet again");
  await sleep(400);
  const shown = await js(`(() => { const out = {}; for (const [k, label] of [['item', ${JSON.stringify(t.groupItemPrice)}], ['large', ${JSON.stringify(t.groupSizePrice(LANG === "ar" ? "كبير" : "Large"))}]]) { const l = [...document.querySelectorAll('.ct-sheet label')].find(x => ${norm}(x) === label); out[k] = l ? document.getElementById(l.htmlFor).value : null; } return out; })()`);
  check(shown.item === "9" && shown.large === "13", "reopened, the sheet shows the group's prices");
  await openFold(t.historyTitle);
  await until(`document.querySelector('.ct-sheet').innerText.includes(${JSON.stringify(t.historyGroups)})`, "the group prices in the history", 10000);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await until("!document.querySelector('.ct-sheet')", "Escape closing the sheet");

  // 5e. a customer in the group, from the inbox; the customer's own order page; the order list
  const customers = (await api("/api/ledger/summary")).customers.filter((c) => c.phone);
  const [wholesale, retail] = [customers.find((c) => c.phone === "97455500001"), customers.find((c) => c.phone === "97455500002")];
  for (const who of [wholesale, retail]) {
    await fetch(`${API}/sim/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from_number: who.phone, text: "hello" }) });
  }
  await go("/app/inbox", 1500);
  await setLanguage(LANG);
  await sleep(500);
  await click(`[...document.querySelectorAll('.inbox-list button, .conv')].find(b => b.textContent.includes(${JSON.stringify(wholesale.name)}))`, 800);
  await until("!!document.querySelector('.thread-head')", "the open conversation");
  const pickerLabel = LANG === "ar" ? "مجموعة الأسعار" : "Price group";
  await until(`[...document.querySelectorAll('.thread-head label.assign')].some(l => l.textContent.includes(${JSON.stringify(pickerLabel)}))`, "the price group picker in the conversation", 15000);
  await shot("15f-inbox-picker");
  await noSideScroll("the conversation header");
  await axe("inbox-picker", [], ".thread-head");
  const picked = await js(`(() => { const sel = [...document.querySelectorAll('.thread-head label.assign')].find(l => l.textContent.includes(${JSON.stringify(pickerLabel)})).querySelector('select'); const opt = [...sel.options].find(o => o.value === ${JSON.stringify(groupId)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true })); return opt.textContent; })()`);
  check(picked === (LANG === "ar" ? "الجملة" : "Wholesale"), "the picker offers the group by its name in this language");
  await sleep(1200);
  check((await api(`/api/inbox/conversations/${wholesale.id}`)).customer.price_group_id === groupId, "choosing the group in the conversation put the customer in it");
  check((await api(`/api/inbox/conversations/${retail.id}`)).customer.price_group_id === null, "and the other customer stayed in the default group");
  await shot("15g-inbox-picked");

  // The customer's own order page shows the group's price; another customer's shows the normal one.
  const priceOnPage = (name) => js(`(() => { const r = [...document.querySelectorAll('.cx-row')].find(x => x.querySelector('b')?.textContent === ${JSON.stringify(name)}); return r ? r.querySelector('.num').textContent : null; })()`);
  // The customer's page speaks the customer's language (English for both here), whatever the workspace does.
  const shownName = target[0];
  await go(`/s/al-noor?c=${wholesale.id}`, 1500);
  await until(`document.querySelectorAll('.cx-row').length > 0`, "the customer's order page");
  check(await priceOnPage(shownName) === "QAR 9", "the wholesale customer's order page shows the group's price (QAR 9)");
  await shot("15h-order-page-wholesale");
  await go(`/s/al-noor?c=${retail.id}`, 1500);
  await until(`document.querySelectorAll('.cx-row').length > 0`, "the other customer's order page");
  check(await priceOnPage(shownName) === "QAR 10.50", "the other customer's order page shows the normal price (the sale, QAR 10.50)");
  await noSideScroll("the order page");

  // Each orders the Large size; the order list shows the group and the size's SKU.
  const large = priced.variants.find((v) => v.name === "Large").id;
  const place = async (who) => (await fetch(`${API}/api/store/al-noor/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contact_id: who.id, payment: "link", items: [{ product_id: priced.id, quantity: 1, variant_id: large }] }) })).json();
  const [theirs, ours] = [await place(wholesale), await place(retail)];
  check(theirs.total === 1300 && theirs.price_group.name === "Wholesale" && ours.total === 1450 && ours.price_group.is_default, "each customer was charged their own price for the Large size (QAR 13 and QAR 14.50)");
  await go("/app/orders", 1500);
  await setLanguage(LANG);
  await sleep(500);
  const ordersText = await js("document.body.innerText");
  check(ordersText.includes("KB-100-L") && ordersText.includes(LANG === "ar" ? "الجملة" : "Wholesale"), "the order list shows the size's SKU and the wholesale order's group");
  await shot("15i-orders");
  await noSideScroll("the order list");
  await go("/app/catalog", 1500);
  await setLanguage(LANG);
  await sleep(500);

  // 6. stock: count Falafel, with a difference and a reason
  const falafel = MENU.find((m) => m[0] === "Falafel plate");
  await click(`[...document.querySelectorAll('.ct-card .ct-open')].find(b => b.textContent.includes(${JSON.stringify(LANG === "ar" ? falafel[1] : falafel[0])}))`, 600);
  await until("!!document.querySelector('.ct-sheet')", "the edit sheet for falafel");
  await pressText(t.rules.count[0], "label");
  await fill(t.openingStock, "24");
  await pressText(t.save, "button", 800);
  await until("!document.querySelector('.ct-sheet')", "falafel saved");
  check((await items()).find((i) => i.name === falafel[0]).variants[0].on_hand === 24, "an item counted in stock starts from the number typed");
  await click("document.querySelector('#ct-tab-stock')", 700);
  await until("document.querySelectorAll('.ct-stockrow').length >= 1", "the stock list");
  await shot("16-stock");
  await noSideScroll("the stock tab");
  await click(`[...document.querySelectorAll('.ct-stockrow')].find(r => r.textContent.includes(${JSON.stringify(LANG === "ar" ? falafel[1] : falafel[0])})).querySelectorAll('button')[2]`, 500);
  await until("!!document.querySelector('.ct-sheet')", "the count sheet");
  await fill(t.counted, "20");
  await sleep(250);
  await shot("17-count-difference");
  await noSideScroll("the count sheet");
  await pressText(t.record, "button", 200); // without a reason: refused on the screen
  check((await sheetText()).includes(t.reasonRequired), "a count that differs needs a reason");
  await pressText(t.reasonsCount[1]);
  await shot("18-count-reason");
  await pressText(t.record, "button", 800);
  await until("!document.querySelector('.ct-sheet')", "the count recorded");
  const counted = (await items()).find((i) => i.name === falafel[0]);
  check(counted.variants[0].on_hand === 20, "the shelf count replaced the system's number");
  const movement = (await api("/api/items/stock-log?limit=5")).log[0];
  check(movement.kind === "counted" && movement.delta === -4 && movement.reason === t.reasonsCount[1], "the difference (−4) and its reason are in the stock log");
  await shot("19-stock-log");

  // 7. bulk: +10% on five items, preview, apply, undo
  await click("document.querySelector('#ct-tab-items')", 600);
  const before = Object.fromEntries((await items()).map((i) => [i.id, i.price]));
  await pressExact(t.select);
  for (let i = 0; i < 5; i++) await click(`document.querySelectorAll('.ct-card .ct-open')[${i + 1}]`, 120);
  await shot("20-select");
  await pressText(t.chooseAction);
  await until("!!document.querySelector('.ct-sheet')", "the bulk sheet");
  await pressText(t.actions.price_percent[0], "label");
  await fill(t.percent, "10");
  await shot("21-bulk-choose");
  await pressText(t.preview, "button", 700);
  await until("!!document.querySelector('.ct-preview')", "the preview");
  await shot("22-bulk-preview");
  await noSideScroll("the bulk preview");
  check((await items()).every((i) => i.price === before[i.id]), "looking at the preview changed nothing");
  await pressText(t.apply(5), "button", 900);
  await until("!document.querySelector('.ct-sheet')", "the bulk change applied");
  await shot("23-bulk-applied");
  const after = await items();
  check(after.filter((i) => i.price !== before[i.id]).length === 5, "five prices changed");
  await click(`[...document.querySelectorAll('.ct-actions button')].find(b => b.textContent.includes(${JSON.stringify(t.undoNamed("price_percent", 5))}))`, 900);
  const undone = await items();
  check(undone.every((i) => i.price === before[i.id]), "undo put every price back");
  check((await api("/api/items/bulk/last")).last === null, "only one undo");
  await shot("24-after-undo");

  // 8. the same screens in dark
  await setup("dark");
  await go("/app/catalog", 1500);
  await setLanguage(LANG);
  await sleep(700);
  await shot("30-dark-grid");
  await axe("grid");
  await click("document.querySelector('.ct-card .ct-open')", 700);
  await until("!!document.querySelector('.ct-sheet')", "the edit sheet in dark");
  await sleep(400);
  await shot("31-dark-edit");
  await axe("edit-sheet");
  await js("document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape" });
  await sleep(300);
  await setup("light");
  await go("/app/catalog", 1500);
  await setLanguage(LANG);
  await sleep(700);
  await axe("grid-light");
  await click("document.querySelector('#ct-tab-stock')", 700);
  await axe("stock");
  await shot("32-stock-light");
  // 9. the on-screen keyboard: shrink the window to what is left above one, and look at a form
  await click("document.querySelector('#ct-tab-items')", 600);
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 430, deviceScaleFactor: 2, mobile: true });
  await click("document.querySelector('.ct-card .ct-open')", 700);
  await until("!!document.querySelector('.ct-sheet')", "the edit sheet with the keyboard up");
  await fill(t.price, "");
  await sleep(500);
  const room = await js(`(() => { const f = document.querySelector('.ct-sheet-foot').getBoundingClientRect(); const i = document.activeElement.getBoundingClientRect(); const sh = document.querySelector('.ct-sheet').getBoundingClientRect(); return { footBottom: f.bottom, footTop: f.top, fieldBottom: i.bottom, fieldTop: i.top, sheetTop: sh.top, height: innerHeight }; })()`);
  check(room.footBottom <= room.height + 1 && room.fieldBottom <= room.footTop && room.fieldTop >= room.sheetTop, "with the keyboard up the buttons stay visible and the field being typed in is above them");
  await shot("33-keyboard-up");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(300);
  if (await js("!!document.querySelector('.ct-sheet')")) await pressText(t.leaveGo).catch(() => undefined);
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });

  // 10. an agent sees only what the counter does: switches, stock, sold out in bulk
  const agentEmail = "yusuf@alnoor.example";
  const signedIn = await js(`fetch('/api/auth/code', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email: ${JSON.stringify(agentEmail)}})}).then(r => r.json()).then(d => fetch('/api/auth/verify', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email: ${JSON.stringify(agentEmail)}, code: d.dev_code})})).then(r => r.json()).then(m => m.role)`);
  check(signedIn === "agent", "signed in as an agent");
  await go("/app/catalog", 1500);
  await setLanguage(LANG);
  await sleep(600);
  const bodyText = await js("document.body.innerText");
  check(!bodyText.includes(t.add) && !bodyText.includes(t.settings), "an agent is not offered Add or Settings");
  check(await js("document.querySelectorAll('.ct-card .sh-switch').length > 0"), "an agent still has the switch on every item");
  await shot("40-agent-grid");
  await click("document.querySelector('.ct-card .ct-open')", 700);
  await until("!!document.querySelector('.ct-sheet')", "the item opened read-only");
  check((await sheetText()).includes(t.mustBeOwner) && await js("document.querySelector('.ct-sheet fieldset.ct-form').disabled"), "an agent sees the item read-only, with the reason");
  await shot("41-agent-item");
  await js("document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))");
  await pressText(t.close, "button", 400).catch(() => undefined);
  await until("!document.querySelector('.ct-sheet')", "the read-only item closed");
  const refused = await js(`fetch('/api/items', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({name:'Nope', price: 100})}).then(r => r.status)`);
  check(refused === 403, "and the API refuses an agent who tries to add an item anyway");
  await click("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === " + JSON.stringify(t.select) + ")", 400);
  await click("document.querySelector('.ct-card .ct-open')", 200);
  await pressText(t.chooseAction);
  await until("!!document.querySelector('.ct-sheet')", "the bulk sheet for an agent");
  check(await js("document.querySelectorAll('.ct-sheet input[name=action]').length === 2"), "an agent's bulk actions are only sold out and available again");
  await shot("42-agent-bulk");
  await js("fetch('/api/auth/logout', {method:'POST'})");

  // 11. a laptop: the same screens, with the side panel
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await go("/app/catalog", 1500);
  await setLanguage(LANG);
  await sleep(600);
  await shot("50-laptop-grid");
  await click("document.querySelector('.ct-card .ct-open')", 700);
  await until("!!document.querySelector('.ct-sheet')", "the side panel");
  await sleep(500);
  await shot("51-laptop-edit");
  // The laptop sidebar's and top bar's greys (search hint, shortcut, group label, clock) are the shell's own.
  await axe("laptop-edit", [".sh-side", ".sh-top"]);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(300);
  await axe("laptop-grid", [".sh-side", ".sh-top"]);
  check(browser.problems.length === 0, `no errors in the browser's console (${browser.problems.length})`);
  for (const p of browser.problems.slice(0, 8)) log("   ", p);
} catch (error) {
  if (error.message !== "__done__") {
    failures.push(String(error.message ?? error));
    log("STOPPED:", error.message ?? error);
    try { await shot("99-where-it-stopped"); } catch { /* the page is gone */ }
  }
} finally {
  await browser.close();
}
if (failures.length) { console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("\nAll checks passed.");
