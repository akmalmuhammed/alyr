// What the Discovery screens read and write (ALY-322, spec 065 "API"): the routes under
// `/api/discovery`, their shapes, and one way to turn a refusal into something the screens can
// say. Every answer goes through a parser, so a field the API leaves out becomes an empty list
// or a null, never a crash, and a part of the score that was not measured is never given a
// number (spec: "Say a number it did not measure" is a thing it must never do). The words in an
// answer (a finding's title, why, what happens) arrive in the reader's language through
// `?lang=`; the screen's own words are in `discoveryCopy.ts`.
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
};

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

export type Place = { id: string; name: string; name_ar: string; area: string };
export type Connection = { kind: string; on: boolean };

// ── errors ──────────────────────────────────────────────

export class DiscoveryError extends Error {
  status: number;
  code: string;
  messageAr: string;
  /** Seconds, from a 429's `retry_after` (the body) or its `Retry-After` header. */
  retryAfter: number | null;
  constructor(status: number, code: string, message: string, messageAr = "", retryAfter: number | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.messageAr = messageAr;
    this.retryAfter = retryAfter;
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
  return new DiscoveryError(status, code, message, messageAr, fromBody ?? header);
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
  };
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
    return id ? [{ id, name: str(p.name), name_ar: str(p.name_ar), area: str(p.area) }] : [];
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
};
