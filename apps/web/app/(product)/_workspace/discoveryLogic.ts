// The pure parts of the Discovery screens (ALY-322, spec 065): which view the address names,
// which state the Home screen is in, when to stop asking about a run, how findings group, which
// months a report can be asked for, and how a time, a month or a step is written in a person's
// language. No React and no fetch: `discovery.test.mjs` runs these under `node --test`.
//
// Times are the shop's (Doha) and written with Western digits in Arabic too (alyr-design,
// arabic.md); a time never says "ago", because "5 min ago" goes stale on a screen nobody
// refreshes.

import type { Lang } from "./lang";
import {
  DiscoveryError, KINDS, PARTS_SHOWN,
  type Connection, type Finding, type Kind, type Overview, type PartKey, type Run, type Step,
} from "./discoveryApi.ts";
import { T } from "./discoveryCopy.ts";

// ── the four views and the address that carries them ────

export const VIEWS = ["home", "todo", "reviews", "reports"] as const;
export type View = (typeof VIEWS)[number];

/** The view an address names (`?view=`); anything else, or nothing, is Home. */
export function readView(param: string | null | undefined): View {
  return (VIEWS as readonly string[]).includes(param ?? "") ? (param as View) : "home";
}

/** The address of a view. Home is the plain section address. `extra` carries `finding=` and the like. */
export function viewHref(view: View, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (view !== "home") p.set("view", view);
  for (const [key, value] of Object.entries(extra)) if (value) p.set(key, value);
  const text = p.toString();
  return `/app/discovery${text ? `?${text}` : ""}`;
}

/**
 * The views that open beneath a section in the menu. Only Discovery has any: every other
 * section of the workspace gets an empty list, so its menu entry is drawn exactly as before.
 */
export function subItems(sectionKey: string): readonly View[] {
  return sectionKey === "discovery" ? VIEWS : [];
}

// ── Home ────────────────────────────────────────────────

export type HomeState = "noConnection" | "noRun" | "caughtUp" | "content";

/** What the Home screen shows under its heading, from the overview alone. */
export function homeState(o: Overview): HomeState {
  if (!o.has_connection) return "noConnection";
  const c = o.counts;
  const worked = c.open + c.skipped + c.owner_done + c.verified > 0 || o.score !== null;
  // A first run that failed leaves nothing to show: the same page as before it, plus the failure.
  if (!worked) return "noRun";
  if (!o.next && o.up_next.length === 0) return "caughtUp";
  return "content";
}

export const isRunning = (run: Run | null | undefined): boolean => !!run && (run.status === "queued" || run.status === "running");
export const isFinished = (run: Run | null | undefined): boolean => !!run && (run.status === "done" || run.status === "failed");

// ── following a run ─────────────────────────────────────

/** How often a run is asked about while it is on screen (spec: every 1.5 s). */
export const POLL_MS = 1500;
/** Four minutes of asking. Past it the screen says it is slow and stops; nothing polls for ever. */
export const MAX_POLLS = 160;

/** Whether to ask again: not once the run is done or failed, and not past the limit. */
export function pollDecision(run: Run | null, polls: number): "poll" | "stop" | "slow" {
  if (isFinished(run)) return "stop";
  return polls >= MAX_POLLS ? "slow" : "poll";
}

/** Whole minutes a refusal asks the person to wait: never 0, and rounded up. */
export function minutesFrom(seconds: number | null): number {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return 1;
  return Math.max(1, Math.ceil(seconds / 60));
}

// ── how a step is worded ────────────────────────────────

export type StepKind = { kind: "snapshot" } | { kind: "rules"; family: PartKey | null } | { kind: "other"; word: "start" | "findings" | "reviews" | "score" | null };

/**
 * What a logged step is, from its `tool` ("connector.snapshot", "rules.evaluate…"). The log's own
 * sentences are English, so an Arabic screen says the step in its own words where the tool is
 * known, and only falls back to the sentence where it is not.
 */
export function stepKind(tool: string): StepKind {
  const t = tool.trim().toLowerCase();
  if (t.startsWith("connector.")) return { kind: "snapshot" };
  if (t.startsWith("rules.")) {
    const rest = t.slice("rules.".length);
    return { kind: "rules", family: PARTS_SHOWN.find((part) => rest.includes(part)) ?? null };
  }
  const word = ({ "run.start": "start", "findings.save": "findings", "reviews.save": "reviews", "score.compute": "score" } as const)[t as "run.start"];
  return { kind: "other", word: word ?? null };
}

// ── the to-do list ──────────────────────────────────────

/** Findings grouped by who does them, in the order agent, owner, process; empty groups are left out. */
export function groupByKind(items: readonly Finding[]): { kind: Kind; items: Finding[] }[] {
  return KINDS.map((kind) => ({ kind, items: items.filter((f) => f.kind === kind) })).filter((g) => g.items.length > 0);
}

// ── reviews ─────────────────────────────────────────────

export type StarFilter = "all" | "3" | "2" | "1";

/** The query a review filter makes (`max_rating`, `replied=false`, `location_id`). */
export function reviewQuery(filter: { place: string; stars: StarFilter; unanswered: boolean }) {
  return {
    location_id: filter.place || undefined,
    max_rating: filter.stars === "all" ? undefined : Number(filter.stars),
    replied: filter.unanswered ? false : undefined,
  };
}

/** One decimal place, as an average is said ("4.2"); Western digits in both languages. */
export function averageText(value: number | null): string {
  return value === null ? "" : value.toFixed(1);
}

// ── reports ─────────────────────────────────────────────

const doha = (options: Intl.DateTimeFormatOptions, tag = "en-GB") =>
  new Intl.DateTimeFormat(tag, { timeZone: "Asia/Qatar", ...options });

/** The `yyyy-mm` of the last `n` calendar months in Doha, this month first. */
export function lastMonths(now: Date, n: number): string[] {
  const parts = doha({ year: "numeric", month: "2-digit" }).formatToParts(now);
  let year = Number(parts.find((p) => p.type === "year")?.value);
  let month = Number(parts.find((p) => p.type === "month")?.value);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  return out;
}

const locale = (lang: Lang) => (lang === "ar" ? "ar-QA-u-ca-gregory-nu-latn" : "en-GB");

/** "November 2026" / «نوفمبر 2026». */
export function monthName(month: string, lang: Lang): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale(lang), { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

// ── times ───────────────────────────────────────────────

function dayParts(date: Date, lang: Lang, now: Date) {
  const fmt = doha({ day: "numeric", month: lang === "ar" ? "long" : "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, locale(lang));
  const get = (type: string) => fmt.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  const thisYear = doha({ year: "numeric" }, locale(lang)).format(now);
  return { day: get("day"), month: get("month"), year: get("year"), time: `${get("hour")}:${get("minute")}`, sameYear: get("year") === thisYear };
}

/** "7 Nov · 14:20" (with the year when it is not this one); null for a time that is not one. */
export function formatWhen(iso: string | null, lang: Lang, now: Date = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const p = dayParts(date, lang, now);
  return `${p.day} ${p.month}${p.sameYear ? "" : ` ${p.year}`} · ${p.time}`;
}

/** "7 Nov", with the year when it is not this one. */
export function formatDay(iso: string | null, lang: Lang, now: Date = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const p = dayParts(date, lang, now);
  return `${p.day} ${p.month}${p.sameYear ? "" : ` ${p.year}`}`;
}

// ── places and connections ──────────────────────────────

export const placeName = (place: { name: string; name_ar: string }, lang: Lang): string =>
  (lang === "ar" ? place.name_ar || place.name : place.name || place.name_ar);

/** Whether what the screens show comes from the sample business (and must say so, once). */
export const isSample = (connection: Connection | null): boolean => !!connection && connection.on && connection.kind === "sample";

/** The steps of a run in the order they were logged. */
export const inOrder = (steps: readonly Step[]): Step[] => [...steps].sort((a, b) => a.seq - b.seq);

// ── what a refusal says ─────────────────────────────────

/** The sentence for a refusal, in the person's language: the screen's own words where it has them. */
export function sayError(error: unknown, lang: Lang): string {
  const t = T[lang];
  if (!(error instanceof DiscoveryError)) return t.failed;
  if (error.code === "offline") return t.offline;
  if (error.code === "module_off") return t.moduleOff;
  if (error.status === 403) return t.forbidden;
  if (lang === "ar") return error.messageAr || t.failed;
  return error.code !== "bad_answer" && error.message && error.message.length < 200 ? error.message : t.failed;
}

/** A logged step in words: the log's own sentence in English, the screen's words in Arabic. */
export function stepText(step: Step, lang: Lang): { text: string; foreign: boolean } {
  const t = T[lang];
  const k = stepKind(step.tool);
  const known = k.kind === "snapshot" ? t.stepSnapshot : k.kind === "rules" ? t.stepRules(k.family) : k.word ? t.stepOther[k.word] : "";
  if (lang === "en") return { text: step.summary || known || step.tool, foreign: false };
  return known ? { text: known, foreign: false } : { text: step.summary || step.tool, foreign: true };
}

/** A value that is only digits and their marks (a phone number, a time) keeps its own direction. */
export const isNumeric = (value: string): boolean => /^[\d+\s().:\-–/]+$/.test(value.trim()) && /\d/.test(value);
