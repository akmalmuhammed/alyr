// What the Discovery screens read and write (ALY-322, spec 065 "API"): the routes under
// `/api/discovery`, their shapes, and one way to turn a refusal into something the screens can
// say. Every answer goes through a parser, so a field the API leaves out becomes an empty list
// or a null, never a crash, and a part of the score that was not measured is never given a
// number (spec: "Say a number it did not measure" is a thing it must never do). The words in an
// answer (a finding's title, why, what happens) arrive in the reader's language through
// `?lang=`; the screen's own words are in `discoveryCopy.ts`.
//
// Phase 2 (ALY-324, spec 066) adds proposals (one exact change with its before and after, and
// what a person may do with it), facts (what the owner confirmed to be true), the settings of the
// asks on WhatsApp and the branch managers. A proposal's `can` is read as the API sends it and is
// false when missing: the screens never work out for themselves who may approve.
//
// Plain TypeScript with no React and no browser globals beyond `fetch`: `discovery.test.mjs`
// runs the parsers under `node --test`.

import type { Lang } from "./lang";

// ── what the API answers ────────────────────────────────

export type Kind = "agent" | "owner" | "process";
export type Severity = "high" | "medium" | "low";
export type FindingStatus = "open" | "skipped" | "owner_done" | "verified" | "gone";
export type PartKey = "presence" | "reviews" | "website" | "whatsapp" | "ai";
export type RunStatus = "queued" | "running" | "done" | "failed";

export const KINDS: readonly Kind[] = ["agent", "owner", "process"];
export const SEVERITIES: readonly Severity[] = ["high", "medium", "low"];
export const STATUSES: readonly FindingStatus[] = ["open", "skipped", "owner_done", "verified", "gone"];
/** The parts the screens draw. `ai` is not measured in Phase 1 and is not drawn at all (D-039). */
export const PARTS_SHOWN: readonly PartKey[] = ["presence", "reviews", "website", "whatsapp"];

export type Evidence = { label: string; value: string; where: string; seen_at: string | null };
export type Step = { seq: number; tool: string; summary: string; ok: boolean; started_at: string | null; ended_at: string | null };
export type PlaceRef = { id: string; name: string };

export type Finding = {
  id: string; rule_id: string; kind: Kind; severity: Severity; status: FindingStatus;
  title: string; why: string; what_happens: string; what_is_needed: string;
  evidence: Evidence[]; location: PlaceRef | null; first_seen_at: string | null; last_seen_at: string | null;
  /** Only on `GET /findings/{id}`: the run steps that produced it. */
  steps: Step[];
  /** Phase 2: its proposals of the last 30 days, newest first (not on a list row: see `proposals_waiting`). */
  proposals: Proposal[];
  /** Phase 2: the fact a proposal is waiting for, which the sheet turns into a form. */
  needs_fact: { key: FactKey; location_id: string } | null;
  /** Phase 2: whether this person may ask for a proposal now. */
  can_propose: boolean;
  /** Phase 2: on a list row, how many of its proposals wait for approval. */
  proposals_waiting: number;
};

// ── Phase 2: proposals, facts, settings (spec 066) ──────

export type ProposalStatus = "proposed" | "approved" | "declined" | "expired" | "applied" | "failed" | "undone";
export type Verification = "pending" | "confirmed" | "not_confirmed";
export type DayKey = "sat" | "sun" | "mon" | "tue" | "wed" | "thu" | "fri";
export type FactKey = "hours" | "phone" | "category" | "name" | "whatsapp";
export type Channel = "whatsapp" | "portal";

export const PROPOSAL_STATUSES: readonly ProposalStatus[] = ["proposed", "approved", "declined", "expired", "applied", "failed", "undone"];
/** Saturday first: the week as the shop keeps it, and the order the API sends the lines in. */
export const DAYS: readonly DayKey[] = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];
export const FACT_KEYS: readonly FactKey[] = ["hours", "phone", "category", "name", "whatsapp"];

/** One side of a change: one line of text (WhatsApp's and a table cell's) and, for hours, seven rows. */
export type Side = { text: string; lines: { day: DayKey; text: string }[] };
export type Decided = { by: string; channel: Channel | ""; at: string | null };
export type ReviewContext = { rating: number; posted_at: string | null; author_name: string; body: string; language: string };

export type Proposal = {
  id: string; finding_id: string; rule_id: string; type: string; target: string; status: ProposalStatus; severity: Severity;
  title: string; why: string; rule: string; location: PlaceRef | null;
  field: string; field_label: string; where: string; before: Side; after: Side; change_hash: string;
  /** Only for a reply to a review: the review, as quoted data. */
  context: { review: ReviewContext } | null;
  evidence: Evidence[]; proposer: string; proposed_at: string | null; expires_at: string | null;
  decided: Decided | null;
  /** Who undid it, in the same shape as `decided`. The spec's example has no such key; read if present. */
  undone: Decided | null;
  applied_at: string | null; undo_until: string | null; failure: { code: string; message: string } | null;
  verification: Verification | null; sample: boolean;
  can: { approve: boolean; decline: boolean; undo: boolean };
  /** On the answers of approve, decline and undo only. */
  already: boolean;
};
export type HistoryRow = { at: string | null; event: string; by: string; channel: string; text: string };
export type ProposalDetail = Proposal & { history: HistoryRow[] };

export type ProposalsAnswer = { items: Proposal[]; counts: Record<ProposalStatus, number>; waiting: number };
export type OverviewProposals = { waiting: number; approved: number; failed: number; next: Proposal | null };

export type Fact = {
  location_id: string; key: FactKey; value: Record<string, unknown>; source: string;
  confirmed_by_name: string; confirmed_at: string | null; default: boolean;
};
export type Receiver = { contact_id: string; name: string; last4: string; linked: boolean; receives: boolean };
export type Settings = { ask_cap_per_day: number; weekly_run: boolean; receivers: Receiver[]; template_ready: boolean };
export type Manager = { user_id: string; name: string };
export type TeamMember = { id: string; name: string; role: string };

export type ScorePart = { value: number | null; measured: boolean; weight: number | null };
export type ScoreParts = Partial<Record<PartKey, ScorePart>>;

export type Run = {
  id: string; status: RunStatus; trigger: string; score: number | null; score_parts: ScoreParts | null;
  started_at: string | null; finished_at: string | null;
  /** A plain sentence, set on a failed run. The spec's run shape does not list it; the table has it. */
  error: string | null;
  steps: Step[];
};

export type Counts = { open: number; skipped: number; owner_done: number; verified: number };

export type Overview = {
  has_connection: boolean; has_run: boolean; last_run: Run | null; score: number | null;
  /** One sentence by rule, built by the API in the reader's language. Not in the spec's shape; the backend sends it. */
  headline: string;
  score_parts: ScoreParts | null; counts: Counts; next: Finding | null; up_next: Finding[]; done: Finding[];
  delta: { score_change: number; since_run_id: string | null } | null;
  /** Phase 2. Null for a person who may not list proposals: then nothing about them is drawn. */
  proposals: OverviewProposals | null;
};

export type FindingsAnswer = { items: Finding[]; counts: Counts };

export type Review = {
  id: string; location: PlaceRef | null; rating: number; posted_at: string | null; author_name: string;
  body: string; language: string; replied: boolean; reply_text: string;
};
export type ReviewsAnswer = {
  items: Review[];
  summary: { count: number; average: number | null; unanswered: number };
};

export type Report = {
  month: string; generated_at: string | null; score_start: number | null; score_end: number | null;
  change: number | null; headline: string; fixed: Finding[]; still_open: Finding[]; new: Finding[];
  by_part: ScoreParts; runs: number;
};

export type Place = {
  id: string; name: string; name_ar: string; area: string; whatsapp_e164: string;
  /** Phase 2. The spec has no route that says who a place's managers are; read from the place if it carries them. */
  managers: Manager[];
};
export type Connection = { kind: string; on: boolean };

// ── errors ──────────────────────────────────────────────

export class DiscoveryError extends Error {
  status: number;
  code: string;
  messageAr: string;
  /** Seconds, from a 429's `retry_after` (the body) or its `Retry-After` header. */
  retryAfter: number | null;
  /** The rest of the body: a 422 `needs_fact` carries the `key` and the `location_id` here. */
  extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, messageAr = "", retryAfter: number | null = null, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.messageAr = messageAr;
    this.retryAfter = retryAfter;
    this.extra = extra;
  }
}

/**
 * Turns a refusal into one error. The API's shapes are `{detail: "words"}`,
 * `{detail: {code, message, message_ar, retry_after}}` and `{detail: "words", code, message_ar}`
 * (spec: "the existing shape"); a retry time can sit in the body or in the header.
 */
export function errorFrom(status: number, data: unknown, retryHeader: string | null = null): DiscoveryError {
  const top = rec(data);
  const inner = top.detail && typeof top.detail === "object" ? rec(top.detail) : top;
  const code = str(inner.code) || str(top.code);
  const message = typeof top.detail === "string" ? top.detail : str(inner.message);
  const messageAr = str(inner.message_ar) || str(top.message_ar);
  const fromBody = num(inner.retry_after) ?? num(top.retry_after);
  const header = retryHeader !== null && /^\d+$/.test(retryHeader.trim()) ? Number(retryHeader.trim()) : null;
  return new DiscoveryError(status, code, message, messageAr, fromBody ?? header, { ...top, ...inner });
}

// ── small readers ───────────────────────────────────────

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function str(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}
function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function count(value: unknown): number {
  const n = num(value);
  return n === null || n < 0 ? 0 : Math.floor(n);
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
function bad(what: string): DiscoveryError {
  return new DiscoveryError(0, "bad_answer", `unexpected answer: ${what}`);
}

// ── parsers ─────────────────────────────────────────────

function parsePlace(raw: unknown): PlaceRef | null {
  const r = rec(raw);
  const id = str(r.id);
  return id ? { id, name: str(r.name) } : null;
}

function parseEvidence(raw: unknown): Evidence {
  const r = rec(raw);
  return { label: str(r.label), value: str(r.value), where: str(r.where), seen_at: strOrNull(r.seen_at) };
}

export function parseStep(raw: unknown, index = 0): Step {
  const r = rec(raw);
  return {
    seq: num(r.seq) ?? index + 1, tool: str(r.tool), summary: str(r.summary), ok: r.ok !== false,
    started_at: strOrNull(r.started_at), ended_at: strOrNull(r.ended_at),
  };
}

export function parseFinding(raw: unknown): Finding {
  const r = rec(raw);
  const id = str(r.id);
  if (!id) throw bad("a finding without an id");
  // A status that is not one of the five would be drawn as something to do or not to do: refuse it.
  if (typeof r.status !== "string" || !(STATUSES as readonly string[]).includes(r.status)) throw bad("a finding's status");
  return {
    id, rule_id: str(r.rule_id), kind: oneOf(r.kind, KINDS, "owner"), severity: oneOf(r.severity, SEVERITIES, "medium"),
    status: r.status as FindingStatus, title: str(r.title), why: str(r.why), what_happens: str(r.what_happens),
    what_is_needed: str(r.what_is_needed), evidence: arr(r.evidence).map(parseEvidence), location: parsePlace(r.location),
    first_seen_at: strOrNull(r.first_seen_at), last_seen_at: strOrNull(r.last_seen_at),
    steps: arr(r.steps ?? r.run_steps).map(parseStep),
    proposals: arr(r.proposals).flatMap((raw) => {
      // A proposal that cannot be read is left out, not allowed to take the whole finding with it.
      try { return [parseProposal(raw)]; } catch { return []; }
    }),
    needs_fact: parseNeed(r.needs_fact),
    can_propose: r.can_propose === true,
    proposals_waiting: count(r.proposals_waiting),
  };
}

function parseNeed(raw: unknown): { key: FactKey; location_id: string } | null {
  const r = rec(raw);
  return isFactKey(r.key) ? { key: r.key, location_id: str(r.location_id) } : null;
}

// ── proposals ───────────────────────────────────────────

function parseSide(raw: unknown): Side {
  const r = rec(raw);
  const lines = arr(r.lines).flatMap((item) => {
    const l = rec(item);
    return isDay(l.day) ? [{ day: l.day, text: str(l.text) }] : [];
  });
  return { text: str(r.text), lines };
}

function isDay(value: unknown): value is DayKey {
  return typeof value === "string" && (DAYS as readonly string[]).includes(value);
}

function parseDecided(raw: unknown): Decided | null {
  const r = rec(raw);
  if (Object.keys(r).length === 0) return null;
  return { by: str(r.by), channel: r.channel === "whatsapp" || r.channel === "portal" ? r.channel : "", at: strOrNull(r.at) };
}

function parseContext(raw: unknown): { review: ReviewContext } | null {
  const review = rec(rec(raw).review);
  if (Object.keys(review).length === 0) return null;
  const rating = Math.round(num(review.rating) ?? 0);
  return {
    review: {
      rating: Math.min(5, Math.max(0, rating)), posted_at: strOrNull(review.posted_at), author_name: str(review.author_name),
      body: str(review.body), language: str(review.language),
    },
  };
}

export function parseProposal(raw: unknown): Proposal {
  const r = rec(raw);
  const id = str(r.id);
  if (!id) throw bad("a proposal without an id");
  // A status that is not one of the seven would be drawn as something that can be approved or not: refuse it.
  if (typeof r.status !== "string" || !(PROPOSAL_STATUSES as readonly string[]).includes(r.status)) throw bad("a proposal status");
  const can = rec(r.can);
  const failure = rec(r.failure);
  const verification = typeof r.verification === "string" && ["pending", "confirmed", "not_confirmed"].includes(r.verification)
    ? (r.verification as Verification) : null;
  return {
    id, finding_id: str(r.finding_id), rule_id: str(r.rule_id), type: str(r.type), target: str(r.target), status: r.status as ProposalStatus,
    severity: oneOf(r.severity, SEVERITIES, "medium"), title: str(r.title), why: str(r.why), rule: str(r.rule), location: parsePlace(r.location),
    field: str(r.field), field_label: str(r.field_label), where: str(r.where), before: parseSide(r.before), after: parseSide(r.after),
    change_hash: str(r.change_hash), context: parseContext(r.context), evidence: arr(r.evidence).map(parseEvidence),
    proposer: str(r.proposer), proposed_at: strOrNull(r.proposed_at), expires_at: strOrNull(r.expires_at),
    decided: parseDecided(r.decided), undone: parseDecided(r.undone), applied_at: strOrNull(r.applied_at), undo_until: strOrNull(r.undo_until),
    failure: Object.keys(failure).length === 0 ? null : { code: str(failure.code), message: str(failure.message) },
    verification, sample: r.sample === true,
    // Never worked out here: a person may do what the API says they may, and nothing when it says nothing.
    can: { approve: can.approve === true, decline: can.decline === true, undo: can.undo === true },
    already: r.already === true,
  };
}

export function parseProposalDetail(raw: unknown): ProposalDetail {
  const r = rec(raw);
  return {
    ...parseProposal(raw),
    history: arr(r.history).map((item) => {
      const h = rec(item);
      return { at: strOrNull(h.at), event: str(h.event), by: str(h.by), channel: str(h.channel), text: str(h.text) };
    }),
  };
}

export function parseProposals(raw: unknown): ProposalsAnswer {
  const r = rec(raw);
  const c = rec(r.counts);
  const counts = Object.fromEntries(PROPOSAL_STATUSES.map((status) => [status, count(c[status])])) as Record<ProposalStatus, number>;
  return { items: arr(r.items).map(parseProposal), counts, waiting: count(r.waiting) };
}

/** `POST /findings/{id}/proposals`: the live ones, new or already there. */
export function parsePrepared(raw: unknown): Proposal[] {
  return arr(rec(raw).items).map(parseProposal);
}

function parseOverviewProposals(raw: unknown): OverviewProposals | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const r = rec(raw);
  return { waiting: count(r.waiting), approved: count(r.approved), failed: count(r.failed), next: r.next ? parseProposal(r.next) : null };
}

function isFactKey(value: unknown): value is FactKey {
  return typeof value === "string" && (FACT_KEYS as readonly string[]).includes(value);
}

export function parseFact(raw: unknown): Fact {
  const r = rec(raw);
  if (!isFactKey(r.key)) throw bad("a fact key");
  return {
    location_id: str(r.location_id), key: r.key, value: rec(r.value), source: str(r.source),
    confirmed_by_name: str(r.confirmed_by_name), confirmed_at: strOrNull(r.confirmed_at), default: r.default === true,
  };
}

export function parseFacts(raw: unknown): Fact[] {
  return arr(rec(raw).items).flatMap((item) => {
    try { return [parseFact(item)]; } catch { return []; }
  });
}

export function parseManagers(raw: unknown): Manager[] {
  const list = Array.isArray(raw) ? raw : arr(rec(raw).items);
  return list.flatMap((item) => {
    const m = rec(item);
    const user_id = str(m.user_id ?? m.id);
    return user_id ? [{ user_id, name: str(m.name) }] : [];
  });
}

export function parseSettings(raw: unknown): Settings {
  const r = rec(raw);
  const cap = Math.round(num(r.ask_cap_per_day) ?? 3);
  return {
    ask_cap_per_day: Math.min(5, Math.max(1, cap)), weekly_run: r.weekly_run === true, template_ready: r.template_ready === true,
    receivers: arr(r.receivers).flatMap((item) => {
      const v = rec(item);
      const contact_id = str(v.contact_id);
      return contact_id ? [{ contact_id, name: str(v.name), last4: str(v.last4), linked: v.linked === true, receives: v.receives === true }] : [];
    }),
  };
}

/** `GET /api/team`: the members of the shop, of which the staff role (`agent`) can manage a branch. */
export function parseTeam(raw: unknown): TeamMember[] {
  return arr(rec(raw).members).flatMap((item) => {
    const m = rec(item);
    const id = str(m.id);
    return id ? [{ id, name: str(m.name), role: str(m.role) }] : [];
  });
}

function parseCounts(raw: unknown): Counts {
  const r = rec(raw);
  return { open: count(r.open), skipped: count(r.skipped), owner_done: count(r.owner_done), verified: count(r.verified) };
}

/** A part's value is a number only when the part was measured. */
function parsePart(raw: unknown): ScorePart {
  if (typeof raw === "number" && Number.isFinite(raw)) return { value: raw, measured: true, weight: null };
  const r = rec(raw);
  const measured = r.measured === true;
  return { value: measured ? num(r.value) : null, measured: measured && num(r.value) !== null, weight: num(r.weight) };
}

export function parseParts(raw: unknown): ScoreParts | null {
  const r = rec(raw);
  const keys: PartKey[] = ["presence", "reviews", "website", "whatsapp", "ai"];
  const present = keys.filter((k) => k in r);
  if (present.length === 0) return null;
  const out: ScoreParts = {};
  for (const key of present) out[key] = r[key] === null ? { value: null, measured: false, weight: null } : parsePart(r[key]);
  return out;
}

export function parseRun(raw: unknown): Run {
  const r = rec(raw);
  const id = str(r.id);
  if (!id) throw bad("a run without an id");
  return {
    id, status: oneOf(r.status, ["queued", "running", "done", "failed"] as const, "queued"), trigger: str(r.trigger),
    score: num(r.score), score_parts: parseParts(r.score_parts), started_at: strOrNull(r.started_at),
    finished_at: strOrNull(r.finished_at), error: strOrNull(r.error), steps: arr(r.steps).map(parseStep),
  };
}

export function parseOverview(raw: unknown): Overview {
  const r = rec(raw);
  const delta = rec(r.delta);
  const change = num(delta.score_change);
  return {
    has_connection: r.has_connection === true, has_run: r.has_run === true,
    last_run: r.last_run ? parseRun(r.last_run) : null, score: num(r.score), headline: str(r.headline), score_parts: parseParts(r.score_parts),
    counts: parseCounts(r.counts), next: r.next ? parseFinding(r.next) : null,
    up_next: arr(r.up_next).map(parseFinding), done: arr(r.done).map(parseFinding),
    delta: change === null ? null : { score_change: change, since_run_id: strOrNull(delta.since_run_id) },
    proposals: parseOverviewProposals(r.proposals),
  };
}

export function parseFindings(raw: unknown): FindingsAnswer {
  const r = rec(raw);
  return { items: arr(r.items).map(parseFinding), counts: parseCounts(r.counts) };
}

export function parseReview(raw: unknown): Review {
  const r = rec(raw);
  const id = str(r.id);
  if (!id) throw bad("a review without an id");
  const rating = Math.round(num(r.rating) ?? 0);
  return {
    id, location: parsePlace(r.location), rating: Math.min(5, Math.max(0, rating)), posted_at: strOrNull(r.posted_at),
    author_name: str(r.author_name), body: str(r.body), language: str(r.language), replied: r.replied === true,
    reply_text: str(r.reply_text),
  };
}

export function parseReviews(raw: unknown): ReviewsAnswer {
  const r = rec(raw);
  const s = rec(r.summary);
  return {
    items: arr(r.items).map(parseReview),
    summary: { count: count(s.count), average: num(s.average), unanswered: count(s.unanswered) },
  };
}

export function parseReport(raw: unknown): Report {
  const r = rec(raw);
  const month = str(r.month);
  if (!/^\d{4}-\d{2}$/.test(month)) throw bad("a report without its month");
  return {
    month, generated_at: strOrNull(r.generated_at), score_start: num(r.score_start), score_end: num(r.score_end),
    change: num(r.change), headline: str(r.headline), fixed: arr(r.fixed).map(parseFinding),
    still_open: arr(r.still_open).map(parseFinding), new: arr(r.new).map(parseFinding),
    by_part: parseParts(r.by_part) ?? {}, runs: count(r.runs),
  };
}

/** `GET /locations` is "the list": an array, or an object holding it. */
export function parsePlaces(raw: unknown): Place[] {
  const r = rec(raw);
  const list = Array.isArray(raw) ? raw : arr(r.items ?? r.locations);
  return list.flatMap((item) => {
    const p = rec(item);
    const id = str(p.id);
    return id ? [{ id, name: str(p.name), name_ar: str(p.name_ar), area: str(p.area), whatsapp_e164: str(p.whatsapp_e164), managers: parseManagers(p.managers) }] : [];
  });
}

/** `GET /connection`: which connector is on. */
export function parseConnection(raw: unknown): Connection {
  const r = rec(raw);
  const list = arr(r.items ?? r.connections);
  const mine = list.map(rec).find((c) => c.status === "on" || c.on === true);
  const source = mine ?? r;
  const kind = str(source.kind);
  const on = source.on === true || source.status === "on" || (kind !== "" && source.on !== false && source.status !== "off");
  return { kind: on ? kind : "", on };
}

// ── calling ─────────────────────────────────────────────

async function call<T>(path: string, parse: (raw: unknown) => T, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/discovery${path}`, {
      method, cache: "no-store",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new DiscoveryError(0, "offline", "offline");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw errorFrom(response.status, data, response.headers.get("retry-after"));
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw bad("no JSON");
  }
  return parse(raw);
}

const q = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) p.set(key, value);
  const text = p.toString();
  return text ? `?${text}` : "";
};

async function getTeam(): Promise<TeamMember[]> {
  let response: Response;
  try {
    response = await fetch("/api/team", { cache: "no-store" });
  } catch {
    throw new DiscoveryError(0, "offline", "offline");
  }
  if (!response.ok) throw errorFrom(response.status, await response.json().catch(() => ({})));
  return parseTeam(await response.json().catch(() => ({})));
}

export type ProposalFilter = "live" | "done" | "closed" | "all" | ProposalStatus;

export const discovery = {
  overview: (lang: Lang) => call(`/overview${q({ lang })}`, parseOverview),
  /** `status=done` is the three that are over: marked by the owner, confirmed by a later check-up, no longer found. */
  findings: (lang: Lang, filter: { status?: FindingStatus | "done"; location_id?: string } = {}) =>
    call(`/findings${q({ lang, status: filter.status, location_id: filter.location_id })}`, parseFindings),
  finding: (lang: Lang, id: string) => call(`/findings/${encodeURIComponent(id)}${q({ lang })}`, parseFinding),
  setStatus: (lang: Lang, id: string, status: "open" | "skipped" | "owner_done") =>
    call(`/findings/${encodeURIComponent(id)}/status${q({ lang })}`, parseFinding, "POST", { status }),
  reviews: (lang: Lang, filter: { location_id?: string; replied?: boolean; max_rating?: number } = {}) =>
    call(`/reviews${q({
      lang, location_id: filter.location_id,
      replied: filter.replied === undefined ? undefined : String(filter.replied),
      max_rating: filter.max_rating === undefined ? undefined : String(filter.max_rating),
    })}`, parseReviews),
  report: (lang: Lang, month: string) => call(`/reports/${encodeURIComponent(month)}${q({ lang })}`, parseReport),
  startRun: (lang: Lang) => call(`/runs${q({ lang })}`, parseRun, "POST"),
  run: (lang: Lang, id: string) => call(`/runs/${encodeURIComponent(id)}${q({ lang })}`, parseRun),
  places: () => call("/locations", parsePlaces),
  connection: () => call("/connection", parseConnection),
  setConnection: (kind: string, on: boolean) => call("/connection", parseConnection, "PUT", { kind, on }),

  // Phase 2 (spec 066 "Routes").
  proposals: (lang: Lang, filter: { status?: ProposalFilter; location_id?: string } = {}) =>
    call(`/proposals${q({ lang, status: filter.status, location_id: filter.location_id })}`, parseProposals),
  proposal: (lang: Lang, id: string) => call(`/proposals/${encodeURIComponent(id)}${q({ lang })}`, parseProposalDetail),
  prepare: (lang: Lang, findingId: string) => call(`/findings/${encodeURIComponent(findingId)}/proposals${q({ lang })}`, parsePrepared, "POST"),
  /** The tap itself: it carries the hash of the change the person was shown, so only that change can be approved. */
  approve: (lang: Lang, id: string, change_hash: string) =>
    call(`/proposals/${encodeURIComponent(id)}/approve${q({ lang })}`, parseProposal, "POST", { change_hash }),
  decline: (lang: Lang, id: string) => call(`/proposals/${encodeURIComponent(id)}/decline${q({ lang })}`, parseProposal, "POST"),
  undo: (lang: Lang, id: string) => call(`/proposals/${encodeURIComponent(id)}/undo${q({ lang })}`, parseProposal, "POST"),
  facts: (lang: Lang, location_id: string) => call(`/facts${q({ lang, location_id })}`, parseFacts),
  setFact: (lang: Lang, fact: { location_id: string; key: FactKey; value: Record<string, unknown> }) =>
    call(`/facts${q({ lang })}`, parseFact, "PUT", fact),
  setManagers: (lang: Lang, locationId: string, user_ids: string[]) =>
    call(`/locations/${encodeURIComponent(locationId)}/managers${q({ lang })}`, parseManagers, "PUT", { user_ids }),
  settings: (lang: Lang) => call(`/settings${q({ lang })}`, parseSettings),
  setSettings: (lang: Lang, patch: { ask_cap_per_day?: number; weekly_run?: boolean; receivers?: string[] }) =>
    call(`/settings${q({ lang })}`, parseSettings, "PUT", patch),
  team: getTeam,
};
