// Sign-up at /start, played back in the browser for the demo (ALY-246). It follows the real
// onboarding API's answers (recorded by scripts/demo-portal/record-onboarding.mjs for a
// made-up barber shop) and keeps its progress in this tab's session storage. Only the salon
// is offered; the test chat is scripted; no email, no code and no bank details are real.

import { json, loadPack, setShop } from "./shim";

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Run = {
  stage: "anon" | "verified" | "business" | "done";
  email: string; owner: string; name: string; name_ar: string; area: string;
  step: string; reminders: boolean;
  services: Obj[]; hours: Obj[]; chat: Obj[]; booked: boolean; accepted: boolean;
  readiness: Record<string, Obj>;
};

const KEY = "alyr-demo-signup";
let rec: Promise<Obj> | null = null;
const recorded = (real: typeof fetch) => (rec ??= real("/demo/onboarding.json").then((r) => r.json()));

export function readRun(): Run | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "null"); } catch { return null; }
}
const write = (run: Run) => { try { sessionStorage.setItem(KEY, JSON.stringify(run)); } catch { /* storage blocked: the page keeps going */ } };
export const clearRun = () => { try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ } };

const qar = (halalas: number) => `QAR ${(halalas / 100).toLocaleString("en-US")}`;

// The made-up price: two products together, the first at its list price and the second QAR 50.
function quoteOf(r: Obj, run: Run) {
  const q = structuredClone(r.quote);
  const chat = { ...q.lines[0], item_key: "chat", name: "ALYR Chat", name_ar: "ALYR Chat", unit_price: 5000, unit_price_text: qar(5000), amount: 5000, amount_text: qar(5000) };
  q.lines.splice(1, 0, chat);
  for (const l of q.lines) { l.business = run.name; l.business_ar = run.name_ar; }
  const monthly = 44900 + 5000;
  const setup = 250000;
  q.totals = {
    monthly_subtotal: monthly, discount: 0, monthly_total: monthly, period_total: monthly, one_time_total: setup,
    monthly_subtotal_text: qar(monthly), discount_text: qar(0), monthly_total_text: qar(monthly),
    period_total_text: qar(monthly), one_time_total_text: qar(setup),
  };
  q.together = { alone: 89800, price: monthly, saving: 39900, saving_pct: 44, alone_text: qar(89800), price_text: qar(monthly), saving_text: qar(39900) };
  if (run.accepted) { q.status = "accepted"; q.accepted_at = new Date().toISOString(); q.accepted_by = run.owner; }
  return q;
}

function stateOf(r: Obj, run: Run) {
  const base = structuredClone(run.step === "plan" || run.step === "golive" ? r.stateGolive : r.state);
  base.business = { ...base.business, name: run.name, name_ar: run.name_ar, area: run.area, reminders: run.reminders };
  base.owner = { name: run.owner, email: run.email };
  base.step = run.step;
  base.services = run.services.filter((s) => s.active !== false);
  base.hours = run.hours;
  if (base.quote) base.quote = quoteOf(r, run);
  return base;
}

function readinessOf(r: Obj, run: Run) {
  const out = structuredClone(r.readiness);
  const done = new Set<string>(["content", "hours"]);
  if (run.booked) done.add("test");
  if (run.accepted) done.add("price");
  for (const check of out.checks ?? []) if (check.key && done.has(check.key)) check.status = "done";
  return out;
}

const SCRIPT = (name: string) => ({
  hello: `Welcome to ${name}. How can we help?`,
  pick: "Which service would you like? Haircut is QAR 60 and takes 45 minutes.",
  when: "The first free time is tomorrow morning. Shall I book it?",
  done: "Booked: Haircut. We will remind you the evening before.",
});

function say(run: Run, text: string, choices: { id: string; title: string }[] = []) {
  const at = new Date().toISOString();
  run.chat.push({ direction: "in", kind: "text", body: text, payload: {}, status: "received", created_at: at });
  const words = SCRIPT(run.name);
  const turn = run.chat.filter((m) => m.direction === "in").length;
  const reply = turn === 1 ? { body: words.hello, choices: [{ id: "book", title: "Book a visit" }, { id: "prices", title: "Prices" }] }
    : turn === 2 ? { body: words.pick, choices: [{ id: "haircut", title: "Haircut" }, { id: "beard", title: "Beard trim" }] }
    : turn === 3 ? { body: words.when, choices: [{ id: "yes", title: "Yes, book it" }] }
    : { body: words.done, choices: [] };
  if (turn >= 4) run.booked = true;
  void choices;
  run.chat.push({ direction: "out", kind: reply.choices.length ? "buttons" : "text", body: reply.body, payload: reply.choices.length ? { choices: reply.choices } : {}, status: "sent", created_at: at });
}

export async function signup(real: typeof fetch, method: string, url: URL, body: unknown): Promise<Response | null> {
  const path = url.pathname;
  const onStart = window.location.pathname.startsWith("/start");
  const isOnboarding = path.startsWith("/api/onboarding/") || (onStart && (path === "/api/auth/me" || path.startsWith("/api/services") || path === "/api/hours" || path === "/api/bookings"));
  const run = readRun();
  // The workspace after a demo sign-up is the new shop's name over the sample salon's screens.
  if (!isOnboarding) {
    if (run?.stage === "done" && method === "GET" && (path === "/api/workspace" || path === "/api/auth/me")) {
      const pack = await loadPack(real, "salon");
      const hit = path === "/api/workspace" ? pack.get["/api/workspace"] : { body: pack.me };
      const copy = structuredClone(hit.body) as Obj;
      if (path === "/api/workspace") { copy.business = { ...copy.business, name: run.name, name_ar: run.name_ar }; copy.me = { ...copy.me, name: run.owner }; }
      else copy.name = run.owner;
      return json(copy);
    }
    return null;
  }

  const r = await recorded(real);
  const b = (body ?? {}) as Obj;
  const fresh = (): Run => ({
    stage: "anon", email: "", owner: "Hamad", name: "Al Sadd Barbers", name_ar: "حلاقة السد", area: "Al Sadd",
    step: "services", reminders: true, services: structuredClone(r.state.services), hours: structuredClone(r.state.hours),
    chat: [], booked: false, accepted: false, readiness: {},
  });
  const cur = run ?? fresh();
  const signedIn = cur.stage === "business" || cur.stage === "done";

  if (path === "/api/auth/me") return json(signedIn ? { ...r.me, name: cur.owner, email: cur.email } : { signed_in: false });
  if (path === "/api/onboarding/types") return json({ ...r.types, types: r.types.types.filter((t: Obj) => t.key === "salon"), signup_open: true });
  if (path === "/api/onboarding/code") { write({ ...fresh(), email: String(b.email ?? "") }); return json({ sent: true, dev_code: "482913" }); }
  if (path === "/api/onboarding/verify") { write({ ...cur, stage: "verified" }); return json({ status: "new", signup_token: "demo" }); }
  if (path === "/api/onboarding/business") {
    write({ ...cur, stage: "business", owner: String(b.owner_name || "Hamad"), name: String(b.name || cur.name), name_ar: String(b.name_ar || cur.name_ar), area: String(b.area || cur.area), step: "services" });
    return json({ ok: true });
  }
  if (!signedIn) return json({ detail: "Sign in first." }, 401);

  if (path === "/api/onboarding/state") {
    if (method === "PATCH") {
      if (typeof b.step === "string") cur.step = b.step;
      if (typeof b.reminders === "boolean") cur.reminders = b.reminders;
      write(cur);
    }
    return json(stateOf(r, cur));
  }
  if (path === "/api/onboarding/readiness") return json(readinessOf(r, cur));
  if (path.startsWith("/api/onboarding/steps/") || path === "/api/onboarding/whatsapp") return json(readinessOf(r, cur));
  if (path === "/api/onboarding/quote") return json(quoteOf(r, cur));
  if (path === "/api/onboarding/quote/accept") { cur.accepted = true; write(cur); return json(quoteOf(r, cur)); }
  if (path === "/api/onboarding/payment") {
    const q = quoteOf(r, cur);
    const due = cur.accepted ? q.totals.monthly_total + q.totals.one_time_total : 0;
    return json({
      ...r.payment, status: cur.accepted ? "unpaid" : "no_price", due, due_text: qar(due), left: due, left_text: qar(due),
      setup_text: qar(q.totals.one_time_total), period_text: qar(q.totals.monthly_total), quote_number: 1,
      reference: "ALYR-4821", bank: "DEMO ONLY: no real bank details here.\nIn the live product your payment reference and ALYR's bank account show here.",
    });
  }
  if (path === "/api/onboarding/finish") { cur.stage = "done"; write(cur); setShop("salon"); return json({ ok: true }); }
  if (path === "/api/onboarding/test-chat") {
    if (method === "POST") { say(cur, String(b.text ?? ""), []); write(cur); }
    return json({ messages: cur.chat });
  }
  if (path === "/api/bookings") {
    const pack = await loadPack(real, "salon");
    const base = structuredClone(pack.get["/api/bookings"].body) as Obj;
    const sample = base.bookings?.[0];
    base.bookings = cur.booked && sample ? [{ ...sample, customer: "Test customer (test)", status: "booked", service: "Haircut" }] : [];
    return json(base);
  }
  if (path === "/api/hours" && method === "PUT") { cur.hours = (b.periods as Obj[]) ?? cur.hours; write(cur); return json({ hours: cur.hours }); }
  if (path === "/api/services" && method === "POST") {
    cur.services.push({ id: `demo-${Date.now()}`, name: String(b.name), name_ar: String(b.name), duration_minutes: 30, price: 0, price_text: qar(0) });
    write(cur); return json({ services: cur.services });
  }
  const one = path.match(/^\/api\/services\/([^/]+)(\/active)?$/);
  if (one) {
    const found = cur.services.find((s) => s.id === one[1]);
    if (found && one[2]) found.active = (b.active as boolean) ?? true;
    else if (found) Object.assign(found, b, b.price !== undefined ? { price_text: qar(Number(b.price)) } : {});
    write(cur); return json({ services: cur.services });
  }
  return json({ detail: "This part is not in the demo." }, 404);
}
