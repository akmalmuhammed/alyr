/**
 * Pure rules for the Orders screens (J01): filters and their URL form, the `?show=` presets, the next
 * step, the late rule, how an item and a time are written, the cancel consequences, the order's
 * timeline. Figures and times are written by the kit's formatters (`_ui/format.ts`: Doha's clock, Latin
 * digits, «QAR 85» and «85 ر.ق»); nothing here keeps a second copy of them. Tested in `logic.test.mjs`.
 */

import { NBSP, ago, formatDate, formatTime, money, type Lang } from "../../../_ui/format.ts";
import { fmtQtyUnit, lineUnit } from "../../_customer/qty.ts";
import { copy, type FilterWords } from "./copy.ts";
import type { ActivityRow, Order, OrderItem, TeamMember } from "./types.ts";

export { ago, money, formatDate, formatTime, none } from "../../../_ui/format.ts";

/** Rows on a page. The server caps a page at 200 and a list at 1,000. */
export const PAGE_SIZE = 50;
/** `UNCONFIRMED_MINUTES` in the API (`modules/agent/facts.py`): a new order older than this is late. */
export const LATE_MINUTES = 15;

// ── filters and the address ───────────────────────────────

export type ShowPreset = "unconfirmed" | "ready" | "unpaid" | "paid";

export interface OrderFilters {
  status?: string; // open | new | confirmed | ready | done | cancelled | all (default open)
  payment?: string; // all | paid | unpaid | on_account
  mode?: string; // all | pickup | delivery
  assigned?: string; // a user id | none | all
  q?: string;
  sort?: "newest" | "oldest";
  offset?: number;
  /** Rows to load (the phone's "Show more" raises it by a page, up to the server's 200). */
  limit?: number;
  /** A link the product emits (`?show=`): shown with a banner and "Show all". */
  show?: ShowPreset | null;
  /** The order open in the drawer, and the order open on its own page: an id, or a number in the preview. */
  open?: string;
  detail?: string;
  dialog?: "paid" | "cancel" | null;
  /** The order a dialog is about, when no drawer or page names it (`?dialog=paid&for=1032`). */
  for?: string;
}

const SHOWS: readonly ShowPreset[] = ["unconfirmed", "ready", "unpaid", "paid"];

/**
 * What each `?show=` link means today (the Agent, the staff alert and the setup checklist emit them):
 * `unconfirmed` is status new; `ready` is status ready; `unpaid` is a payment still open on an order
 * that is not cancelled (the Open tab with payment Not paid); `paid` is every paid order.
 */
export function showFilters(show: ShowPreset): OrderFilters {
  switch (show) {
    case "unconfirmed":
      return { status: "new" };
    case "ready":
      return { status: "ready" };
    case "unpaid":
      return { status: "open", payment: "unpaid" };
    case "paid":
      return { status: "all", payment: "paid" };
  }
}

/** The filters in force: the preset first, then what the person chose over it. */
export function effectiveFilters(filters: OrderFilters): OrderFilters {
  const preset = filters.show ? showFilters(filters.show) : {};
  return { ...preset, ...filters };
}

/** Is any filter narrowing the list (a search, a payment, a hand-over, a person, or a status past Open)? */
export function isNarrowed(filters: OrderFilters): boolean {
  const f = effectiveFilters(filters);
  return Boolean(
    f.q || (f.payment && f.payment !== "all") || (f.mode && f.mode !== "all") || (f.assigned && f.assigned !== "all"),
  );
}

/** The address the preview and the workspace read, `?tab=`, `?pay=` and `?by=` being the short forms. */
export function queryToFilters(params: Record<string, string | undefined>): OrderFilters {
  const f: OrderFilters = {};
  const show = SHOWS.find((s) => s === params.show);
  if (show) f.show = show;
  const status = params.status ?? params.tab;
  if (status) f.status = status;
  const payment = params.payment ?? params.pay;
  if (payment) f.payment = payment;
  if (params.mode) f.mode = params.mode;
  const by = params.assigned ?? params.by;
  if (by) f.assigned = by;
  if (params.q) f.q = params.q;
  if (params.sort === "oldest" || params.sort === "newest") f.sort = params.sort;
  const offset = Number.parseInt(params.offset ?? "", 10);
  if (Number.isFinite(offset) && offset > 0) f.offset = offset;
  const limit = Number.parseInt(params.limit ?? "", 10);
  if (Number.isFinite(limit) && limit > PAGE_SIZE) f.limit = Math.min(200, limit);
  if (params.open) f.open = params.open;
  if (params.detail) f.detail = params.detail;
  if (params.dialog === "paid" || params.dialog === "cancel") f.dialog = params.dialog;
  if (params.for) f.for = params.for;
  return f;
}

/** The query for `GET /api/orders`. The Open tab is sent as `status=open`: with none the server answers every order. */
export function filtersToQuery(filters: OrderFilters): URLSearchParams {
  const f = effectiveFilters(filters);
  const q = new URLSearchParams();
  q.set("status", f.status || "open");
  if (f.payment && f.payment !== "all") q.set("payment", f.payment);
  if (f.mode && f.mode !== "all") q.set("mode", f.mode);
  if (f.assigned && f.assigned !== "all") q.set("assigned", f.assigned);
  if (f.q?.trim()) q.set("q", f.q.trim().slice(0, 80));
  if (f.sort === "oldest") q.set("sort", "oldest");
  q.set("limit", String(Math.min(200, Math.max(PAGE_SIZE, f.limit ?? PAGE_SIZE))));
  if (f.offset && f.offset > 0) q.set("offset", String(f.offset));
  return q;
}

// ── numbers, people, times ────────────────────────────────

/** `#1042`, whatever shape it comes in. */
export function orderNo(num: number | string): string {
  return `#${String(num).replace(/^#/, "")}`;
}

/** `+974 5555 0112`. A number that is not a Qatar mobile is shown as the person's phone gave it, with its plus. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("974") && digits.length === 11) return `+974${NBSP}${digits.slice(3, 7)}${NBSP}${digits.slice(7)}`;
  if (digits.length === 8) return `+974${NBSP}${digits.slice(0, 4)}${NBSP}${digits.slice(4)}`;
  return raw.startsWith("+") ? raw : `+${digits}`;
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

function ms(value: string | Date | number): number {
  return typeof value === "number" ? value : value instanceof Date ? value.getTime() : Date.parse(value);
}

/** Whole minutes since an instant (0 for one in the future). */
export function minutesSince(at: string | Date | number, now: number): number {
  const then = ms(at);
  return Number.isFinite(then) ? Math.max(0, Math.floor((now - then) / 60_000)) : 0;
}

/** A new order that has waited more than 15 minutes: the figure goes amber. */
export function isLateNew(status: string, createdAt: string | Date, now: number): boolean {
  return status === "new" && minutesSince(createdAt, now) > LATE_MINUTES;
}

const sameDay = (a: string | number | Date, b: string | number | Date): boolean =>
  formatDate(a, "en", { year: "always" }) === formatDate(b, "en", { year: "always" });

/** The "Placed" cell: the time of day, and under it the age (today) or the date (another day). */
export function placedParts(createdAt: string, lang: Lang, now: number): { time: string; sub: string; today: boolean } {
  const today = sameDay(createdAt, now);
  return {
    time: formatTime(createdAt, lang),
    sub: today ? ago(createdAt, lang, now) : formatDate(createdAt, lang, { now }),
    today,
  };
}

/** "today", or the day's date, for a day the order is promised or was placed. */
export function dayWord(value: string | null | undefined, lang: Lang, now: number): string {
  if (!value) return copy(lang).todayWord;
  return sameDay(value, now) ? copy(lang).todayWord : formatDate(value, lang, { now });
}

// ── items ─────────────────────────────────────────────────

type Named = Pick<OrderItem, "name" | "name_ar" | "variant" | "variant_ar" | "options" | "options_ar">;

export const itemName = (it: Named, lang: Lang): string => (lang === "ar" && it.name_ar ? it.name_ar : it.name);
export const itemVariant = (it: Named, lang: Lang): string => (lang === "ar" && it.variant_ar ? it.variant_ar : it.variant ?? "");
export function itemOptions(it: Named, lang: Lang): string[] {
  const own = lang === "ar" && it.options_ar && it.options_ar.some(Boolean) ? it.options_ar : it.options ?? [];
  return own.filter(Boolean);
}

/** "250 ml", "Pack of 6 · Grey": the variant, then its options, for a line under the item's name. */
export function itemSub(it: Named, lang: Lang): string {
  return [itemVariant(it, lang), ...itemOptions(it, lang)].filter(Boolean).join(" · ");
}

/** The quantity as the order was taken: «3», «0.5 kg». */
export function itemQty(it: Pick<OrderItem, "quantity" | "unit" | "unit_shown">, lang: Lang): string {
  return fmtQtyUnit(it.quantity, lineUnit(it.quantity, it.unit ?? "piece", Boolean(it.unit_shown)), lang);
}

/** "1 × Carnauba wax · 250 ml". */
export function itemLine(it: OrderItem, lang: Lang): string {
  const variant = itemVariant(it, lang);
  return `${itemQty(it, lang)} × ${itemName(it, lang)}${variant ? ` · ${variant}` : ""}`;
}

/** The table's two lines: the first item, then the rest joined; and the whole text for the `title`. */
export function itemsSummary(items: OrderItem[], lang: Lang): { line1: string; line2: string; full: string } {
  const lines = (items ?? []).map((it) => itemLine(it, lang));
  return { line1: lines[0] ?? "", line2: lines.slice(1).join(", "), full: lines.join(", ") };
}

// ── steps ─────────────────────────────────────────────────

export type StepTo = "confirmed" | "ready" | "done";
export interface NextStep {
  to: StepTo;
  /** The key of the button's words in the copy. */
  label: "btnConfirmOrder" | "btnMarkReady" | "btnMarkDone";
}

/** The one step an order can take; none for a done or a cancelled order. Never backwards. */
export function nextStep(status: string): NextStep | null {
  if (status === "new") return { to: "confirmed", label: "btnConfirmOrder" };
  if (status === "confirmed") return { to: "ready", label: "btnMarkReady" };
  if (status === "ready") return { to: "done", label: "btnMarkDone" };
  return null;
}

const ORDER_OF: Record<string, number> = { new: 0, confirmed: 1, ready: 2, done: 3 };
/** The current step on the rail of four (Placed, Confirmed, Ready, Done): steps before it are done, 4 means all are. */
export function stepIndex(status: string): number {
  return (ORDER_OF[status] ?? 0) + 1;
}

export type Tone = "ink" | "n" | "ok";
export function statusTone(status: string): Tone {
  return status === "new" ? "ink" : status === "ready" || status === "done" ? "ok" : "n";
}

type StatusKey = "stNew" | "stConfirmed" | "stReady" | "stDone" | "stCancelled";
export function statusKey(status: string): StatusKey {
  return (
    { new: "stNew", confirmed: "stConfirmed", ready: "stReady", done: "stDone", cancelled: "stCancelled" } as Record<string, StatusKey>
  )[status] ?? "stNew";
}
export const stillKey = (status: string): "stillNew" | "stillConfirmed" | "stillReady" | "stillDone" =>
  (({ new: "stillNew", confirmed: "stillConfirmed", ready: "stillReady", done: "stillDone" }) as Record<string, "stillNew" | "stillConfirmed" | "stillReady" | "stillDone">)[status] ?? "stillNew";

/** When each step happened and who took it, read from the order's timeline (never typed). */
export function stepFacts(
  activity: ActivityRow[],
  createdAt: string,
): Record<"placed" | "confirmed" | "ready" | "done", { at: string | null; by: string | null }> {
  const last = (action: string) => [...activity].reverse().find((a) => a.action === action);
  const pick = (action: string) => {
    const row = last(action);
    return { at: row?.created_at ?? null, by: row?.actor_name && !isAutomatic(row.actor_name) ? row.actor_name : null };
  };
  return { placed: { at: createdAt, by: null }, confirmed: pick("confirmed"), ready: pick("ready"), done: pick("done") };
}

/** The API's automatic actor (the word is the server's; the screens write "Automatically"). */
export const isAutomatic = (name: string | null | undefined): boolean => /^assist/i.test(name ?? "");

// ── the customer's reply window ───────────────────────────

export type WindowState = { kind: "never" } | { kind: "closed" } | { kind: "open"; hours: number };

/** Typed replies are allowed for 24 hours after the customer last wrote. */
export function replyWindow(windowUntil: string | null | undefined, now: number): WindowState {
  if (!windowUntil) return { kind: "never" };
  const left = ms(windowUntil) - now;
  if (!Number.isFinite(left) || left <= 0) return { kind: "closed" };
  return { kind: "open", hours: Math.floor(left / 3_600_000) };
}

// ── cancel ────────────────────────────────────────────────

export interface CancelFacts {
  restockDefault: boolean;
  restockCount: number;
  refundDue: number;
  creditReversal: boolean;
  /** The number of the receipt or invoice a credit note will cancel, when Documents made one. */
  documentNumber: string | null;
}

/** What cancelling does, from the order alone (the server does the same: `cancel_order`). */
export function cancelFacts(order: Order, lines: Pick<OrderItem, "quantity">[] = order.items): CancelFacts {
  const whole = lines.every((l) => Number.isInteger(l.quantity));
  return {
    restockDefault: order.status === "new" || order.status === "confirmed",
    restockCount: whole ? lines.reduce((n, l) => n + l.quantity, 0) : lines.length,
    refundDue: order.payment === "paid" && !order.test ? order.total : 0,
    creditReversal: order.payment === "on_account",
    documentNumber: order.document?.number ?? null,
  };
}

// ── the timeline ──────────────────────────────────────────

export interface TimelineEntry {
  text: string;
  meta: string;
  tone: "ok" | "warn" | "volt" | "n";
}

const METHOD_KEY = {
  cash: "methodCash",
  bank_transfer: "methodBankTransfer",
  card_terminal: "methodCardTerminal",
  cheque: "methodCheque",
  link: "methodLink",
} as const;
export function methodWord(method: string | null | undefined, lang: Lang): string {
  const key = METHOD_KEY[(method ?? "link") as keyof typeof METHOD_KEY];
  return copy(lang)[key ?? "methodLink"];
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One sentence for one row of the order's timeline. */
export function activityText(a: ActivityRow, customer: string, lang: Lang): string {
  const t = copy(lang);
  const raw = a.actor_name ?? "";
  const actor = isAutomatic(raw) ? t.automatically : raw === "Customer" ? customer : raw || t.automatically;
  const d = a.detail ?? {};
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  switch (a.action) {
    case "placed":
      return t.actPlaced(customer);
    case "took":
      return t.actTook(actor);
    case "assigned":
      return text(d.to_name) || text(d.to) ? t.actAssigned(actor, text(d.to_name) || text(d.to)) : t.actUnassigned(actor);
    case "confirmed":
      return t.actConfirmed(actor);
    case "ready":
      return t.actReady(actor);
    case "done":
      return t.actDone(actor);
    case "paid": {
      const method = text(d.method) || "link";
      const amount = typeof d.amount_minor === "number" ? d.amount_minor : typeof d.amount === "number" ? d.amount : null;
      return t.actPaid(method === "link" ? null : methodWord(method, lang), amount === null ? "" : money(amount, lang), actor);
    }
    case "cancelled": {
      const stock = typeof d.stock_returned === "number" ? d.stock_returned : 0;
      // The server's own default reasons are English words; only a reason someone typed is shown.
      const reason = /^(cancelled by staff|order cancelled|cancelled)$/i.test(text(d.reason).trim()) ? "" : text(d.reason);
      return t.actCancelled(actor, reason, stock);
    }
    case "refund_due":
      return t.actRefundDue(typeof d.amount === "number" ? money(d.amount, lang) : text(d.amount));
    case "late_payment":
      return t.actLatePayment;
    default:
      return capital(a.action.replace(/_/g, " "));
  }
}

/** The timeline, newest first, with each row's time ("09:38", or "Wed 11 Nov · 20:15" from another day) and who. */
export function timelineEntries(activity: ActivityRow[], customer: string, lang: Lang, now: number): TimelineEntry[] {
  const rows = [...activity].reverse();
  return rows.map((a, i) => {
    const at = a.created_at ?? "";
    const time = at ? formatTime(at, lang) : "";
    const when = at && !sameDay(at, now) ? `${formatDate(at, lang, { now })} · ${time}` : time;
    const who = a.actor_name && !isAutomatic(a.actor_name) && a.actor_name !== "Customer" && a.action !== "placed" ? a.actor_name : "";
    const stepNow = i === 0 && ["confirmed", "ready", "done"].includes(a.action) && minutesSince(at, now) < 60;
    return {
      text: activityText(a, customer, lang),
      meta: [when, who].filter(Boolean).join(" · "),
      tone: a.action === "paid" ? "ok" : a.action === "refund_due" || a.action === "late_payment" ? "warn" : stepNow ? "volt" : "n",
    };
  });
}

// ── words for the sentences that name filters ─────────────

/** The active filters as the words of the "None of the 14 open orders is a paid delivery handled by Yusuf" sentence. */
export function filterWords(filters: OrderFilters, team: TeamMember[]): FilterWords {
  const f = effectiveFilters(filters);
  const out: FilterWords = {};
  if (f.payment && f.payment !== "all") out.payment = f.payment;
  if (f.mode && f.mode !== "all") out.mode = f.mode;
  if (f.assigned === "none") out.by = null;
  else if (f.assigned && f.assigned !== "all") out.by = firstName(team.find((m) => m.id === f.assigned)?.name ?? "");
  return out;
}

