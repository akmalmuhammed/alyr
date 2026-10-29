// Terms and the privacy notice (ALY-167, spec 031) in a real browser at phone width, in English or
// Arabic, light and dark. No packages: scripts/browser-kit.mjs drives headless Edge over the
// DevTools protocol with Node 22's own WebSocket and fetch. Node 22.18 or newer (it reads the
// screens' words straight from the .ts copy files).
//
//   node scripts/terms-browser-check.mjs --lang en --base http://localhost:3147 \
//        --out C:/t/tm/shots --profile C:/t/tm/p-en --port 9393 \
//        --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API (ALYR_SIGNUP_OPEN=true, ALYR_ENV=local so an unsigned caller counts as ALYR
// staff) on a scratch database of its own and the web app pointed at it; never the shared one.
// It signs a new owner up through the real screens and checks:
//   * sign-up: the privacy notice is listed with a tick and a link to read it; "Create my
//     business" stays off until every line is ticked and says why; ticking is per line; creating
//     records the acceptance (the API says so, and the go-live line is done);
//   * a new version: the owner's workspace shows the banner (and nobody else's role would), with
//     what changed; one tap accepts and the banner goes; on the go-live list the terms line
//     offers the same;
//   * the console: /ops/terms lists the versions with the current ones marked, and publishing
//     one from the form makes it current.
// Every screen is checked at 375 px (the sign-up and the banner also at 320): nothing scrolls
// sideways, every target is 44 px, every field has a name; axe finds nothing on the parts this
// change added.
// Short folders: Edge fails quietly with long paths, so keep --profile and --out short.

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch } from "./browser-kit.mjs";
import { COPY as START } from "../apps/web/app/(product)/start/copy.ts";
import { COPY as BANNER } from "../apps/web/app/(product)/_workspace/termsCopy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3147";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const OUT = args.out ?? `${tmpdir()}/tm-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/tm-profile-${LANG}`;
const PORT = Number(args.port ?? (AR ? 9394 : 9393));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const s = START[LANG];
const bn = BANNER[LANG];
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };

const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: 375, height: 812, scheme: "light" });
const visible = "(e => e.getClientRects().length > 0)";
const norm = "(e => e.textContent.replace(/\\s+/g, ' ').trim())";
const primary = "[...document.querySelectorAll('.ob-btn.primary')].filter(" + visible + ")[0]";
const shot = async (name) => { await b.shot(`${OUT}/${LANG}-${b.scheme}-${name}.png`); log("shot", name); };

async function api(path, { method = "GET", body, cookie = "" } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
const sessionCookie = async () => {
  const c = (await b.send("Network.getCookies", { urls: [BASE] })).cookies.find((x) => x.name === "alyr_session");
  return c ? `alyr_session=${c.value}` : "";
};

async function layout(name, scope = ".ob-main") {
  const wide = await b.js(`(() => { const out = []; const w = innerWidth; if (Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > w) out.push('page ' + document.documentElement.scrollWidth + '>' + w); for (const el of document.querySelectorAll(${JSON.stringify(scope)})) if (el.scrollWidth > el.clientWidth + 1) out.push(${JSON.stringify(scope)} + ' ' + el.scrollWidth + '>' + el.clientWidth); return out.join(', '); })()`);
  check(wide === "", `${name}: nothing scrolls sideways at ${await b.js("innerWidth")} px${wide ? " (" + wide + ")" : ""}`);
  if (wide) log("   past the edge:", await b.js(`[...document.querySelectorAll(${JSON.stringify(scope)} + ' *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 6).map(e => e.tagName.toLowerCase() + '.' + String(e.className).slice(0, 28) + ' ' + Math.round(e.getBoundingClientRect().left) + '..' + Math.round(e.getBoundingClientRect().right)).join(' | ')`));
}
async function targets(name, scope) {
  const small = await b.js(`(() => { const out = []; for (const el of new Set(document.querySelectorAll(${JSON.stringify(scope)} + ' button, ' + ${JSON.stringify(scope)} + ' a, ' + ${JSON.stringify(scope)} + ' label'))) { if (!(${visible})(el)) continue; const r = el.getBoundingClientRect(); if (r.height < 43.5 || (r.width < 43.5 && el.tagName !== 'LABEL')) out.push((el.className || el.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); } return out.join(', '); })()`);
  check(small === "", `${name}: every button, link and tick is at least 44 px${small ? " (" + small + ")" : ""}`);
  const unnamed = await b.js(`(() => [...document.querySelectorAll(${JSON.stringify(scope)} + ' input')].filter(${visible}).filter(i => !(i.labels && i.labels.length) && !i.getAttribute('aria-label')).map(i => i.outerHTML.slice(0, 80)).join(' | '))()`);
  check(unnamed === "", `${name}: every field has a name${unnamed ? " (" + unnamed + ")" : ""}`);
}
async function axe(name, scope) {
  if (!AXE) { log("axe skipped: give --axe <path to axe.min.js>"); return; }
  const found = await b.axe(AXE, [scope]);
  check(found !== null && found.filter((v) => v.impact !== "minor").length === 0, `${name}: axe finds no violations (${found?.length ?? "?"} found)`);
  for (const v of found ?? []) for (const n of v.nodes.slice(0, 3)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}
const typeInto = async (find, text) => { await b.click(find); await b.clearFocused(); await b.type(text); await b.sleep(120); };

// ── the real sign-up screens ────────────────────────────────────────────────────────────
async function signUp(scheme) {
  await b.view(375, 812, true, scheme);
  await b.send("Network.clearBrowserCookies");
  const email = `terms-${Date.now().toString(36)}@shop.example`;
  const current = (await api("/api/onboarding/terms/current")).data.current;
  await b.go(`${BASE}/start`, 2500);
  await b.js(`localStorage.setItem('alyr-lang', '${LANG}'); localStorage.setItem('alyr-workspace-lang', '${LANG}'); try { localStorage.removeItem('alyr-onboarding-draft'); } catch (e) {}`);
  await b.go(`${BASE}/start`, 2500);
  await b.until("!!document.querySelector('input[type=email]')", "the email step", 60000);
  await typeInto("document.querySelector('input[type=email]')", email);
  await b.click(primary, 500);
  await b.until("!!document.querySelector('.ob-devcode')", "the dev code", 30000);
  const code = (await b.js("document.querySelector('.ob-devcode').innerText")).match(/\d{6}/)[0];
  await typeInto("document.querySelector('#ob-form input')", code);
  await b.click(primary, 800);
  await b.until("document.querySelectorAll('.ob-tile').length > 0", "the type step", 30000);
  await b.click("document.querySelector('.ob-tile')", 200);
  await b.click(primary, 600);
  await b.until("!!document.querySelector('.ob-terms')", "the terms on the basics step", 30000);
  return { email, current };
}

async function signUpChecks(current) {
  const legend = await b.js("document.querySelector('.ob-terms legend')?.innerText ?? ''");
  check(legend === s.terms.legend, `sign-up: the group is called “${s.terms.legend}”`);
  const rows = await b.js("document.querySelectorAll('.ob-term').length");
  check(rows === current.length && rows >= 1, `sign-up: every current version has a line (${rows} of ${current.length})`);
  const first = current[0];
  const label = await b.js("document.querySelector('.ob-term label')?.innerText.trim() ?? ''");
  const title = AR ? first.title_ar : first.title;
  check(label === s.terms[first.kind](title), `sign-up: the line says “${s.terms[first.kind](title)}”`);
  const href = await b.js("document.querySelector('.ob-term a')?.getAttribute('href') ?? ''");
  check(href === (AR ? first.url_ar : first.url), `sign-up: its link opens the page (${href})`);
  check(await b.js("document.querySelector('.ob-term a')?.target === '_blank' && document.querySelector('.ob-term a').rel.includes('noopener')"), "sign-up: the link opens in a new tab, safely");
  // owner and business name first, as a person would
  await typeInto("document.querySelector('#ob-form .ob-field input')", "Hamad");
  await typeInto("document.querySelectorAll('#ob-form .ob-field input')[1]", `Terms Shop ${Date.now().toString(36).slice(-4)}`);
  check(await b.js(`${primary}.disabled`), "sign-up: Create my business is off until every line is ticked");
  check((await b.js("document.querySelector('.ob-terms [role=status]')?.innerText ?? ''")).includes(s.terms.needed), `sign-up: it says “${s.terms.needed}”`);
  await layout("sign-up"); await targets("sign-up", ".ob-main"); await shot("signup-terms");
  await axe(`sign-up (${b.scheme})`, ".ob-terms");
  await b.view(320, 640, true, b.scheme); await b.sleep(300);
  await layout("sign-up at 320"); await targets("sign-up at 320", ".ob-terms"); await shot("signup-terms-320");
  await b.view(375, 812, true, b.scheme); await b.sleep(300);
  // ticking is per line, and unticking turns it off again
  for (let i = 0; i < rows; i++) await b.click(`document.querySelectorAll('.ob-term label')[${i}]`, 150);
  check(await b.js(`!${primary}.disabled`), "sign-up: ticking every line turns Create on");
  check(await b.js("!document.querySelector('.ob-terms [role=status]')"), "sign-up: and the reminder goes");
  await b.click("document.querySelector('.ob-term label')", 150);
  check(await b.js(`${primary}.disabled`), "sign-up: unticking a line turns Create off again");
  await b.click("document.querySelector('.ob-term label')", 150);
  await b.click(primary, 1500);
  await b.until("!document.querySelector('.ob-terms')", "the business created", 60000);
}

// ── the workspace's banner, and the go-live line ───────────────────────────────────────
const stamp = () => Date.now().toString(36).slice(-6);
async function publish(version, changes) {
  const made = await api("/api/admin/terms", { method: "POST", body: {
    kind: "agreement", version, title: "Customer agreement", title_ar: "اتفاقية العميل", url: "/agreement", url_ar: "/ar/agreement",
    changes, changes_ar: "شروط الدفع أوضح.",
  } });
  check(made.status === 200, `the back office publishes ${version} (${made.status})`);
  return made.data;
}

async function bannerChecks(cookie) {
  const v = `test-${stamp()}`;
  const agreement = await publish(v, "Payment terms are clearer.");
  check((await api("/api/onboarding/terms", { cookie })).data.pending.map((t) => t.kind).join() === "agreement", "banner: the API says the agreement is waiting");
  await b.go(`${BASE}/app`, 2500);
  await b.until("!!document.querySelector('.tm-banner')", "the banner", 60000);
  const text = await b.js("document.querySelector('.tm-banner').innerText");
  check(text.includes(bn.title) && text.includes(bn.agreement(AR ? agreement.title_ar : agreement.title)), `banner: it asks “${bn.title}” and names the agreement`);
  check(text.includes(bn.changed(AR ? "شروط الدفع أوضح." : "Payment terms are clearer.")), "banner: and says what changed");
  check(await b.js("document.querySelector('.tm-banner a').getAttribute('href') === " + JSON.stringify(AR ? "/ar/agreement" : "/agreement")), "banner: it links to the page");
  await layout("banner", ".tm-banner"); await targets("banner", ".tm-banner"); await shot("banner");
  await axe(`banner (${b.scheme})`, ".tm-banner");
  await b.view(320, 640, true, b.scheme); await b.sleep(300);
  await layout("banner at 320", ".tm-banner"); await targets("banner at 320", ".tm-banner"); await shot("banner-320");
  await b.view(375, 812, true, b.scheme); await b.sleep(300);
  await b.click("document.querySelector('.tm-accept')", 600);
  await b.until("!document.querySelector('.tm-banner')", "the banner gone", 30000);
  check((await api("/api/onboarding/terms", { cookie })).data.pending.length === 0, "banner: one tap accepted it, and nothing is waiting");

  // a second new version, while the owner is on the go-live list
  const next = `test-${stamp()}b`;
  await publish(next, "");
  await api("/api/onboarding/state", { method: "PATCH", body: { step: "golive" }, cookie });
  await b.go(`${BASE}/start`, 2500);
  await b.until("!!document.querySelector('.ob-check-more.ob-terms')", "the terms on the go-live list", 60000);
  const done = await b.js("[...document.querySelectorAll('.ob-check')].find(e => e.querySelector('.ob-check-more.ob-terms'))?.classList.contains('done')");
  check(done === false, "go-live: the terms line is open");
  await layout("go-live"); await targets("go-live", ".ob-check-more.ob-terms"); await shot("golive-terms");
  await b.click(`[...document.querySelectorAll('.ob-check-more.ob-terms button')].find(e => ${norm}(e) === ${JSON.stringify(s.terms.accept)})`, 800);
  await b.until("!document.querySelector('.ob-check-more.ob-terms')", "the terms line done", 30000);
  check((await api("/api/onboarding/readiness", { cookie })).data.checks.find((c) => c.key === "terms").status === "done", "go-live: accepting there makes the line done");
}

// ── the back office ──────────────────────────────────────────────────────────────────────
async function consoleChecks() {
  await b.send("Network.clearBrowserCookies");
  await b.go(`${BASE}/ops/terms`, 2500);
  await b.until("document.querySelectorAll('.ops-lines tbody tr').length > 0", "the versions list", 60000);
  const rows = await b.js("[...document.querySelectorAll('.ops-lines tbody tr')].map(r => r.innerText.replace(/\\s+/g, ' ')).join(' || ')");
  check(/Privacy notice/.test(rows) && /2026-10-28/.test(rows) && /Customer agreement/.test(rows), "console: the privacy notice and the published agreements are listed");
  check(/Current/.test(rows) && /Replaced/.test(rows), "console: the current versions are marked, and the replaced ones");
  const version = `test-${stamp()}c`;
  const fill = (n, text) => typeInto(`document.querySelectorAll('.ops-form .ops-field input')[${n}]`, text);
  await fill(0, version); await fill(1, "Customer agreement"); await fill(2, "اتفاقية العميل");
  await fill(3, "/agreement"); await fill(4, "/ar/agreement"); await fill(5, "Clearer payment terms.");
  await b.click("document.querySelector('.ops-form button[type=submit]')", 1200);
  await b.until("!!document.querySelector('.ops-ok')", "the published message", 30000);
  check((await b.js("document.querySelector('.ops-lines tbody').innerText")).includes(version), "console: the new version is in the list");
  check((await api("/api/onboarding/terms/current")).data.current.find((t) => t.kind === "agreement").version === version, "console: it is now the current agreement for a new sign-up");
  await shot("console-terms");
}

try {
  for (const scheme of ["light", "dark"]) {
    log(`── ${scheme}`);
    const { current } = await signUp(scheme);
    await signUpChecks(current);
    const cookie = await sessionCookie();
    check((await api("/api/onboarding/terms", { cookie })).data.pending.length === 0, "sign-up: the acceptance was recorded (nothing is waiting)");
    check((await api("/api/onboarding/readiness", { cookie })).data.checks.find((c) => c.key === "terms").status === "done", "sign-up: the go-live list has the terms line done");
    await bannerChecks(cookie);
  }
  await b.view(375, 812, true, "light");
  await consoleChecks();
  check(b.problems.length === 0, `no console errors or exceptions${b.problems.length ? ": " + b.problems.slice(0, 5).join(" || ") : ""}`);
} catch (error) {
  failures.push(String(error.message ?? error));
  log("STOPPED", error.stack ?? error);
} finally {
  await b.close();
}
if (failures.length) { console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`); process.exit(1); }
log("all checks passed");
