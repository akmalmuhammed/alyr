// The live Agent figure's arithmetic (the founder, 25 Oct 2026; `alyr-design/motion.md`,
// "The live Agent figure"). The dashboard's opening is the engine's own sample at 16:20
// (`_agent/samples`); each event of the sample's script (`copy.ts`, `samples.*.live`) moves
// the clock and the numbers it touches, in the engine's own words and formats, so the
// sentence, the numbers, the bars and the feed always agree:
//
// - every message sent adds one to "messages ALYR sent for you", every reminder to "booking
//   reminders";
// - an order adds one to "Orders this week", its amount to the week's sales and to today's
//   bar, and the percentages against last week are worked out again, as the engine does
//   (`view.py` `_pct`), against last week by 16:20 (no sales are assumed after it);
// - a booking adds one to "Booked, next 7 days" and "New bookings this week", and to that
//   day's booked part;
// - a "Needs you now" row's count goes up or down, with its summary sentence;
// - the clock and every wait move on by the event's minutes.
//
// Nothing here is drawn: it returns an AgentView for the shared dashboard to draw.

import type { AgentView, Rich } from "../_agent/types";
import type { LiveEvent } from "./copy";

const NBSP = " ";
const CLOCK = /\b(\d{1,2}):(\d{2})\b/;

function minutesOf(clock: string): number {
  const m = CLOCK.exec(clock);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** The engine's money: "QAR 3,120" / "3,120 ر.ق", from dirhams (`agent/words.py` money). */
export function money(dirhams: number, lang: "en" | "ar"): string {
  const figure = Math.round(dirhams / 100).toLocaleString("en-US");
  return lang === "ar" ? `${figure}${NBSP}ر.ق` : `QAR${NBSP}${figure}`;
}

/** The engine's waits: "48 min", "1 h 16 min" / "48 د", "1 س 16 د" (`agent/words.py` minutes). */
function wait(mins: number, lang: "en" | "ar"): string {
  if (mins < 60) return lang === "ar" ? `${mins}${NBSP}د` : `${mins}${NBSP}min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (lang === "ar") return rest ? `${hours}${NBSP}س ${rest}${NBSP}د` : `${hours}${NBSP}س`;
  return rest ? `${hours}${NBSP}h ${rest}${NBSP}min` : `${hours}${NBSP}h`;
}

const WAIT = /^(?:(\d+)\s(?:h|س)\s?)?(?:(\d+)\s(?:min|د))?$/;

function parseWait(text: string): number | null {
  const m = WAIT.exec(text.replace(/ /g, " ").trim());
  if (!m || (!m[1] && !m[2])) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}

const num = (value: string) => Number(value.replace(/[^\d]/g, "")) || 0;
const grouped = (n: number) => n.toLocaleString("en-US");

/** The engine's percentage against last week (`view.py` `_pct`). */
const pct = (cur: number, last: number) => Math.round((100 * (cur - last)) / last);

/** Last week's figure behind a shown percentage: the whole number nearest cur / (1 + p) that
 * gives the same rounded percentage. */
function lastFrom(cur: number, p: number): number {
  const guess = Math.round(cur / (1 + p / 100));
  for (const d of [0, -1, 1, -2, 2]) if (guess + d > 0 && pct(cur, guess + d) === p) return guess + d;
  return guess;
}

/** Each run of digits in a piece of text that equals `from` becomes `to` (the first `limit`). */
const NUMBER = /\d+(?:,\d{3})*/g;

function swapNumber(text: string, from: number, to: number, limit = 1): string {
  let left = limit;
  return text.replace(NUMBER, (run) => (left > 0 && num(run) === from ? (left--, grouped(to)) : run));
}

function mapRich(parts: Rich, fn: (text: string, bold: boolean) => string): Rich {
  return parts.map((p) => (typeof p === "string" ? fn(p, false) : { b: fn(p.b, true) }));
}

function richHas(parts: Rich, n: number): boolean {
  return parts.some((p) => ((typeof p === "string" ? p : p.b).match(NUMBER) ?? []).some((run) => num(run) === n));
}

/** The nth "12%" in a piece of text becomes `to`. */
function swapPercents(parts: Rich, values: (number | null)[]): Rich {
  let i = 0;
  return mapRich(parts, (text) => text.replace(/(\d+)%/g, (all) => {
    const v = values[i++];
    return v == null ? all : `${v}%`;
  }));
}

const weekday = (date: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${date}T12:00:00Z`).getUTCDay()];

/**
 * The dashboard as it stands after the first `step` events of `script` (0: the opening, the
 * engine's sample exactly as it is).
 */
export function liveView(base: AgentView, script: LiveEvent[], step: number): AgentView {
  if (step <= 0) return base;
  const events = script.slice(0, step);
  const lang = base.lang;
  const at = events[events.length - 1].at;
  const elapsed = minutesOf(at) - minutesOf(base.header.when);

  let sent = 0;
  let reminders = 0;
  let orders = 0;
  let sales = 0;
  const booked: Record<string, number> = {};
  let bookings = 0;
  const needs: Record<string, number> = {};
  let needsSummary: string | null = null;
  for (const e of events) {
    const by = e.undo ? -1 : 1;
    for (const key of e.adds) {
      if (key === "sent") sent += by;
      else reminders += by;
    }
    if (e.order) {
      orders += by;
      sales += by * e.order * 100;
    }
    if (e.booking) {
      bookings += 1;
      booked[e.booking] = (booked[e.booking] ?? 0) + 1;
    }
    if (e.needs) {
      needs[e.needs.key] = (needs[e.needs.key] ?? 0) + e.needs.by;
      if (e.needs.summary) needsSummary = e.needs.summary;
    }
  }
  const needsChanged = Object.values(needs).some((n) => n !== 0);

  // ------------------------------------------------------------------ the numbers
  const kpi = (key: string) => base.kpis.find((k) => k.key === key);
  const ordersKpi = kpi("orders");
  const salesKpi = kpi("sales");
  const pctOf = (k: typeof ordersKpi) => {
    const shown = k?.change?.text.map((p) => (typeof p === "string" ? p : p.b)).join("").match(/(\d+)%/);
    return shown ? Number(shown[1]) : null;
  };
  const ordersNow = ordersKpi ? num(ordersKpi.value) + orders : 0;
  const ordersPct = ordersKpi && pctOf(ordersKpi) != null && ordersKpi.change?.dir === "up"
    ? pct(ordersNow, lastFrom(num(ordersKpi.value), pctOf(ordersKpi)!)) : null;
  // Last week's sales by this time, from the week's own bars: every past day's last week,
  // and today's "by this time".
  const salesLast = base.week?.days.reduce(
    (sum, d) => sum + (d.state === "past" ? d.last ?? 0 : d.state === "today" ? d.last_by_now ?? 0 : 0), 0) ?? 0;
  const salesBefore = salesKpi ? num(salesKpi.value) * 100 : 0;
  const salesNow = salesBefore + sales;
  const salesPct = salesKpi && salesLast > 0 && salesKpi.change?.dir === "up" ? pct(salesNow, salesLast) : null;

  const kpis = base.kpis.map((k) => {
    if (k.key === "orders" && orders) {
      return { ...k, value: grouped(ordersNow), change: k.change && ordersPct != null ? {
        ...k.change, text: swapPercents(k.change.text, [ordersPct]),
        said: k.change.said?.replace(/\d+%/, `${ordersPct}%`) ?? null } : k.change };
    }
    if (k.key === "sales" && sales) {
      return { ...k, value: grouped(Math.round(salesNow / 100)), change: k.change && salesPct != null ? {
        ...k.change, text: swapPercents(k.change.text, [salesPct]),
        said: k.change.said?.replace(/\d+%/, `${salesPct}%`) ?? null } : k.change };
    }
    if ((k.key === "booked_ahead" || k.key === "new_bookings") && bookings) {
      return { ...k, value: grouped(num(k.value) + bookings) };
    }
    return k;
  });

  // ---------------------------------------------------------------- the sentence
  const bookedKpi = kpi("booked_ahead");
  const summary = base.header.summary.map((s, index) => {
    let text = s.text;
    if (index === 0 && ordersKpi && orders) {
      text = mapRich(text, (t, bold) => (bold && salesKpi ? money(salesNow, lang) : swapNumber(t, num(ordersKpi.value), ordersNow)));
    }
    if (s.muted && (ordersPct != null || salesPct != null)) text = swapPercents(text, [ordersPct, salesPct]);
    if (bookedKpi && bookings && index > 0 && !s.muted && richHas(text, num(bookedKpi.value))) {
      text = mapRich(text, (t) => swapNumber(t, num(bookedKpi.value), num(bookedKpi.value) + bookings));
    }
    return { ...s, text };
  });
  // The last sentence names what needs confirming: while the count has moved, the event's own
  // words for the new count (the engine's template, written per language in copy.ts).
  if (needsChanged && needsSummary && summary.length) {
    summary[summary.length - 1] = { ...summary[summary.length - 1], text: [needsSummary] };
  }

  // ------------------------------------------------------------- needs and done
  const items = base.needs.items.map((item) => ({
    ...item,
    count: item.count + (needs[item.key] ?? 0),
    detail: item.detail && mapRich(item.detail, (t, bold) => {
      const mins = bold ? parseWait(t) : null;
      return mins == null ? t : wait(mins + elapsed, lang);
    }),
  }));
  const rows = base.done.rows.map((row) => {
    const add = row.key === "sent" ? sent : row.key === "booking_reminders" ? reminders : 0;
    return add ? { ...row, value: grouped(num(row.value) + add) } : row;
  });

  // -------------------------------------------------------------------- the week
  const week = base.week && {
    ...base.week,
    days: base.week.days.map((d) => {
      let day = d;
      if (d.state === "today" && sales && d.value != null) {
        const value = d.value + sales;
        day = { ...day, value, value_text: base.week!.format === "money" ? money(value, lang) : String(value) };
      }
      const more = booked[weekday(d.date)];
      if (more) {
        const n = (d.booked ?? 0) + more;
        day = { ...day, booked: n, booked_text: d.booked_text ? swapNumber(d.booked_text, d.booked ?? 0, n) : String(n) };
      }
      return day;
    }),
  };

  return {
    ...base,
    header: {
      ...base.header,
      when: base.header.when.replace(CLOCK, at),
      summary,
    },
    needs: { ...base.needs, items },
    kpis,
    kpi_caption: base.kpi_caption?.replace(CLOCK, at) ?? null,
    done: { ...base.done, rows },
    week,
  };
}

/** A flag's words, taken from the dashboard as it stands when the flag is raised, so the feed
 * and the screen agree. The site shows no rule line under it (founder, 25 Oct 2026). */
export function flagLine(view: AgentView, flag: NonNullable<LiveEvent["flag"]>): Rich | null {
  if (flag.from === "suggestion") return view.suggestions.find((s) => s.key === flag.key)?.title ?? null;
  const need = view.needs.items.find((n) => n.key === flag.key);
  return need ? [{ b: String(need.count) }, " ", ...need.words] : null;
}
