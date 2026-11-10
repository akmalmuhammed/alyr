// The Answers check's side of the Discovery client (ALY-326, spec 068): the shapes of
// `GET /api/discovery/answers` and `PUT /api/discovery/answers/settings`, read defensively like
// `discoveryApi.ts` does: a value that is not what the spec says becomes null, an empty list or
// zero, never a crash, and a share that was not measured is never given a number. It has its own
// small readers so the shared client is left as it is. No React, no words.

import { DiscoveryError, errorFrom } from "./discoveryApi.ts";
import type { Lang } from "./lang";

export type AnswerStatus = "ok" | "error";
export type EngineInfo = { kind: string; label: string; sample: boolean; live: boolean };
export type Option = { key: string; label: string };

export type AnswerItem = {
  id: string; engine: string; engine_label: string; question_key: string; lang: Lang; question: string;
  status: AnswerStatus; error: string | null; named: boolean; position: number | null; list_size: number;
  /** The words of the answer that matched the business, as the answer wrote them. */
  matched: string; competitors: string[];
  /** The answer itself: somebody else's text. Shown quoted, as text, never as markup. */
  text: string;
};

export type Tally = { run_id: string; asked_at: string | null; named: number; counted: number; share: number | null; measured: boolean };
export type Competitor = { name: string; answers: number };
export type LastAsked = Tally & { sample: boolean; answers: AnswerItem[]; competitors: Competitor[] };

export type AnswerSettings = {
  trade: string | null; city: string | null; engines: string[]; trade_label: string; city_label: string;
};

export type AnswersView = {
  enabled: boolean; available: string[]; settings: AnswerSettings;
  options: { trades: Option[]; cities: Option[] };
  engines: EngineInfo[]; questions: { key: string; lang: Lang; text: string }[];
  last: LastAsked | null; previous: Tally | null;
  change: { share_change: number; since_run_id: string | null } | null;
  history: Tally[];
  /** Built by the API in the reader's language, by rule. */
  headline: string; rule: string; limits: string; caution: string; sample_note: string;
};

// ── small readers ───────────────────────────────────────

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strOrNull = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
function count(value: unknown): number {
  const n = num(value);
  return n === null || n < 0 ? 0 : Math.floor(n);
}
const langOf = (value: unknown): Lang => (value === "ar" ? "ar" : "en");

function parseTally(raw: unknown): Tally | null {
  const r = rec(raw);
  const run_id = str(r.run_id);
  if (!run_id) return null;
  const share = num(r.share);
  const measured = r.measured === true && share !== null;
  return {
    run_id, asked_at: strOrNull(r.asked_at), named: count(r.named), counted: count(r.counted),
    // Not measured means no number, whatever the answer carried.
    share: measured ? Math.min(100, Math.max(0, Math.round(share))) : null, measured,
  };
}

export function parseAnswerItem(raw: unknown): AnswerItem | null {
  const r = rec(raw);
  const id = str(r.id);
  if (!id) return null;
  const status: AnswerStatus = r.status === "error" ? "error" : "ok";
  const position = num(r.position);
  return {
    id, engine: str(r.engine), engine_label: str(r.engine_label), question_key: str(r.question_key), lang: langOf(r.lang),
    question: str(r.question), status, error: status === "error" ? str(r.error) : null,
    // An answer that could not be had names nothing.
    named: status === "ok" && r.named === true,
    position: status === "ok" && position !== null && position >= 1 ? Math.floor(position) : null,
    list_size: count(r.list_size), matched: str(r.matched),
    competitors: arr(r.competitors).filter((c): c is string => typeof c === "string" && c !== ""),
    text: str(r.text),
  };
}

function parseCompetitors(raw: unknown): Competitor[] {
  return arr(raw).flatMap((item) => {
    const r = rec(item);
    const name = str(r.name);
    return name ? [{ name, answers: Math.max(1, count(r.answers)) }] : [];
  });
}

function parseOptions(raw: unknown): Option[] {
  return arr(raw).flatMap((item) => {
    const r = rec(item);
    const key = str(r.key);
    return key ? [{ key, label: str(r.label) || key }] : [];
  });
}

export function parseAnswers(raw: unknown): AnswersView {
  const r = rec(raw);
  const s = rec(r.settings);
  const o = rec(r.options);
  const last = rec(r.last);
  const head = parseTally(r.last);
  const change = rec(r.change);
  const shift = num(change.share_change);
  return {
    enabled: r.enabled === true, available: arr(r.available).filter((k): k is string => typeof k === "string"),
    settings: {
      trade: strOrNull(s.trade), city: strOrNull(s.city), engines: arr(s.engines).filter((k): k is string => typeof k === "string"),
      trade_label: str(s.trade_label), city_label: str(s.city_label),
    },
    options: { trades: parseOptions(o.trades), cities: parseOptions(o.cities) },
    engines: arr(r.engines).flatMap((e) => {
      const x = rec(e);
      const kind = str(x.kind);
      return kind ? [{ kind, label: str(x.label) || kind, sample: x.sample === true, live: x.live === true }] : [];
    }),
    questions: arr(r.questions).flatMap((q) => {
      const x = rec(q);
      return str(x.text) ? [{ key: str(x.key), lang: langOf(x.lang), text: str(x.text) }] : [];
    }),
    last: head ? { ...head, sample: last.sample === true, answers: arr(last.answers).map(parseAnswerItem).filter((a): a is AnswerItem => a !== null), competitors: parseCompetitors(last.competitors) } : null,
    previous: parseTally(r.previous),
    change: shift === null ? null : { share_change: shift, since_run_id: strOrNull(change.since_run_id) },
    history: arr(r.history).map(parseTally).filter((t): t is Tally => t !== null),
    headline: str(r.headline), rule: str(r.rule), limits: str(r.limits), caution: str(r.caution), sample_note: str(r.sample_note),
  };
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
    throw new DiscoveryError(0, "bad_answer", "unexpected answer: no JSON");
  }
  return parse(raw);
}

/** What the settings route takes: only keys of the closed lists, never typed text. */
export type SettingsChange = { enabled?: boolean; trade?: string; city?: string };

export const answers = {
  get: (lang: Lang) => call(`/answers?lang=${lang}`, parseAnswers),
  set: (lang: Lang, change: SettingsChange) => call(`/answers/settings?lang=${lang}`, parseAnswers, "PUT", change),
};
