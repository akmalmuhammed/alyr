/**
 * Pure rules for the Inbox (J04): the 24-hour window, who is waiting, the mark on a row, the
 * counts, the filters and the phone's two groups. Every function that depends on "now" takes it
 * as an argument, so a screen draws one moment, a test can pin it, and nothing here reads the
 * clock or the device's time zone (the shop's clock is Doha's, through `_ui/format`).
 *
 * The rules are the API's (`core/team.py`: a customer whose last message has had no answer for
 * 10 minutes is waiting; `core/outbound.py`: a typed reply goes only within 24 hours of the
 * customer's last message). The screen never decides a rule the server decides; it draws the
 * same rule so the words stay true between two loads.
 */

import { formatDate, formatTime } from "../../../_ui/format.ts";
import type { Lang } from "./copy.ts";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
/** WhatsApp: a typed reply is allowed within 24 hours of the customer's last message. */
export const WINDOW_MS = 24 * HOUR;
/** `core/team.py` WAITING_MINUTES: how long a customer's last message may sit before it is "waiting". */
export const WAITING_MINUTES = 10;

export const OUTCOMES = ["sold", "booked", "answered", "lost"] as const;
export type Outcome = (typeof OUTCOMES)[number];
/** `core/team.py` LOST_REASONS. */
export const LOST_REASONS = ["price", "not_available", "no_reply", "went_elsewhere", "other"] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export type Chip = "waiting" | "mine" | "unassigned" | "not_delivered" | "window_closed";

export interface ConversationItem {
  id: string;
  name: string;
  phone: string;
  status: "open" | "closed";
  /** Automatic replies are paused for this customer (a person has the conversation). */
  assistant_paused: boolean;
  opted_out: boolean;
  /** When typed replies stop being allowed (24 h after the customer's last message); null once it has. */
  window_closes_at: string | null;
  unread: number;
  assigned: { id: string; name: string } | null;
  last: {
    /** The words of the last message. A plain string is what a person wrote; a pair is ALYR's own line. */
    body: string | { en: string; ar: string };
    direction: "in" | "out";
    /** The message's own delivery status: queued, sent, delivered, read, failed, blocked. */
    status: string;
    created_at: string;
    /** Who sent an outbound message: a person's first name, or "auto" for an automatic reply. */
    by?: string;
  };
}

export interface InboxFilters {
  tab: "open" | "closed";
  chip?: Chip | null;
  q?: string;
}

// ── the window ───────────────────────────────────────────────

/** Open while the deadline is in the future. `closesAt` null or missing means it has closed. */
export function windowOpen(closesAt: string | null | undefined, now: number): boolean {
  if (!closesAt) return false;
  const at = Date.parse(closesAt);
  return Number.isFinite(at) && at > now;
}

/** The window's deadline from the customer's last message. */
export function windowDeadline(lastInboundAt: string | null | undefined): string | null {
  if (!lastInboundAt) return null;
  const at = Date.parse(lastInboundAt);
  return Number.isFinite(at) ? new Date(at + WINDOW_MS).toISOString() : null;
}

/** Whole hours left, rounded down so the screen never promises more than there is. 0 once under an hour or closed. */
export function windowHoursLeft(closesAt: string | null | undefined, now: number): number {
  if (!windowOpen(closesAt, now)) return 0;
  return Math.floor((Date.parse(closesAt as string) - now) / HOUR);
}

/** Minutes left when under an hour (for the "less than an hour" line); 0 when more or closed. */
export function windowMinutesLeft(closesAt: string | null | undefined, now: number): number {
  if (!windowOpen(closesAt, now)) return 0;
  const left = Date.parse(closesAt as string) - now;
  return left < HOUR ? Math.max(1, Math.ceil(left / MINUTE)) : 0;
}

// ── who is waiting ───────────────────────────────────────────

/** Minutes since the customer's last message when it is still unanswered, else null. */
export function waitingMinutes(item: Pick<ConversationItem, "status" | "last">, now: number): number | null {
  if (item.status !== "open" || item.last.direction !== "in") return null;
  const at = Date.parse(item.last.created_at);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.floor((now - at) / MINUTE));
}

/** Waiting by the shared rule: unanswered for at least WAITING_MINUTES, and a typed reply can still go. */
export function isWaiting(item: ConversationItem, now: number): boolean {
  const minutes = waitingMinutes(item, now);
  return minutes !== null && minutes >= WAITING_MINUTES && windowOpen(item.window_closes_at, now);
}

export type RowMark =
  | { kind: "not_delivered"; tone: "bad" }
  | { kind: "template_only"; tone: "n" }
  | { kind: "waiting"; tone: "warn"; minutes: number };

/** The one state a list row shows beside who has it: failed first, then window closed, then waiting. */
export function rowMark(item: ConversationItem, now: number): RowMark | null {
  if (item.last.direction === "out" && (item.last.status === "failed" || item.last.status === "blocked")) {
    return { kind: "not_delivered", tone: "bad" };
  }
  if (item.status === "open" && !windowOpen(item.window_closes_at, now)) return { kind: "template_only", tone: "n" };
  if (isWaiting(item, now)) return { kind: "waiting", tone: "warn", minutes: waitingMinutes(item, now) ?? 0 };
  return null;
}

// ── counts and filters ───────────────────────────────────────

export interface InboxCounts {
  open: number;
  closed: number;
  waiting: number;
  mine: number;
  unassigned: number;
  unread: number;
  /** Open conversations whose last message did not go out, and those whose window has closed. */
  not_delivered?: number;
  window_closed?: number;
}

/** The chip and tab counts of a list, by the same rules the filters use (the mock API's `counts`). */
export function countConversations(items: readonly ConversationItem[], me: string | null, now: number): InboxCounts {
  const open = items.filter((c) => c.status === "open");
  return {
    open: open.length,
    closed: items.length - open.length,
    waiting: open.filter((c) => isWaiting(c, now)).length,
    mine: me ? open.filter((c) => c.assigned?.id === me).length : 0,
    unassigned: open.filter((c) => !c.assigned).length,
    unread: open.filter((c) => c.unread > 0).length,
    not_delivered: open.filter((c) => rowMark(c, now)?.kind === "not_delivered").length,
    window_closed: open.filter((c) => !windowOpen(c.window_closes_at, now)).length,
  };
}

/** Tab, chip and search, as the API does them (`modules/inbox/listing.py`). Search reads name, phone and the last words. */
export function filterConversations(
  items: readonly ConversationItem[],
  filters: InboxFilters,
  now: number,
  me: string | null = null,
  lang: Lang = "en",
): ConversationItem[] {
  const q = (filters.q ?? "").trim().toLowerCase();
  return items.filter((item) => {
    if (filters.tab !== item.status) return false;
    switch (filters.chip) {
      case "waiting":
        if (!isWaiting(item, now)) return false;
        break;
      case "mine":
        if (!me || item.assigned?.id !== me) return false;
        break;
      case "unassigned":
        if (item.assigned) return false;
        break;
      case "window_closed":
        if (windowOpen(item.window_closes_at, now)) return false;
        break;
      case "not_delivered": {
        const mark = rowMark(item, now);
        if (mark?.kind !== "not_delivered") return false;
        break;
      }
      default:
        break;
    }
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
      pickText(item.last.body, lang).toLowerCase().includes(q)
    );
  });
}

/** The phone's two groups: customers waiting for a person, and the rest (answered, or automatic replies). */
export function phoneGroups(items: readonly ConversationItem[], now: number) {
  const waiting = items.filter((c) => isWaiting(c, now));
  const rest = items.filter((c) => !isWaiting(c, now));
  const oldest = waiting.reduce((most, c) => Math.max(most, waitingMinutes(c, now) ?? 0), 0);
  return { waiting, rest, oldest };
}

/** One language of a text that is either as written (a string) or ALYR's own line in both languages. */
export function pickText(value: string | { en: string; ar: string }, lang: Lang): string {
  return typeof value === "string" ? value : value[lang];
}

// ── the shop's clock (Doha, through the kit) ───────────────────

/** One Doha calendar day as a string, to tell whether two moments fall on the same day. */
export function dayKey(moment: string | number): string {
  return formatDate(moment, "en", { year: "always" });
}

/** Whole Doha calendar days from `from` to `to` (0 on the same day). */
export function daysBetween(from: string | number, to: string | number): number {
  const parse = (m: string | number) => {
    const [y, mo, d] = new Date(typeof m === "string" ? Date.parse(m) + 3 * HOUR : m + 3 * HOUR)
      .toISOString().slice(0, 10).split("-").map(Number);
    return Date.UTC(y, mo - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / (24 * HOUR));
}

/** The stamp at the end of a list row: the time today, the weekday within a week, else the date. */
export function rowStamp(moment: string, lang: Lang, now: number): string {
  const days = daysBetween(moment, now);
  if (days <= 0) return formatTime(moment, lang);
  if (days < 7) return formatDate(moment, lang).split(" ")[0];
  return formatDate(moment, lang, { now });
}
