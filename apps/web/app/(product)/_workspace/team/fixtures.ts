// Sample data for the preview route and the tests: Nuqta Car Care, a fictional car-care shop. It has
// the shape of what the API sends (GET /api/team, GET /api/team/performance, GET /api/team/settings),
// so the screens read it through the same code as live data. All names are made up. Money is in fils.
// Day of the sample: Thu 12 Nov 2026, Doha 09:40. Erasable TypeScript only.

import type { Me, Member, Period, RawPerformance, RawPerson } from "./logic.ts";

export const SHOP_NAME = "Nuqta Car Care";
/** Doha's wall clock for the sample: the report below was read at this moment. */
export const SAMPLE_NOW = "2026-11-12T09:40";
export const SAMPLE_OFFLINE_FROM = "2026-11-12T09:31";

/** In the order the API sends them (by when they joined), not by name: the screen sorts. */
export const FIXTURE_MEMBERS: Member[] = [
  { id: "hana", name: "Hana", email: "hana@nuqta.qa", role: "owner" },
  { id: "omar", name: "Omar", email: "omar@nuqta.qa", role: "admin" },
  { id: "bilal", name: "Bilal", email: "bilal@nuqta.qa", role: "agent" },
  { id: "salma", name: "Salma", email: "salma@nuqta.qa", role: "agent" },
  { id: "yusuf", name: "Yusuf", email: "yusuf@nuqta.qa", role: "agent" },
  { id: "reem", name: "Reem", email: "reem@nuqta.qa", role: "agent" },
  { id: "maha", name: "Maha", email: "maha@nuqta.qa", role: "agent" },
];

export const FIXTURE_OWNER: Me = { id: "hana", role: "owner" };
export const FIXTURE_AGENT: Me = { id: "salma", role: "agent" };

const person = (
  id: string, name: string, role: string, p: Partial<RawPerson> & { closed?: RawPerson["closed"] },
): RawPerson => {
  const closed = p.closed ?? {};
  return {
    id, name, role, open: 0, waiting: 0, oldest_wait_minutes: null, replies: 0, median_reply_seconds: null,
    closed, closed_total: Object.values(closed).reduce((n, v) => n + (v ?? 0), 0), orders: 0, sales: 0,
    bookings_completed: 0, no_shows: 0, ...p,
  };
};

/** The seven-day numbers. Other periods are scaled from these, below. */
const WEEK: RawPerson[] = [
  person("bilal", "Bilal", "agent", { open: 2, replies: 64, median_reply_seconds: 180, closed: { sold: 6, booked: 9, answered: 5, lost: 1 }, orders: 9, sales: 289000, bookings_completed: 29, no_shows: 2 }),
  person("hana", "Hana", "owner", { open: 1, waiting: 1, oldest_wait_minutes: 4, replies: 12, median_reply_seconds: 360, closed: { sold: 1, booked: 1, answered: 2, lost: 0 }, orders: 2, sales: 124000 }),
  person("maha", "Maha", "agent", {}),
  person("omar", "Omar", "admin", { open: 2, replies: 38, median_reply_seconds: 240, closed: { sold: 4, booked: 5, answered: 4, lost: 1 }, orders: 6, sales: 364000, bookings_completed: 12, no_shows: 0 }),
  person("reem", "Reem", "agent", { open: 3, replies: 71, median_reply_seconds: 120, closed: { sold: 8, booked: 11, answered: 6, lost: 1 }, orders: 11, sales: 320800, bookings_completed: 17, no_shows: 1 }),
  person("salma", "Salma", "agent", { open: 4, waiting: 1, oldest_wait_minutes: 7, replies: 88, median_reply_seconds: 60, closed: { sold: 12, booked: 13, answered: 8, lost: 1 }, orders: 14, sales: 487000, bookings_completed: 21, no_shows: 1 }),
  person("yusuf", "Yusuf", "agent", { open: 2, replies: 47, median_reply_seconds: 180, closed: { sold: 5, booked: 8, answered: 4, lost: 1 }, orders: 7, sales: 272000, bookings_completed: 25, no_shows: 2 }),
];
const NOBODY = { open: 1, waiting: 1, oldest_wait_minutes: 12, orders: 3, sales: 291200 };

const SINCE: Record<Period, string> = {
  1: "2026-11-12T00:00:00+03:00",
  7: "2026-11-06T00:00:00+03:00",
  30: "2026-10-14T00:00:00+03:00",
};
const FACTOR: Record<Period, number> = { 1: 0.2, 7: 1, 30: 4 };

function scale(p: RawPerson, factor: number): RawPerson {
  if (factor === 1) return p;
  const k = (n: number) => Math.round(n * factor);
  const closed: RawPerson["closed"] = {};
  for (const [key, value] of Object.entries(p.closed)) closed[key as keyof typeof closed] = k(value ?? 0);
  return {
    ...p, replies: k(p.replies), orders: k(p.orders), sales: k(p.sales), bookings_completed: k(p.bookings_completed), no_shows: k(p.no_shows),
    closed, closed_total: Object.values(closed).reduce((n, v) => n + (v ?? 0), 0),
  };
}

/** What the API sends for a period, for the owner. An agent's own view is `agentReport`. */
export function fixtureReport(days: Period): RawPerformance {
  const factor = FACTOR[days];
  const people = WEEK.map((p) => scale(p, factor));
  const medians = people.map((p) => p.median_reply_seconds).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const sales = people.reduce((n, p) => n + p.sales, 0) + Math.round(NOBODY.sales * factor);
  return {
    days,
    since: SINCE[days],
    waiting_minutes: 10,
    can_see_everyone: true,
    unassigned: { ...NOBODY, orders: Math.round(NOBODY.orders * factor), sales: Math.round(NOBODY.sales * factor) },
    totals: {
      waiting: people.reduce((n, p) => n + p.waiting, 0) + NOBODY.waiting,
      open: people.reduce((n, p) => n + p.open, 0) + NOBODY.open,
      closed: people.reduce((n, p) => n + p.closed_total, 0),
      sold: people.reduce((n, p) => n + (p.closed.sold ?? 0), 0),
      sales,
      median_reply_seconds: medians.length ? medians[Math.floor(medians.length / 2)] : null,
    },
    people,
  };
}

/** What the API sends an agent: their own row. (The totals and unassigned block still arrive today; the screen never draws them. See requests.md.) */
export function agentReport(days: Period, me: Me): RawPerformance {
  const full = fixtureReport(days);
  return { ...full, can_see_everyone: false, people: full.people.filter((p) => p.id === me.id) };
}

/** A new shop: nobody has replied, closed or sold anything yet. */
export function emptyReport(days: Period): RawPerformance {
  return {
    days, since: SINCE[days], waiting_minutes: 10, can_see_everyone: true,
    unassigned: { open: 0, waiting: 0, oldest_wait_minutes: null, orders: 0, sales: 0 },
    totals: { waiting: 0, open: 0, closed: 0, sold: 0, sales: 0, median_reply_seconds: null },
    people: FIXTURE_MEMBERS.slice(0, 1).map((m) => person(m.id, m.name, m.role, {})),
  };
}
