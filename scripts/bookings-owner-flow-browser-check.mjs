// The bookings owner's first week, in a real browser (ALY-259, D-140, spec 043): a salon signs up,
// then runs its bookings from the workspace without asking ALYR for anything, and a customer
// books on the booking page what the owner set up. English or Arabic; 1440 and 390 px; light
// and dark; headless Edge over the DevTools protocol (scripts/browser-kit.mjs), no packages.
// Node 22.
//
//   node scripts/bookings-owner-flow-browser-check.mjs --lang en --stages 1 \
//        --base http://localhost:3259 --pg alyr259-pg --db alyr --out C:/t/bk259/shots \
//        --profile C:/t/bk259/p-en --port 9759 --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API on its own database (`python -m alyr.migrate`) with sign-up open (a developer
// machine is open) and a web app pointed at it, and `docker` to read and write that database
// (`--pg` names its container). Each run makes its own salon, so it can be run again and again.
// `--stages` says how much of the owner's week to walk: 1 is the services; later stages add the
// opening hours and days off, the desk, and the people and chairs.

import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch, sleep } from "./browser-kit.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3259";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const STAGES = String(args.stages ?? "1");
const stage = (n) => STAGES.split(",").some((s) => Number(s) >= n);
const OUT = args.out ?? `${tmpdir()}/bookings-owner-flow-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/bookings-owner-flow-${LANG}`;
const PORT = Number(args.port ?? (AR ? 9760 : 9759));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const DB = args.db ?? "alyr";
const PG = args.pg ?? "alyr259-pg";
const SECRET = args.secret ?? ["alyr", "local", "development", "link", "key", "not", "for", "real", "use"].join("-");
const RUN = Date.now().toString(36);
const EMAIL = `owner.${RUN}.${LANG}@flow.example`;
const SHOP = AR ? "استوديو نور للشعر" : "Noor Hair Studio";
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };
const sql = (text) => execFileSync("docker", ["exec", PG, "psql", "-U", "alyr", "-d", DB, "-At", "-c", text], { encoding: "utf8" }).trim();

const W = AR
  ? {
    setup: "إعداد الحجوزات", back: "العودة إلى اليوم", services: "الخدمات", addService: "إضافة خدمة", addSave: "إضافة الخدمة",
    save: "حفظ", hide: "إخفاء", show: "إظهار", hideYes: "إخفاء الخدمة", name: "الاسم", nameAr: "الاسم بالعربية",
    thread: "تشذيب الحاجبين", threadEn: "Eyebrow threading", needName: "اكتب اسم الخدمة", badLength: "المدة عدد صحيح من الدقائق",
    needPrice: "النسبة من السعر تحتاج إلى سعر", added: "تمت إضافة الخدمة", saved: "تم حفظ الخدمة", hidden: "أُخفيت الخدمة",
    shown: "الخدمة ظاهرة الآن", hiddenTag: "مخفية", booked: "تم تأكيد", edit: "تعديل", minutes: "دقيقة", qar: "ر.ق",
    onlyThese: "هؤلاء فقط", needWho: "اختر موظفاً أو كرسياً واحداً على الأقل", addPerson: "إضافة",
  }
  : {
    setup: "Set up bookings", back: "Back to the day", services: "Services", addService: "Add a service", addSave: "Add service",
    save: "Save", hide: "Hide", show: "Show", hideYes: "Hide it", name: "Name", nameAr: "Name in Arabic",
    thread: "Eyebrow threading", threadEn: "Eyebrow threading", needName: "Write the service's name", badLength: "The length is a whole number of minutes",
    needPrice: "A share of the price needs the service to have a price", added: "Service added", saved: "Service saved", hidden: "Hidden. Customers no longer see it",
    shown: "Shown on the booking page", hiddenTag: "Hidden", booked: "confirmed", edit: "Edit", minutes: "min", qar: "QAR",
    onlyThese: "Only these", needWho: "Choose at least one person or chair", addPerson: "Add",
  };

// A booking link for one customer, signed with the development key, as the chat would send it.
const uuidBytes = (id) => Buffer.from(id.replaceAll("-", ""), "hex");
function bookingToken(tenant, contactId) {
  const expires = Buffer.alloc(4);
  expires.writeUInt32BE(Math.floor(Date.now() / 1000) + 86400);
  const payload = Buffer.concat([Buffer.from([2, 2]), uuidBytes(contactId), expires]);
  const mac = createHmac("sha256", SECRET).update(Buffer.concat([Buffer.from("alyr-link-v2\0"), uuidBytes(tenant), payload])).digest().subarray(0, 16);
  return `${payload.toString("base64url")}.${mac.toString("base64url")}`;
}

const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: 1440, height: 900, scheme: "light" });
const { js, until, click } = b;
const shot = async (name) => { await b.shot(`${OUT}/${LANG}-${name}.png`); log("shot", name); };
const text = () => js("document.body.innerText.replace(/\\s+/g, ' ')");
async function noSideScroll(name) {
  const wide = await js("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth");
  check(wide <= 0, `no sideways scrolling on ${name}${wide > 0 ? ` (${wide}px too wide)` : ""}`);
}
async function axe(name) {
  const found = await b.axe(AXE);
  if (found === null) { log("axe skipped: give --axe <path to axe.min.js>"); return; }
  writeFileSync(`${OUT}/${LANG}-axe-${name}.json`, JSON.stringify(found, null, 2));
  const serious = found.filter((v) => v.impact === "serious" || v.impact === "critical");
  check(serious.length === 0, `axe: no serious violations on ${name} (${found.length} found in all)`);
  for (const v of found) for (const n of v.nodes.slice(0, 3)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}
async function touchTargets(name) {
  const small = await js("[...document.querySelectorAll('.bk .btn, .bk-partbtn, .bk-check, .bk-field input, .bk-field select')].filter((x) => x.offsetParent && x.getBoundingClientRect().height < 44).map((x) => (x.className || x.tagName) + ':' + Math.round(x.getBoundingClientRect().height))");
  check(small.length === 0, `touch targets are at least 44 px tall on ${name}${small.length ? ` (${small.slice(0, 4).join(", ")})` : ""}`);
}
const run = async (name, fn) => {
  try { log(`── ${name}`); await fn(); } catch (error) {
    failures.push(`${name}: ${error.message ?? error}`);
    log("STOPPED", name, error.message ?? error);
    try { await shot(`99-${name.replace(/\W+/g, "-")}-stopped`); } catch { /* the page is gone */ }
  }
};
/** Fill a field the way a person does: focus it, replace what is there, type. */
async function fill(selector, value) {
  await click(`document.querySelector(${JSON.stringify(selector)})`, 80);
  await b.clearFocused();
  if (value) await b.type(value);
}
const buttonByText = (label, scope = "document") => `[...${scope}.querySelectorAll('button')].find((x) => x.offsetParent && x.textContent.trim() === ${JSON.stringify(label)})`;
const services = async (slug) => (await js(`fetch('/api/book/${slug}').then((r) => r.json()).then((p) => p.services.map((s) => s.name))`));

let tenant = "";
let slug = "";
try {
  await b.send("Emulation.setLocaleOverride", { locale: AR ? "ar-QA" : "en-GB" });

  await run("sign up a new salon through the real sign-up", async () => {
    await b.go(`${BASE}/login`, 800);
    const made = await js(`(async () => {
      localStorage.setItem('alyr-workspace-lang', ${JSON.stringify(LANG)});
      const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const code = (await (await post('/api/onboarding/code', { email: ${JSON.stringify(EMAIL)} })).json()).dev_code;
      const token = (await (await post('/api/onboarding/verify', { email: ${JSON.stringify(EMAIL)}, code })).json()).signup_token;
      const terms = (await (await fetch('/api/onboarding/terms/current')).json()).current.map((t) => t.id);
      const r = await post('/api/onboarding/business', { signup_token: token, owner_name: 'Reem Test', name: ${JSON.stringify(SHOP)}, name_ar: 'استوديو نور للشعر', type: 'salon', area: 'West Bay', accepted_terms: terms, lang: ${JSON.stringify(LANG)} });
      return [r.status, (await r.json()).created]; })()`);
    check(made[0] === 200, "a new salon is made through the sign-up API");
    tenant = made[1];
    slug = sql(`select slug from tenants where id = '${tenant}'`);
    check(Boolean(slug), `the salon has its booking address (/b/${slug})`);
    // The owner's own words in both languages: an Arabic page needs an Arabic shop name.
    sql(`update tenants set name_ar = 'استوديو نور للشعر' where id = '${tenant}'`);
  });

  await run("the day view of a new shop points at the services", async () => {
    await b.go(`${BASE}/app/bookings`, 1800);
    await until("!!document.querySelector('.bk')", "the Bookings screen");
    check((await js("document.querySelector('.bk')?.closest('[dir]')?.dir")) === (AR ? "rtl" : "ltr"), "the screen reads in its language's direction");
    check((await js("document.querySelectorAll('.bk-barbtns .btn')[0]?.textContent.trim()")) === W.setup, "the owner sees Set up bookings beside the walk-in button");
    await shot("01-day-1440");
    await noSideScroll("day view 1440");
  });

  await run("services: the setup lists what the sign-up made", async () => {
    await click(buttonByText(W.setup), 1000);
    await until("document.querySelectorAll('.bk-service').length > 0", "the services");
    const count = await js("document.querySelectorAll('.bk-service').length");
    const expected = Number(sql(`select count(*) from services where tenant_id = '${tenant}'`));
    check(count === expected, `every service of the sign-up is listed (${count} of ${expected})`);
    const parts = await js("[...document.querySelectorAll('.bk-partbtn')].map((x) => x.getAttribute('aria-pressed'))");
    check(parts[0] === "true" && parts.length === 3, "the setup has three parts and opens on the services");
    await shot("02-services-1440");
    await noSideScroll("services 1440");
    await axe("services");
  });

  await run("services: add one with its deposit", async () => {
    await click(`document.getElementById('bk-svc-add')`, 500);
    await until("!!document.getElementById('bk-s-new-n')", "the form");
    check(await js("document.activeElement?.id === 'bk-s-new-n'"), "the keyboard lands in the name field");
    // Refused in the page's words, with nothing sent.
    await click(buttonByText(W.addSave), 300);
    check((await text()).includes(W.needName), "an empty name is refused in words");
    await fill("#bk-s-new-n", "Eyebrow threading");
    await fill("#bk-s-new-a", "تشذيب الحاجبين");
    await fill("#bk-s-new-m", "four");
    await click(buttonByText(W.addSave), 300);
    check((await text()).includes(W.badLength), "a length that is not a number is refused in words");
    await fill("#bk-s-new-m", AR ? "٢٠" : "20");
    await fill("#bk-s-new-p", "");
    await js("(() => { const s = document.getElementById('bk-s-new-k'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'percent'); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await until("!!document.getElementById('bk-s-new-d')", "the deposit field");
    await fill("#bk-s-new-d", "20");
    await click(buttonByText(W.addSave), 300);
    check((await text()).includes(W.needPrice), "a share of the price with no price is refused in words");
    await shot("03-add-service-error-1440");
    await fill("#bk-s-new-p", AR ? "٣٠٫٥" : "30.5");
    await click(buttonByText(W.addSave), 1200);
    await until("[...document.querySelectorAll('.bk-service-name b')].some((x) => x.textContent.includes('Eyebrow') || x.textContent.includes('تشذيب'))", "the new service in the list");
    check((await text()).includes(W.added), "the page says the service was added");
    const row = await js("[...document.querySelectorAll('.bk-service')].find((x) => x.textContent.includes('Eyebrow') || x.textContent.includes('تشذيب'))?.querySelector('.bk-facts')?.textContent");
    check(/30\.50/.test(row ?? "") && /20%/.test(row ?? ""), `its length, price and deposit are shown (${row})`);
    const stored = sql(`select price, deposit_kind, deposit_value, name_ar from services where tenant_id = '${tenant}' and name = 'Eyebrow threading'`);
    check(stored === "3050|percent|20|تشذيب الحاجبين", `it is saved in dirhams with both names (${stored})`);
    await shot("04-service-added-1440");
  });

  await run("services: change the price, hide it, show it again", async () => {
    const label = `${W.edit}: ${AR ? "تشذيب الحاجبين" : "Eyebrow threading"}`;
    await click(`document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)})`, 500);
    await until("!!document.querySelector('[id^=bk-s-][id$=-p]')", "the edit form");
    await fill("[id^=bk-s-][id$=-p]", "35");
    await click(buttonByText(W.save), 1200);
    await until(`document.body.innerText.includes(${JSON.stringify(W.saved)})`, "the saved message");
    check(sql(`select price from services where tenant_id = '${tenant}' and name = 'Eyebrow threading'`) === "3500", "the new price is saved");
    const deposit = await js("fetch('/api/services').then((r) => r.json()).then((d) => d.services.find((s) => s.name === 'Eyebrow threading').deposit)");
    check(deposit === 700, `the deposit follows the price (20% of QAR 35 is QAR 7: ${deposit})`);
    const hideLabel = `${W.hide}: ${AR ? "تشذيب الحاجبين" : "Eyebrow threading"}`;
    await click(`document.querySelector(${JSON.stringify(`[aria-label="${hideLabel}"]`)})`, 1200);
    await until(`document.body.innerText.includes(${JSON.stringify(W.hidden)})`, "the hidden message");
    check(!(await services(slug)).includes("Eyebrow threading"), "a hidden service is gone from the booking page");
    check((await text()).includes(W.hiddenTag), "it stays in the list, marked hidden");
    await shot("05-service-hidden-1440");
    const showLabel = `${W.show}: ${AR ? "تشذيب الحاجبين" : "Eyebrow threading"}`;
    await click(`document.querySelector(${JSON.stringify(`[aria-label="${showLabel}"]`)})`, 1200);
    await until(`document.body.innerText.includes(${JSON.stringify(W.shown)})`, "the shown message");
    check((await services(slug)).includes("Eyebrow threading"), "shown again, it is on the booking page");
  });

  await run("services: who does it, once the shop lists two chairs", async () => {
    await click("document.querySelectorAll('.bk-partbtn')[1]", 600);
    await until("!!document.getElementById('bk-new-n')", "the people part");
    for (const chair of ["Chair 1", "Chair 2"]) {
      await fill("#bk-new-n", chair);
      await click(buttonByText(W.addPerson), 900);
    }
    check(Number(sql(`select count(*) from booking_resources where tenant_id = '${tenant}'`)) === 2, "two chairs are added from the People part");
    await click("document.querySelectorAll('.bk-partbtn')[0]", 600);
    const edit = `${W.edit}: ${AR ? "تشذيب الحاجبين" : "Eyebrow threading"}`;
    await click(`document.querySelector(${JSON.stringify(`[aria-label="${edit}"]`)})`, 500);
    await until("!!document.querySelector('.bk-choices')", "the who-does-it choice");
    check(await js("document.querySelector('.bk-choices input[type=radio]').checked"), "a service starts with everyone doing it");
    await click(`[...document.querySelectorAll('.bk-choices label')].find((x) => x.textContent.includes(${JSON.stringify(W.onlyThese)}))`, 300);
    await until("document.querySelectorAll('.bk-doers input[type=checkbox]').length === 2", "the two chairs to choose from");
    await shot("05b-who-does-it-1440");
    await click(buttonByText(W.save), 300);
    check((await text()).includes(W.needWho), "choosing nobody is refused in words");
    await click("document.querySelectorAll('.bk-doers input[type=checkbox]')[1]", 200);
    await click(buttonByText(W.save), 1200);
    await until(`document.body.innerText.includes(${JSON.stringify(W.saved)})`, "the saved message");
    const who = sql(`select r.name from service_resources sr join booking_resources r on r.id = sr.resource_id where sr.tenant_id = '${tenant}'`);
    check(who === "Chair 2", `only Chair 2 does the service (${who})`);
    await b.view(390, 844, true, "light");
    await b.go(`${BASE}/app/bookings`, 1500);
    await until("!!document.querySelector('.bk')", "the Bookings screen");
    await click(buttonByText(W.setup), 900);
    await until("document.querySelectorAll('.bk-service').length > 0", "the services");
    await click(`document.querySelector(${JSON.stringify(`[aria-label="${edit}"]`)})`, 500);
    await click(`[...document.querySelectorAll('.bk-choices label')].find((x) => x.textContent.includes(${JSON.stringify(W.onlyThese)}))`, 300);
    await noSideScroll("who does it 390");
    await touchTargets("who does it 390");
    await shot("05c-who-does-it-390");
    await b.view(1440, 900, false, "light");
  });

  // A customer of the shop, as the chat would have made one.
  const contact = (() => {
    sql(`insert into contacts (tenant_id, phone, name, lang) values ('${tenant}', '97455${String(Date.now() % 1_000_000).padStart(6, "0")}', 'Mona Test', '${LANG}')`);
    return sql(`select id from contacts where tenant_id = '${tenant}' and name = 'Mona Test'`);
  })();
  const link = () => `${BASE}/b/${slug}?t=${bookingToken(tenant, contact)}`;

  await run("the customer books the new service on the booking page", async () => {
    await b.view(390, 844, true, "light");
    await b.go(link(), 1600);
    await until("document.querySelectorAll('.cx-choice').length > 0", "the services");
    check(await js("[...document.querySelectorAll('.cx-choice')].some((x) => x.textContent.includes('Eyebrow') || x.textContent.includes('تشذيب'))"), "the service the owner added is on the booking page");
    await click("[...document.querySelectorAll('.cx-choice')].find((x) => x.textContent.includes('Eyebrow') || x.textContent.includes('تشذيب'))", 600);
    for (let d = 1; d < 10; d += 1) {
      await click(`document.querySelectorAll('.cx-day')[${d}]`, 900);
      await until("document.querySelectorAll('.cx-time').length > 0 || [...document.querySelectorAll('.cx-note')].length > 0", "the times");
      if (await js("document.querySelectorAll('.cx-time').length > 0")) break;
    }
    await click("document.querySelector('.cx-time')", 600);
    await noSideScroll("booking page 390");
    await shot("06-booking-page-390");
    await click("document.querySelector('.cx-bar .cx-btn')", 1800);
    // A service with a deposit holds the time until it is paid.
    await shot("07-booking-made-390");
    const made = sql(`select service_name, price, deposit, deposit_state from bookings where tenant_id = '${tenant}'`);
    check(made.startsWith("Eyebrow threading|3500|700|due"), `the booking keeps the price and deposit it was made at (${made})`);
    const chair = sql(`select r.name from bookings b join booking_resources r on r.id = b.resource_id where b.tenant_id = '${tenant}'`);
    check(chair === "Chair 2", `it lands on the chair that does the service (${chair})`);
  });

  await run("the new booking is on the owner's day", async () => {
    await b.view(1440, 900, false, "light");
    await b.go(`${BASE}/app/bookings`, 1500);
    await until("!!document.querySelector('.bk')", "the Bookings screen");
    const day = sql(`select (starts_at at time zone 'Asia/Qatar')::date from bookings where tenant_id = '${tenant}' limit 1`);
    await click(`document.querySelectorAll('.bk-nav button')[2]`, 200);
    for (let i = 0; i < 12; i += 1) {
      if (await js("document.querySelectorAll('.bk-card').length > 0")) break;
      await click("document.querySelectorAll('.bk-nav button')[2]", 500);
    }
    check(await js("document.querySelectorAll('.bk-card').length > 0"), `the booking is on the day view (${day})`);
    await shot("08-owner-sees-booking-1440");
  });

  await run("phone width, light and dark: no sideways scroll, 44 px targets", async () => {
    for (const scheme of ["light", "dark"]) {
      await b.view(390, 844, true, scheme);
      await b.go(`${BASE}/app/bookings`, 1500);
      await until("!!document.querySelector('.bk')", "the Bookings screen");
      await click(buttonByText(W.setup), 900);
      await until("document.querySelectorAll('.bk-service').length > 0", "the services");
      await noSideScroll(`services 390 ${scheme}`);
      await touchTargets(`services 390 ${scheme}`);
      await shot(`09-services-390-${scheme}`);
      await click(`document.getElementById('bk-svc-add')`, 500);
      await until("!!document.getElementById('bk-s-new-n')", "the form");
      await noSideScroll(`add service form 390 ${scheme}`);
      await touchTargets(`add service form 390 ${scheme}`);
      await shot(`10-add-service-390-${scheme}`);
      if (scheme === "dark") await axe("services-dark");
    }
    await b.view(320, 700, true, "light");
    await b.go(`${BASE}/app/bookings`, 1500);
    await until("!!document.querySelector('.bk')", "the Bookings screen");
    await click(buttonByText(W.setup), 900);
    await until("document.querySelectorAll('.bk-service').length > 0", "the services");
    await noSideScroll("services 320");
  });

  check(b.problems.filter((p) => !/favicon|Hydration|status of 4\d\d/.test(p)).length === 0, `no console errors (${b.problems.slice(0, 3).join(" | ")})`);
} finally {
  await b.close();
}

if (failures.length) {
  console.log(`\n[${LANG}] ${failures.length} failed:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`\n[${LANG}] all checks passed`);
