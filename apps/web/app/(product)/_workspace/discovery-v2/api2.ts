// What the Discovery v2 screens Checks, Answers, Proof and Set up read beyond `discoveryApi.ts`:
// the check packs (`GET /api/discovery/packs`, `GET/PUT /api/discovery/pack`, workstream B), the
// Answers check (`GET /api/discovery/answers`, spec 068) and the overview's `checks` block. Kept in
// this folder so the shared client stays as it is. Every answer goes through a parser: a field the
// API leaves out becomes an empty list or a null, never a crash and never a made-up value.
//
// Plain TypeScript with no React, so `screens.test.mjs` runs the parsers under `node --test`.

import { DiscoveryError, errorFrom, parseFinding, parseOverview, parseProposal, type Finding, type Overview, type Proposal } from "../discoveryApi.ts";
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

/** The overview's `checks` block: the family and trade of the last check-up (or of today's pack).
 * `previous` (the loop, agent D): checks matched on the check-up before the last, and when. */
export type ChecksBlock = {
  run_id: string | null; family: string | null; trade: string | null; matched: number; measured: number; not_measured: number; total: number;
  previous: { matched: number; measured: number; at: string } | null;
};

export function parseChecksBlock(raw: unknown): ChecksBlock | null {
  const r = rec(raw);
  if (!("family" in r) && !("matched" in r)) return null;
  const prev = rec(r.previous);
  const at = strOrNull(prev.at);
  return {
    run_id: strOrNull(r.run_id), family: strOrNull(r.family), trade: strOrNull(r.trade),
    matched: count(r.matched), measured: count(r.measured), not_measured: count(r.not_measured), total: count(r.total),
    previous: at && num(prev.matched) !== null ? { matched: count(prev.matched), measured: count(prev.measured), at } : null,
  };
}

/** The overview's `asks` block (the loop, agent D): at most `cap` open asks, the rest "Also noticed"
 * (each waits its turn), when the weekly check runs next and the soonest ~20-hour check of a sent change.
 * An item is a proposal, or a seasonal ask (a finding the owner answers), which counts toward the cap. */
export type AskItem = { kind: "proposal"; queue: "open" | "also_noticed"; proposal: Proposal } | { kind: "season"; queue: "open" | "also_noticed"; finding: Finding };
export type AsksBlock = { cap: number; open: AskItem[]; alsoNoticed: AskItem[]; nextCheckAt: string | null; nextChangeCheckAt: string | null };

function parseAskItems(raw: unknown, queue: "open" | "also_noticed"): AskItem[] {
  return arr(raw).flatMap((item): AskItem[] => {
    const v = rec(item);
    // An item that cannot be read is left out, not allowed to take the page with it.
    try {
      if (v.kind === "proposal" && v.proposal) return [{ kind: "proposal", queue, proposal: parseProposal(v.proposal) }];
      if (v.kind === "season" && v.finding) return [{ kind: "season", queue, finding: parseFinding(v.finding) }];
    } catch { /* left out */ }
    return [];
  });
}

export function parseAsksBlock(raw: unknown): AsksBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const r = rec(raw);
  return {
    cap: Math.max(1, count(r.cap) || 3),
    open: parseAskItems(r.open_asks, "open"),
    alsoNoticed: parseAskItems(r.also_noticed, "also_noticed"),
    nextCheckAt: strOrNull(r.next_check_at),
    nextChangeCheckAt: strOrNull(r.next_change_check_at),
  };
}

export type OverviewPlus = { overview: Overview; checks: ChecksBlock | null; asks: AsksBlock | null };
export const parseOverviewPlus = (raw: unknown): OverviewPlus => ({
  overview: parseOverview(raw), checks: parseChecksBlock(rec(raw).checks), asks: parseAsksBlock(rec(raw).asks),
});

// ── answers (spec 068; Answers v2, workstream G #362) ──

/** first: nothing to compare; not_enough: under 30 answers in one of the two check-ups (the sample
 * never reaches 30); no_change: the ranges overlap; up / down: they do not. */
export type ChangeState = "first" | "not_enough" | "no_change" | "up" | "down";
const CHANGE_STATES: readonly ChangeState[] = ["first", "not_enough", "no_change", "up", "down"];
/** A likely range in whole percents (Wilson, 95%). */
export type PctRange = { low: number; high: number };

/** One answer tool in one language: never added into another (per tool and per language). */
export type AnswerGroup = {
  engine: string; engine_label: string; sample: boolean; lang: string; lang_label: string;
  named: number; counted: number; asked: number;
  range: PctRange | null;
  /** Only from 30 answers. */
  share: number | null;
  headline: string;
  change: { state: ChangeState | null; reason: string; since: { named: number; counted: number; range: PctRange | null } | null };
};
export type CitedCheck = "matches" | "differs" | "not_read";
export type AnswerSource = { host: string; title: string; check: CitedCheck; check_label: string };
export type AnswerItem = {
  id: string; engine: string; engine_label: string; lang: string; question: string;
  status: string; named: boolean; matched: string; text: string; said_by: string; shared: boolean;
  sources: AnswerSource[];
};
/** A page the answers cited (per host, most cited first). */
export type CitedHost = {
  host: string; titles: string[]; answers: number; answersWithoutYou: number;
  check: CitedCheck; check_label: string; engineLabels: string[]; langs: string[];
};
export type AnswerTally = { run_id: string; asked_at: string | null; named: number; counted: number; sample: boolean };
export type AnswersLast = AnswerTally & { groups: AnswerGroup[]; answers: AnswerItem[]; sources: CitedHost[] };

export type AnswersAnswer = {
  enabled: boolean;
  engines: { kind: string; label: string; sample: boolean }[];
  trade: string; city: string; area: string;
  last: AnswersLast | null;
  previous: AnswerTally | null;
  headline: string; method: string; rule: string; limits: string; caution: string; sampleNote: string;
  rangeNote: string; quoteNote: string; sourcesTitle: string; sourcesNote: string;
};

function parseTally(raw: unknown): AnswerTally | null {
  const r = rec(raw);
  const run = str(r.run_id);
  if (!run) return null;
  return { run_id: run, asked_at: strOrNull(r.asked_at), named: count(r.named), counted: count(r.counted), sample: r.sample === true };
}

function parseRange(raw: unknown): PctRange | null {
  const r = rec(raw);
  const low = num(r.low), high = num(r.high);
  return low !== null && high !== null && low >= 0 && high <= 100 && low <= high ? { low, high } : null;
}

const checkOf = (v: unknown): CitedCheck => (v === "matches" || v === "differs" ? v : "not_read");

function parseGroup(raw: unknown): AnswerGroup | null {
  const v = rec(raw);
  const engine = str(v.engine), lang = str(v.lang);
  if (!engine || !lang) return null;
  const change = rec(v.change);
  const since = rec(change.since);
  const named = count(v.named), counted = count(v.counted);
  const state = str(change.state);
  return {
    engine, engine_label: str(v.engine_label) || engine, sample: v.sample === true, lang, lang_label: str(v.lang_label),
    named: Math.min(named, counted), counted, asked: count(v.asked),
    range: counted > 0 ? parseRange(v.range) : null,
    share: counted >= 30 ? num(v.share) : null,
    headline: str(v.headline),
    change: {
      state: (CHANGE_STATES as readonly string[]).includes(state) ? (state as ChangeState) : null,
      reason: str(change.reason),
      since: Object.keys(since).length ? { named: count(since.named), counted: count(since.counted), range: parseRange(since.range) } : null,
    },
  };
}

export function parseAnswers(raw: unknown): AnswersAnswer {
  const r = rec(raw);
  const lastRaw = rec(r.last);
  const lastTally = parseTally(r.last);
  const last: AnswersLast | null = lastTally ? {
    ...lastTally,
    groups: arr(lastRaw.groups).flatMap((g) => { const v = parseGroup(g); return v ? [v] : []; }),
    answers: arr(lastRaw.answers).flatMap((a) => {
      const v = rec(a);
      const id = str(v.id);
      return id ? [{
        id, engine: str(v.engine), engine_label: str(v.engine_label) || str(v.engine), lang: str(v.lang), question: str(v.question),
        status: str(v.status), named: v.named === true, matched: str(v.matched), text: str(v.text),
        said_by: str(v.said_by) || str(v.engine_label), shared: v.shared === true,
        sources: arr(v.sources).flatMap((s) => {
          const x = rec(s);
          const host = str(x.host);
          return host ? [{ host, title: str(x.title), check: checkOf(x.check), check_label: str(x.check_label) }] : [];
        }),
      }] : [];
    }),
    sources: arr(lastRaw.sources).flatMap((s) => {
      const x = rec(s);
      const host = str(x.host);
      return host ? [{
        host, titles: strs(x.titles), answers: count(x.answers), answersWithoutYou: count(x.answers_without_you),
        check: checkOf(x.check), check_label: str(x.check_label), engineLabels: strs(x.engine_labels), langs: strs(x.langs),
      }] : [];
    }),
  } : null;
  const settings = rec(r.settings);
  return {
    enabled: r.enabled === true,
    engines: arr(r.engines).flatMap((e) => { const v = rec(e); const kind = str(v.kind); return kind ? [{ kind, label: str(v.label) || kind, sample: v.sample === true }] : []; }),
    trade: str(settings.trade_label), city: str(settings.city_label), area: str(settings.area_label),
    last, previous: parseTally(r.previous),
    headline: str(r.headline), method: str(r.method), rule: str(r.rule), limits: str(r.limits), caution: str(r.caution), sampleNote: str(r.sample_note),
    rangeNote: str(r.range_note), quoteNote: str(r.quote_note), sourcesTitle: str(r.sources_title), sourcesNote: str(r.sources_note),
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
  /** The loop's open asks (at most three) and "Also noticed", the same block as the overview's `asks`. */
  asks: (lang: D2Lang) => call(`/asks?lang=${lang}`, parseAsksBlock),
  /** Owner and admin only (403 otherwise): whether the Google Places live read is on, and each place's place ID. */
  googlePlace: () => call("/google-place", parseGooglePlace),
  /** A Google Maps link or a place ID; "" removes it. Refused (422) when it holds no place ID. */
  setGooglePlace: (locationId: string, link: string) =>
    call(`/google-place/${encodeURIComponent(locationId)}`, parseGooglePlace, "PUT", { link }),
};

// ── the Google Maps link of each place (workstream F) ──

export type GooglePlace = { id: string; name: string; nameAr: string; area: string; placeId: string | null };
export type GooglePlaces = { on: boolean; places: GooglePlace[] };

export function parseGooglePlace(raw: unknown): GooglePlaces {
  const r = rec(raw);
  return {
    on: r.on === true,
    places: arr(r.places).flatMap((p) => {
      const x = rec(p);
      const id = str(x.id);
      return id ? [{ id, name: str(x.name), nameAr: str(x.name_ar), area: str(x.area), placeId: str(x.place_id) || null }] : [];
    }),
  };
}
