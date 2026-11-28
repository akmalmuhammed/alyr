// Pure logic of the Discovery v2 screens Checks, Proof, Answers and Set up: what each draws from
// the API's answers. No React and no browser globals, so `screens.test.mjs` runs it under
// `node --test`. Nothing here invents a value: a check that was not measured is never a match or a
// difference and is left out of every "N of M"; a count is only ever a count of what the API sent.

import { DAYS, type CheckState, type ChecksAnswer, type ChecksRow, type DayKey, type Evidence, type Fact, type Finding, type Place, type Proposal } from "../discoveryApi.ts";
import type { AnswerGroup, AnswerItem, AnswersAnswer, ChecksBlock, CitedHost, Pack } from "./api2.ts";
import type { D2Lang } from "./copy.ts";
import { T2 } from "./copy2.ts";
import { stageOf, tally, type Tally } from "./logic.ts";
import { phoneText } from "./ownLogic.ts";

// ── values in either language ──────────────────────────

const ARABIC = /[؀-ۿ]/;
const RANGE = /\d[\d:.,]*(?:\s*[–-]\s*\d[\d:.,]*)+|\+?\d[\d\s]{5,}\d/g;

/** A value as the API wrote it, ready for either direction: a value with Arabic in it keeps its own
 * direction, and each time range or phone number inside it is held left to right («الجمعة
 * 13:00–22:00» never reads 22:00–13:00). A value with no Arabic is left as it is (drawn LTR). */
export function bidiValue(text: string): { rtl: boolean; text: string } {
  if (!ARABIC.test(text)) return { rtl: false, text };
  // U+2066 … U+2069 hold the run left to right; word joiners (U+2060) keep a range on one line.
  return { rtl: true, text: text.replace(RANGE, (run) => `⁦${run.replace(/–/g, "⁠–⁠")}⁩`) };
}

// ── Checks ─────────────────────────────────────────────

export type CheckKind = "differ" | "ok" | "nm";
export type CheckFilter = "all" | CheckKind;
export const kindOf = (state: CheckState): CheckKind => (state === "pass" ? "ok" : state === "fail" ? "differ" : "nm");

export type CheckRowView = {
  key: string;
  ruleId: string;
  /** The check's name ("Hours match"), from the API in the reader's language. */
  label: string;
  /** The place, when the business has more than one; null for the whole business or a single place. */
  place: string | null;
  kind: CheckKind;
  /** The open finding behind a difference: its title is the row's sentence, its evidence the chips. */
  finding: Finding | null;
  evidence: Evidence[];
  /** A change waits for approval on This week. */
  askWaiting: boolean;
  /** The check as a whole sentence in the reader's language (`GET /checks`, agent C3), or null
   * from an older API (the label is drawn then). Not measured: what was looked at, without the
   * trailing "Not measured" the state pill already says. */
  sentence: string | null;
};
export type GroupId = "core" | "own" | "family";
export type CheckGroup = { id: GroupId; title: string; rows: CheckRowView[]; matched: number; differ: number; notMeasured: number };
export type ChecksView = {
  state: "content" | "notMeasured";
  checkedAt: string | null;
  tally: Tally | null;
  groups: CheckGroup[];
  counts: Record<CheckFilter, number>;
  family: string | null;
  familyTitle: string | null;
  tradeTitle: string | null;
};

const ORDER: Record<CheckKind, number> = { differ: 0, ok: 1, nm: 2 };

/** The rule ids a family brings: its own, its overlays' and the trade's overlays' (minus what any of them skips). */
export function familyRules(packs: readonly Pack[], family: string | null, trade: string | null): Set<string> {
  const out = new Set<string>();
  const fam = packs.find((p) => p.kind === "family" && p.id === family);
  if (!fam) return out;
  const overlays = [...fam.overlays, ...(fam.trades.find((t) => t.key === trade)?.overlays ?? [])];
  for (const id of [fam.id, ...overlays]) for (const r of packs.find((p) => p.id === id)?.rules ?? []) out.add(r);
  return out;
}

export function buildChecks(input: {
  checks: ChecksAnswer | null;
  findings: readonly Finding[];
  packs: readonly Pack[];
  block: ChecksBlock | null;
  waiting: readonly Proposal[];
  titles: { core: string; own: string };
  /** The language of the sentences; English when absent. */
  lang?: D2Lang;
}): ChecksView {
  const { checks, findings, packs, block } = input;
  const fam = packs.find((p) => p.kind === "family" && p.id === block?.family) ?? null;
  const trade = fam?.trades.find((t) => t.key === block?.trade) ?? null;
  const base = { checkedAt: checks?.finished_at ?? null, family: fam?.id ?? null, familyTitle: fam?.title ?? null, tradeTitle: trade?.title ?? null };
  // One count across the screens (This week's headline, the tab, Checks): the overview's own, the
  // checks that apply to this business with "Not measured" left out; summed from the rows only when
  // the API sends no block.
  const t = block && block.run_id && block.measured > 0
    ? { matched: block.matched, measured: block.measured, notMeasured: block.not_measured, total: block.total }
    : tally(checks);
  if (!checks || !checks.measured || !t) {
    return { ...base, state: "notMeasured", tally: null, groups: [], counts: { all: 0, differ: 0, ok: 0, nm: 0 } };
  }
  const label = new Map(checks.rules.map((r) => [r.id, r.label]));
  // `GET /checks` marks each rule: `first_party` (it reads ALYR's own records) and `pack` (the pack
  // that brought it into the last check-up). A pack other than the core is the family's group
  // (its overlays included). An older API without marks: every rule is core.
  const own = new Set(checks.rules.filter((r) => r.first_party).map((r) => r.id));
  const famRules = new Set(checks.rules.filter((r) => !r.first_party && r.pack && r.pack !== "core").map((r) => r.id));
  const many = checks.places.length > 1;
  const waitingFindings = new Set(input.waiting.filter((p) => p.status === "proposed").map((p) => p.finding_id));
  const open = findings.filter((f) => f.status === "open");
  const findingFor = (rule: string, placeId: string | null) =>
    open.find((f) => f.rule_id === rule && (f.location?.id ?? null) === placeId) ?? (placeId === null || !many ? open.find((f) => f.rule_id === rule) ?? null : null);

  const rows: CheckRowView[] = [];
  const lang = input.lang ?? "en";
  const add = (placeId: string | null, placeName: string | null, states: Record<string, CheckState>, said: ChecksRow["sentences"]) => {
    for (const rule of checks.rules) {
      const state = states[rule.id];
      if (!state) continue;
      const kind = kindOf(state);
      const finding = kind === "differ" ? findingFor(rule.id, placeId) : null;
      rows.push({
        key: `${placeId ?? "business"}:${rule.id}`, ruleId: rule.id, label: label.get(rule.id) ?? rule.id,
        place: many ? placeName : null, kind, finding, evidence: finding?.evidence ?? [],
        askWaiting: !!finding && (finding.proposals_waiting > 0 || waitingFindings.has(finding.id)),
        sentence: sentenceOf(said?.[rule.id], kind, lang),
      });
    }
  };
  if (checks.business) add(null, null, checks.business.checks, checks.business.sentences);
  for (const p of checks.places) add(p.id, p.name, p.checks, p.sentences);

  const groupOf = (rule: string): GroupId => (own.has(rule) ? "own" : famRules.has(rule) ? "family" : "core");
  const groups: CheckGroup[] = (["core", "own", "family"] as GroupId[]).flatMap((id) => {
    const mine = rows.filter((r) => groupOf(r.ruleId) === id).sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
    if (!mine.length) return [];
    const title = id === "core" ? input.titles.core : id === "own" ? input.titles.own : fam?.title ?? "";
    return [{
      id, title, rows: mine,
      matched: mine.filter((r) => r.kind === "ok").length,
      differ: mine.filter((r) => r.kind === "differ").length,
      notMeasured: mine.filter((r) => r.kind === "nm").length,
    }];
  });
  const counts = {
    all: rows.length,
    differ: rows.filter((r) => r.kind === "differ").length,
    ok: rows.filter((r) => r.kind === "ok").length,
    nm: rows.filter((r) => r.kind === "nm").length,
  };
  return { ...base, state: "content", tally: t, groups, counts };
}

// The API ends a check it could not measure with ": Not measured." («: لم يُقَس.»); the row's pill says it.
const NM_TAIL = /\s*[:：]\s*(Not measured|لم يُقَس)\.?\s*$/u;

/** A check's sentence in the reader's language, or null. */
export function sentenceOf(said: { en: string; ar: string } | undefined, kind: CheckKind, lang: D2Lang): string | null {
  const text = said ? (lang === "ar" ? said.ar : said.en) : "";
  if (!text) return null;
  if (kind !== "nm") return text;
  const short = text.replace(NM_TAIL, "");
  return short && short !== text ? short : text;
}

/** A sentence that ends in a run of names ("…spelled more than one way across your listings: A; B;
 * C."), cut into its head and the names, so the names are drawn as a list under the sentence and
 * never as one bidirectional run (the lead's review of #372). English joins them with "; ", the
 * Arabic with «، » round isolated names. Null when the sentence holds no such list. */
export function sentenceList(text: string): { head: string; items: string[] } | null {
  const at = text.search(/[:：]\s/);
  if (at < 0) return null;
  const head = `${text.slice(0, at).trim()}.`;
  const rest = text.slice(at + 1).trim().replace(/\.$/, "");
  const isolated = [...rest.matchAll(/\u2068([^\u2069]*)\u2069/g)].map((m) => m[1].trim());
  // Arabic: only when the rest is nothing but isolated names joined by commas.
  if (isolated.length >= 2 && rest.replace(/\u2068[^\u2069]*\u2069/g, "").replace(/[،,\s]/g, "") === "") return { head, items: isolated };
  const parts = rest.split(/;\s+/).map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2 ? { head, items: parts } : null;
}

/** What a group draws: each difference on its own (its sentence and evidence), and the checks that
 * match or were not measured once per check, with the places they hold for (56 rows become 16). */
export type CheckLine =
  | { kind: "differ"; row: CheckRowView }
  | { kind: "ok" | "nm"; key: string; ruleId: string; label: string; sentence: string | null; places: string[] };

export function linesOf(rows: readonly CheckRowView[]): CheckLine[] {
  const out: CheckLine[] = [];
  for (const row of rows) {
    if (row.kind === "differ") { out.push({ kind: "differ", row }); continue; }
    // The same sentence at several places is one line; a sentence that differs by place is its own.
    const key = `${row.kind}:${row.ruleId}:${row.sentence ?? ""}`;
    const same = out.find((l): l is Extract<CheckLine, { kind: "ok" | "nm" }> => l.kind !== "differ" && l.key === key);
    if (same) { if (row.place) same.places.push(row.place); continue; }
    out.push({ kind: row.kind, key, ruleId: row.ruleId, label: row.label, sentence: row.sentence, places: row.place ? [row.place] : [] });
  }
  return out;
}

/** Rows a filter shows; a group with none is not drawn. */
export const filterRows = (rows: readonly CheckRowView[], filter: CheckFilter): CheckRowView[] =>
  filter === "all" ? [...rows] : rows.filter((r) => r.kind === filter);

// ── Proof ──────────────────────────────────────────────

export type ReceiptKind = "approved" | "you" | "fixed" | "changed" | "undone" | "expired" | "declined";
export type ReceiptFilter = "all" | ReceiptKind;
export type ReceiptStatus = "matches" | "sent" | "notMatching" | "approved" | "failed" | "undone" | "expired" | "declined" | "fixed" | "changed" | "youMatches" | "youPending";

/** A receipt of a proposal (approved, undone, expired, fixed, changed or not now). */
export type ChangeReceipt = { kind: Exclude<ReceiptKind, "you">; id: string; p: Proposal; status: ReceiptStatus; when: string | null };
export type Receipt = ChangeReceipt | { kind: "you"; id: string; f: Finding; status: ReceiptStatus; when: string | null };

/** Where a proposal is on the receipts. An ask that closed without a decision is dated when it
 * closed (`closed_at`), never by its expiry date, and says why it closed: only one whose 14 days ran
 * out is "Expired"; one the next check found fixed is "fixed"; one a person set aside reads as not
 * now; one approved with a changed value is "changed" (its new approval carries the receipt, see
 * `buildProof`). One a newer check replaced, or the owner marked done (that finding has its own
 * receipt), is not drawn. */
export function receiptOf(p: Proposal): Receipt | null {
  const stage = stageOf(p);
  if (stage === "waiting") return null;
  if (stage === "expired") {
    const when = p.closed_at ?? p.proposed_at;
    switch (p.expire_reason) {
      case "superseded": case "finding_done": return null;
      case "finding_gone": return { kind: "fixed", id: p.id, p, status: "fixed", when };
      case "finding_skipped": return { kind: "declined", id: p.id, p, status: "declined", when };
      case "edited": return { kind: "changed", id: p.id, p, status: "changed", when };
      default: return { kind: "expired", id: p.id, p, status: "expired", when };
    }
  }
  const when = p.undone?.at ?? p.applied_at ?? p.decided?.at ?? p.proposed_at;
  if (stage === "undone") return { kind: "undone", id: p.id, p, status: "undone", when };
  if (stage === "declined") return { kind: "declined", id: p.id, p, status: "declined", when };
  const status: ReceiptStatus = stage === "live" ? "matches" : stage === "notLive" ? "notMatching" : stage === "sent" ? "sent" : stage === "failed" ? "failed" : "approved";
  return { kind: "approved", id: p.id, p, status, when };
}

export type ProofView = {
  receipts: Receipt[];
  counts: Record<ReceiptFilter, number>;
  /** The date of the oldest receipt: "6 receipts since 27 Oct". */
  since: string | null;
  matches: number;
  /** People who decided (approved, said not now or undid), in order of first appearance. */
  deciders: string[];
  /** A change the owner made outside ALYR is among the receipts. */
  byYou: boolean;
};

const ms = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0);

export function buildProof(proposals: readonly Proposal[], doneFindings: readonly Finding[]): ProofView {
  // "Change it" closes the ask shown and approves a new one with the changed value: one receipt.
  const replaced = new Set(proposals.map((p) => p.edited_from).filter((id): id is string => !!id));
  const fromProposals = proposals.filter((p) => !replaced.has(p.id)).map(receiptOf).filter((r): r is Receipt => r !== null);
  const yours: Receipt[] = doneFindings
    // Done by the owner: marked done (a website step is one), or an owner's task the check then saw.
    .filter((f) => f.status === "owner_done" || (f.status === "verified" && f.kind === "owner"))
    .map((f) => ({ kind: "you", id: f.id, f, status: f.status === "verified" ? "youMatches" : "youPending", when: f.last_seen_at }));
  const receipts = [...fromProposals, ...yours].sort((a, b) => ms(b.when) - ms(a.when));
  const counts: Record<ReceiptFilter, number> = { all: receipts.length, approved: 0, you: 0, fixed: 0, changed: 0, undone: 0, expired: 0, declined: 0 };
  for (const r of receipts) counts[r.kind] += 1;
  const deciders: string[] = [];
  for (const r of [...receipts].reverse()) {
    if (r.kind === "you") continue;
    for (const name of [r.p.decided?.by, r.p.undone?.by]) if (name && !deciders.includes(name)) deciders.push(name);
  }
  const oldest = receipts.length ? receipts[receipts.length - 1].when : null;
  return {
    receipts, counts, since: oldest,
    matches: receipts.filter((r) => r.status === "matches" || r.status === "youMatches" || r.status === "fixed").length,
    deciders, byYou: counts.you > 0,
  };
}

export const filterReceipts = (receipts: readonly Receipt[], filter: ReceiptFilter): Receipt[] =>
  filter === "all" ? [...receipts] : receipts.filter((r) => r.kind === filter);

// ── Answers ────────────────────────────────────────────

export type Dot = { named: boolean; tool: string; question: string };
export type LangTally = { named: number; counted: number; dots: Dot[] };
export type ToolRow = { engine: string; label: string; en: LangTally; ar: LangTally };
export type AnswersView = {
  state: "off" | "notAsked" | "tooFew" | "content";
  named: number;
  counted: number;
  en: LangTally;
  ar: LangTally;
  tools: ToolRow[];
  /** One per tool and language (the API's `groups`), never added together. */
  groups: AnswerGroup[];
  /** No tool reached 30 answers in a language: no share and no change can be named. */
  notEnough: boolean;
  /** The most answers one tool counted in one language. */
  most: number;
  cited: CitedHost[];
  quote: AnswerItem | null;
  askedAt: string | null;
  sample: boolean;
};

const langTally = (items: readonly AnswerItem[]): LangTally => ({
  named: items.filter((a) => a.named).length,
  counted: items.length,
  dots: items.map((a) => ({ named: a.named, tool: a.engine_label, question: a.question })),
});

/** Only answers that came back (`status: ok`) are counted; one that failed is not a "not named". */
export function buildAnswers(a: AnswersAnswer): AnswersView {
  const ok = (a.last?.answers ?? []).filter((x) => x.status === "ok");
  const en = ok.filter((x) => x.lang === "en"), ar = ok.filter((x) => x.lang === "ar");
  const engines = [...new Set(ok.map((x) => x.engine))];
  const tools = engines.map((engine) => {
    const mine = ok.filter((x) => x.engine === engine);
    return { engine, label: mine[0]?.engine_label ?? engine, en: langTally(mine.filter((x) => x.lang === "en")), ar: langTally(mine.filter((x) => x.lang === "ar")) };
  });
  const state = !a.last ? (a.enabled ? "notAsked" : "off") : !a.last.counted || !ok.length ? "tooFew" : "content";
  const groups = a.last?.groups ?? [];
  const most = groups.reduce((m, g) => Math.max(m, g.counted), 0);
  return {
    state,
    named: a.last?.named ?? 0,
    counted: a.last?.counted ?? 0,
    en: langTally(en), ar: langTally(ar), tools,
    groups,
    notEnough: groups.length > 0 && most < 30,
    most,
    cited: a.last?.sources ?? [],
    quote: ok.find((x) => x.named && x.text) ?? ok.find((x) => x.text) ?? null,
    askedAt: a.last?.asked_at ?? null,
    sample: !!a.last?.sample,
  };
}

/** An answer tool's text as plain paragraphs: `**…**` becomes a strong part with its markers
 * removed, and every other character stays text (React escapes it: no markup from an answer is
 * ever drawn as HTML). The matched name is marked inside either kind of part. */
export function answerParas(text: string, matched: string): { text: string; strong: boolean; mark: boolean }[][] {
  return text.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const out: { text: string; strong: boolean; mark: boolean }[] = [];
    line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).forEach((chunk) => {
      const strong = /^\*\*[^*]+\*\*$/.test(chunk);
      const plain = strong ? chunk.slice(2, -2) : chunk.replace(/\*\*/g, "");
      for (const part of markName(plain, matched)) out.push({ text: part.text, strong, mark: part.mark });
    });
    return out;
  }).filter((para) => para.length);
}

/** A sentence cut around each percent ("79%", "6 to 79%" keeps its own words), so a screen can
 * hold every percent left to right. */
export function percentRuns(text: string): { text: string; pct: boolean }[] {
  return text.split(/(\d+(?:[.,]\d+)?\s?%)/g).filter(Boolean).map((part) => ({ text: part, pct: /%$/.test(part) }));
}

/** The answer's text cut into parts around the matched name, so the name can be marked. */
export function markName(text: string, name: string): { text: string; mark: boolean }[] {
  if (!name) return [{ text, mark: false }];
  const at = text.toLocaleLowerCase().indexOf(name.toLocaleLowerCase());
  if (at < 0) return [{ text, mark: false }];
  return [{ text: text.slice(0, at), mark: false }, { text: text.slice(at, at + name.length), mark: true }, { text: text.slice(at + name.length), mark: false }].filter((p) => p.text);
}

// ── Set up ─────────────────────────────────────────────

/** How many checks a business of this family (and trade) is checked against: the core, the
 * family's own, the family's and the trade's overlays, minus every rule any of them skips. */
export function checksFor(packs: readonly Pack[], family: string, trade: string | null): number {
  const core = packs.find((p) => p.kind === "core");
  const fam = packs.find((p) => p.kind === "family" && p.id === family);
  if (!core || !fam) return 0;
  const overlays = [...fam.overlays, ...(fam.trades.find((t) => t.key === trade)?.overlays ?? [])];
  const involved = [core, fam, ...overlays.map((id) => packs.find((p) => p.id === id)).filter((p): p is Pack => !!p)];
  const rules = new Set(involved.flatMap((p) => p.rules));
  for (const p of involved) for (const s of p.skip) rules.delete(s);
  return rules.size;
}

export const families = (packs: readonly Pack[]): Pack[] => packs.filter((p) => p.kind === "family");

/** One tile of "What ALYR already has": where it came from is said beside it. */
/** `prov`: "you" only for what a person confirmed; "sample" for what only the fictional sample wrote. */
export type KnownFact = { key: string; label: string; value: string; sub?: string; subLang?: "en" | "ar"; prov: "you" | "sample" | "alyr" | "source"; ltr?: boolean };

const DAY_SHORT: Record<D2Lang, Record<DayKey, string>> = {
  en: { sat: "Sat", sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri" },
  ar: { sat: "السبت", sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة" },
};

/** The confirmed week as lines: days in a row with the same hours run together, Saturday first.
 * «Sat–Thu 07:00–22:00», «Fri 13:00–22:00»; a day with no hours is «Closed». */
export function hoursLines(value: Record<string, unknown>, lang: D2Lang): string[] {
  const span = (d: DayKey) => {
    const v = value[d];
    return Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "string" ? `${v[0]}–${v[1]}` : T2[lang].hoursClosed;
  };
  const runs: { from: DayKey; to: DayKey; text: string }[] = [];
  for (const d of DAYS) {
    const text = span(d);
    const last = runs[runs.length - 1];
    if (last && last.text === text) last.to = d;
    else runs.push({ from: d, to: d, text });
  }
  return runs.map((r) => `${DAY_SHORT[lang][r.from]}${r.from === r.to ? "" : `–${DAY_SHORT[lang][r.to]}`} ${r.text}`);
}

const factText = (f: Fact | undefined): string => {
  if (!f) return "";
  const v = Object.values(f.value).find((x) => typeof x === "string" && x);
  return typeof v === "string" ? v : "";
};

/** What ALYR already has about the business's first place: its names and numbers in ALYR, what
 * the owner confirmed (said "You confirmed"), and which source is connected. Nothing is guessed:
 * a fact that is not there is not drawn. */
export function knownFacts(input: { place: Place | null; facts: readonly Fact[]; sourceKind: string; lang: D2Lang }): KnownFact[] {
  const t = T2[input.lang];
  const out: KnownFact[] = [];
  const confirmed = (key: string) => input.facts.find((f) => f.key === key && !f.default);
  const who = (key: string): KnownFact["prov"] => (confirmed(key)?.source === "sample" ? "sample" : "you");
  const { place } = input;
  if (place && (place.name || place.name_ar)) {
    const main = input.lang === "ar" ? place.name_ar || place.name : place.name || place.name_ar;
    const other = input.lang === "ar" ? (place.name_ar ? place.name : "") : (place.name ? place.name_ar : "");
    out.push({ key: "name", label: t.fName, value: main, sub: other && other !== main ? other : undefined, subLang: input.lang === "ar" ? "en" : "ar", prov: confirmed("name") ? who("name") : "alyr" });
  }
  const wa = factText(confirmed("whatsapp")) || place?.whatsapp_e164 || "";
  if (wa) out.push({ key: "whatsapp", label: t.fWhatsapp, value: phoneText(wa), prov: confirmed("whatsapp") ? who("whatsapp") : "alyr", ltr: true });
  const phone = factText(confirmed("phone"));
  if (phone) out.push({ key: "phone", label: t.fPhone, value: phoneText(phone), prov: who("phone"), ltr: true });
  const hours = confirmed("hours");
  if (hours) {
    const lines = hoursLines(hours.value, input.lang);
    out.push({ key: "hours", label: t.fHours, value: lines[0], sub: lines.slice(1).join(" · ") || undefined, subLang: input.lang, prov: who("hours"), ltr: true });
  }
  const category = factText(confirmed("category"));
  if (category) out.push({ key: "category", label: t.fCategory, value: category, prov: who("category") });
  const source = t.sourceKinds[input.sourceKind.startsWith("google") ? "google" : input.sourceKind];
  if (source) out.push({ key: "source", label: t.fSource, value: source, prov: "source" });
  return out;
}
