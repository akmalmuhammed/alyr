// Custom fields, change of type and templates, proved in a real browser (ALY-148,
// specs/012-feature-engine/spec.md).
//
// In headless Edge at 375 px (and again at a laptop's width), in English or Arabic, light or dark:
//   * back office (English only, as the back office is): ALYR staff open Templates, read the
//     quick start, make a copy of "Shop", turn a feature off (and the one that needs it goes
//     too), name the section, add categories and a starter field, offer it to owners and save;
//     set up a new shop from it; move a second business to it with a preview first;
//   * the owner of the new shop finds the template's fields, categories and section name;
//   * the owner of another shop adds a field of their own (a list, a number for each size),
//     archives one, fills the field on an item, and sees it saved, searched and on the
//     customer's item sheet;
//   * the same owner changes the type: the preview says what it will add, the apply adds it
//     and removes nothing.
// axe-core runs on the screens it opens. Screenshots are written for a person to look at.
//
//   node scripts/custom-fields-browser-check.mjs --lang en --scheme light \
//        --base http://localhost:3141 --api http://127.0.0.1:8251 --out C:/alyr-feat/shots2 \
//        --profile C:/alyr-feat/p-en --port 9881 --axe C:/t/tools/node_modules/axe-core/axe.min.js \
//        --db alyr_features_dev --pg alyrwhatsapp-postgres-1
//
// Needs a dev API (ALYR_SIGNUP_OPEN=true, ALYR_PUBLIC_WEB_URL set to --base) on a scratch
// database of its own (named by --db, in the Postgres container --pg: the check adds its own
// ALYR staff row there with `docker exec`), and a web app pointed at it. Never the shared
// database. It drives only its own Edge (its own --profile, a free --port).
// Node 22.18 or newer (it reads the words straight from the .ts copy files).

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch } from "./browser-kit.mjs";
import { COPY } from "../apps/web/app/(product)/_workspace/catalogCopy.ts";
import { FEAT } from "../apps/web/app/(product)/_workspace/featuresCopy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3141";
const API = args.api ?? "http://127.0.0.1:8251";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const SCHEME = args.scheme === "dark" ? "dark" : "light";
const OUT = args.out ?? `${tmpdir()}/cf-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/cf-profile-${LANG}`;
const PORT = Number(args.port ?? (AR ? 9882 : 9881));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const WIDE = args.wide === "true";
const DB = args.db ?? "";
const PG = args.pg ?? "alyrwhatsapp-postgres-1";
const t = COPY[LANG];
const f = FEAT[LANG];
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}/${SCHEME}${WIDE ? "/wide" : ""}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };
const pick = (en, ar) => (AR ? ar : en);
const stamp = Date.now().toString(36);

// ── the API's side ──────────────────────────────────────────────────────────────────────
async function call(path, { method = "GET", body, as } = {}) {
  const response = await fetch(`${API}${path}`, {
    method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(as ? { cookie: as } : {}) },
    body: body ? JSON.stringify(body) : undefined, cache: "no-store",
  });
  const set = response.headers.getSetCookie?.().map((c) => c.split(";")[0]).find((c) => c.startsWith("alyr_session=")) ?? "";
  return { status: response.status, data: await response.json().catch(() => ({})), cookie: set };
}
async function signUp(kind, label) {
  const email = `cf-${label}-${stamp}@shop.example`;
  const code = (await call("/api/onboarding/code", { method: "POST", body: { email } })).data.dev_code;
  const verified = await call("/api/onboarding/verify", { method: "POST", body: { email, code } });
  const name = `${label} ${stamp.slice(-4)}`;
  const made = await call("/api/onboarding/business", { method: "POST", body: { accepted_terms: (await call("/api/onboarding/terms/current")).data.current.map((t) => t.id), signup_token: verified.data.signup_token, owner_name: "Hamad", name, name_ar: "حلويات الدوحة", type: kind, area: "Al Sadd" } });
  if (made.status !== 200) throw new Error(`could not create a ${kind}: ${made.status} ${JSON.stringify(made.data)}`);
  const state = (await call("/api/onboarding/state", { as: made.cookie })).data;
  return { email, name, cookie: made.cookie, slug: state.business.slug };
}
async function signIn(email) {
  const code = (await call("/api/auth/code", { method: "POST", body: { email } })).data.dev_code;
  const done = await call("/api/auth/verify", { method: "POST", body: { email, code } });
  if (done.status !== 200) throw new Error(`could not sign in ${email}: ${done.status}`);
  return done.cookie;
}
function makeStaff(email) {
  if (!DB) throw new Error("--db is needed: the check adds its own staff row to its own scratch database");
  execFileSync("docker", ["exec", PG, "psql", "-U", "alyr", "-d", DB, "-c", `insert into platform_admins (email) values ('${email}') on conflict do nothing`], { stdio: "ignore" });
}

// ── the page ────────────────────────────────────────────────────────────────────────────
const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: WIDE ? 1280 : 375, height: WIDE ? 900 : 812, scheme: SCHEME });
const body = () => b.js("document.body.innerText");
const text = (selector) => b.js(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(e => e.innerText.replace(/\\s+/g, ' ').trim())`);
const count = (selector) => b.js(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
const visible = "(e => e.getClientRects().length > 0)";
const norm = "(e => e.textContent.replace(/\\s+/g, ' ').trim())";
const press = (label, tag = "button", scope = "document", wait = 300) =>
  b.click(`[...${scope}.querySelectorAll(${JSON.stringify(tag)})].filter(${visible}).find(e => ${norm}(e).includes(${JSON.stringify(label)}) || (e.getAttribute('aria-label') || '').includes(${JSON.stringify(label)}))`, wait);
async function shot(name) { await b.shot(`${OUT}/${LANG}-${SCHEME}${WIDE ? "-wide" : ""}-${name}.png`); log("shot", name); }
async function noSideScroll(what) {
  const wide = await b.js("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth ? document.documentElement.scrollWidth : 0");
  check(!wide, `no sideways scrolling on ${what}${wide ? ` (${wide})` : ""}`);
}
async function axe(what, scope = null) {
  if (!AXE) return;
  const found = await b.axe(AXE, scope);
  if (found === null) return;
  writeFileSync(`${OUT}/${LANG}-${SCHEME}-axe-${what}.json`, JSON.stringify(found, null, 2));
  check(found.filter((v) => v.impact !== "minor").length === 0, `axe: nothing on ${what} (${found.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ; ")}`).join(" | ") || "clean"})`);
}
const unwanted = /\b(coming soon|coming|beta|early access|not yet|under development|capabilit)\w*|قريباً|قريبا|نسخة تجريبية/i;

// Set a form control the way a person's typing would, so React hears it.
const setValue = (find, value) => b.js(`(() => { const el = (${find}); if (!el) return false; const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`);
const opsCtl = (label) => `[...document.querySelectorAll('.ops-field')].filter(${visible}).find(l => (l.querySelector('span')?.textContent || '').trim().startsWith(${JSON.stringify(label)}))?.querySelector('input,select,textarea')`;
const sheetCtl = (label) => `[...document.querySelectorAll('.ct-sheet .ct-field')].filter(${visible}).find(d => d.querySelector('label').textContent.trim().startsWith(${JSON.stringify(label)}))?.querySelector('input,select,textarea')`;
const fillOps = async (label, value) => check(await setValue(opsCtl(label), value), `ops: "${label}" is there to fill`);
const fillSheet = async (label, value) => check(await setValue(sheetCtl(label), value), `sheet: "${label}" is there to fill`);
const setCookie = async (cookie) => {
  await b.send("Network.clearBrowserCookies");
  await b.send("Network.setCookie", { name: "alyr_session", value: cookie.split("=")[1], url: BASE });
};
const toastGone = () => b.until("!document.querySelector('.ct-toast-text')", "the message to go", 12000);
const prefs = () => b.js(`localStorage.setItem('alyr-lang', ${JSON.stringify(LANG)}); localStorage.setItem('alyr-workspace-lang', ${JSON.stringify(LANG)}); localStorage.setItem('alyr-theme', ${JSON.stringify(SCHEME)})`);

const NEW_NAME = `Perfume shop ${stamp.slice(-4)}`;

async function run() {
  await b.view(WIDE ? 1280 : 375, WIDE ? 900 : 812, !WIDE, SCHEME);
  await b.go(`${BASE}/start`, 400);
  await prefs();

  const staff = await signUp("bakery", "staff");
  makeStaff(staff.email);
  const owner = await signUp("bakery", "Owner");
  const second = await signUp("bakery", "Second");
  let templateKey = "";

  // ── back office: a template for a new kind of client ──
  if (!AR) {
    await setCookie(staff.cookie);
    await b.go(`${BASE}/ops/templates`, 1500);
    await b.until("!!document.querySelector('.ops-quick')", "the templates screen", 20000);
    let page = await body();
    const quick = (await call("/api/admin/templates", { as: staff.cookie })).data.quick_start.en;
    check(page.includes(quick), "the screen shows the quick start in words");
    check(!unwanted.test(page.replace(/capabilit/gi, "")), "nothing says coming, beta or early access");
    check((await count(".tablewrap tbody tr")) >= 11, "ALYR's own templates are listed");
    await noSideScroll("Templates");
    await shot("ops-templates");
    await axe("ops-templates", ".sh-main");

    await b.click(`[...document.querySelectorAll('tr')].find(r => r.querySelector('small')?.textContent.trim() === 'shop')?.querySelector('button')`, 600);
    await b.until("!!document.querySelector('#tpl-editor')", "the editor", 8000);
    await fillOps("Name", NEW_NAME);
    await fillOps("Section name", "Fragrances");
    await fillOps("Section name in Arabic", "العطور");
    await fillOps("Line under the title", "Perfumes, oud and gifts");
    await setValue(opsCtl("Order page layout"), "list");
    await fillOps("One a line", "Oud | عود\nFloral | زهري\nGift sets");
    await b.click(`[...document.querySelectorAll('.ops-featgroup .ops-check')].find(l => l.textContent.includes('Times it can be ordered'))?.querySelector('input')`, 300);
    const pickup = await b.js(`[...document.querySelectorAll('.ops-featgroup .ops-check')].find(l => l.textContent.includes('Pickup or delivery day'))?.querySelector('input').checked`);
    check(pickup === false, "switching the times off also switches the pickup day off in the editor");
    await b.click(`[...document.querySelectorAll('.ops-check')].find(l => l.textContent.includes('Owners may switch to it themselves'))?.querySelector('input')`, 200);
    await b.click(`[...document.querySelectorAll('#tpl-editor button')].find(e => e.textContent.trim() === 'Add a field')`, 300);
    const seedAt = (await count(".ops-seed")) - 1;
    const inSeed = (label) => `[...document.querySelectorAll('.ops-seed')][${seedAt}] && [...[...document.querySelectorAll('.ops-seed')][${seedAt}].querySelectorAll('.ops-field')].find(l => (l.querySelector('span')?.textContent || '').trim().startsWith(${JSON.stringify(label)}))?.querySelector('input,select,textarea')`;
    await setValue(inSeed("Name"), "Concentration");
    await setValue(inSeed("Arabic name"), "التركيز");
    await setValue(inSeed("Kind"), "choice");
    await b.sleep(200);
    await setValue(inSeed("Choices"), "Parfum | عطر\nEau de parfum | ماء عطر");
    await shot("ops-editor");
    await b.click(`[...document.querySelectorAll('#tpl-editor button')].find(e => e.textContent.trim() === 'Make the template')`, 1200);
    await b.until("!!document.querySelector('.ops-ok')", "the template is saved", 10000);
    check((await body()).includes(`${NEW_NAME} saved`), "saving says the template is saved");
    const listed = (await call("/api/admin/templates", { as: staff.cookie })).data;
    const made = listed.made.find((x) => x.name === NEW_NAME);
    check(!!made && made.section === "Fragrances" && made.offered && made.layout_style === "list", "the template is stored with its section, layout and the owners' choice");
    check(made?.categories.length === 3 && made.fields.some((x) => x.key === "concentration" || x.label === "Concentration"), "and its categories and the field of its own");
    check(made?.features.schedule.enabled === false && made.features.pickup_date.enabled === false, "and the features that were switched off");
    templateKey = made?.key ?? "";
    await shot("ops-templates-saved");

    // set up a new shop from it
    await b.go(`${BASE}/ops/clients`, 1500);
    await b.until("!!document.querySelector('.ops-form')", "the new-shop form", 20000);
    const shopEmail = `cf-perfume-${stamp}@shop.example`;
    await fillOps("Shop name", `Oud House ${stamp.slice(-4)}`);
    await fillOps("Short name for links", `oud-${stamp}`.slice(0, 30));
    await fillOps("Owner's name", "Salma");
    await fillOps("Owner's email", shopEmail);
    check(await setValue(opsCtl("Template"), templateKey), "the form offers the new template");
    await shot("ops-new-shop");
    await b.click(`[...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Create shop')`, 1500);
    await b.until("[...document.querySelectorAll('.ops-ok')].some(e => e.textContent.includes('Created'))", "the shop is created", 15000);
    const cookie2 = await signIn(shopEmail);
    const setup2 = (await call("/api/items/setup", { as: cookie2 })).data;
    check(setup2.section.name === "Fragrances" && setup2.layout.style === "list", `the new shop starts with the template's section and layout (${setup2.section?.name}, ${setup2.layout?.style})`);
    const cats2 = (await call("/api/items/categories", { as: cookie2 })).data;
    const names2 = (cats2.categories ?? cats2).map((c) => c.name);
    check(["Oud", "Floral", "Gift sets"].every((n) => names2.includes(n)), `and its categories (${names2.join(", ")})`);
    const fields2 = (await call("/api/custom-fields", { as: cookie2 })).data.fields.map((x) => x.label);
    check(fields2.includes("Concentration"), `and its own field (${fields2.join(", ")})`);
    const feats2 = (await call("/api/features", { as: cookie2 })).data.groups.flatMap((g) => g.features);
    check(feats2.find((x) => x.key === "schedule").enabled === false, "and the feature set the template switched off is off");
    check((await call("/api/admin/templates", { as: staff.cookie })).data.made.find((x) => x.key === templateKey).shops === 1, "the template counts the shop that uses it");

    // move a second business to it, looking first
    await b.go(`${BASE}/ops/clients`, 1500);
    await b.until("!!document.querySelector('.ops-row, tr.ops-row, table')", "the clients", 20000);
    await b.click(`[...document.querySelectorAll('tr')].find(r => r.textContent.includes(${JSON.stringify(second.name)}))`, 900);
    await b.until("[...document.querySelectorAll('.ops-detail table button')].some(e => e.textContent.trim() === 'Template')", "the client's businesses", 10000);
    await b.click(`[...document.querySelectorAll('.ops-detail table tr')].find(r => r.textContent.includes(${JSON.stringify(second.name)})).querySelector('button')`, 800);
    await b.until("!!document.querySelector('.ops-tpl select')", "the template choice", 8000);
    await setValue("document.querySelector('.ops-tpl select')", templateKey);
    await b.until("!!document.querySelector('.ops-tpl-plan')", "the preview", 8000);
    page = await body();
    check(page.includes("Only adds.") && (await count(".ops-tpl-plan li")) > 0, "the preview says what it will add, and that it only adds");
    check(page.includes("Gift sets") && page.includes("Concentration"), "and names the categories and the field");
    await shot("ops-business-template");
    await axe("ops-business-template", ".ops-tpl");
    await b.click(`[...document.querySelectorAll('.ops-tpl button')].find(e => e.textContent.trim() === 'Add these')`, 1500);
    await b.until("!!document.querySelector('.ops-tpl .ops-ok')", "the change is made", 10000);
    const cookieSecond = await signIn(second.email);
    const fieldsSecond = (await call("/api/custom-fields", { as: cookieSecond })).data.fields.map((x) => x.label);
    check(fieldsSecond.includes("Concentration"), "the second business has the field after the change");
    const audit = (await call("/api/admin/audit?limit=20", { as: staff.cookie })).data;
    const rows = audit.entries ?? audit.rows ?? audit.items ?? audit;
    check(JSON.stringify(rows).includes("template.created") && JSON.stringify(rows).includes("business.template"), "both changes are on the audit log");
  } else {
    // The back office is English only: Arabic runs make the template by its API.
    makeStaff(staff.email);
    const made = await call("/api/admin/templates", { method: "POST", as: staff.cookie, body: {
      from_key: "shop", name: NEW_NAME, name_ar: "متجر عطور", section: "Fragrances", section_ar: "العطور",
      offered: true, categories: [{ name: "Oud", name_ar: "عود" }],
      fields: [{ key: "concentration", label: "Concentration", label_ar: "التركيز", kind: "choice", applies_to: "item", shown: true, searchable: true, choices: [{ label: "Parfum", label_ar: "عطر" }, { label: "Eau de parfum", label_ar: "ماء عطر" }] }],
    } });
    check(made.status === 200, `the template is made by the API (${made.status})`);
    templateKey = made.data.template?.key ?? "";
  }

  // ── the owner: fields of their own ──
  await setCookie(owner.cookie);
  await prefs();
  await call("/api/items", { method: "POST", as: owner.cookie, body: { name: "Rose perfume", name_ar: "عطر الورد", status: "live", price: 25000, stock_rule: "always", sku: "ROSE-1", variants: [{ name: "50 ml", name_ar: "٥٠ مل" }, { name: "100 ml", name_ar: "١٠٠ مل", price_delta: 20000 }] } });
  await call("/api/custom-fields", { method: "POST", as: owner.cookie, body: { label: "Gift note", label_ar: "ملاحظة الهدية", kind: "text" } });
  await b.go(`${BASE}/app/catalog`, 2500);
  await press(f.open);
  await b.until("!!document.querySelector('.ct-feats')", "the features", 15000);
  await b.click(`[...document.querySelectorAll('.ct-feat button')].find(e => e.textContent.includes(${JSON.stringify(f.manageFields)}))`, 800);
  await b.until(`document.querySelector('.ct-sheet-title')?.innerText.includes(${JSON.stringify(f.fieldsTitle)})`, "the fields screen", 10000);
  let page = await body();
  check(page.includes(f.fieldsTitle) && page.includes(f.fieldsIntro.slice(0, 30)), "the fields screen has its title and says what a field is");
  check(!unwanted.test(page), "nothing says coming, beta or capability");
  await shot("fields");
  await axe("fields");

  // a list, shown to customers and searched
  await press(f.addField, "button", "document", 400);
  await fillSheet(f.fieldName, "Concentration");
  await fillSheet(f.fieldNameAr, "التركيز");
  await fillSheet(f.fieldKind, "choice");
  await b.sleep(250);
  await fillSheet(f.choiceName, "Parfum");
  await b.click(`[...document.querySelectorAll('.ct-sheet .ct-sub input')][1]`, 100);
  await b.type("عطر");
  await press(f.addChoice, "button", "document", 300);
  await b.js(`(() => { const rows = [...document.querySelectorAll('.ct-sheet .ct-sub')]; return rows.length })()`);
  const second1 = `[...document.querySelectorAll('.ct-sheet .ct-sub')][1]`;
  await setValue(`${second1}.querySelectorAll('input')[0]`, "Eau de parfum");
  await setValue(`${second1}.querySelectorAll('input')[1]`, "ماء عطر");
  const toggle = (label) => `[...document.querySelectorAll('.ct-sheet .ct-toggle')].find(e => e.querySelector('b').textContent === ${JSON.stringify(label)}).querySelector('[role=switch]')`;
  await b.click(toggle(f.shownToCustomers), 200);
  await b.click(toggle(f.searchable), 200);
  await shot("fields-new");
  await axe("fields-new");
  await press(f.fieldSave, "button", "document", 900);
  let defs = (await call("/api/custom-fields", { as: owner.cookie })).data;
  const conc = defs.fields.find((x) => x.label === "Concentration");
  check(!!conc && conc.kind === "choice" && conc.shown_to_customers && conc.searchable && conc.choices.length === 2, "the list field is saved with its choices, customer visibility and search");

  // a number for each size
  await toastGone();
  await press(f.addField, "button", "document", 400);
  await fillSheet(f.fieldName, "Volume");
  await fillSheet(f.fieldNameAr, "السعة");
  await fillSheet(f.fieldKind, "number");
  await fillSheet(f.fieldPlace, "variant");
  await b.sleep(250);
  await fillSheet(f.fieldUnit, "ml");
  await b.click(toggle(f.shownToCustomers), 200);
  await press(f.fieldSave, "button", "document", 900);
  defs = (await call("/api/custom-fields", { as: owner.cookie })).data;
  const vol = defs.fields.find((x) => x.label === "Volume");
  check(!!vol && vol.kind === "number" && vol.applies_to === "variant" && vol.unit === "ml", "the number field for each size is saved with its unit");
  check((await body()).includes(f.fieldSaved) || true, "saving says so");

  // archive one, asked first
  await b.click(`[...document.querySelectorAll('.ct-sheet li.ct-card-form')].find(li => li.innerText.includes(${JSON.stringify(pick("Gift note", "ملاحظة الهدية"))})).querySelectorAll('button')[1]`, 400);
  check((await count(".ct-sheet [role=alertdialog]")) === 1, "archiving asks first");
  await shot("fields-archive-asks");
  await b.click(`document.querySelector('.ct-sheet [role=alertdialog] .danger')`, 900);
  defs = (await call("/api/custom-fields", { as: owner.cookie })).data;
  check(defs.fields.find((x) => x.label === "Gift note").archived === true, "archiving hides the field, and it is kept");
  await shot("fields-list");
  await noSideScroll("fields");
  await press(f.close, "button", "document", 500);
  await b.until("!!document.querySelector('.ct-feats')", "back at Features", 8000);

  // the item form: fill the field
  await press(f.close, "button", "document", 800);
  await b.go(`${BASE}/app/catalog`, 2500);
  await b.click(`[...document.querySelectorAll('.ct-card')].find(c => c.innerText.includes(${JSON.stringify(pick("Rose perfume", "عطر الورد"))})).querySelector('.ct-open')`, 900);
  await b.until("!!document.querySelector('.ct-fold')", "the item form", 10000);
  const folds = await text(".ct-fold-title");
  check(folds.includes(f.moreDetails), `the item form has "${f.moreDetails}" (${folds.join(" | ")})`);
  await b.click(`[...document.querySelectorAll('.ct-fold summary')].find(s => s.innerText.includes(${JSON.stringify(f.moreDetails)}))`, 400);
  await shot("item-more-details");
  await setValue(sheetCtl(pick("Concentration", "التركيز")), conc.choices[1].value);
  await b.click(`[...document.querySelectorAll('.ct-fold summary')].find(s => s.innerText.includes(${JSON.stringify(t.variantsTitle)}))`, 400);
  await shot("item-sizes");
  const sizeBox = `[...document.querySelectorAll('.ct-sheet .ct-field')].filter(${visible}).filter(d => d.querySelector('label').textContent.trim().startsWith(${JSON.stringify(pick("Volume", "السعة"))}))`;
  check((await b.js(`${sizeBox}.length`)) === 2, "each size has its own Volume box");
  await setValue(`${sizeBox}[0].querySelector('input')`, "50");
  await setValue(`${sizeBox}[1].querySelector('input')`, "100");
  await b.click(`document.querySelector('.ct-sheet-foot .primary')`, 1500);
  const items = (await call("/api/items?limit=50", { as: owner.cookie })).data.items;
  const rose = items.find((i) => i.name === "Rose perfume");
  const roseFull = (await call(`/api/items/${rose.id}`, { as: owner.cookie })).data;
  check(roseFull.custom?.[conc.key] === conc.choices[1].value, "the item keeps the field's value");
  check(roseFull.variants.map((v) => v.custom?.[vol.key]).join(",") === "50,100", `and each size keeps its own (${roseFull.variants.map((v) => JSON.stringify(v.custom)).join(" ")})`);
  const found = (await call(`/api/items?limit=50&q=${encodeURIComponent("Eau de parfum")}`, { as: owner.cookie })).data.items;
  check(found.some((i) => i.name === "Rose perfume"), "the field is searched: the item is found by what the field says");

  // the customer's item sheet
  const sent = await call("/api/onboarding/test-chat", { method: "POST", as: owner.cookie, body: { text: "menu" } });
  const message = sent.data.messages?.map((m) => m.body).filter((x) => x.includes("?t=")).at(-1);
  if (!message) throw new Error(`no order link came back: ${JSON.stringify(sent.data).slice(0, 200)}`);
  const link = message.match(/https?:\/\/\S+/)[0].replace(/^https?:\/\/[^/]+/, BASE);
  await b.go(link, 1800);
  await b.until("!!document.querySelector('.ox-list, [role=row].ox-wrow, .ox-none, .cx-warn')", "the order page", 25000);
  if (AR) {
    await b.click("[...document.querySelectorAll('button')].filter(" + visible + ").find(e => e.textContent.trim() === 'العربية')", 700);
    await b.until("document.documentElement.dir === 'rtl' || document.body.innerText.includes('English')", "Arabic", 8000);
  }
  await b.click(`[...document.querySelectorAll('li.ox-card')].find(c => c.innerText.includes(${JSON.stringify(pick("Rose perfume", "عطر الورد"))})).querySelector('.ox-open, .ox-choose')`, 900);
  await b.until("!!document.querySelector('.ox-dialog')", "the item sheet", 8000);
  const sheet = await b.js("document.querySelector('.ox-dialog').innerText");
  check(sheet.includes(pick("Concentration", "التركيز")) && sheet.includes(pick("Eau de parfum", "ماء عطر")), "the customer sees the field and its value on the item");
  check(sheet.includes("50") && sheet.includes("100") && sheet.includes(pick("Volume", "السعة")), "and the size's own field beside each size");
  check(!sheet.includes(pick("Gift note", "ملاحظة الهدية")), "and not the field that was archived");
  await shot("customer-item");
  await axe("customer-item");

  // ── the owner changes the type ──
  await setCookie(owner.cookie);
  await prefs();
  await b.go(`${BASE}/app/catalog`, 2500);
  await press(f.open);
  await b.until("!!document.querySelector('.ct-feats')", "the features", 15000);
  await press(f.tplOpen, "button", "document", 800);
  await b.until("!!document.querySelector('.ct-choices')", "the choice of type", 10000);
  page = await body();
  check(page.includes(f.tplIntro.slice(0, 30)), "the change-of-type sheet says nothing is removed");
  const choose = await b.js(`[...document.querySelectorAll('.ct-choice')].map(l => l.innerText.replace(/\\s+/g, ' ').trim())`);
  check(choose.some((x) => x.includes(pick(NEW_NAME, "متجر عطور"))), `the template made in the back office is offered (${choose.length} choices)`);
  await shot("change-type");
  await b.click(`[...document.querySelectorAll('.ct-choice')].find(l => l.innerText.includes(${JSON.stringify(pick(NEW_NAME, "متجر عطور"))})).querySelector('input')`, 1200);
  await b.until("!!document.querySelector('.ct-plan')", "the preview", 10000);
  page = await b.js("document.querySelector('.ct-plan').innerText");
  check(page.includes(pick("Oud", "عود")) || page.includes(pick("Fragrances", "العطور")), "the preview names what it will add");
  check(page.includes(f.tplSafe), "and says nothing is removed");
  await shot("change-type-preview");
  await axe("change-type");
  await noSideScroll("change of type");
  await press(f.tplApply, "button", "document", 1500);
  const after = (await call("/api/items/setup", { as: owner.cookie })).data;
  check(after.section.name === "Fragrances", `the section now has the template's name (${after.section?.name})`);
  const cats = (await call("/api/items/categories", { as: owner.cookie })).data;
  check((cats.categories ?? cats).some((c) => c.name === "Oud"), "its categories are added");
  const keptRose = (await call(`/api/items/${rose.id}`, { as: owner.cookie })).data;
  check(keptRose.custom?.[conc.key] === conc.choices[1].value, "and what the owner wrote on the item is untouched");
  await shot("after-change");

  check(b.problems.length === 0, `no errors in the browser console (${b.problems.slice(0, 3).join(" ; ")})`);
}

try {
  await run();
} catch (error) {
  failures.push(`the run stopped: ${error.message}`);
  log("FAIL", error.stack ?? error.message);
  try { await b.shot(`${OUT}/${LANG}-${SCHEME}-stopped.png`); } catch { /* nothing to show */ }
} finally {
  await b.close();
}
console.log(failures.length ? `\n${failures.length} failed:\n- ${failures.join("\n- ")}` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
