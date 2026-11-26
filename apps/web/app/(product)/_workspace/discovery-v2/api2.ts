// What the Discovery v2 screens Checks, Answers, Proof and Set up read beyond `discoveryApi.ts`:
// the check packs (`GET /api/discovery/packs`, `GET/PUT /api/discovery/pack`, workstream B), the
// Answers check (`GET /api/discovery/answers`, spec 068) and the overview's `checks` block. Kept in
// this folder so the shared client stays as it is. Every answer goes through a parser: a field the
// API leaves out becomes an empty list or a null, never a crash and never a made-up value.
//
// Plain TypeScript with no React, so `screens.test.mjs` runs the parsers under `node --test`.

import { DiscoveryError, errorFrom, parseOverview, type Overview } from "../discoveryApi.ts";
import type { D2Lang } from "./copy.ts";

// ── tiny readers ───────────────────────────────────────

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const count = (v: unknown): number => Math.max(0, Math.round(num(v) ?? 0));
const strs = (v: unknown): string[] => arr(v).map(str).filter(Boolean);

// ── packs (workstream B) ───────────────────────────────

export type PackKind = "core" | "family" | "overlay";
export type PackTrade = { key: string; title: string; title_en: string; title_ar: string; overlays: string[] };
export type Pack = {
  id: string; kind: PackKind; family: string | null; title: string; title_en: string; title_ar: string;
  trades: PackTrade[];
  /** The rule ids this pack itself adds (the API has expanded `@firstparty`). */
  rules: string[];
  checks: number;
  /** For the core and a family: every check a business of it is checked against. */
  total_checks: number | null;
  overlays: string[];
  skip: string[];
};
export type PackChoice = {
  family: string | null; trade: string | null; family_title: string | null; trade_title: string | null;
  /** False while the pack comes from the business type, not from a person's choice. */
  chosen: boolean;
  business_type: string;
  rules: string[];
  checks: number;
  overlays: string[];
};

export function parsePacks(raw: unknown): Pack[] {
  return arr(rec(raw).items).flatMap((item) => {
    const p = rec(item);
    const id = str(p.id);
    const kind = str(p.kind);
    if (!id || (kind !== "core" && kind !== "family" && kind !== "overlay")) return [];
    return [{
      id, kind, family: strOrNull(p.family), title: str(p.title), title_en: str(p.title_en), title_ar: str(p.title_ar),
      trades: arr(p.trades).flatMap((t) => {
        const v = rec(t);
        const key = str(v.key);
        return key ? [{ key, title: str(v.title), title_en: str(v.title_en), title_ar: str(v.title_ar), overlays: strs(v.overlays) }] : [];
      }),
      rules: strs(p.rules), checks: count(p.checks), total_checks: num(p.total_checks),
      overlays: strs(p.overlays), skip: strs(p.skip),
    }];
  });
}

export function parsePackChoice(raw: unknown): PackChoice {
  const r = rec(raw);
  return {
    family: strOrNull(r.family), trade: strOrNull(r.trade), family_title: strOrNull(r.family_title), trade_title: strOrNull(r.trade_title),
    chosen: r.chosen === true, business_type: str(r.business_type), rules: strs(r.rules), checks: count(r.checks), overlays: strs(r.overlays),
  };
}

/** The overview's `checks` block: the family and trade of the last check-up (or of today's pack). */
export type ChecksBlock = { run_id: string | null; family: string | null; trade: string | null; matched: number; measured: number; not_measured: number; total: number };

export function parseChecksBlock(raw: unknown): ChecksBlock | null {
  const r = rec(raw);
  if (!("family" in r) && !("matched" in r)) return null;
  return {
    run_id: strOrNull(r.run_id), family: strOrNull(r.family), trade: strOrNull(r.trade),
    matched: count(r.matched), measured: count(r.measured), not_measured: count(r.not_measured), total: count(r.total),
  };
}

export type OverviewPlus = { overview: Overview; checks: ChecksBlock | null };
export const parseOverviewPlus = (raw: unknown): OverviewPlus => ({ overview: parseOverview(raw), checks: parseChecksBlock(rec(raw).checks) });

// ── answers (spec 068; workstream G adds the range and the cited pages) ──

export type AnswerItem = {
  id: string; engine: string; engine_label: string; lang: string; question: string;
  status: string; named: boolean; position: number | null; matched: string; text: string;
};
export type AnswerTally = { run_id: string; asked_at: string | null; named: number; counted: number; measured: boolean };
export type AnswersLast = AnswerTally & { sample: boolean; answers: AnswerItem[] };
/** TODO(G): the likely range of the count if asked again (api-gaps.md). Drawn only when sent. */
export type AnswerRange = { low: number; high: number };
/** TODO(G): a page the answers cited, and how many answers cited it (api-gaps.md). Drawn only when sent. */
export type CitedPage = { kind: string; title: string; host: string; cites: number; state: "matches" | "differs" | "not_read" | ""; note: string };

export type AnswersAnswer = {
  enabled: boolean;
  engines: { kind: string; label: string; sample: boolean }[];
  trade: string; city: string;
  last: AnswersLast | null;
  previous: AnswerTally | null;
  headline: string; rule: string; limits: string; caution: string; sampleNote: string;
  range: AnswerRange | null;
  cited: CitedPage[] | null;
};

function parseTally(raw: unknown): AnswerTally | null {
  const r = rec(raw);
  const run = str(r.run_id);
  if (!run) return null;
  return { run_id: run, asked_at: strOrNull(r.asked_at), named: count(r.named), counted: count(r.counted), measured: r.measured === true };
}

export function parseAnswers(raw: unknown): AnswersAnswer {
  const r = rec(raw);
  const lastTally = parseTally(r.last);
  const last = lastTally ? {
    ...lastTally,
    sample: rec(r.last).sample === true,
    answers: arr(rec(r.last).answers).flatMap((a) => {
      const v = rec(a);
      const id = str(v.id);
      return id ? [{
        id, engine: str(v.engine), engine_label: str(v.engine_label) || str(v.engine), lang: str(v.lang), question: str(v.question),
        status: str(v.status), named: v.named === true, position: num(v.position), matched: str(v.matched), text: str(v.text),
      }] : [];
    }),
  } : null;
  const settings = rec(r.settings);
  const range = rec(r.range);
  const low = num(range.low), high = num(range.high);
  return {
    enabled: r.enabled === true,
    engines: arr(r.engines).flatMap((e) => { const v = rec(e); const kind = str(v.kind); return kind ? [{ kind, label: str(v.label) || kind, sample: v.sample === true }] : []; }),
    trade: str(settings.trade_label), city: str(settings.city_label),
    last, previous: parseTally(r.previous),
    headline: str(r.headline), rule: str(r.rule), limits: str(r.limits), caution: str(r.caution), sampleNote: str(r.sample_note),
    range: low !== null && high !== null && low <= high ? { low, high } : null,
    cited: Array.isArray(r.cited) ? r.cited.flatMap((c) => {
      const v = rec(c);
      const title = str(v.title);
      const state = str(v.state);
      return title ? [{ kind: str(v.kind), title, host: str(v.host), cites: count(v.cites), state: (["matches", "differs", "not_read"].includes(state) ? state : "") as CitedPage["state"], note: str(v.note) }] : [];
    }) : null,
  };
}

// ── calling ────────────────────────────────────────────

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
  if (!response.ok) throw errorFrom(response.status, await response.json().catch(() => ({})), response.headers.get("retry-after"));
  return parse(await response.json().catch(() => ({})));
}

export const discovery2 = {
  overview: (lang: D2Lang) => call(`/overview?lang=${lang}`, parseOverviewPlus),
  packs: (lang: D2Lang) => call(`/packs?lang=${lang}`, parsePacks),
  /** Owner and admin only: the agent role is refused with 403. */
  pack: (lang: D2Lang) => call(`/pack?lang=${lang}`, parsePackChoice),
  setPack: (lang: D2Lang, family: string, trade: string | null) => call(`/pack?lang=${lang}`, parsePackChoice, "PUT", { family, trade }),
  answers: (lang: D2Lang) => call(`/answers?lang=${lang}`, parseAnswers),
};
