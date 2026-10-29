// The reminder to finish setting up (ALY-171, spec 032): the page its stop link opens, the language
// the owner is written to, and what the back office's funnel shows, in a real browser at phone
// width, in English or Arabic, light and dark. No packages: scripts/browser-kit.mjs drives
// headless Edge over the DevTools protocol; Node 22.18 or newer (it reads the screens' words from
// the .ts copy file).
//
//   node scripts/resume-browser-check.mjs --lang en --base http://localhost:3147 \
//        --out C:/t/rs/shots --profile C:/t/rs/p-en --port 9395 \
//        --api-container alyr-ob-api --db-container alyr-bookings-pg --db alyr_obcheck \
//        --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API (ALYR_SIGNUP_OPEN=true, ALYR_ENV=local, ALYR_PUBLIC_WEB_URL set to --base)
// running in a Docker container (--api-container, to make the signed stop link the way an email's
// is made) on a scratch database in a PostgreSQL container (--db-container, --db), and the web
// app pointed at it; never the shared database. For a new owner it checks:
//   * the stop link opens a page that says the reminders are off, switches them off (the database
//     says so), and offers to open the setup; a tampered link says it does not work;
//   * the language of the sign-up screen is the language ALYR has on record, and a switch
//     afterwards follows;
//   * the back office's funnel line counts the reminders that went and the owners who came back.
// 375 px and 320 px, 44 px targets, nothing scrolls sideways, axe clean.
// Short folders: Edge fails quietly with long paths, so keep --profile and --out short.

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch } from "./browser-kit.mjs";
import { COPY as START } from "../apps/web/app/(product)/start/copy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3147";
const LANG = args.lang === "ar" ? "ar" : "en";
const OUT = args.out ?? `${tmpdir()}/rs-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/rs-profile-${LANG}`;
const PORT = Number(args.port ?? (LANG === "ar" ? 9396 : 9395));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const API_CONTAINER = args["api-container"] ?? "alyr-ob-api";
const DB_CONTAINER = args["db-container"] ?? "alyr-bookings-pg";
const DB = args.db ?? "alyr_obcheck";
const s = START[LANG];
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };

const sql = (text) => execFileSync("docker", ["exec", DB_CONTAINER, "psql", "-U", "alyr", "-d", DB, "-tAc", text], { encoding: "utf8" }).trim();
const stopLink = (slug, tenant) => execFileSync("docker", ["exec", API_CONTAINER, "uv", "run", "python", "-c",
  `from uuid import UUID; from alyr.core import links; print(links.resume_stop_url('${BASE}', '${slug}', UUID('${tenant}')))`], { encoding: "utf8" }).trim().split("\n").pop();

const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: 375, height: 812, scheme: "light" });
const visible = "(e => e.getClientRects().length > 0)";
const shot = async (name) => { await b.shot(`${OUT}/${LANG}-${b.scheme}-${name}.png`); log("shot", name); };

async function api(path, { method = "GET", body, cookie = "" } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})), cookie: response.headers.getSetCookie?.().map((c) => c.split(";")[0]).find((c) => c.startsWith("alyr_session=")) ?? "" };
}
async function signUp(tag) {
  const email = `owner-${tag}-${Date.now().toString(36)}@shop.example`;
  const code = (await api("/api/onboarding/code", { method: "POST", body: { email } })).data.dev_code;
  const verified = await api("/api/onboarding/verify", { method: "POST", body: { email, code } });
  const accepted_terms = (await api("/api/onboarding/terms/current")).data.current.map((t) => t.id);
  const made = await api("/api/onboarding/business", { method: "POST", body: {
    signup_token: verified.data.signup_token, owner_name: "Hamad", name: `Resume ${Date.now().toString(36).slice(-4)}`,
    name_ar: "الدوحة", type: "salon", area: "Al Sadd", accepted_terms, lang: LANG,
  } });
  if (made.status !== 200) throw new Error(`could not create a business: ${made.status} ${JSON.stringify(made.data)}`);
  await b.send("Network.clearBrowserCookies");
  await b.send("Network.setCookie", { name: "alyr_session", value: made.cookie.split("=")[1], url: BASE });
  const state = (await api("/api/onboarding/state", { cookie: made.cookie })).data;
  return { cookie: made.cookie, slug: state.business.slug, tenant: sql(`select id from tenants where slug = '${state.business.slug}'`), state };
}

async function layout(name) {
  const wide = await b.js("(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth ? document.documentElement.scrollWidth + '>' + innerWidth : '')()");
  check(wide === "", `${name}: nothing scrolls sideways at ${await b.js("innerWidth")} px${wide ? " (" + wide + ")" : ""}`);
}
async function targets(name) {
  const small = await b.js(`(() => [...document.querySelectorAll('main a, main button')].filter(${visible}).filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map(e => (e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)).join(', '))()`);
  check(small === "", `${name}: every button and link is at least 44 px${small ? " (" + small + ")" : ""}`);
}
async function axe(name) {
  if (!AXE) { log("axe skipped: give --axe <path to axe.min.js>"); return; }
  const found = await b.axe(AXE);
  check(found !== null && found.filter((v) => v.impact !== "minor").length === 0, `${name}: axe finds no violations (${found?.length ?? "?"} found)`);
  for (const v of found ?? []) for (const n of v.nodes.slice(0, 3)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}

try {
  for (const scheme of ["light", "dark"]) {
    log(`── ${scheme}`);
    await b.view(375, 812, true, scheme);
    const { cookie, slug, tenant, state } = await signUp(scheme);
    check(state.lang === LANG, `the sign-up screen's language is on record (${state.lang})`);
    check(sql(`select resume_reminders from tenants where id = '${tenant}'`) === "t", "reminders start on");

    // the link in the email
    const link = stopLink(slug, tenant);
    check(link.includes(`/start/stop?b=${slug}&t=`) && !/@/.test(link), "the stop link names the business and carries a signed token, no address");
    await b.go(`${BASE}/start`, 800);
    await b.js(`localStorage.setItem('alyr-lang', '${LANG}')`);
    await b.go(link, 1500);
    await b.until("!!document.querySelector('main h1')", "the page says it is done", 60000);
    check((await b.js("document.querySelector('main h1').innerText")) === s.resumeStop.title, `stop: the page says “${s.resumeStop.title}”`);
    check((await b.js("document.querySelector('main .ob-sub').innerText")) === s.resumeStop.body, "stop: and that setup can still be finished");
    check(sql(`select resume_reminders from tenants where id = '${tenant}'`) === "f", "stop: the reminders are off in the database");
    check(await b.js("document.querySelector('main a.ob-btn')?.getAttribute('href') === '/start'"), "stop: it offers to open the setup");
    check(!/@/.test(await b.js("location.href")) , "stop: no address in the page's own URL");
    await layout("stop"); await targets("stop"); await shot("stop");
    await axe(`stop (${scheme})`);
    await b.view(320, 640, true, scheme); await b.sleep(300);
    await layout("stop at 320"); await targets("stop at 320"); await shot("stop-320");
    await b.view(375, 812, true, scheme); await b.sleep(300);

    // a link that has been tampered with does nothing
    const bad = link.slice(0, -3) + "AAA";
    await b.go(bad, 1500);
    await b.until("!!document.querySelector('main [role=alert]')", "the failure message", 60000);
    check((await b.js("document.querySelector('main [role=alert]').innerText")) === s.resumeStop.failed, "stop: a tampered link says it does not work");
    await shot("stop-failed");

    // the language on record follows the screen
    const other = LANG === "ar" ? "en" : "ar";
    await b.js(`localStorage.setItem('alyr-lang', '${other}')`);
    await b.go(`${BASE}/start`, 2500);
    await b.until(`document.documentElement.lang === '${other}' || !!document.querySelector('.ob[lang=${other}]')`, "the screen in the other language", 60000);
    await b.until(`true`, "settled");
    await b.sleep(1500);
    check((await api("/api/onboarding/state", { cookie })).data.lang === other, `the record follows a switch to ${other}`);
    await b.js(`localStorage.setItem('alyr-lang', '${LANG}')`);

    // the back office: reminders that went, and an owner who came back
    await api("/api/onboarding/readiness", { cookie });
    sql(`insert into onboarding_reminders (tenant_id, number, step, lang, sent_at) values ('${tenant}', 1, 'services', '${LANG}', now() - interval '1 hour')`);
    await api("/api/onboarding/state", { cookie });
    check(sql(`select count(*) from onboarding_reminders where tenant_id = '${tenant}' and returned_at is not null`) === "1", "the owner opening setup records that they came back");
  }
  await b.send("Network.clearBrowserCookies");
  await b.go(`${BASE}/ops/onboarding`, 2500);
  await b.until("!!document.querySelector('.ops-funnel')", "the funnel line", 60000);
  const line = await b.js("document.querySelector('.ops-funnel').innerText.replace(/\\s+/g, ' ')");
  check(/reminder emails to \d+, \d+ came back/.test(line), `the funnel counts the reminders and the returns (“${line.slice(0, 160)}”)`);
  await shot("funnel");
  check(b.problems.length === 0, `no console errors or exceptions${b.problems.length ? ": " + b.problems.slice(0, 5).join(" || ") : ""}`);
} catch (error) {
  failures.push(String(error.message ?? error));
  log("STOPPED", error.stack ?? error);
} finally {
  await b.close();
}
if (failures.length) { console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`); process.exit(1); }
log("all checks passed");
