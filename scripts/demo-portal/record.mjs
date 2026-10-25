// Records what the portal's screens read from the API for one demo shop, so the portal can be
// published with demo data and no backend (docs/runbooks/portal-demo.md, ALY-246).
//
//   node scripts/demo-portal/record.mjs <shop-key> <owner-email> [base-url]
//
// Needs the API and `pnpm dev` running on a machine with the fictional demo shops loaded
// (scripts/cloud-setup.sh, then python -m alyr.seed_bookings / seed_qirfa / seed_catalog_demos).
// Writes apps/web/demo/<shop-key>.json and the shop's picture files into apps/web/demo/media/.
// Reads only; only GET answers are kept. Everything recorded is invented demo data.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Playwright is not a dependency of the repo: point PLAYWRIGHT_DIR at an install of it.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_DIR ?? "playwright");

const [shop, email, base = "http://localhost:3100"] = process.argv.slice(2);
if (!shop || !email) { console.error("usage: record.mjs <shop-key> <owner-email> [base-url]"); process.exit(1); }
const out = join(dirname(fileURLToPath(import.meta.url)), "../../apps/web/demo");
mkdirSync(join(out, "media"), { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const get = {};
const media = new Map();
page.on("response", async (r) => {
  const u = new URL(r.url());
  if (r.request().method() !== "GET" || !u.pathname.startsWith("/api/")) return;
  const type = r.headers()["content-type"] ?? "";
  try {
    if (type.includes("json")) get[u.pathname + u.search] = { status: r.status(), body: await r.json() };
    else if (type.startsWith("image/") && r.ok()) media.set(u.pathname, { type, body: await r.body() });
  } catch { /* a response that went away while the page moved on */ }
});

const code = (await (await page.request.post(`${base}/api/auth/code`, { data: { email } })).json()).dev_code;
await page.request.post(`${base}/api/auth/verify`, { data: { email, code } });

// A signed customer link carries a token and a link points at the local address; neither belongs in
// a published file, so the token becomes "demo" and the address a placeholder.
const clean = (text) => text.replace(/([?&]t=)[A-Za-z0-9._-]{12,}/g, "$1demo").replaceAll("http://localhost:3100", "https://demo.alyr.example");
const settle = (ms = 1500) => page.waitForTimeout(ms);
// SKIP_CRAWL=1 keeps what an earlier run recorded and only adds the detail answers below.
const file = join(out, `${shop}.json`);
if (process.env.SKIP_CRAWL && existsSync(file)) Object.assign(get, JSON.parse(readFileSync(file, "utf8")).get);
const SKIP = /delete|remove|cancel|archive|send|sign out|log out|revoke|reset|import|export|download|pay|refund|save|apply|confirm|mark|accept|reject|disable|enable|add|new|create|upload|invite|publish|issue|void|credit/i;

await page.goto(`${base}/app`); await settle(3000);
const links = [...new Set(await page.$$eval(".sh-link", (as) => as.map((a) => a.getAttribute("href"))))];
for (const link of process.env.SKIP_CRAWL ? [] : links) {
  await page.goto(base + link); await settle(2500);
  // Open what can be opened without changing anything: tabs, filters, rows, cards.
  const count = await page.locator("main button, main [role=tab], main a[href^='/app']").count();
  for (let i = 0; i < Math.min(count, 40); i++) {
    await page.goto(base + link); await settle(900);
    const el = page.locator("main button, main [role=tab], main a[href^='/app']").nth(i);
    const label = ((await el.textContent().catch(() => "")) ?? "").trim();
    if (!(await el.isVisible().catch(() => false)) || SKIP.test(label)) continue;
    await el.click({ timeout: 1500 }).catch(() => {});
    await settle(700);
  }
}

// Detail answers behind the lists, read straight from the API with the same sign-in.
const ids = (path, key, pick) => (get[path]?.body?.[key] ?? get[path]?.body ?? []).slice?.(0, pick).map((x) => x.id ?? x.contact_id).filter(Boolean) ?? [];
const fetchJson = async (path) => {
  if (get[path]) return;
  const r = await page.request.get(base + path);
  if ((r.headers()["content-type"] ?? "").includes("json")) get[path] = { status: r.status(), body: await r.json() };
};
for (const convoPath of Object.keys(get).filter((k) => k.startsWith("/api/inbox/conversations?")))
  for (const id of ids(convoPath, "conversations", 8)) await fetchJson(`/api/inbox/conversations/${id}`);
// A long chat is cut to its last 40 messages: the demo does not need a year of history.
for (const [path, answer] of Object.entries(get))
  if (/^\/api\/inbox\/conversations\/[^?]+$/.test(path) && Array.isArray(answer.body?.messages)) answer.body.messages = answer.body.messages.slice(-40);
for (const customer of (get["/api/ledger/summary"]?.body?.customers ?? []).slice(0, 12)) await fetchJson(`/api/ledger/customers/${customer.id}/entries`);
const itemPath = Object.keys(get).find((k) => k.startsWith("/api/items?") || k === "/api/items");
if (itemPath) for (const id of ids(itemPath, "items", 40))
  for (const tail of ["", "/price-history", "/group-prices", "/activity", "/photos", "/stock-log"]) await fetchJson(`/api/items/${id}${tail}`);
for (const path of ["/api/items/categories", "/api/items/settings", "/api/items/share", "/api/items/stock-log", "/api/price-groups", "/api/features",
  "/api/services", "/api/hours", "/api/templates", "/api/staff-numbers", "/api/reports/weekly", "/api/reports/settings", "/api/media/usage"]) await fetchJson(path);

for (const [path, file] of media) {
  const name = path.replace(/^\/api\//, "").replace(/\//g, "__");
  writeFileSync(join(out, "media", name), file.body);
}
const me = get["/api/auth/me"]?.body ?? null;
writeFileSync(join(out, `${shop}.json`), clean(JSON.stringify({ shop, me, get, media: [...media].map(([path, f]) => ({ path, type: f.type, file: path.replace(/^\/api\//, "").replace(/\//g, "__") })) })));
console.log(`${shop}: ${Object.keys(get).length} answers, ${media.size} pictures`);
await browser.close();
