// The connected-apps screen's pure parts (ALY-292): which state the screen is in, how the record's
// rows are read, which connections are live, and the sentence for each thing that happened. No
// React and no fetch, so `mcp.test.mjs` runs them on their own (so nothing here imports a module
// that Node cannot read as it is: only types, which are stripped). Times are the shop's (Doha),
// with Western digits in Arabic too, and never say "ago", which goes stale on a screen nobody reloads.

import type { Copy, Lang } from "./mcpCopy";
import type { Grant, Row, Settings } from "./mcpApi";

/** Which of the screen's states a load ended in. */
export type Screen = "loading" | "forbidden" | "unavailable" | "error" | "ready";
/** What the connector is doing for the business: off, on, or paused. */
export type Mode = "off" | "on" | "paused";

export const isManager = (role: string): boolean => role === "owner" || role === "admin";

/**
 * The screen's state for a load that failed. A 404 is the connector being switched off for the whole
 * server: it is a state, not an error, and offers nothing to do. A 403 is a person who is not an
 * owner or admin. Anything else (the network, a server fault) is an error with Try again.
 */
export function screenFor(error: unknown): Screen {
  const status = statusOf(error);
  if (status === 404) return "unavailable";
  if (status === 403) return "forbidden";
  return "error";
}

// An ApiError (catalogApi.ts) carries a numeric `status` and a string `code`; read structurally so
// this file needs no import it cannot have under `node --test`.
const statusOf = (error: unknown): number => (error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 0);
const codeOf = (error: unknown): string => (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "");

/** Off until an owner has opted in; then on, or paused by the kill switch. */
export function modeOf(s: Settings): Mode {
  if (!s.enabled) return "off";
  return s.paused ? "paused" : "on";
}

/** Whether this person may turn the connector on: only an owner (the opt-in is an owner's choice). */
export const canOptIn = (role: string): boolean => role === "owner";

export const liveGrants = (grants: Grant[]): Grant[] => grants.filter((g) => g.live);
export const endedGrants = (grants: Grant[]): Grant[] => grants.filter((g) => !g.live);

/** The daily limit counts a rolling 24 hours: a limit reached longer ago than that is not news. */
export function capIsRecent(capHitAt: string | null, now: Date = new Date()): boolean {
  if (!capHitAt) return false;
  const at = new Date(capHitAt).getTime();
  return Number.isFinite(at) && now.getTime() - at < 24 * 3600 * 1000;
}

/** The address an owner pastes into their app: only an https address (or a local one on a developer's machine). */
export function usableAddress(address: string): string {
  try {
    const url = new URL(address);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || (local && url.protocol === "http:") ? url.toString() : "";
  } catch {
    return "";
  }
}

/** A request an app made, or a change to the connection itself. */
export const isCall = (row: Row): boolean => row.action === "call";

export function splitRows(rows: Row[]): { calls: Row[]; events: Row[] } {
  return { calls: rows.filter(isCall), events: rows.filter((r) => !isCall(r)) };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** A request's parts, read from the record's detail; anything missing is empty. */
export function callOf(row: Row) {
  const d = row.detail;
  return {
    tool: str(d.tool), phase: str(d.phase), result: str(d.result), client: str(d.client),
    ms: typeof d.ms === "number" ? Math.round(d.ms) : null,
    affects: typeof d.affects === "number" ? d.affects : null,
    args: d.args && typeof d.args === "object" ? (d.args as Record<string, unknown>) : null,
  };
}

/** What an app asked for, as text to read: the arguments' JSON, or "" when there were none. Never markup. */
export function argsText(args: Record<string, unknown> | null): string {
  if (!args || Object.keys(args).length === 0) return "";
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return "";
  }
}

/** The sentence for a change to the connection; a kind of row this screen does not know is said plainly. */
export function eventText(row: Row, grants: Grant[], c: Copy): string {
  const who = row.person || c.someone;
  const d = row.detail;
  switch (row.action) {
    case "opted_in": return c.eventOptedIn(who);
    case "switched_off": return c.eventSwitchedOff(who);
    case "paused": return c.eventPaused(who);
    case "resumed": return c.eventResumed(who);
    case "grant_created": return c.eventGrantCreated(who, str(d.client) || grants.find((g) => g.id === row.grantId)?.client || c.anApp);
    case "grant_revoked": return c.eventGrantRevoked(who, grants.find((g) => g.id === row.grantId)?.client ?? "");
    case "cap_reached": return c.eventCap;
    default: return c.eventOther(row.action);
  }
}

/** A line under an ended-connection event: why it ended, when the record says so. */
export function eventWhy(row: Row, c: Copy): string {
  return row.action === "grant_revoked" ? c.endedWhy[str(row.detail.why)] ?? "" : "";
}

/** The line that says how a connection ended: expired, or ended and why and by whom. */
export function endedLine(g: Grant, lang: Lang, c: Copy, now: Date = new Date()): string {
  if (g.revokedAt) {
    const why = (g.revokedWhy && c.endedWhy[g.revokedWhy]) || c.endedUnknown;
    return c.endedLine(why, g.revokedBy ?? "", day(g.revokedAt, lang, now));
  }
  return c.expired(day(g.expiresAt, lang, now));
}

// ── times ───────────────────────────────────────────────

const locale = (lang: Lang) => (lang === "ar" ? "ar-QA-u-ca-gregory-nu-latn" : "en-GB");

function dayParts(date: Date, lang: Lang, now: Date) {
  const doha = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale(lang), { timeZone: "Asia/Qatar", ...options });
  const parts = doha({ day: "numeric", month: lang === "ar" ? "long" : "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year"), time: `${get("hour")}:${get("minute")}`, sameYear: get("year") === doha({ year: "numeric" }).format(now) };
}

/** "7 Nov" (the year when it is not this one); "" for nothing or a time that is not one. */
export function day(iso: string | null, lang: Lang, now: Date = new Date()): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const p = dayParts(date, lang, now);
  return `${p.day} ${p.month}${p.sameYear ? "" : ` ${p.year}`}`;
}

/** "7 Nov · 14:20", the shop's clock. */
export function when(iso: string | null, lang: Lang, now: Date = new Date()): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const p = dayParts(date, lang, now);
  return `${p.day} ${p.month}${p.sameYear ? "" : ` ${p.year}`} · ${p.time}`;
}

/** The sentence for a refusal or a failure, in the person's language. The API's own English is never shown. */
export function sayError(error: unknown, c: Copy): string {
  const code = codeOf(error);
  const status = statusOf(error);
  if (code === "offline") return c.offline;
  if (code === "must_confirm") return c.mustTick;
  if (status === 403) return c.forbidden;
  if (status === 404) return c.alreadyEnded;
  return c.failed;
}

/** A newer load answers; a slower, older one does not overwrite it. */
export function newerOnly(): { next: () => number; current: (n: number) => boolean } {
  let latest = 0;
  return { next: () => ++latest, current: (n) => n === latest };
}
