// The back office's outreach screens (specs/065, ALY-311) in a real browser, at phone width (390)
// and on a laptop (1440), light and dark, before the API exists: every `/api/*` call the page
// makes is answered here from fixtures, through the DevTools protocol's Fetch domain, so the
// screens render with realistic data and the founder's actions (approve, a stale approval, edit,
// reject, the kill switch, a connection test) run end to end against a small fake that keeps
// state. Then the empty and error states. Headless Chrome or Edge over scripts/browser-kit.mjs,
// no packages. Node 22.
//
//   cd apps/web && ALYR_API_URL=http://127.0.0.1:9 pnpm exec next dev -p 3311   # nothing answers on 9
//   EDGE_PATH=/usr/bin/google-chrome node scripts/outreach-browser-check.mjs \
//        --base http://localhost:3311 --out /tmp/or-shots --port 9641 --no-sandbox \
//        --axe apps/web/node_modules/axe-core/axe.min.js
//
// Every business, person and address below is made up (CLAUDE.md, rule 10). Domains end in
// `.example` (RFC 2606), so no link here can reach a real business.

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch, sleep } from "./browser-kit.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3311";
const OUT = args.out ?? `${tmpdir()}/or-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/or-profile`;
const PORT = Number(args.port ?? 9641);
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const FLAGS = args["no-sandbox"] === "true" ? ["--no-sandbox"] : [];
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };

// ── fixtures ────────────────────────────────────────────────────────────────────────────────
const H = 3_600_000;
const ago = (hours) => new Date(Date.now() - hours * H).toISOString();
const ok = (findings) => ({ ok: findings.every((f) => f.ok), findings });
const LINT_OK = ok([
  { key: "uncited_fact", ok: true, note: "" }, { key: "under_150_words", ok: true, note: "" },
  { key: "subject_length", ok: true, note: "" }, { key: "no_link", ok: true, note: "" },
  { key: "no_tracking", ok: true, note: "" }, { key: "opt_out_line", ok: true, note: "" }, { key: "legal_line", ok: true, note: "" },
]);
const CRITIC_OK = ok([
  { key: "rests_on_brief", ok: true, note: "" }, { key: "short_plain", ok: true, note: "" }, { key: "true_to_offer", ok: true, note: "" },
]);
const FOOT = "Akmal, ALYR\nALYR Technologies, PO Box 00000, Doha, Qatar (sample legal line)\nIf you would rather not hear from me again, reply \"stop\" and I will not write again.";

function draft(id, prospect, step, version, subject, sentences, extra = {}) {
  const body = sentences.map((s) => s.text).join(" ").replace(/\n /g, "\n") + `\n\n${FOOT}`;
  return {
    id, prospect_id: prospect, kind: "sequence", step, version, subject, body, language: "en",
    sentences, critic: CRITIC_OK, lint: LINT_OK, body_hash: `h-${id}-v${version}`, status: "in_review",
    created_by: "model", created_at: ago(5), wait_working_days: step === 2 ? 3 : step === 3 ? 7 : null, ...extra,
  };
}

const dunelightClaims = [
  { id: "c1", text: "Bakes sourdough and date loaves every morning", url: "https://dunelight-bakehouse.example/", quote: "baked fresh every morning from 6", kept: true, dropped_reason: null },
  { id: "c2", text: "Takes orders by Instagram message", url: "https://dunelight-bakehouse.example/order", quote: "send us a DM on Instagram to order", kept: true, dropped_reason: null },
  { id: "c3", text: "Offers next-day pickup from Al Sadd", url: "https://dunelight-bakehouse.example/pickup", quote: "pick up the next day at our Al Sadd counter", kept: true, dropped_reason: null },
  { id: "c4", text: "Has three branches", url: "https://dunelight-bakehouse.example/about", quote: "our three branches", kept: false, dropped_reason: "The quoted words are not on the page." },
];
const saffronClaims = [
  { id: "c1", text: "Delivers flower boxes across Doha the same day", url: "https://saffronloop.example/", quote: "same-day delivery anywhere in Doha", kept: true, dropped_reason: null },
  { id: "c2", text: "Takes corporate orders for events", url: "https://saffronloop.example/events", quote: "corporate and event orders welcome", kept: true, dropped_reason: null },
];
const tesselleClaims = [
  { id: "c1", text: "Roasts in small batches in Leeds", url: "https://tessellecoffee.example/about", quote: "small-batch roasting in Leeds", kept: true, dropped_reason: null },
  { id: "c2", text: "Sells wholesale to cafés", url: "https://tessellecoffee.example/wholesale", quote: "wholesale for independent cafés", kept: true, dropped_reason: null },
];

const S = (text, claim_ids = []) => ({ text, claim_ids });
function makeReview() {
  return [
    {
      draft: draft("d-dune-1", "p-dune", 1, 1, "Instagram orders at Dunelight", [
        S("Hi Mariam,\n\n"),
        S("I saw that Dunelight takes orders by Instagram message and offers next-day pickup in Al Sadd.", ["c2", "c3"]),
        S("With loaves baked fresh every morning, a missed message is a loaf nobody collects.", ["c1"]),
        S("ALYR keeps those orders in one list, so each one is confirmed and ready for pickup."),
        S("Would a short call next week be useful?"),
      ]),
      follow_ups: [
        draft("d-dune-2", "p-dune", 2, 1, "Re: Instagram orders at Dunelight", [
          S("Hi Mariam,\n\n"), S("A quick follow-up on my note about next-day pickup orders.", ["c3"]), S("Happy to show it in ten minutes."),
        ]),
        draft("d-dune-3", "p-dune", 3, 1, "Last note from ALYR", [
          S("Hi Mariam,\n\n"), S("I will leave it here."), S("If orders by message ever pile up, my reply is open."),
        ]),
      ],
      prospect: {
        id: "p-dune", company: "Dunelight Bakehouse", website: "https://dunelight-bakehouse.example", domain: "dunelight-bakehouse.example",
        country: "QA", lane: "allowed", business_type: "Bakery", contact_first_name: "Mariam", contact_role: "Owner",
        email_verifier: "valid", basis: "published_business_contact", basis_note: "Email on the contact page", level: 1,
        fit_score: 82, fit_reason: "Takes orders by message and runs a pickup counter: the order list fits how it already works.", language: "en",
      },
      claims: dunelightClaims, dropped_claims: 1, waiting_since: ago(26),
    },
    {
      draft: draft("d-saff-1", "p-saff", 1, 1, "Event orders at Saffron Loop", [
        S("Hi Huda,\n\n"),
        S("Saffron Loop delivers flower boxes across Doha the same day and takes corporate orders for events.", ["c1", "c2"]),
        S("ALYR keeps every order and its delivery time in one place."),
        S("Worth a look?"),
      ]),
      follow_ups: [draft("d-saff-2", "p-saff", 2, 1, "Re: Event orders", [S("Hi Huda,\n\n"), S("Following up once."), S("See it at alyr.example/demo.")], {
        lint: ok([{ key: "no_link", ok: false, note: "A link in a follow-up needs your approval as written." }, { key: "under_150_words", ok: true, note: "" }]),
      })],
      prospect: {
        id: "p-saff", company: "Saffron Loop Florists", website: "https://saffronloop.example", domain: "saffronloop.example",
        country: "QA", lane: "allowed", business_type: "Florist", contact_first_name: "Huda", contact_role: "Marketing lead",
        email_verifier: "accept_all", basis: "referral", basis_note: "Introduced by a supplier", level: 1,
        fit_score: 71, fit_reason: "Same-day delivery runs on messages and times.", language: "en",
      },
      claims: saffronClaims, dropped_claims: 0, waiting_since: ago(5),
    },
    {
      draft: draft("d-tess-1", "p-tess", 1, 2, "Wholesale orders, Tessellé", [
        S("Hi Tom,\n\n"),
        S("Tessellé roasts in small batches in Leeds and sells wholesale to cafés.", ["c1", "c2"]),
        S("Our clients cut order mistakes in half."),
        S("See how at https://alyr.example."),
      ], {
        lint: ok([
          { key: "uncited_fact", ok: false, note: "“Our clients cut order mistakes in half.” names a fact and cites nothing." },
          { key: "no_link", ok: false, note: "The first message has a link." },
          { key: "under_150_words", ok: true, note: "" },
        ]),
        critic: ok([{ key: "true_to_offer", ok: false, note: "Claims a result ALYR has no clients for." }, { key: "short_plain", ok: true, note: "" }]),
      }),
      follow_ups: [],
      prospect: {
        id: "p-tess", company: "Tessellé Coffee Roasters", website: "https://tessellecoffee.example", domain: "tessellecoffee.example",
        country: "GB", lane: "allowed", business_type: "Coffee roaster", contact_first_name: "Tom", contact_role: "Founder",
        email_verifier: "valid", basis: "legitimate_interest", basis_note: "LIA-2026-03", level: 2,
        fit_score: 58, fit_reason: "Wholesale orders arrive by email and phone.", language: "en",
      },
      claims: tesselleClaims, dropped_claims: 0, waiting_since: ago(2),
    },
  ];
}

const row = (id, company, domain, country, lane, stage, first, role, verifier, basis, level, fit, hours, extra = {}) => ({
  id, company, website: `https://${domain}`, domain, country, lane, business_type: extra.type ?? "", source: extra.source ?? "discovery",
  stage, paused: extra.paused ?? false, contact_first_name: first, contact_role: role, email_verifier: verifier, basis, level,
  fit_score: fit, updated_at: ago(hours),
});
function makeProspects() {
  return [
    row("p-dune", "Dunelight Bakehouse", "dunelight-bakehouse.example", "QA", "allowed", "in_review", "Mariam", "Owner", "valid", "published_business_contact", 1, 82, 26, { type: "Bakery" }),
    row("p-saff", "Saffron Loop Florists", "saffronloop.example", "QA", "allowed", "in_review", "Huda", "Marketing lead", "accept_all", "referral", 1, 71, 5, { type: "Florist" }),
    row("p-tess", "Tessellé Coffee Roasters", "tessellecoffee.example", "GB", "allowed", "in_review", "Tom", "Founder", "valid", "legitimate_interest", 2, 58, 2, { type: "Coffee roaster" }),
    row("p-qamar", "Qamar Tailoring House", "qamartailoring.example", "QA", "allowed", "sending", "Yousef", "General manager", "valid", "published_business_contact", 1, 77, 30, { type: "Tailor" }),
    row("p-ward", "Wardat Al Reem Salon", "wardatalreem.example", "SA", "allowed", "needs_human", "", "", null, null, 1, null, 50, { type: "Salon" }),
    row("p-pebble", "Pebblegate Stationers", "pebblegate.example", "AE", "allowed", "replied", "Leila", "Owner", "valid", "existing_relationship", 1, 64, 70, { type: "Stationery", source: "manual" }),
    row("p-copper", "Copperleaf Kitchen", "copperleaf.example", "DE", "consent_only", "disqualified", "Jonas", "Owner", "valid", "opt_in", 1, 40, 120, { type: "Restaurant", source: "import" }),
    row("p-marlo", "Marlowe & Finch Bakery", "marlowefinch.example", "US", "allowed", "researching", "", "", null, "legitimate_interest", 3, null, 1, { type: "Bakery" }),
    row("p-orbit", "Orbit Cycle Repairs", "orbitcycles.example", "GB", "allowed", "opted_out", "Sam", "Owner", "valid", "legitimate_interest", 2, 55, 200, { type: "Bike shop", paused: false }),
  ];
}

function makeDetail(id) {
  const base = state.prospects.find((p) => p.id === id);
  if (!base) return null;
  const item = makeReview().find((i) => i.prospect.id === id);
  const sends = id === "p-qamar"
    ? [{ id: "s1", draft_id: "d-q-1", step: 1, sent_at: ago(70), message_id: "<a1@outreach.example>", status: "sent" }]
    : [];
  return {
    ...base, source_url: `https://search.example/q?${id}`, contact_last_name: id === "p-dune" ? "Haddad" : "",
    contact_email: base.contact_first_name ? `${base.contact_first_name.toLowerCase()}@${base.domain}` : "",
    email_source: base.contact_first_name ? "finder" : null, basis_note: item?.prospect.basis_note ?? "", language: "en",
    fit_reason: item?.prospect.fit_reason ?? "", notes: id === "p-dune" ? "Met at a food market in Oct; asked to be written to." : "",
    paused_reason: base.paused ? "Paused by staff" : "",
    claims: id === "p-dune" ? dunelightClaims : item?.claims ?? [],
    drafts: item ? [item.draft, ...item.follow_ups, { ...item.draft, id: `${item.draft.id}-old`, version: 0, status: "superseded", created_at: ago(40) }] : [],
    approvals: [],
    intents: id === "p-qamar" ? [{ id: "i2", step: 2, draft_id: "d-q-2", run_at: ago(-20), status: "rescheduled", last_check: 10, last_result: "Friday in Doha: next opening Sunday 08:30" }] : [],
    sends,
    replies: id === "p-pebble" ? [state.replies[0]] : [],
    events: [
      { at: ago(26), kind: "stage", actor: "engine", detail: { from: "drafting", to: "in_review" } },
      { at: ago(27), kind: "draft", actor: "engine", detail: { note: "Three steps drafted; lint passed" } },
      { at: ago(30), kind: "research", actor: "engine", detail: { note: "4 claims, 3 kept, 1 dropped" } },
      { at: ago(31), kind: "stage", actor: "engine", detail: { from: "new", to: "researching" } },
    ],
  };
}

function makeReplies() {
  return [
    {
      id: "r1", prospect_id: "p-pebble", company: "Pebblegate Stationers", contact_first_name: "Leila", step: 1, received_at: ago(3),
      subject: "Re: Orders by message at Pebblegate", body: "Hi Akmal,\n\nYes, this sounds useful. We get a lot of school-list orders on WhatsApp in August. Could you show me on Tuesday afternoon?\n\nLeila",
      label: "interested", other_labels: [], confidence: 0.93, waiting_because: "interested", booking_draft_id: "d-book-1",
      handled_by: "", handled_at: null, note: "",
    },
    {
      id: "r2", prospect_id: "p-qamar", company: "Qamar Tailoring House", contact_first_name: "Yousef", step: 1, received_at: ago(20),
      subject: "Re: Fittings booked by message", body: "Does this work with our existing booking book? We are not ready to change everything. Maybe after Ramadan.",
      label: "question", other_labels: ["not_now"], confidence: 0.61, waiting_because: "several_labels", booking_draft_id: null,
      handled_by: "", handled_at: null, note: "",
    },
  ];
}

const CONNECTIONS = [
  { key: "model", provider: "Anthropic", configured: true, settings: [{ name: "ALYR_ANTHROPIC_API_KEY", present: true }, { name: "ALYR_OUTREACH_MODEL_FAST", present: true }, { name: "ALYR_OUTREACH_MODEL_DRAFT", present: true }], last_test: { ok: true, message: "Answered the one-word check.", at: ago(4), by: "staff@alyr.example" } },
  { key: "discovery", provider: "Exa", configured: true, settings: [{ name: "ALYR_EXA_API_KEY", present: true }], last_test: null },
  { key: "email_finder", provider: "Hunter", configured: false, settings: [{ name: "ALYR_HUNTER_API_KEY", present: false }], last_test: null },
  { key: "smtp", provider: "smtp.mail.example", configured: true, settings: ["HOST", "PORT", "USER", "PASSWORD"].map((n) => ({ name: `ALYR_OUTREACH_SMTP_${n}`, present: true })).concat([{ name: "ALYR_OUTREACH_FROM", present: true }, { name: "ALYR_OUTREACH_FROM_NAME", present: true }]), last_test: { ok: false, message: "Sign-in refused: 535 authentication failed.", at: ago(1), by: "staff@alyr.example" } },
  { key: "imap", provider: "imap.mail.example", configured: false, settings: ["HOST", "PORT", "USER", "PASSWORD"].map((n) => ({ name: `ALYR_OUTREACH_IMAP_${n}`, present: n !== "PASSWORD" })), last_test: null },
];

function makeActivity() {
  return [
    { id: "a1", kind: "reply", at: ago(3), prospect_id: "p-pebble", company: "Pebblegate Stationers", step: 1, check: null, outcome: "", detail: "Labelled interested (93%). A booking reply waits in Review." },
    { id: "a2", kind: "refusal", at: ago(6), prospect_id: "p-qamar", company: "Qamar Tailoring House", step: 2, check: 10, outcome: "rescheduled", detail: "Friday in Doha. Next opening Sunday 08:30." },
    { id: "a3", kind: "send", at: ago(7), prospect_id: "p-qamar", company: "Qamar Tailoring House", step: 1, check: null, outcome: "", detail: "Sent from the outreach mailbox." },
    { id: "a4", kind: "refusal", at: ago(9), prospect_id: "p-copper", company: "Copperleaf Kitchen", step: 1, check: 6, outcome: "blocked", detail: "Germany needs consent; the basis on record is not allowed." },
    { id: "a5", kind: "opt_out", at: ago(30), prospect_id: "p-orbit", company: "Orbit Cycle Repairs", step: 2, check: null, outcome: "", detail: "Replied “stop”. Suppressed; sequence stopped." },
    { id: "a6", kind: "bounce", at: ago(52), prospect_id: null, company: "(erased prospect)", step: 1, check: null, outcome: "", detail: "550 5.1.1 mailbox unknown. Address suppressed." },
  ];
}

let state;
function reset(mode = "full") {
  state = {
    mode, approveCalls: 0,
    review: mode === "full" ? makeReview() : [],
    prospects: mode === "full" ? makeProspects() : [],
    replies: mode === "full" ? makeReplies() : [],
    activity: mode === "full" ? makeActivity() : [],
    kill: { on: false, reason: "", by: "", at: null },
    settings: { global_daily_cap: 50, default_level: 1, honeytokens: ["trap.one@alyr-check.example", "trap.two@alyr-check.example"], booking_url: "", booking_url_default: "https://cal.alyr.example/akmal/intro", updated_by: "staff@alyr.example", updated_at: ago(48) },
    connections: structuredClone(CONNECTIONS),
  };
}
reset();

function overview() {
  const stages = {};
  for (const p of state.prospects) stages[p.stage] = (stages[p.stage] ?? 0) + 1;
  return {
    enabled: true, kill_switch: state.kill, stages, review_waiting: state.review.length, replies_waiting: state.replies.filter((r) => !r.handled_at).length,
    today: { sent: state.mode === "full" ? 7 : 0, global_cap: state.settings.global_daily_cap, mailbox_cap: 10, ramp_week: 1, queued: state.mode === "full" ? 2 : 0 },
    queues: { queued: 2, held: 0, rescheduled: 1 }, mailbox: { from_address: "akmal@outreach.example", paused: false, paused_reason: "" },
    connections: state.connections.map((c) => ({ key: c.key, configured: c.configured, ok: c.last_test?.ok ?? null })),
  };
}

/** The fake API: [status, body] for a method, a path and a JSON body. */
function answer(method, path, body) {
  const url = new URL(path, "http://x");
  const p = url.pathname;
  if (p === "/api/admin/staff") return [200, { me: "staff@alyr.example", staff: [] }];
  if (state.mode === "error") return [500, { detail: "The outreach service is not answering." }];
  const O = "/api/admin/outreach";
  if (p === `${O}/overview`) return [200, overview()];
  if (p === `${O}/review`) return [200, { items: state.review }];
  let m;
  if ((m = p.match(new RegExp(`^${O}/drafts/([^/]+)/approve$`)))) {
    state.approveCalls++;
    const item = state.review.find((i) => i.draft.id === m[1]);
    if (!item) return [404, { detail: "No such draft." }];
    // The first approval of Dunelight's message arrives after an edit elsewhere: the hash is stale.
    if (item.prospect.id === "p-dune" && item.draft.version === 1) {
      item.draft = { ...item.draft, version: 2, body_hash: "h-d-dune-1-v2", created_by: "staff@alyr.example", subject: "Instagram orders at Dunelight Bakehouse" };
      return [409, { detail: { code: "stale_hash", message: "The draft changed." } }];
    }
    if (body.body_hash !== item.draft.body_hash) return [409, { detail: { code: "stale_hash", message: "The draft changed." } }];
    state.review = state.review.filter((i) => i !== item);
    const pr = state.prospects.find((x) => x.id === item.prospect.id); if (pr) pr.stage = "approved";
    return [200, { approved: [item.draft.id, ...(body.with_follow_ups ? item.follow_ups.map((f) => f.id) : [])] }];
  }
  if ((m = p.match(new RegExp(`^${O}/drafts/([^/]+)/edit$`)))) {
    for (const item of state.review) {
      const all = [item.draft, ...item.follow_ups];
      const d = all.find((x) => x.id === m[1]);
      if (d) {
        const fresh = { ...d, id: `${d.id}-v${d.version + 1}`, version: d.version + 1, subject: body.subject, body: body.body, body_hash: `h-${d.id}-v${d.version + 1}`, created_by: "staff@alyr.example",
          lint: body.body.includes("http") ? ok([{ key: "no_link", ok: false, note: "The first message has a link." }]) : LINT_OK, critic: null };
        if (item.draft.id === d.id) item.draft = fresh; else item.follow_ups = item.follow_ups.map((f) => (f.id === d.id ? fresh : f));
        return [200, fresh];
      }
    }
    return [404, { detail: "No such draft." }];
  }
  if ((m = p.match(new RegExp(`^${O}/drafts/([^/]+)/reject$`)))) {
    if (!body.reason) return [422, { detail: "A reason is required." }];
    state.review = state.review.filter((i) => i.draft.id !== m[1]);
    return [200, { ok: true }];
  }
  if (p === `${O}/prospects` && method === "GET") return [200, { prospects: state.prospects }];
  if (p === `${O}/prospects` && method === "POST") {
    const id = `p-new-${state.prospects.length}`;
    state.prospects.unshift(row(id, body.company, new URL(body.website).host, body.country, "allowed", "new", body.contact_first_name, body.contact_role, null, body.basis, 1, null, 0, { source: "manual" }));
    return [200, { id }];
  }
  if (p === `${O}/prospects/import`) return [200, { added: 2, skipped: [{ row: 3, reason: "ZZ: outreach is blocked there" }] }];
  if (p === `${O}/discover`) return [200, { queued: true, job_id: "job-1" }];
  if ((m = p.match(new RegExp(`^${O}/prospects/([^/]+)$`)))) {
    if (method === "PATCH") { const pr = state.prospects.find((x) => x.id === m[1]); if (pr && body.disqualify) pr.stage = "disqualified"; return [200, { ok: true }]; }
    const d = makeDetail(m[1]);
    return d ? [200, d] : [404, { detail: "No such prospect." }];
  }
  if ((m = p.match(new RegExp(`^${O}/prospects/([^/]+)/(pause|resume|research)$`)))) {
    const pr = state.prospects.find((x) => x.id === m[1]);
    if (pr && m[2] !== "research") pr.paused = m[2] === "pause";
    return [200, { ok: true }];
  }
  if (p === `${O}/replies`) return [200, { replies: state.replies.filter((r) => (url.searchParams.get("handled") === "true" ? r.handled_at : !r.handled_at)) }];
  if ((m = p.match(new RegExp(`^${O}/replies/([^/]+)/handled$`)))) {
    const r = state.replies.find((x) => x.id === m[1]);
    if (r) Object.assign(r, { handled_at: new Date().toISOString(), handled_by: "staff@alyr.example", note: body.note ?? "" });
    return [200, { ok: true }];
  }
  if (p === `${O}/activity`) {
    const kind = url.searchParams.get("kind");
    const counts = {};
    for (const a of state.activity) counts[a.kind] = (counts[a.kind] ?? 0) + 1;
    return [200, { items: state.activity.filter((a) => !kind || a.kind === kind), today: overview().today, counts }];
  }
  if (p === `${O}/connections`) return [200, { connections: state.connections }];
  if ((m = p.match(new RegExp(`^${O}/connections/([^/]+)/test$`)))) {
    const c = state.connections.find((x) => x.key === m[1]);
    const t = { ok: true, message: c.key === "smtp" ? "Signed in. Nothing sent." : "Answered.", at: new Date().toISOString(), by: "staff@alyr.example" };
    c.last_test = t;
    return [200, t];
  }
  if (p === `${O}/settings` && method === "GET") return [200, { ...state.settings, kill_switch: state.kill }];
  if (p === `${O}/settings` && method === "PUT") { Object.assign(state.settings, body, { updated_at: new Date().toISOString() }); return [200, { ...state.settings, kill_switch: state.kill }]; }
  if (p === `${O}/kill-switch`) { state.kill = { on: body.on, reason: body.reason, by: "staff@alyr.example", at: new Date().toISOString() }; return [200, state.kill]; }
  return [404, { detail: `not in the fixtures: ${method} ${p}` }];
}

// ── the run ─────────────────────────────────────────────────────────────────────────────────
const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: 390, height: 844, args: FLAGS });
const unknown = [];
b.on("Fetch.requestPaused", async (e) => {
  const { request } = e;
  let body = {};
  try { body = request.postData ? JSON.parse(request.postData) : {}; } catch { body = {}; }
  const [status, data] = answer(request.method, request.url, body);
  if (status === 404 && String(data.detail).startsWith("not in the fixtures")) unknown.push(data.detail);
  await b.send("Fetch.fulfillRequest", {
    requestId: e.requestId, responseCode: status,
    responseHeaders: [{ name: "content-type", value: "application/json" }, { name: "cache-control", value: "no-store" }],
    body: Buffer.from(JSON.stringify(data)).toString("base64"),
  }).catch(() => {});
});
await b.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/*", requestStage: "Request" }] });

const text = () => b.js("document.querySelector('main')?.innerText ?? ''");
const wait = (expr, what) => b.until(expr, what, 20000);
const has = (s) => `(document.querySelector('main')?.innerText ?? '').includes(${JSON.stringify(s)})`;
const button = (words) => `[...document.querySelectorAll('main button, main a')].find(b => b.innerText.trim() === ${JSON.stringify(words)})`;
const shots = [];

async function shot(name, { full = false } = {}) {
  const path = `${OUT}/${name}.png`;
  if (full) {
    const [w, h] = await b.js("[innerWidth, innerHeight]");
    const tall = await b.js("(() => { const s = document.querySelector('.sh-scroll'); return s ? s.scrollHeight + (innerHeight - s.clientHeight) : document.documentElement.scrollHeight; })()");
    await b.view(w, Math.min(Math.max(tall, h), 7000), w < 900, b.scheme);
    await sleep(300);
    await b.shot(path);
    await b.view(w, h, w < 900, b.scheme);
  } else await b.shot(path);
  shots.push(path);
}

async function noOverflow(label) {
  // Something inside a scroller that clips it (the stage chips, a wide table) is not page overflow.
  const over = await b.js("(() => { const clipped = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { if (getComputedStyle(p).overflowX !== 'visible') return p.getBoundingClientRect().right <= innerWidth + 1; } return false; }; const d = document.documentElement; const wide = [...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !clipped(e)).slice(0, 3).map(e => e.tagName + '.' + String(e.className).slice(0, 30)); return { page: d.scrollWidth - d.clientWidth, wide }; })()");
  check(over.page <= 0 && over.wide.length === 0, `${label}: nothing wider than the screen${over.wide.length ? ` (${over.wide.join(", ")})` : ""}`);
}

async function axe(label) {
  if (!AXE) return;
  const v = await b.axe(AXE, { include: [["main"], [".or-strip"]] });
  const serious = (v ?? []).filter((x) => x.impact === "serious" || x.impact === "critical");
  check(serious.length === 0, `${label}: axe finds nothing serious${serious.length ? ` (${serious.map((x) => `${x.id}×${x.n}: ${x.nodes[0]?.target}`).join("; ")})` : ""}`);
}

async function open(path, ready) {
  await b.go(`${BASE}${path}`, 900);
  await wait(ready, `${path} ready`);
  await sleep(500);
}

// A step that times out ends the run, but never leaves the browser behind on its port.
try {
// Phone, light: the founder's morning.
await b.view(390, 844, true, "light");
await open("/ops/outreach", has("Dunelight Bakehouse"));
check(await b.js("document.querySelectorAll('h1').length") === 1, "review: one h1");
check(await b.js("!!document.querySelector('.sh-tabbar a[href=\"/ops/outreach\"].on')"), "review: Outreach is in the phone's tab bar, marked current");
check(await b.js("document.querySelectorAll('.btn.volt').length") === 1, "review: one Volt button (Approve) on the screen");
check(await b.js("document.querySelectorAll('.or-body sup a').length") >= 3, "review: sentences carry numbered sources");
check(await b.js("document.querySelectorAll('.or-sources li').length") === 3, "review: three kept claims listed as sources");
check(await b.js(has("1 claim was dropped")), "review: the dropped claim is counted");
await noOverflow("review 390");
await axe("review 390");
await shot("01-review-390");
await shot("01-review-390-full", { full: true });

// A stale approval: the card reloads and says why.
await b.click(button("Approve"));
await wait(has("This draft changed after you opened it"), "the stale-hash message");
check(await b.js(has("Instagram orders at Dunelight Bakehouse")), "stale: the card shows the draft as it now stands");
await shot("02-review-stale-390");
await b.click(button("Approve"));
await wait(has("Approved. Dunelight Bakehouse"), "approved message");
check(await b.js(has("Saffron Loop Florists")), "approved: the next card opens");
check(await b.js(has("Accept-all domain")), "accept_all: the card warns");
check(await b.js("document.querySelector('.or-tick input')?.disabled === true"), "a follow-up failing the lint cannot be approved with the first");
await shot("03-review-next-acceptall-390");

// Edit: a new version, linted again.
await b.click("[...document.querySelectorAll('.or-card-foot button')].find(b => b.innerText.trim() === 'Edit')");
await b.js("(() => { const t = document.querySelector('.or-editor textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, t.value + '\\nhttps://alyr.example'); t.dispatchEvent(new Event('input', { bubbles: true })); })()");
await shot("04-review-edit-390");
await b.click(button("Save new version"));
await wait(has("New version saved"), "edit saved");
check(await b.js("document.querySelector('.or-approve')?.disabled === true"), "edit: the new version fails the lint (a link), so Approve is off");
check(/\bv2\b/i.test(await text()), "edit: the card shows v2");
await shot("05-review-edited-lint-390");

// Reject with a reason.
await b.click(button("Reject"));
await b.click(button("Reject draft"));
check(await b.js(has("Write a reason.")), "reject: a reason is required");
await b.click("document.querySelector('.or-confirm textarea')");
await b.type("Too generic; mention the event orders first.");
await b.click(button("Reject draft"));
await wait(has("Tessellé Coffee Roasters"), "rejected, next card");
check(await b.js(has("Every fact has a source")), "lint failures are named in words");
await shot("06-review-lint-failed-390", { full: true });

// Prospects.
await open("/ops/outreach/prospects", has("Qamar Tailoring House"));
await noOverflow("prospects 390");
await axe("prospects 390");
await shot("07-prospects-390", { full: true });
await b.click("document.querySelector('.or-search input')");
await b.type("tailor");
await wait("document.querySelectorAll('.or-prospects tbody tr').length === 1", "search filters to one");
check(true, "prospects: search filters the list");
await b.click(button("Add by hand"));
await b.js("(() => { const s = [...document.querySelectorAll('.or-form select')][0]; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'GB'); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
await sleep(200);
const gbBases = await b.js("[...document.querySelectorAll('.or-form select')][1].innerText");
check(gbBases.includes("Legitimate interest"), "add: GB offers legitimate interest");
await b.js("(() => { const s = [...document.querySelectorAll('.or-form select')][0]; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'QA'); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
await sleep(200);
check(!(await b.js("[...document.querySelectorAll('.or-form select')][1].innerText")).includes("Legitimate interest"), "add: QA does not");
await b.click(button("Add prospect"));
check(await b.js(has("Choose the basis. Nothing is sent without one.")), "add: the basis is required, said beside the field");
await noOverflow("add form 390");
await shot("08-prospects-add-390", { full: true });
await b.click(button("Close"));

await open("/ops/outreach/prospects?id=p-dune", has("Met at a food market"));
check(await b.js(has("Dropped")) && await b.js(has("The quoted words are not on the page.")), "detail: dropped claims show with the reason");
await noOverflow("detail 390");
await axe("detail 390");
await shot("09-prospect-detail-390", { full: true });
await open("/ops/outreach/prospects?id=p-qamar", has("Qamar Tailoring House"));
check(await b.js(has("Check 10: Send window")), "detail: an intent shows the gateway check that rescheduled it");
await b.click(button("Disqualify"));
await shot("10-prospect-disqualify-390");
await b.click(button("Cancel"));

// Replies, activity, connections, settings.
await open("/ops/outreach/replies", has("Pebblegate Stationers"));
check(await b.js(has("61%")) && await b.js(has("also Not now")), "replies: confidence and the second label show");
await noOverflow("replies 390");
await axe("replies 390");
await shot("11-replies-390", { full: true });

await open("/ops/outreach/activity", has("Copperleaf Kitchen"));
check(await b.js(has("Check 6 · Country lane and basis")), "activity: a refusal names its check");
check(await b.js(has("3 more may go today.")), "activity: what may still go today (mailbox cap 10, 7 sent)");
await noOverflow("activity 390");
await axe("activity 390");
await shot("12-activity-390", { full: true });

await open("/ops/outreach/connections", has("Email finder"));
check(!(await text()).match(/sk-|password\s*[:=]/i), "connections: no secret on the screen");
await b.click("[...document.querySelectorAll('.or-service')].find(s => s.innerText.includes('Outreach mailbox')).querySelector('.or-test .btn')");
await wait(has("Signed in. Nothing sent."), "smtp test answer");
check(true, "connections: Test runs and shows its answer");
await noOverflow("connections 390");
await axe("connections 390");
await shot("13-connections-390", { full: true });

await open("/ops/outreach/settings", has("Sending is allowed"));
await shot("14-settings-390", { full: true });
await b.click(button("Stop all sending"));
await b.click(button("Yes, stop all sending"));
check(await b.js(has("Write why.")), "kill switch: a reason is required");
await b.click("document.querySelector('.or-confirm textarea')");
await b.type("Checking the DNS records before more sends.");
await shot("15-settings-kill-confirm-390");
await b.click(button("Yes, stop all sending"));
await wait(has("All sending is stopped"), "kill switch on");
await wait("document.querySelector('.or-strip')?.innerText.includes('Sending stopped')", "the strip follows");
check(true, "kill switch: the page and the overview strip say sending stopped");
await noOverflow("settings 390");
await axe("settings 390");
await shot("16-settings-kill-on-390");

// The laptop, light, then dark.
reset();
await b.view(1440, 900, false, "light");
for (const [path, ready, name] of [
  ["/ops/outreach", has("Dunelight Bakehouse"), "21-review-1440"],
  ["/ops/outreach/prospects", has("Qamar Tailoring House"), "22-prospects-1440"],
  ["/ops/outreach/prospects?id=p-dune", has("Met at a food market"), "23-detail-1440"],
  ["/ops/outreach/replies", has("Pebblegate Stationers"), "24-replies-1440"],
  ["/ops/outreach/activity", has("Copperleaf Kitchen"), "25-activity-1440"],
  ["/ops/outreach/connections", has("Email finder"), "26-connections-1440"],
  ["/ops/outreach/settings", has("Sending is allowed"), "27-settings-1440"],
]) {
  await open(path, ready);
  await noOverflow(`${name}`);
  await shot(name, { full: true });
}
await b.view(1440, 900, false, "dark");
await open("/ops/outreach", has("Dunelight Bakehouse"));
await axe("review 1440 dark");
await shot("31-review-1440-dark", { full: true });
await b.view(390, 844, true, "dark");
await open("/ops/outreach/settings", has("Sending is allowed"));
await shot("32-settings-390-dark");

// The narrowest phone: nothing may push the page sideways at 320.
reset();
await b.view(320, 700, true, "light");
for (const [path, ready] of [
  ["/ops/outreach", has("Dunelight Bakehouse")], ["/ops/outreach/prospects", has("Qamar Tailoring House")],
  ["/ops/outreach/prospects?id=p-dune", has("Met at a food market")], ["/ops/outreach/replies", has("Pebblegate Stationers")],
  ["/ops/outreach/activity", has("Copperleaf Kitchen")], ["/ops/outreach/connections", has("Email finder")],
  ["/ops/outreach/settings", has("Sending is allowed")],
]) {
  await open(path, ready);
  await noOverflow(`${path} 320`);
}
await shot("35-review-320");

// Empty and error states, on the phone.
reset("empty");
await b.view(390, 844, true, "light");
for (const [path, words, name] of [
  ["/ops/outreach", "Drafts waiting for your approval show here", "41-review-empty-390"],
  ["/ops/outreach/prospects", "Prospects show here", "42-prospects-empty-390"],
  ["/ops/outreach/replies", "Replies that need you show here", "43-replies-empty-390"],
  ["/ops/outreach/activity", "Sends, replies and refusals show here", "44-activity-empty-390"],
]) {
  await open(path, has(words));
  check(true, `${name}: the empty state says what will appear`);
  await noOverflow(name);
  await shot(name, { full: true });
}
reset("error");
await open("/ops/outreach", has("The outreach service is not answering."));
check(await b.js(button("Try again") + " !== undefined"), "error: the message and a retry");
await shot("51-review-error-390");
await open("/ops/outreach/prospects", has("The outreach service is not answering."));
await shot("52-prospects-error-390");

} catch (error) {
  failures.push(`the run stopped: ${error.message}`);
  log("FAIL", `the run stopped: ${error.message}`);
  await b.shot(`${OUT}/99-where-it-stopped.png`).catch(() => {});
}

check(unknown.length === 0, `every call was in the fixtures${unknown.length ? `: ${[...new Set(unknown)].join("; ")}` : ""}`);
const problems = b.problems.filter((p) => !/Failed to load resource/.test(p));
check(problems.length === 0, `no script errors${problems.length ? `: ${problems.slice(0, 5).join(" | ")}` : ""}`);
await b.close();

log(`\nscreenshots in ${OUT} (${shots.length})`);
if (failures.length) { log(`\n${failures.length} failed:\n- ${failures.join("\n- ")}`); process.exit(1); }
log("all checks passed");
