// Runs the Team screen's "Your WhatsApp" card in a real browser at phone width, in English or
// Arabic, light or dark, and takes screenshots (ALY-131). No packages: Node 22's built-in
// WebSocket and fetch, and headless Edge or Chrome driven over the DevTools protocol.
//
//   node scripts/whatsapp-link-browser-check.mjs --lang en --base http://localhost:3181 \
//        --out C:/t/wl/shots --profile C:/t/wl/profile-en --port 9381
//
// It needs a dev API (local mode, ALYR_JOBS_INLINE=true, a database of its own, never the
// shared alyr one) and a web app that proxies to it (`ALYR_API_URL=... next dev -p 3181`),
// with the demo shop seeded (python -m alyr.seed) and the owner and agent not yet linked.
// What it does: signs in as the demo owner, opens Team, gets a code and checks the exact
// message and the countdown, sends the message from a simulated phone, sees the card turn to
// linked with the last four digits, picks each place to work (and reads each back from the
// API), unlinks with the confirm step, lets a code run out, then signs in as the agent and
// checks the agent's list of commands has no OWED and no amounts. It also checks nothing
// scrolls sideways at 375 px, light and dark, and looks at a laptop. Exits with an error if
// anything is wrong.
//
// Short folders: Edge fails quietly with long paths, so keep --profile and --out short.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { COPY, commandsFor } from "../apps/web/app/(product)/_workspace/whatsappCopy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3181";
const LANG = args.lang === "ar" ? "ar" : "en";
const OUT = args.out ?? `${tmpdir()}/wl-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/wl-profile-${LANG}`;
const PORT = Number(args.port ?? (LANG === "ar" ? 9382 : 9381));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OWNER = "fatima@alnoor.example";
const AGENT = "yusuf@alnoor.example";
const t = COPY[LANG];
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await send("Page.enable"); await send("Runtime.enable");
  return { send, on, problems, close: async () => { try { await send("Browser.close"); } catch { /* gone */ } ws.close(); proc.kill(); } };
}

const browser = await launch();
const { send } = browser;
const failures = [];
const log = (...m) => console.log(`[${LANG}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };

async function setup(scheme, width = 375, height = 812) {
  const phone = width < 600;
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: phone });
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
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(`${OUT}/${LANG}-${name}.png`, Buffer.from(r.data, "base64"));
  log("shot", name);
}
const norm = "(e => e.textContent.replace(/\\s+/g, ' ').trim())";
const visible = "(e => e.getClientRects().length > 0)";
async function click(find, wait = 250) {
  const probe = `(() => { const el = (${find}); if (!el) return null; const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const top = document.elementFromPoint(cx, cy); const v = visualViewport; return { hit: !!top && (el === top || el.contains(top) || top.contains(el)), x: (cx - v.offsetLeft) * v.scale, y: (cy - v.offsetTop) * v.scale, h: r.height, cover: top ? top.tagName + '.' + String(top.className).slice(0, 40) : null }; })()`;
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
  return last;
}
const wa = "document.querySelector('.wa')";
const pressText = (text, wait) => click(`[...${wa}.querySelectorAll('button')].filter(${visible}).find(e => ${norm}(e) === ${JSON.stringify(text)})`, wait);
const waText = () => js(`${wa} ? ${norm}(${wa}) : ''`);
const sideways = () => js("document.documentElement.scrollWidth - document.documentElement.clientWidth");

// The API is asked through the page's own origin, so it carries the sign-in cookie.
const page = (method, path, body) => js(`fetch(${JSON.stringify(path)}, { method: ${JSON.stringify(method)}, headers: {'content-type':'application/json'}, ${body ? `body: JSON.stringify(${JSON.stringify(body)}),` : ""} cache: 'no-store' }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }))`);
async function signIn(email) {
  await go("/login", 300);
  const sent = await page("POST", "/api/auth/code", { email });
  const done = await page("POST", "/api/auth/verify", { email, code: sent.body.dev_code });
  if (done.status !== 200) throw new Error(`sign-in failed for ${email}: ${done.status}`);
}
async function openTeam() {
  await go("/app/team", 1200);
  await until(`!!${wa}`, "the WhatsApp card");
  if (LANG === "ar") {
    if (await js("document.querySelector('.sh').dir") !== "rtl") {
      // On a laptop the language button is in the sidebar; on a phone it is in the palette.
      if (await js("innerWidth >= 900")) await click("document.querySelector('.sh-lang')", 600);
      else {
        await click("document.querySelector('.sh-mtop [aria-label=\"Search or jump to\"]')", 300);
        await click("[...document.querySelectorAll('.sh-palette button[role=option]')].find(b => /Switch to Arabic/.test(b.textContent))", 600);
      }
    }
    await until("document.querySelector('.sh').dir === 'rtl'", "Arabic");
  }
  await sleep(500);
}
async function phoneSends(from, text) {
  const r = await fetch(`${BASE}/sim/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from_number: from, text }) });
  return r.json();
}

try {
  await setup("light");
  await signIn(OWNER);
  const before = await page("GET", "/api/owner/whatsapp");
  check(before.status === 200 && before.body.linked === false, "the owner starts unlinked");

  // ── unlinked ──
  await openTeam();
  check((await waText()).includes(t.linkTitle) && (await waText()).includes(t.getCode), "the Link card shows a Get a code button");
  check(!/coming|soon|beta|قريباً/i.test(await waText()), "no coming-soon label");
  check(await sideways() <= 0, "nothing scrolls sideways (unlinked)");
  check((await js(`getComputedStyle(${wa}).direction`)) === (LANG === "ar" ? "rtl" : "ltr"), "reading direction follows the language");
  await shot("1-unlinked");

  // ── a code ──
  const press = await pressText(t.getCode, 500);
  check(press.h >= 44, `the Get a code button is ${Math.round(press.h)} px tall`);
  await until(`!!${wa}.querySelector('.wa-msg')`, "the code");
  const message = await js(`${wa}.querySelector('.wa-msg').textContent`);
  check(/^LINK \d{8}$/.test(message), `the exact message is shown (${message.replace(/\d/g, "#")})`);
  const timer = await js(`${wa}.querySelector('[role=timer]').textContent`);
  check(/^(10:00|9:5\d)$/.test(timer), `the countdown starts at ten minutes (${timer})`);
  check((await js(`getComputedStyle(${wa}.querySelector('.wa-msg')).direction`)) === "ltr", "the message stays left to right");
  await sleep(2200);
  const later = await js(`${wa}.querySelector('[role=timer]').textContent`);
  check(later !== timer, `the countdown moves (${timer} to ${later})`);
  check(await sideways() <= 0, "nothing scrolls sideways (with a code)");
  await shot("2-code");

  // ── the phone sends it ──
  const phone = "+97455512345";
  await phoneSends(phone, message);
  await until(`!!${wa}.querySelector(".wa-number")`, "the linked state", 15000);
  const linkedText = await waText();
  check(linkedText.includes("2345") && !linkedText.includes("5512345"), "linked: only the last four digits show");
  check(linkedText.includes(t.justLinked), "linked: the card says so");
  check(linkedText.includes(t.unlink), "linked: an Unlink button");
  const status = await page("GET", "/api/owner/whatsapp");
  check(status.body.linked && status.body.number_ends === "2345", "the API agrees");
  await shot("3-linked");

  // ── where you work ──
  for (const [pref, name] of [["whatsapp", t.workOptions.whatsapp.name], ["portal", t.workOptions.portal.name], ["both", t.workOptions.both.name]]) {
    const hit = await click(`[...${wa}.querySelectorAll('[role=radio]')].find(e => ${norm}(e).startsWith(${JSON.stringify(name)}))`, 500);
    check(hit.h >= 44, `${pref} choice is ${Math.round(hit.h)} px tall`);
    const now = await page("GET", "/api/owner/whatsapp");
    check(now.body.preference === pref, `choosing "${pref}" is saved (API says ${now.body.preference})`);
    check((await js(`${wa}.querySelector('[role=radio][aria-checked=true]').textContent`)).includes(name), `${pref} shows as chosen`);
  }

  // ── the commands for an owner ──
  const owner = await page("GET", "/api/auth/me");
  const modules = (await page("GET", "/api/workspace")).body?.modules ?? [];
  const shown = await js(`[...${wa}.querySelectorAll('.wa-cmds code:not([lang=ar])')].map(e => e.textContent)`);
  check(JSON.stringify(shown) === JSON.stringify(commandsFor("owner", modules).map((c) => c.toUpperCase())), `owner sees ${shown.join(", ")}`);
  check(shown.includes("OWED") || !modules.includes("ledger"), "owner can send OWED when the ledger is on");

  // ── dark, and a laptop ──
  await setup("dark");
  await sleep(400);
  await shot("4-linked-dark");
  check(await sideways() <= 0, "nothing scrolls sideways (dark)");
  await setup("light", 1280, 900);
  await sleep(500);
  await shot("5-laptop");
  await setup("dark", 1280, 900);
  await sleep(400);
  await shot("6-laptop-dark");
  await setup("light");
  await sleep(400);

  // ── unlink, with the confirm step ──
  await pressText(t.unlink, 300);
  check((await waText()).includes(t.unlinkAsk), "unlink asks first");
  await shot("7-unlink-ask");
  await pressText(t.keepLinked, 300);
  check((await page("GET", "/api/owner/whatsapp")).body.linked === true, "keeping it leaves it linked");
  await pressText(t.unlink, 300);
  await pressText(t.unlinkYes, 600);
  check((await page("GET", "/api/owner/whatsapp")).body.linked === false, "unlinking works");
  check((await waText()).includes(t.unlinked) && (await waText()).includes(t.getCode), "after unlinking the card offers a code again");

  // ── a code that runs out ──
  await pressText(t.getCode, 500);
  await until(`!!${wa}.querySelector('.wa-msg')`, "a second code");
  await js("(() => { const real = Date.now; Date.now = () => real() + 601000; })()");
  await until(`${wa}.textContent.includes(${JSON.stringify(t.expired)})`, "the expiry");
  check((await waText()).includes(t.newCode), "an expired code offers a new one");
  check(await js(`${wa}.querySelector('.wa-msgrow button').disabled`), "an expired code cannot be copied");
  await shot("8-expired");
  await js("location.reload()");

  // ── an agent ──
  await signIn(AGENT);
  await openTeam();
  const agentShown = await js(`[...${wa}.querySelectorAll('.wa-cmds code:not([lang=ar])')].map(e => e.textContent)`);
  check(!agentShown.includes("OWED"), `an agent is not offered OWED (${agentShown.join(", ")})`);
  check(JSON.stringify(agentShown) === JSON.stringify(commandsFor("agent", modules).map((c) => c.toUpperCase())), "an agent's list matches the permission table");
  check(!!t.commandNotes.today && (await waText()).includes(t.commandNotes.today.agent), "an agent's list says there are no amounts");
  check(await sideways() <= 0, "nothing scrolls sideways (agent)");
  await shot("9-agent");

  // ── not signed in ──
  await page("POST", "/api/auth/logout");
  await go("/app/team", 800);
  check(!(await js("!!document.querySelector('.wa-msg')")), "no code is shown when signed out");
} catch (error) {
  failures.push(String(error.message ?? error));
  log("ERROR", error.message ?? error);
  try { await shot("error"); } catch { /* nothing to show */ }
}

const noise = browser.problems.filter((p) => !/favicon|Failed to load resource|hydrat/i.test(p));
check(noise.length === 0, `no errors in the console${noise.length ? `: ${noise.slice(0, 3).join(" | ")}` : ""}`);
await browser.close();
if (failures.length) { console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`\n[${LANG}] all checks passed. Screenshots in ${OUT}`);
