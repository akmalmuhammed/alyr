// Records one made-up sign-up (a salon) through the onboarding API, so the demo can play it
// back at /start (ALY-246). Writes apps/web/demo/onboarding.json. Run against a local API:
//   node scripts/demo-portal/record-onboarding.mjs [base-url]
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "http://localhost:3100";
const out = join(dirname(fileURLToPath(import.meta.url)), "../../apps/web/demo/onboarding.json");
// A signed customer link carries a token and a link points at the local address; neither belongs in
// a published file, so the token becomes "demo" and the address a placeholder.
const clean = (text) => text.replace(/([?&]t=)[A-Za-z0-9._-]{12,}/g, "$1demo").replaceAll("http://localhost:3100", "https://demo.alyr.example");
let cookie = "";
async function call(method, path, body, withCookie = true) {
  const r = await fetch(base + path, {
    method, headers: { "content-type": "application/json", ...(withCookie && cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = r.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, data };
}
const rec = {};
const email = `demo-${Date.now()}@example.com`;
rec.types = (await call("GET", "/api/onboarding/types")).data;
const sent = await call("POST", "/api/onboarding/code", { email });
const verified = await call("POST", "/api/onboarding/verify", { email, code: sent.data.dev_code });
const name = "Al Sadd Barbers";
await call("POST", "/api/onboarding/business", {
  signup_token: verified.data.signup_token, owner_name: "Hamad", name, name_ar: "حلاقة السد", type: "salon", area: "Al Sadd",
});
rec.me = (await call("GET", "/api/auth/me")).data;
rec.state = (await call("GET", "/api/onboarding/state")).data;
rec.services = (await call("GET", "/api/services")).data;
rec.hours = (await call("GET", "/api/hours")).data;
rec.chat0 = (await call("GET", "/api/onboarding/test-chat")).data;
rec.chat = [];
let turn = await call("POST", "/api/onboarding/test-chat", { text: "Hi", reply_id: "" });
rec.chat.push(turn.data);
for (let i = 0; i < 6; i++) {
  const bookings = (await call("GET", "/api/bookings")).data;
  if (bookings.bookings?.some((b) => b.customer.endsWith("(test)") && b.status === "booked")) { rec.bookings = bookings; break; }
  const last = [...turn.data.messages].reverse().find((m) => m.direction === "out" && (m.payload?.choices?.length || m.payload?.rows?.length || m.payload?.sections?.length));
  const choices = last?.payload?.choices ?? last?.payload?.rows ?? last?.payload?.sections?.flatMap((s) => s.rows) ?? [];
  const pick = choices[0];
  turn = await call("POST", "/api/onboarding/test-chat", pick ? { text: pick.title, reply_id: pick.id } : { text: "ok", reply_id: "" });
  rec.chat.push(turn.data);
}
rec.bookings ??= (await call("GET", "/api/bookings")).data;
// ALYR publishes the price (the back office is open on a local machine).
const clients = (await call("GET", "/api/admin/clients", undefined, false)).data.clients;
const mine = clients.find((c) => c.businesses.some((b) => b.name === name));
const detail = (await call("GET", `/api/admin/clients/${mine.id}`, undefined, false)).data;
const draft = detail.quotes.find((q) => q.status === "draft");
if (draft) await call("POST", `/api/admin/quotes/${draft.id}/publish`, undefined, false);
rec.quote = (await call("GET", "/api/onboarding/quote")).data;
rec.payment = (await call("GET", "/api/onboarding/payment")).data;
rec.readiness = (await call("GET", "/api/onboarding/readiness")).data;
rec.stateGolive = (await call("GET", "/api/onboarding/state")).data;
writeFileSync(out, clean(JSON.stringify(rec)));
console.log("chat turns", rec.chat.length, "booking", rec.bookings.bookings?.length, "quote", rec.quote?.status, "payment", rec.payment?.status);
console.log(rec.chat.map((c) => c.messages.at(-1)?.body + " | " + JSON.stringify(c.messages.at(-1)?.payload).slice(0, 160)).join("\n"));
