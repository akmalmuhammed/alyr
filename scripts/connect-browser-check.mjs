// Runs the connection screen (ALY-142) in a real browser at phone width, English and Arabic,
// light and dark, and on a laptop; takes screenshots; scans every state with axe-core. No
// packages: Node 22's WebSocket and fetch and headless Edge over the DevTools protocol
// (scripts/browser-kit.mjs). Use your own profile folder, a random high port, short paths.
//
//   node scripts/connect-browser-check.mjs --base http://localhost:3142 --api http://127.0.0.1:8142 \
//        --out C:/t142/shots --profile C:/t142/p --port 9442 --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// Needs a dev API (started with ALYR_WEBHOOK_ALLOW_LOCAL=true) on a scratch database whose open
// demo shop has the `documents` module on, and the web app in front of it. The script makes its
// own terms, key, switch, webhook address and import through the API first (never the shared
// database). It exits with an error if a check fails.

import { mkdirSync } from "node:fs";
import { launch, sleep } from "./browser-kit.mjs";
import { CC } from "../apps/web/app/(product)/_workspace/connectCopy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3142";
const API = args.api ?? "http://127.0.0.1:8142";
const OUT = args.out ?? "C:/t142/shots";
const PROFILE = args.profile ?? "C:/t142/p";
const PORT = Number(args.port ?? 9442);
const AXE = args.axe ?? "";
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
mkdirSync(OUT, { recursive: true });

const failures = [];
const check = (ok, what) => { if (!ok) { failures.push(what); console.log(`  FAIL  ${what}`); } else console.log(`  ok    ${what}`); };

async function call(path, method = "GET", body) {
  const response = await fetch(`${API}${path}`, { method, headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : {}, text };
}

// ── make the shop's side of it through the API ──────────────────────────────────────────
const SALES = [
  "sale_id,document_number,date,phone,name,description,sku,quantity,unit_price,payment_method,total",
  "S-1,R-1,2026-10-18,+974 5555 0101,Maha,Bread,BR-01,12,3.50,cash,87.00",
  "S-1,,,,,Date cake,CK-02,1,45.00,,",
  "S-2,R-2,2026-10-18,+974 5555 0102,Noor,Coffee,CF-01,2,12.00,card,24.00",
  "S-3,R-3,2026-10-19,0555,Dana,Tea,T-1,1,5.00,barter,",
].join("\n");

async function prepare() {
  // A clean start, so a second run finds the shop as the first did: no keys, no addresses, no
  // import (an import that was never sent is taken back; the documents stay on record).
  const before = (await call("/api/connect-setup/overview")).json;
  for (const k of before.keys ?? []) if (k.active) await call(`/api/connect-setup/keys/${k.id}/revoke`, "POST", {});
  for (const h of before.webhooks ?? []) await call(`/api/connect-setup/webhooks/${h.id}`, "DELETE");
  while ((await call("/api/connect-setup/imports/undo", "POST", {})).status === 200) { /* until none is left */ }
  await call("/api/connect-setup/terms/accept", "POST", {});
  const key = await call("/api/connect-setup/keys", "POST", { name: "Till 1", scopes: ["sales:write", "documents:read"], rate_limit_per_minute: 120 });
  check(key.status === 201, "a key is made");
  await call("/api/connect-setup/authority", "PUT", { changes: { receipt: "external" } });
  const hook = await call("/api/connect-setup/webhooks", "POST", { url: "http://127.0.0.1:9/alyr", events: ["document.issued", "document.failed"], name: "POS webhooks" });
  check(hook.status === 201, "a webhook address is added");
  await call("/api/connect-setup/webhooks", "POST", { url: "http://127.0.0.1:9/accounts", events: ["payment.recorded"], name: "" });
  const good = SALES.split("\n").filter((l) => !l.startsWith("S-3")).join("\n");
  const up = await fetch(`${API}/api/connect-setup/imports?filename=week.csv`, { method: "POST", body: good });
  const preview = await up.json();
  const applied = await call(`/api/connect-setup/imports/${preview.id}/apply`, "POST", { preview: preview.hash });
  check(applied.status === 200, `an import is applied (${applied.status})`);
}

// ── the browser ─────────────────────────────────────────────────────────────────────────
function visit(lang, scheme, width, height) {
  return { lang, scheme, width, height, tag: `${lang}-${scheme}-${width}` };
}

async function scanAndShoot(b, v, name, scope = null) {
  const file = `${OUT}/${v.tag}-${name}.png`;
  await b.shot(file);
  const sideways = await b.js("document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('.sh-scroll, .ct-sheet-body, .cn')].some((e) => e.scrollWidth > e.clientWidth + 1)");
  check(!sideways, `${v.tag} ${name}: nothing scrolls sideways`);
  const small = await b.js(`[...document.querySelectorAll('${scope ?? ".cn"} button, ${scope ?? ".cn"} a.btn, ${scope ?? ".cn"} select, ${scope ?? ".cn"} input:not([type=checkbox]):not([type=file])')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5 && e.getAttribute('role') !== 'switch' && getComputedStyle(e).visibility !== 'hidden'; }).map((e) => e.outerHTML.slice(0, 80))`);
  check(small.length === 0, `${v.tag} ${name}: every control is 44 px tall${small.length ? ` (${small.slice(0, 2)})` : ""}`);
  const found = await b.axe(AXE, [scope ?? ".cn"]);
  if (found) check(found.length === 0, `${v.tag} ${name}: axe finds nothing${found.length ? ` ${JSON.stringify(found.map((x) => [x.id, x.nodes[0]?.target]))}` : ""}`);
}

async function scrollTo(b, y) {
  await b.js(`(() => { const s = document.querySelector('.sh-scroll'); if (s) s.scrollTop = ${y}; })()`);
  await sleep(250);
}

async function run(b, v) {
  const c = CC[v.lang];
  console.log(`\n${v.tag}`);
  await b.view(v.width, v.height, v.width < 700, v.scheme);
  await b.go(`${BASE}/app`, 300);
  await b.js(`localStorage.setItem('alyr-workspace-lang', '${v.lang}'); localStorage.setItem('alyr-theme', '${v.scheme}')`);
  await b.go(`${BASE}/app/connections`, 900);
  await b.until("!!document.querySelector('.cn-link')", "the entry on the Connections screen");
  await scanAndShoot(b, v, "entry", ".cn-link");
  await b.click("document.querySelector('.cn-link')", 900);
  await b.until("!!document.querySelector('.cn h1')", "the connection screen");
  check(await b.js("document.querySelector('.sh').getAttribute('dir')") === (v.lang === "ar" ? "rtl" : "ltr"), `${v.tag}: direction`);
  check((await b.js("document.querySelector('.cn h1').textContent")) === c.title, `${v.tag}: the title is in the screen's language`);
  check(await b.js("document.querySelector('.sh-crumbs b').textContent") !== "Products" , `${v.tag}: the breadcrumb names Connections`);
  await b.until("document.querySelectorAll('.cn-card').length >= 5", "the cards");
  await scanAndShoot(b, v, "top");
  await scrollTo(b, 900);
  await scanAndShoot(b, v, "middle");
  await scrollTo(b, 1900);
  await scanAndShoot(b, v, "lower");
  await scrollTo(b, 99999);
  await scanAndShoot(b, v, "foot");
  await scrollTo(b, 0);

  // numbering: the question before it changes
  await b.click("document.querySelectorAll('.cn-card')[1].querySelectorAll('button[role=switch]')[1]", 500);
  await b.until("!!document.querySelector('.ct-sheet')", "the numbering question");
  await scanAndShoot(b, v, "numbering-question", ".ct-sheet");
  await b.click("[...document.querySelectorAll('.ct-sheet-foot button')].pop()", 400);

  // a key: the form, then the secret shown once
  await b.click("[...document.querySelectorAll('.cn-card')[2].querySelectorAll('.ct-actions button')].pop()", 500);
  await b.until("!!document.querySelector('.ct-sheet input')", "the key form");
  await scanAndShoot(b, v, "key-form", ".ct-sheet");
  await b.js("(() => { const i = document.querySelector('.ct-sheet input'); i.focus(); })()");
  await b.type(`Counter ${v.tag}`);
  await b.click("document.querySelector('.ct-sheet-foot .primary')", 900);
  await b.until("!!document.querySelector('.cn-secret-box')", "the secret");
  const secret = await b.js("document.querySelector('.cn-secret-box').value");
  check(/^alyr_k1_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/.test(secret), `${v.tag}: the key is shown once`);
  await scanAndShoot(b, v, "key-secret", ".ct-sheet");
  await b.click("document.querySelector('.ct-sheet-foot .primary')", 500);
  await b.until("!document.querySelector('.ct-sheet')", "the sheet closes");
  const listing = await call("/api/connect-setup/overview");
  check(!JSON.stringify(listing.json).includes(secret), `${v.tag}: the list never shows the key again`);

  // a webhook: the log
  await scrollTo(b, 700);
  await b.click("document.querySelectorAll('.cn-card')[3].querySelector('.cn-row .btn')", 700);
  await b.until("!!document.querySelector('.ct-sheet .cn-log, .ct-sheet .cn-empty')", "the log");
  await scanAndShoot(b, v, "webhook", ".ct-sheet");
  await b.click("document.querySelector('.ct-sheet-foot .btn')", 400);

  // add a webhook address and refuse a private one with words
  await b.click("[...document.querySelectorAll('.cn-card')[3].querySelectorAll('.ct-actions button')].pop()", 500);
  await b.until("!!document.querySelector('.ct-sheet input')", "the address form");
  await b.js("(() => { const i = document.querySelector('.ct-sheet input'); i.focus(); i.select(); })()");
  await b.type("ftp://pos.example.com/hook");
  await b.click("document.querySelector('.ct-sheet-foot .primary')", 900);
  await b.until("!!document.querySelector('.ct-sheet .ct-error')", "the refusal");
  const said = await b.js("document.querySelector('.ct-sheet .ct-error').textContent");
  check(said.length > 20 && (v.lang === "ar" ? /[؀-ۿ]/.test(said) : /https/.test(said)), `${v.tag}: a private address is refused in words (${said.slice(0, 50)})`);
  await scanAndShoot(b, v, "webhook-refused", ".ct-sheet");
  await b.click("[...document.querySelectorAll('.ct-sheet-foot button')].pop()", 400);

  // the import: upload a file with a bad row, see the problems with their rows
  await scrollTo(b, 1300);
  await b.js(`(() => { const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(SALES.replaceAll("S-", "T-").replaceAll("R-", "R-1"))}], 'friday.csv', { type: 'text/csv' })); const input = document.querySelector('input[type=file]'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await b.until("!!document.querySelector('.ct-sheet .cn-problems')", "the preview with problems", 30000);
  const rowsSaid = await b.js("[...document.querySelectorAll('.cn-problems .cn-row b')].map((e) => e.textContent)");
  check(rowsSaid.length >= 1 && rowsSaid.every((t) => /\d/.test(t)), `${v.tag}: each problem names its row (${rowsSaid.slice(0, 2)})`);
  const applyOff = await b.js("document.querySelector('.ct-sheet-foot .primary').disabled");
  check(applyOff === true, `${v.tag}: a file with a problem cannot be applied`);
  await scanAndShoot(b, v, "import-preview", ".ct-sheet");
  await b.js("document.querySelector('.ct-sheet-body').scrollTop = 99999");
  await sleep(300);
  await scanAndShoot(b, v, "import-preview-lower", ".ct-sheet");
  await b.click("[...document.querySelectorAll('.ct-sheet-foot button')].pop()", 800);
  await b.until("!document.querySelector('.ct-sheet')", "the preview closes");

  // undo
  await scrollTo(b, 1300);
  await b.click("[...document.querySelectorAll('.cn-card')[4].querySelectorAll('.ct-actions button')].pop()", 500);
  await b.until("!!document.querySelector('.ct-sheet .cn-sheet-text')", "the undo question");
  await scanAndShoot(b, v, "undo-question", ".ct-sheet");
  await b.click("[...document.querySelectorAll('.ct-sheet-foot button')].pop()", 400);
  check(b.problems.length === 0, `${v.tag}: no errors in the console (${b.problems.slice(0, 2).join(" | ")})`);
}

async function main() {
  await prepare();
  const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE });
  try {
    const only = args.only ? String(args.only).split(",") : null;
    const visits = [visit("en", "light", 375, 812), visit("ar", "light", 375, 812), visit("en", "dark", 375, 812), visit("ar", "dark", 375, 812), visit("en", "light", 1280, 900)];
    for (const v of visits) {
      if (only && !only.includes(v.tag)) continue;
      b.problems.length = 0;
      try { await run(b, v); } catch (error) { failures.push(`${v.tag}: ${error.message}`); console.log(`  ERROR ${v.tag}: ${error.message}`); await b.shot(`${OUT}/${v.tag}-error.png`).catch(() => undefined); }
    }
  } finally {
    await b.close();
  }
  console.log(failures.length ? `\n${failures.length} problem(s):\n${failures.join("\n")}` : "\nAll checks passed.");
  process.exit(failures.length ? 1 : 0);
}

main();
