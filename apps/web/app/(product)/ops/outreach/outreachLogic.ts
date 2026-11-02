// The parts of the outreach screens that are not drawing (specs/065, ALY-311): which bases a
// country allows, how a draft's sentences map to numbered sources, the prospect filters, the CSV
// import's columns, and the checks a form makes before it asks the API. Pure, so
// `outreach.test.mjs` runs them without a browser. The API decides in the end: these only spare
// the founder a round trip and say the reason in words.

import type {
  Basis, Claim, CountryPolicy, Lane, Level, ProspectRow, Sentence, Stage, Verifier,
} from "./types.ts";

// ── the country policy ──────────────────────────────────────────────────────────────────────
// A copy of the table in specs/065 ("The country policy"), which `outreach/policy.py` holds. Used
// only when GET /settings does not send `policy`. Change both in the same pull request.

const GULF_BASES: Basis[] = ["published_business_contact", "existing_relationship", "referral", "opt_in", "inbound"];
const GB_BASES: Basis[] = ["legitimate_interest", ...GULF_BASES];
const EU_BASES: Basis[] = ["legitimate_interest", "opt_in", "inbound", "existing_relationship"];
const GULF_WEEK = { working_days: "Sun to Thu", free_mail_refused: true };
const WEEK = { working_days: "Mon to Fri", hours: "09:00 to 17:00", free_mail_refused: true };

/** EU and EEA members other than DE and IT, which have rows of their own. */
export const EU_EEA = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "GR", "HU", "IE", "LV", "LT", "LU", "MT",
  "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
];

export const POLICY: CountryPolicy[] = [
  ...["QA", "SA", "KW", "BH", "OM"].map((country) => ({
    country, lane: "allowed" as Lane, bases: GULF_BASES, cap: 1 as Level,
    time_zone: { QA: "Asia/Qatar", SA: "Asia/Riyadh", KW: "Asia/Kuwait", BH: "Asia/Bahrain", OM: "Asia/Muscat" }[country] ?? "",
    hours: "08:30 to 16:30", ...GULF_WEEK,
  })),
  { country: "AE", lane: "allowed", bases: GULF_BASES, cap: 1, time_zone: "Asia/Dubai", ...WEEK, hours: "08:30 to 16:30" },
  { country: "EG", lane: "allowed", bases: GULF_BASES, cap: 1, time_zone: "Africa/Cairo", hours: "09:00 to 17:00", ...GULF_WEEK },
  { country: "JO", lane: "allowed", bases: GULF_BASES, cap: 1, time_zone: "Asia/Amman", hours: "09:00 to 17:00", ...GULF_WEEK },
  { country: "GB", lane: "allowed", bases: GB_BASES, cap: 2, time_zone: "Europe/London", ...WEEK },
  { country: "US", lane: "allowed", bases: GB_BASES, cap: 3, time_zone: "America/New_York", ...WEEK },
  { country: "CA", lane: "consent_only", bases: ["conspicuous_publication", "existing_relationship", "opt_in", "inbound"], cap: 1, time_zone: "America/Toronto", ...WEEK },
  { country: "DE", lane: "consent_only", bases: ["opt_in", "inbound", "existing_relationship"], cap: 1, time_zone: "Europe/Berlin", ...WEEK },
  { country: "IT", lane: "consent_only", bases: ["opt_in", "inbound", "existing_relationship"], cap: 1, time_zone: "Europe/Rome", ...WEEK },
  ...EU_EEA.map((country) => ({ country, lane: "allowed" as Lane, bases: EU_BASES, cap: 1 as Level, time_zone: "", ...WEEK })),
];

const BLOCKED: Omit<CountryPolicy, "country"> = {
  lane: "blocked", bases: [], cap: 0, time_zone: "", working_days: "", hours: "", free_mail_refused: true,
};

/** The policy row for a country (two letters, any case); anything unknown is blocked. */
export function policyFor(country: string, policy: CountryPolicy[] = POLICY): CountryPolicy {
  const code = country.trim().toUpperCase();
  return policy.find((p) => p.country === code) ?? { country: code, ...BLOCKED };
}

/** The bases ALYR may record for a contact in this country, in the policy's order. */
/** Countries whose rules are the same (lane, bases, cap, days, hours, free-mail, note) as one row,
 *  in the order each rule first appears; time zones differ within a row and are left out. */
export type PolicyGroup = Omit<CountryPolicy, "country" | "time_zone"> & { countries: string[] };
export function groupPolicy(rows: CountryPolicy[]): PolicyGroup[] {
  const groups = new Map<string, PolicyGroup>();
  for (const r of rows) {
    const key = JSON.stringify([r.lane, r.bases, r.cap, r.working_days, r.hours, r.free_mail_refused, r.note ?? ""]);
    const seen = groups.get(key);
    if (seen) seen.countries.push(r.country);
    else {
      groups.set(key, {
        lane: r.lane, bases: r.bases, cap: r.cap, working_days: r.working_days, hours: r.hours,
        free_mail_refused: r.free_mail_refused, note: r.note, countries: [r.country],
      });
    }
  }
  return [...groups.values()];
}

export function basesFor(country: string, policy?: CountryPolicy[]): Basis[] {
  return policyFor(country, policy).bases;
}

/** The countries the add form offers: every one with a lane that is not blocked, Gulf first. */
export function countriesOffered(policy: CountryPolicy[] = POLICY): string[] {
  return policy.filter((p) => p.lane !== "blocked").map((p) => p.country);
}

const FREE_MAIL = ["gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com"];
const FREE_MAIL_OK: Basis[] = ["opt_in", "inbound", "existing_relationship"];

/** Whether this address is a free-mail one the policy refuses for cold outreach with this basis. */
export function freeMailRefused(email: string, basis: Basis | "" | null): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  const free = FREE_MAIL.includes(domain) || /^yahoo\./.test(domain) || /^hotmail\./.test(domain);
  return free && !(basis && FREE_MAIL_OK.includes(basis));
}

// ── a draft's sentences and their sources ───────────────────────────────────────────────────

export type Sources = {
  /** Kept claims in the order the draft first cites them, numbered from 1. */
  list: { n: number; claim: Claim }[];
  /** Claim id to its number. */
  number: Map<string, number>;
  /** Ids a sentence cites that are not kept claims of the brief: the draft cannot be trusted. */
  missing: string[];
};

/** Numbers the claims a draft cites, in reading order, so the screen shows [1], [2] like a paper. */
export function numberSources(sentences: Sentence[], claims: Claim[]): Sources {
  const kept = new Map(claims.filter((c) => c.kept).map((c) => [c.id, c]));
  const number = new Map<string, number>();
  const list: Sources["list"] = [];
  const missing: string[] = [];
  for (const s of sentences) {
    for (const id of s.claim_ids) {
      if (number.has(id) || missing.includes(id)) continue;
      const claim = kept.get(id);
      if (!claim) { missing.push(id); continue; }
      number.set(id, list.length + 1);
      list.push({ n: list.length + 1, claim });
    }
  }
  return { list, number, missing };
}

/** A run of the body: the text between sentences (`sentence` false) or one sentence and its sources. */
export type Piece = { text: string; refs: number[]; sentence: boolean };

/** The body as written (its line breaks kept), cut after each sentence with that sentence's source
 *  numbers. A sentence the body no longer contains is returned in `unplaced`, never dropped. */
export function annotate(body: string, sentences: Sentence[], sources: Sources): { pieces: Piece[]; unplaced: Sentence[] } {
  const pieces: Piece[] = [];
  const unplaced: Sentence[] = [];
  let at = 0;
  for (const s of sentences) {
    const text = s.text.trim();
    const found = text ? body.indexOf(text, at) : -1;
    if (found < 0) { unplaced.push(s); continue; }
    if (found > at) pieces.push({ text: body.slice(at, found), refs: [], sentence: false });
    const refs = s.claim_ids.map((id) => sources.number.get(id)).filter((n): n is number => n !== undefined);
    pieces.push({ text, refs: [...new Set(refs)].sort((a, b) => a - b), sentence: true });
    at = found + text.length;
  }
  if (at < body.length) pieces.push({ text: body.slice(at), refs: [], sentence: false });
  return { pieces, unplaced };
}

/** Words in a body (the lint's 150-word limit counts them the same way). */
export function words(body: string): number {
  return body.trim() ? body.trim().split(/\s+/).length : 0;
}

// ── the prospects list ──────────────────────────────────────────────────────────────────────

export type Filters = { stage: Stage | "" | "attention"; country: string; q: string };
export const NO_FILTERS: Filters = { stage: "", country: "", q: "" };

/** Stages that need a person: the review queue and the ones the engine handed back. */
export const ATTENTION: Stage[] = ["in_review", "needs_human"];

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** The same filter the API applies, run on the rows already here so typing answers at once. */
export function filterProspects(rows: ProspectRow[], f: Filters): ProspectRow[] {
  const q = fold(f.q.trim());
  return rows.filter((r) => {
    if (f.stage === "attention" ? !ATTENTION.includes(r.stage) : f.stage && r.stage !== f.stage) return false;
    if (f.country && r.country !== f.country.toUpperCase()) return false;
    if (q && ![r.company, r.domain, r.contact_first_name, r.contact_role, r.business_type].some((v) => fold(v ?? "").includes(q))) return false;
    return true;
  });
}

/** Counts per stage of the rows, for the filter's options. */
export function countStages(rows: ProspectRow[]): Partial<Record<Stage, number>> {
  const out: Partial<Record<Stage, number>> = {};
  for (const r of rows) out[r.stage] = (out[r.stage] ?? 0) + 1;
  return out;
}

// ── pills ───────────────────────────────────────────────────────────────────────────────────

export type Tone = "active" | "wait" | "bad" | "idle";

/** Words first, colour second: the tone of a stage's pill. */
export function stageTone(stage: Stage): Tone {
  if (stage === "in_review" || stage === "needs_human") return "wait";
  if (stage === "approved" || stage === "sending" || stage === "replied") return "active";
  if (stage === "disqualified" || stage === "rejected" || stage === "bounced" || stage === "opted_out") return "bad";
  return "idle";
}

export function laneTone(lane: Lane): Tone {
  return lane === "allowed" ? "active" : lane === "consent_only" ? "wait" : "bad";
}

/** valid is fine, accept_all is a warning on the card, anything else should never reach review. */
export function verifierTone(v: Verifier): Tone {
  if (v === "valid") return "active";
  if (v === "accept_all" || v === null) return "wait";
  return "bad";
}

// ── the CSV import ──────────────────────────────────────────────────────────────────────────

/** The columns POST /prospects/import reads (specs/065), as the file's header names them. */
export const CSV_COLUMNS = ["company", "website", "country", "first_name", "last_name", "role", "email", "basis", "language", "notes"] as const;
export const CSV_REQUIRED = ["company", "website", "country", "basis"] as const;

/** RFC 4180 CSV: commas, quoted fields with doubled quotes, CRLF or LF, a final newline or not. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

const headerKey = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_");

export type CsvCheck = {
  rows: number;
  missing: string[];      // required columns the header does not have
  unknown: string[];      // header names the import will ignore
  problems: { row: number; reason: string }[]; // rows the screen can already tell will be refused
};

/** What the screen can say about a file before sending it: its columns and the rows that will not
 *  pass (no company, a country with no lane, a basis that country does not allow). */
export function checkCsv(text: string, policy?: CountryPolicy[]): CsvCheck {
  const [header = [], ...data] = parseCsv(text);
  const keys = header.map(headerKey);
  const missing = CSV_REQUIRED.filter((c) => !keys.includes(c));
  const unknown = header.filter((_, i) => !(CSV_COLUMNS as readonly string[]).includes(keys[i]) && keys[i] !== "");
  const problems: CsvCheck["problems"] = [];
  if (missing.length === 0) {
    data.forEach((values, i) => {
      const get = (k: string) => (values[keys.indexOf(k)] ?? "").trim();
      const row = i + 1;
      const country = get("country").toUpperCase();
      const basis = get("basis") as Basis;
      if (!get("company")) problems.push({ row, reason: "no company" });
      else if (policyFor(country, policy).lane === "blocked") problems.push({ row, reason: `${country || "no country"}: outreach is blocked there` });
      else if (!basesFor(country, policy).includes(basis)) problems.push({ row, reason: `${basis || "no basis"} is not allowed for ${country}` });
      else if (get("email") && freeMailRefused(get("email"), basis)) problems.push({ row, reason: "a free-mail address needs opt_in, inbound or existing_relationship" });
    });
  }
  return { rows: data.length, missing: [...missing], unknown, problems };
}

// ── forms ───────────────────────────────────────────────────────────────────────────────────

export type ProspectForm = {
  company: string; website: string; country: string; contact_first_name: string; contact_last_name: string;
  contact_role: string; contact_email: string; basis: Basis | ""; basis_note: string; language: "en" | "ar"; notes: string;
};
export const EMPTY_PROSPECT: ProspectForm = {
  company: "", website: "", country: "QA", contact_first_name: "", contact_last_name: "", contact_role: "",
  contact_email: "", basis: "", basis_note: "", language: "en", notes: "",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Field errors in words, keyed by field; empty when the form may be sent. */
export function prospectErrors(f: ProspectForm, policy?: CountryPolicy[]): Partial<Record<keyof ProspectForm, string>> {
  const e: Partial<Record<keyof ProspectForm, string>> = {};
  if (!f.company.trim()) e.company = "Write the company's name.";
  if (!/^https:\/\/[^\s/]+\.[^\s]+$/i.test(f.website.trim())) e.website = "Write the full address, starting with https://.";
  const allowed = basesFor(f.country, policy);
  if (allowed.length === 0) e.country = "Outreach is blocked for this country.";
  if (!f.basis) e.basis = "Choose the basis. Nothing is sent without one.";
  else if (!allowed.includes(f.basis)) e.basis = "This country does not allow that basis.";
  if (f.contact_email.trim() && !EMAIL.test(f.contact_email.trim())) e.contact_email = "This is not an email address.";
  else if (f.contact_email.trim() && freeMailRefused(f.contact_email, f.basis)) e.contact_email = "A free-mail address needs opt-in, inbound or an existing relationship.";
  return e;
}

export type SettingsForm = { global_daily_cap: string; default_level: Level; honeytokens: string; booking_url: string };

/** The honeytoken addresses as typed, one a line (commas too), lower case, without repeats. */
export function honeytokenList(text: string): string[] {
  return [...new Set(text.split(/[\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

export function settingsErrors(f: SettingsForm): Partial<Record<keyof SettingsForm, string>> {
  const e: Partial<Record<keyof SettingsForm, string>> = {};
  const cap = Number(f.global_daily_cap);
  if (!/^\d+$/.test(f.global_daily_cap.trim()) || cap < 1 || cap > 500) e.global_daily_cap = "A whole number from 1 to 500.";
  const bad = honeytokenList(f.honeytokens).filter((a) => !EMAIL.test(a));
  if (bad.length) e.honeytokens = `Not an email address: ${bad.join(", ")}.`;
  if (f.booking_url.trim() && !/^https:\/\/[^\s/]+\.[^\s]+/i.test(f.booking_url.trim())) e.booking_url = "Leave it empty, or write an address starting with https://.";
  return e;
}

// ── answers ─────────────────────────────────────────────────────────────────────────────────

/** Whether an approval was refused because the draft changed after the card was read. */
export function isStaleHash(status: number, data: unknown): boolean {
  if (status !== 409 || typeof data !== "object" || data === null) return false;
  const detail = (data as { detail?: unknown }).detail;
  return typeof detail === "object" && detail !== null && (detail as { code?: unknown }).code === "stale_hash";
}

/** What may still go out today: the lower of the global cap and the mailbox's ramp cap, less what went. */
export function leftToday(t: { sent: number; global_cap: number; mailbox_cap: number }): number {
  return Math.max(Math.min(t.global_cap, t.mailbox_cap) - t.sent, 0);
}

/** A confidence of 0 to 1 as a whole percentage, or "" when there is none. */
export function percent(confidence: number | null): string {
  return confidence === null || Number.isNaN(confidence) ? "" : `${Math.round(confidence * 100)}%`;
}

/** A moment in Doha time, as the console prints it everywhere ("2 Nov, 14:05"). */
export function when(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** How long ago, short: "now", "5h", "3d". */
export function age(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "";
  const hours = (now - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return "now";
  if (hours < 24) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** The host of a link, for showing it short ("dunelight.example/about"). */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${u.host.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}
