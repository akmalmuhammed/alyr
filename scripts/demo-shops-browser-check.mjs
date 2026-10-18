// The demo shops in a real browser (ALY-110): every Catalog screen and the customer's order
// page for each demo shop, in English and Arabic, light and dark, at phone width (375 px),
// and the order page on a slow connection and a slow processor. Headless Edge over the
// DevTools protocol (scripts/browser-kit.mjs), no packages. Node 22.18 or newer.
//
//   node scripts/demo-shops-browser-check.mjs --lang en --base http://localhost:3171 \
//        --api http://127.0.0.1:8171 --db alyr_demo_scen --out C:/t/ds \
//        --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs the demo shops (`python -m alyr.seed_catalog_demos`) in a scratch database (never
// the shared one), a dev API on it and a web app pointed at that API (docs/demo.md), and
// `docker` for two read-only lookups in the database (a customer's own link, the open payment
// and the order to track). Options: `--shops restaurant,bakery` picks some of the seven,
// `--schemes light,dark`, `--lang en|ar`, `--only workspace|order|perf`, `--perf-base <url>`
// for the throttled run (use a production build, a dev server is far slower than a real one).
//
// What it does, on each screen: axe-core (wcag2a, wcag2aa, wcag21aa and best practice), the
// size of every control (44 px is the floor), text cut off by its box, controls that overlap
// or sit under something, sideways scrolling, the browser's own accessibility tree (every
// control and picture has a name and a role, dialogs are named, headings and landmarks
// exist), and the order a keyboard visits things in (inside a dialog it stays inside, it
// follows the reading order, and every stop shows where it is). Each screen is also saved as
// a screenshot to look at. A screen reader itself cannot be run here: names, roles and order
// from the accessibility tree are what this checks, and a real phone with VoiceOver or
// TalkBack is still to do.
//
// It exits with an error if any check fails. Findings are written to <out>/<lang>-<scheme>-
// <shop>.json. Short folders: Edge fails quietly with long paths, so keep --profile and --out
// short, and the debugging port is a random free one of this script's own.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch, sleep } from "./browser-kit.mjs";
import { COPY } from "../apps/web/app/(product)/_workspace/catalogCopy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3171";
const API = args.api ?? "http://127.0.0.1:8171";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const OUT = args.out ?? `${tmpdir()}/ds-shots`;
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const DB = args.db ?? "alyr_demo_scen";
const PG = args.pg ?? "alyrwhatsapp-postgres-1";
const SCHEMES = (args.schemes ?? "light,dark").split(",");
const ONLY = new Set((args.only ?? "workspace,order").split(","));  // workspace, order, perf (the slow-phone run needs a production build: --perf-base)
const PERF_BASE = args["perf-base"] ?? "";
const t = COPY[LANG];
mkdirSync(OUT, { recursive: true });

// What to look at in each shop (written here, apart from the code, as the specification).
const SHOPS = {
  restaurant: { item: ["Chicken shawarma", "شاورما دجاج"], draft: ["Shrimp machboos", "مجبوس ربيان"], customer: ["Priya N.", "منى ع."], orders: true, section: "Menu" },
  bakery: { item: ["Chocolate celebration cake", "كيكة المناسبات بالشوكولاتة"], draft: ["Eid cookie box", "علبة كعك العيد"], customer: ["Lina F.", "هند ر."], orders: true, section: "Menu" },
  grocery: { item: ["Fresh milk, 1 litre", "حليب طازج، 1 لتر"], draft: ["Mountain honey, 500 g", "عسل جبلي، 500 غ"], customer: ["Anita R.", "أم سلطان"], orders: true, section: "Products" },
  fashion: { item: ["Butterfly abaya", "عباية فراشة"], draft: ["Satin evening abaya", "عباية سهرة ساتان"], customer: ["Noor A.", "ريم ش."], orders: true, section: "Products" },
  shop: { item: ["USB-C charging cable", "كابل شحن USB-C"], draft: ["Smart watch", "ساعة ذكية"], customer: ["Rashid M.", "عائشة ي."], orders: true, section: "Products" },
  wholesale: { item: ["Basmati rice 5 kg, carton of 4", "أرز بسمتي 5 كغ، كرتون 4"], draft: ["Basmati 1121 premium 5 kg, carton of 4", "أرز بسمتي 1121 فاخر 5 كغ، كرتون 4"], customer: ["Karak Corner", "كافيه الفانوس"], orders: true, section: "Price list" },
  salon: { item: ["Argan hair oil, 100 ml", "زيت الأرغان للشعر، 100 مل"], draft: ["Gel nail kit", "طقم أظافر جل"], customer: null, orders: false, section: "Products" },
};
const KEYS = (args.shops ?? Object.keys(SHOPS).join(",")).split(",");
const nameIn = (pair) => pair[AR ? 1 : 0];

const failures = [];
const notes = [];
const log = (...m) => console.log(`[${LANG}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };

// ── the database, for two lookups the API does not offer ────────────────────────────────
const sql = (text) => execFileSync("docker", ["exec", PG, "psql", "-U", "alyr", "-d", DB, "-At", "-F", "|", "-c", text], { encoding: "utf8" }).trim();

// ── the page's own helpers, installed in the browser (a function, so it is plain code) ──
function installHelpers() {
  const css = (e) => getComputedStyle(e);
  const INTERACTIVE = "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=switch], [role=tab], [role=checkbox], [role=radio], [role=link], [role=menuitem], [tabindex]:not([tabindex='-1'])";
  const shown = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      const s = css(n);
      if (s.display === "none" || s.visibility === "hidden") return false;
      if (n.hasAttribute("inert") || n.getAttribute("aria-hidden") === "true") return false;
    }
    return true;
  };
  const describe = (e) => {
    const text = (e.getAttribute("aria-label") || e.textContent || e.value || e.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 40);
    const cls = typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return `${e.tagName.toLowerCase()}${cls}${text ? ` “${text}”` : ""}`;
  };
  // What is on top: an open dialog, or the whole page.
  const layer = () => document.querySelector("dialog[open]") ?? document.querySelector(".ct-sheet") ?? document.body;
  // The part of an element a person can see: its box cut down by every ancestor that clips.
  const seen = (e) => {
    let { left, top, right, bottom } = e.getBoundingClientRect();
    for (let n = e.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const s = css(n);
      if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      const r = n.getBoundingClientRect();
      if (s.overflowX !== "visible") { left = Math.max(left, r.left); right = Math.min(right, r.right); }
      if (s.overflowY !== "visible") { top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom); }
    }
    left = Math.max(left, 0); top = Math.max(top, 0); right = Math.min(right, innerWidth); bottom = Math.min(bottom, innerHeight);
    return right - left > 1 && bottom - top > 1 ? { left, top, right, bottom } : null;
  };
  // Controls that are there to be pressed: shown, and with some part of them in the window.
  const controls = (root) => [...root.querySelectorAll(INTERACTIVE)].filter((e) => shown(e));
  // The nearest ancestor (or the element itself) fixed to the window or sticky: it does not
  // scroll with the page, so what passes under it is not "overlapped" by it.
  const pinned = (e) => {
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      const p = css(n).position;
      if (p === "fixed" || p === "sticky") return n;
    }
    return null;
  };
  // The nearest thing that scrolls (or the page), and where an element is inside it, so two
  // stops of the keyboard are only compared when they scroll together.
  const scroller = (e) => {
    for (let n = e.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const o = css(n).overflowY;
      if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n;
    }
    return document.scrollingElement;
  };
  const where = (e) => {
    const s = scroller(e);
    const base = s === document.scrollingElement ? 0 : s.getBoundingClientRect().top;
    return { box: s, top: e.getBoundingClientRect().top - base + s.scrollTop };
  };
  window.__ds = {
    describe, layer, controls,
    // Controls whose pressable area is smaller than 44 by 44 px. The area counts what a thumb
    // can hit, which may be more than the box: it is found by pressing outwards from the
    // middle (a hit area drawn with ::before or ::after counts, a neighbour's does not). A
    // link inside a sentence is exempt (WCAG 2.5.8).
    small(root = layer()) {
      const out = [];
      const reach = (e, dx, dy) => {
        const r = e.getBoundingClientRect();
        const cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
        const ok = (x, y) => { if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false; const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t) || t.contains(e)); };
        let n = 0;
        while (n < 80 && ok(cx + dx * (n + 1), cy + dy * (n + 1))) n += 1;
        return n;
      };
      for (const e of controls(root)) {
        let box = e.getBoundingClientRect();
        const label = e.closest("label");
        if (label && e.matches("input[type=checkbox], input[type=radio]")) box = label.getBoundingClientRect();
        if (e.matches("a") && css(e).display === "inline" && e.parentElement && e.parentElement.textContent.trim() !== e.textContent.trim()) continue;
        if (box.width >= 43.5 && box.height >= 43.5) continue;
        e.scrollIntoView({ block: "center", inline: "nearest" });
        const w = reach(e, 1, 0) + reach(e, -1, 0) + 1, h = reach(e, 0, 1) + reach(e, 0, -1) + 1;
        const pressable = { w: Math.max(Math.round(box.width), w), h: Math.max(Math.round(box.height), h) };
        if (pressable.w < 43.5 || pressable.h < 43.5) out.push({ el: describe(e), w: Math.round(box.width), h: Math.round(box.height), pressable: `${pressable.w}x${pressable.h}` });
      }
      for (const n of [document.scrollingElement, root.querySelector?.(".ct-sheet-body, .ox-dbody")]) if (n) n.scrollTop = 0;
      return out;
    },
    // Text that its box cuts off, in a line or a block, or that runs out of a box that hides.
    clipped(root = layer()) {
      const out = [];
      for (const e of root.querySelectorAll("*")) {
        if (!shown(e)) continue;
        const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const s = css(e);
        if (s.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1) out.push({ el: describe(e), why: "ellipsis", full: e.scrollWidth, shown: e.clientWidth });
        // A card's description is a two-line preview and the whole text is one tap away, in the
        // item's own sheet; a name, a price, a label or a button is never cut.
        else if (s.webkitLineClamp && s.webkitLineClamp !== "none" && e.scrollHeight > e.clientHeight + 1 && !e.matches(".ox-desc")) out.push({ el: describe(e), why: "clamped to " + s.webkitLineClamp + " lines" });
        else {
          const r = e.getBoundingClientRect();
          for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
            const as = css(a);
            if (as.overflowX === "auto" || as.overflowX === "scroll") break;
            if (as.overflowX === "hidden" || as.overflowX === "clip") {
              const ar = a.getBoundingClientRect();
              if (ar.width > 0 && (r.right > ar.right + 1.5 || r.left < ar.left - 1.5)) { out.push({ el: describe(e), why: "runs out of " + describe(a) }); break; }
            }
          }
        }
      }
      return out;
    },
    // Controls that overlap another one in the same part of the page. A bar fixed to the
    // window or a sticky footer sits over what scrolls under it by design, so a control is
    // only compared with controls that move with it.
    overlaps(root = layer()) {
      const list = controls(root).map((e) => ({ e, r: seen(e), pin: pinned(e) })).filter(({ r }) => r !== null);
      const out = [];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.pin !== b.pin || a.e.contains(b.e) || b.e.contains(a.e)) continue;
        // A field's own "clear" button sits inside the field, at its end, by design.
        if ((a.e.matches(".ox-clear") && b.e.matches("input")) || (b.e.matches(".ox-clear") && a.e.matches("input"))) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 4 && h > 4) out.push({ a: describe(a.e), b: describe(b.e), w: Math.round(w), h: Math.round(h) });
      }
      return out;
    },
    // Controls that something else still sits on top of when they are scrolled to the middle
    // of the screen: a bar, a toast, a banner that would leave them out of reach.
    covered(root = layer()) {
      const out = [];
      const all = controls(root).filter((e) => !pinned(e));
      for (const e of all.slice(0, 120)) {
        e.scrollIntoView({ block: "center", inline: "nearest" });
        const r = e.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
        const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
        const top = document.elementFromPoint(x, y);
        if (top && top !== e && !e.contains(top) && !top.contains(e) && !(e.closest("label") && e.closest("label").contains(top))) out.push({ el: describe(e), under: describe(top) });
      }
      for (const n of [document.scrollingElement, root.querySelector?.(".ct-sheet-body, .ox-dbody")]) if (n) n.scrollTop = 0;
      return out;
    },
    sideways() {
      const out = [];
      const w = innerWidth;
      if (Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > w + 1) out.push("page " + document.documentElement.scrollWidth + ">" + w);
      for (const e of document.querySelectorAll("main, .sh-main, .sh-scroll, .ct-sheet, .ct-sheet-body, dialog[open], .cx, .ox")) {
        if (e.scrollWidth > e.clientWidth + 1 && shown(e) && css(e).overflowX !== "auto" && css(e).overflowX !== "scroll") out.push(describe(e) + " " + e.scrollWidth + ">" + e.clientWidth);
      }
      return out;
    },
    // Where the keyboard is, for the focus walk.
    here() {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      const r = e.getBoundingClientRect(), s = css(e);
      const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
      const w = where(e);
      window.__ds.boxes = window.__ds.boxes || [];
      let box = window.__ds.boxes.indexOf(w.box);
      if (box < 0) { window.__ds.boxes.push(w.box); box = window.__ds.boxes.length - 1; }
      // An element the keyboard has already been to means it went all the way round.
      window.__ds.visited = window.__ds.visited || new WeakSet();
      const again = window.__ds.visited.has(e);
      window.__ds.visited.add(e);
      const dom = [...document.querySelectorAll("*")].indexOf(e);
      return { el: describe(e), dom, top: Math.round(w.top), left: Math.round(r.left), right: Math.round(r.right), box, pinned: !!pinned(e), inLayer: layer().contains(e), ring: !!ring, visible: shown(e), again };
    },
    headings() {
      return { h1: document.querySelectorAll("h1").length, main: document.querySelectorAll("main, [role=main]").length };
    },
  };
  return true;
}

// ── a browser of our own, on a random free port ─────────────────────────────────────────
async function freePort() {
  for (let i = 0; i < 40; i++) {
    const port = 9400 + Math.floor(Math.random() * 500);
    const taken = await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false);
    if (!taken) return port;
  }
  throw new Error("no free debugging port");
}
const port = await freePort();
const profile = args.profile ?? `${OUT}/p${port}`;
const b = await launch({ edge: EDGE, port, profile, scheme: "light" });
const shotName = [];

async function settle(wait = 700) {
  await sleep(wait);
  await b.js("document.fonts && document.fonts.ready.then(() => true)").catch(() => undefined);
  await b.js(`(${installHelpers.toString()})()`);
}
async function go(path, wait = 900) {
  await b.go(path.startsWith("http") ? path : `${BASE}${path}`, 400);
  await settle(wait);
}
const norm = "(e => e.textContent.replace(/\\s+/g, ' ').trim())";
const visibleOnly = "(e => e.getClientRects().length > 0)";
const press = (text, within = "document", tag = "button", wait = 350) =>
  b.click(`[...${within}.querySelectorAll(${JSON.stringify(tag)})].filter(${visibleOnly}).find(e => ${norm}(e).includes(${JSON.stringify(text)}) || (e.getAttribute('aria-label') || '').includes(${JSON.stringify(text)}))`, wait);
const sheetOpen = () => b.js("!!document.querySelector('dialog[open], .ct-sheet')");
async function closeSheet() {
  if (!(await sheetOpen())) return;
  await b.key("Escape", "Escape", 27);
  await sleep(300);
  if (await sheetOpen()) {
    // A sheet that asks "Leave without saving?" is left.
    await b.js(`(() => { const x = [...document.querySelectorAll('.ct-sheet button')].find(e => ${norm}(e) === ${JSON.stringify(t.leaveGo)}); if (x) x.click(); })()`);
    await sleep(300);
  }
  if (await sheetOpen()) await b.js("document.querySelector('.ct-sheet [aria-label=\"Close\"], .ct-sheet .sh-iconbtn, dialog[open] .ox-x')?.click()");
  await sleep(300);
}

// ── the checks on one screen ────────────────────────────────────────────────────────────
const NAMED_ROLES = new Set(["button", "link", "textbox", "searchbox", "checkbox", "radio", "switch", "combobox", "tab", "menuitem", "spinbutton", "slider", "option", "listbox"]);
async function accessibilityTree() {
  await b.send("Accessibility.enable");
  const { nodes } = await b.send("Accessibility.getFullAXTree");
  const unnamed = [], dialogs = [];
  let headings = 0;
  for (const n of nodes) {
    if (n.ignored) continue;
    const role = n.role?.value;
    const name = (n.name?.value ?? "").trim();
    if (NAMED_ROLES.has(role) && !name) unnamed.push({ role, id: n.backendDOMNodeId });
    if (role === "img" && !name) unnamed.push({ role, id: n.backendDOMNodeId });
    if (role === "dialog") dialogs.push({ name });
    if (role === "heading") headings += 1;
  }
  const described = [];
  for (const u of unnamed.slice(0, 6)) {
    try {
      const { object } = await b.send("DOM.resolveNode", { backendNodeId: u.id });
      const r = await b.send("Runtime.callFunctionOn", { objectId: object.objectId, functionDeclaration: "function() { return window.__ds ? window.__ds.describe(this) : this.outerHTML.slice(0, 80); }", returnByValue: true });
      described.push(`${u.role} ${r.result.value}`);
    } catch { described.push(`${u.role} (gone)`); }
  }
  return { unnamed: described, unnamedCount: unnamed.length, dialogsUnnamed: dialogs.filter((d) => !d.name).length, dialogCount: dialogs.length, headings };
}

// Walk the keyboard through the screen: where it goes, whether it stays in the dialog, follows
// the reading order and shows where it is.
async function focusWalk(limit = 90) {
  await b.js("window.scrollTo(0, 0); document.querySelector('.ct-sheet-body, dialog[open] .ox-dbody')?.scrollTo(0, 0); window.__ds.visited = new WeakSet()");
  const seen = [], problems = [];
  // A dialog puts the keyboard on its first control when it opens: that is the first stop.
  const first = await b.js("window.__ds.here()");
  if (first) seen.push({ ...first, initial: true });
  for (let i = 0; i < limit; i++) {
    await b.key("Tab", "Tab", 9);
    const here = await b.js("window.__ds.here()");
    if (!here || here.again) break;
    seen.push(here);
  }
  // Round and round: the walk may have started in the middle (a dialog puts the keyboard on
  // the control it likes), so it is laid out from the first control in the page's own order.
  if (seen.length > 1) {
    const top = seen.reduce((m, s, i) => (s.dom < seen[m].dom ? i : m), 0);
    seen.push(...seen.splice(0, top));
  }
  const dialog = await sheetOpen();
  const rtl = AR;
  seen.forEach((s, i) => {
    if (dialog && !s.inLayer) problems.push(`focus left the dialog at ${s.el}`);
    // A control the page itself focuses (a dialog's first) shows no ring after a tap; a
    // control reached with Tab must.
    if (!s.ring && !s.initial) problems.push(`no sign of focus on ${s.el}`);
    if (!s.visible) problems.push(`focus on something not shown: ${s.el}`);
    if (i > 0 && s.dom < seen[i - 1].dom) problems.push(`the keyboard order is not the page's order: ${seen[i - 1].el} then ${s.el}`);
    const prev = seen[i - 1];
    // Only two stops that scroll together can be compared by where they are.
    if (prev && prev.box === s.box && prev.pinned === s.pinned) {
      if (s.top < prev.top - 14) problems.push(`goes back up: ${prev.el} then ${s.el}`);
      else if (Math.abs(s.top - prev.top) <= 14 && (rtl ? s.right > prev.right + 6 : s.left < prev.left - 6)) problems.push(`goes against the reading direction: ${prev.el} then ${s.el}`);
    }
  });
  await b.js("document.activeElement && document.activeElement.blur()");
  return { stops: seen.length, problems: [...new Set(problems)].slice(0, 8), order: seen.map((s) => s.el) };
}

const report = [];
const SKIP_FOCUS = new Set(); // screens whose focus walk is not asked for
/** All the checks, a screenshot, and a line in the report. `exclude` names things that are
 *  not this feature's (none, here: nothing is excluded). */
async function audit(shop, scheme, name, { focus = true, scroll = null, reveal = null, soft = false } = {}) {
  await settle(250);
  // Where to look: `scroll` is how far to scroll the screen (or the open sheet), `reveal` an
  // expression for an element to bring to the top. The checks that move things about to look
  // at them put the screen back to the top, so the place is asked for again before each.
  const goTo = async () => {
    if (scroll === null && reveal === null) return;
    await b.js(`(() => {
      const c = document.querySelector('.ct-sheet-body, dialog[open] .ox-dbody') || document.scrollingElement;
      ${scroll !== null ? `c.scrollTop = ${scroll};` : ""}
      ${reveal ? `const r = (${reveal}); if (r) r.scrollIntoView({ block: 'start' });` : ""}
    })()`);
    await sleep(150);
  };
  const key = `${shop}-${scheme}-${name}`;
  await goTo();
  const found = { screen: key, small: await b.js('window.__ds.small()') };
  await goTo(); found.clipped = await b.js('window.__ds.clipped()');
  await goTo(); found.overlaps = await b.js('window.__ds.overlaps()');
  await goTo(); found.covered = await b.js('window.__ds.covered()');
  await goTo(); found.sideways = await b.js('window.__ds.sideways()');
  found.tree = await accessibilityTree();
  found.axe = [];
  await goTo();
  if (AXE && existsSync(AXE)) {
    const violations = await b.axe(AXE);
    found.axe = (violations ?? []).map((v) => ({ id: v.id, impact: v.impact, n: v.n, nodes: v.nodes.slice(0, 4).map((x) => `${x.target} | ${x.why}`) }));
  }
  if (focus && !SKIP_FOCUS.has(name)) found.focus = await focusWalk();
  await goTo();
  await b.shot(`${OUT}/${LANG}-${key}.png`);
  report.push(found);
  const bad = [];
  if (found.axe.length) bad.push(`axe ${found.axe.map((v) => `${v.id}×${v.n}`).join(", ")}`);
  if (found.small.length) bad.push(`${found.small.length} control(s) under 44 px: ${found.small.slice(0, 3).map((s) => `${s.el} ${s.w}×${s.h}`).join("; ")}`);
  if (found.clipped.length) bad.push(`${found.clipped.length} text cut off: ${found.clipped.slice(0, 3).map((s) => `${s.el} (${s.why})`).join("; ")}`);
  if (found.overlaps.length) bad.push(`${found.overlaps.length} overlap(s): ${found.overlaps.slice(0, 2).map((s) => `${s.a} on ${s.b}`).join("; ")}`);
  if (found.covered.length) bad.push(`${found.covered.length} covered: ${found.covered.slice(0, 2).map((s) => `${s.el} under ${s.under}`).join("; ")}`);
  if (found.sideways.length) bad.push(`sideways: ${found.sideways.join(", ")}`);
  if (found.tree.unnamedCount) bad.push(`unnamed: ${found.tree.unnamed.join("; ")}`);
  if (found.tree.dialogsUnnamed) bad.push("a dialog has no name");
  if (found.focus?.problems.length) bad.push(`focus: ${found.focus.problems.slice(0, 3).join("; ")}`);
  if (soft && bad.length) {
    // Not the Catalog's own screen (the home screen's dashboard is the shell's and the
    // Agent's, ALY-129): written down, not failed.
    notes.push(`${key} (not a Catalog screen): ${bad.join(" || ")}`);
    log("note", key, `${bad.length} finding(s) on a screen that is not the Catalog's`);
  } else {
    check(bad.length === 0, `${key}${bad.length ? ": " + bad.join(" || ") : ""}`);
  }
  return found;
}

// ── signing in as a demo owner ──────────────────────────────────────────────────────────
async function signIn(shop) {
  const email = `owner@demo-${shop}.example`;
  // Sign-in codes are limited to five an hour for each address, and this run signs in again
  // for every screen size, language and colour: forget the demo shops' earlier codes (the
  // database is a scratch one, and these addresses can never receive email).
  sql(`delete from login_codes where email = '${email}'`);
  const post = (path, body) => fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let cookie = null;
  // Two runs side by side may both ask for this owner's code: try again if one is taken.
  for (let attempt = 0; attempt < 4 && !cookie; attempt++) {
    const code = (await (await post("/api/auth/code", { email })).json()).dev_code;
    const verified = await post("/api/auth/verify", { email, code });
    cookie = verified.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith("alyr_session=")) ?? null;
    if (!cookie) await sleep(500 + Math.random() * 1500);
  }
  if (!cookie) throw new Error(`could not sign in as ${email}`);
  await b.send("Network.clearBrowserCookies");
  await b.send("Network.setCookie", { name: "alyr_session", value: cookie.split("=")[1], url: BASE });
}
async function setLanguage() {
  await b.go(`${BASE}/start`, 300);
  await b.js(`localStorage.setItem('alyr-lang', '${LANG}'); localStorage.setItem('alyr-workspace-lang', '${LANG}')`);
}

// ── the owner's side: every Catalog screen ──────────────────────────────────────────────
async function workspace(shop, scheme) {
  const spec = SHOPS[shop];
  await signIn(shop);
  await go("/app", 1500);
  await audit(shop, scheme, "home", { soft: true });

  await go("/app/catalog", 1500);
  await b.until("document.querySelectorAll('.ct-card, .ct-row').length > 0", "the items", 20000);
  const title = await b.js("document.querySelector('.sh-main h1')?.textContent ?? ''");
  check(title.trim() === (AR ? { Menu: "القائمة", Products: "المنتجات", "Price list": "قائمة الأسعار" }[spec.section] : spec.section), `${shop}: the section is called ${spec.section} (${title.trim()})`);
  await audit(shop, scheme, "list");
  await audit(shop, scheme, "list-scrolled", { focus: false, scroll: 1400 });

  // The compact list, then back to photos.
  await b.click("document.querySelector('.ct-seg button[aria-pressed=false]')", 500);
  await audit(shop, scheme, "list-compact", { focus: false });
  await b.click("document.querySelector('.ct-seg button[aria-pressed=false]')", 500);

  // The filters the home cards open.
  await go("/app/catalog?show=sold_out", 1500);
  await audit(shop, scheme, "sold-out", { focus: false });
  await go("/app/catalog?show=low_stock", 1500);
  await audit(shop, scheme, "low-stock", { focus: false });
  await go("/app/catalog?show=draft", 1500);
  await audit(shop, scheme, "drafts", { focus: false });

  // Search by a name, in the language of the screen, and by another spelling.
  await go("/app/catalog", 1500);
  await b.click("document.querySelector('.ct-search input')");
  await b.type(nameIn(spec.item).split(" ")[0]);
  await sleep(900);
  await audit(shop, scheme, "search", { focus: false });
  await b.clearFocused();
  await sleep(700);

  // An item, open: every part of its form.
  await b.until("document.querySelectorAll('.ct-card, .ct-row').length > 0", "the items again", 15000);
  await b.click(`[...document.querySelectorAll('.ct-open')].find(e => ${norm}(e).includes(${JSON.stringify(nameIn(spec.item))}) || ${norm}(e).includes(${JSON.stringify(spec.item[0])}) || ${norm}(e).includes(${JSON.stringify(spec.item[1])}))`, 700);
  await b.until("!!document.querySelector('.ct-sheet')", "the edit sheet");
  await audit(shop, scheme, "edit");
  await b.js("document.querySelectorAll('.ct-sheet details').forEach(d => { d.open = true; })");
  await audit(shop, scheme, "edit-open", { focus: false, scroll: 600 });
  // The parts a type puts first: sizes and colours, choices and extras, when it can be ordered.
  for (const [name, title] of [["edit-sizes", t.variantsTitle], ["edit-choices", t.optionsTitle], ["edit-times", t.scheduleTitle]]) {
    const summary = `[...document.querySelectorAll('.ct-sheet summary')].find(s => ${norm}(s).includes(${JSON.stringify(title)}))`;
    if (await b.js(`!!(${summary})`)) await audit(shop, scheme, name, { focus: false, reveal: summary });
  }
  await audit(shop, scheme, "edit-open-end", { focus: false, scroll: 100000 });
  await closeSheet();

  // A draft: no photo yet.
  await b.click(`[...document.querySelectorAll('.ct-open')].find(e => ${norm}(e).includes(${JSON.stringify(spec.draft[0])}) || ${norm}(e).includes(${JSON.stringify(spec.draft[1])}))`, 700);
  await b.until("!!document.querySelector('.ct-sheet')", "the draft's sheet");
  await audit(shop, scheme, "edit-draft", { focus: false });
  await closeSheet();

  // The stock tab, the add sheet, the settings, the import, a share sheet and the bulk bar.
  await go("/app/catalog", 1200);
  await press(t.tabs.stock, "document", "button", 900);
  await audit(shop, scheme, "stock", { focus: false });
  await press(t.tabs.items, "document", "button", 700);

  await press(t.add, "document", "button", 700);
  await b.until("!!document.querySelector('.ct-sheet')", "the add sheet");
  await audit(shop, scheme, "add");
  await closeSheet();

  await press(t.imp.open, "document", "button", 700);
  await b.until("!!document.querySelector('.ct-sheet')", "the import sheet");
  await audit(shop, scheme, "import");
  await closeSheet();

  await press(t.settings, "document", "button", 700);
  await b.until("!!document.querySelector('.ct-sheet')", "the settings sheet");
  await audit(shop, scheme, "settings");
  await audit(shop, scheme, "settings-end", { focus: false, scroll: 100000 });
  await closeSheet();

  if (spec.orders) {
    await b.click("document.querySelector('.ct-share-btn')", 700);
    await b.until("!!document.querySelector('.ct-sheet')", "the share sheet");
    await audit(shop, scheme, "share");
    await closeSheet();
    await press(t.share, "document", "button", 700);
    if (await sheetOpen()) { await audit(shop, scheme, "share-shop", { focus: false }); await closeSheet(); }
  }

  await press(t.select, "document", "button", 500);
  await b.click("document.querySelectorAll('.ct-open')[0]", 300);
  await b.click("document.querySelectorAll('.ct-open')[1]", 300);
  await audit(shop, scheme, "selecting", { focus: false });
  await b.click("document.querySelector('.ct-bar .btn.primary')", 800);
  await b.until("!!document.querySelector('.ct-sheet')", "the bulk sheet");
  await audit(shop, scheme, "bulk");
  await closeSheet();
}

// ── the customer's side ─────────────────────────────────────────────────────────────────
function links(shop) {
  const spec = SHOPS[shop];
  const slug = `demo-${shop}`;
  const tenant = sql(`select id from tenants where slug = '${slug}'`);
  // The page speaks the customer's own language (from their record), so a customer who
  // writes in the language being checked is the one whose link is opened.
  const own = spec.customer
    ? sql(`select substring(m.body from 'http[^ ]*') from messages m join contacts c on c.id = m.contact_id where m.tenant_id = '${tenant}' and m.kind = 'buttons' and c.name = '${nameIn(spec.customer)}' limit 1`).replace(/^http:\/\/localhost:\d+/, BASE)
    : "";
  const pending = sql(`select id from payment_requests where tenant_id = '${tenant}' and status = 'pending' and order_id is not null order by created_at desc limit 1`);
  const track = sql(`select id from orders where tenant_id = '${tenant}' and status in ('confirmed', 'ready', 'done') order by created_at desc limit 1`);
  return { slug, tenant, own, pending, track };
}

async function customer(shop, scheme) {
  const spec = SHOPS[shop];
  const l = links(shop);
  const withLang = async () => { await b.js(`localStorage.setItem('alyr-lang', '${LANG}')`); };
  await setLanguage();
  await go(l.own, 1800);
  await withLang();
  await go(l.own, 1800);
  await b.until("document.querySelectorAll('.ox-card, .ox-wrow').length > 0", "the order page's items", 20000);
  await audit(shop, scheme, "order-top");
  await audit(shop, scheme, "order-scrolled", { focus: false, scroll: 1500 });
  await b.js("window.scrollTo(0, 0)");
  await go(`${BASE}/s/${l.slug}${AR ? "?lang=ar" : ""}`, 1500);
  await audit(shop, scheme, "order-public", { focus: false });

  await go(l.own, 1500);
  // An item, open.
  const opened = await b.click(`[...document.querySelectorAll('.ox-open')].find(e => (e.getAttribute('aria-label') || '').includes(${JSON.stringify(nameIn(spec.item).split(",")[0])}))`, 800).then(() => true, () => false);
  if (opened && (await sheetOpen())) {
    await audit(shop, scheme, "order-item");
    await audit(shop, scheme, "order-item-end", { focus: false, scroll: 100000 });
    await closeSheet();
  }
  // Add something and review the order.
  const added = await b.click("document.querySelector('.ox-add')", 600).then(() => true, () => false);
  if (added) {
    await b.until("!!document.querySelector('.cx-bar')", "the order bar", 8000).catch(() => undefined);
    await audit(shop, scheme, "order-bar", { focus: false });
    await b.click("document.querySelector('.cx-bar .cx-btn, .cx-bar button')", 1200).catch(() => undefined);
    if (await sheetOpen()) { await audit(shop, scheme, "order-review"); await closeSheet(); }
  }
  // A search with nothing in it, and the sold-out look.
  await go(l.own, 1500);
  await b.click("document.querySelector('.ox-search input, input[type=search]')").catch(() => undefined);
  await b.type("zzzz");
  await sleep(700);
  await audit(shop, scheme, "order-search-none", { focus: false });
  await go(l.own, 1500);

  if (l.pending) {
    await go(`/pay/${l.tenant}/${l.pending}`, 1500);
    await audit(shop, scheme, "pay");
  }
  if (l.track) {
    await go(`/t/${l.tenant}/${l.track}`, 1500);
    await audit(shop, scheme, "track");
  }
}

// ── the order page on a slow phone ──────────────────────────────────────────────────────
async function slowPhone(shop) {
  const l = links(shop);
  const base = PERF_BASE || BASE;
  const url = l.own.replace(BASE, base);
  await b.send("Network.clearBrowserCache");
  await b.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await b.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
  const started = Date.now();
  await b.send("Page.navigate", { url });
  let readable = null, usable = null;
  while (Date.now() - started < 90000 && usable === null) {
    const state = await b.js("({ cards: document.querySelectorAll('.ox-card, .ox-wrow').length, add: !!document.querySelector('.ox-add'), photos: [...document.images].filter(i => i.complete && i.naturalWidth > 0).length })").catch(() => null);
    if (state && state.cards > 0 && readable === null) readable = Date.now() - started;
    if (state && state.add) {
      await b.js("document.querySelector('.ox-add').click()").catch(() => undefined);
      await b.until("!!document.querySelector('.cx-bar')", "the order bar", 1200).catch(() => undefined);
      if (await b.js("!!document.querySelector('.cx-bar')")) usable = Date.now() - started;
    }
    await sleep(150);
  }
  await b.shot(`${OUT}/${LANG}-${shop}-slow-phone.png`);
  await b.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await b.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  notes.push(`${shop} on a slow phone (400 kbit/s, 400 ms, processor 4 times slower, ${PERF_BASE ? "production build" : "dev server"}): items readable at ${readable ? (readable / 1000).toFixed(1) + " s" : "never"}, first tap works at ${usable ? (usable / 1000).toFixed(1) + " s" : "never"}`);
  check(readable !== null && readable < 25000, `${shop}: the order page is readable on a slow phone (${readable} ms)`);
  check(usable !== null && usable < 40000, `${shop}: its first tap works on a slow phone (${usable} ms)`);
}

// ── the run ─────────────────────────────────────────────────────────────────────────────
try {
  await setLanguage();
  for (const scheme of SCHEMES) {
    await b.view(375, 812, true, scheme);
    for (const shop of KEYS) {
      log(`── ${shop}, ${scheme}`);
      report.length = 0;
      if (ONLY.has("workspace")) await workspace(shop, scheme);
      if (ONLY.has("order") && SHOPS[shop].orders) await customer(shop, scheme);
      writeFileSync(`${OUT}/${LANG}-${scheme}-${shop}.json`, JSON.stringify(report, null, 2));
    }
  }
  if (ONLY.has("perf")) {
    await b.view(375, 812, true, "light");
    for (const shop of KEYS.filter((k) => SHOPS[k].orders)) await slowPhone(shop);
  }
  const quiet = b.problems.filter((p) => !/Failed to load resource|favicon/.test(p));
  check(quiet.length === 0, `no errors in the browser's console (${quiet.slice(0, 3).join(" | ")})`);
} finally {
  await b.close();
}
for (const n of notes) log("note", n);
if (failures.length) {
  log(`${failures.length} check(s) failed`);
  process.exit(1);
}
log("all checks passed");
