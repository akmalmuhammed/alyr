// The team's pure rules: who may do what to whom, the order people are listed in, and the
// report's numbers read from what GET /api/team/performance really sends. No React, no DOM, no
// words (the words are in copy.ts), so `node --test` runs it. Erasable TypeScript only.

export type Role = "owner" | "admin" | "agent";
export const ROLES: readonly Role[] = ["owner", "admin", "agent"];

/** One row of GET /api/team: all the product knows about a person today. */
export type Member = { id: string; name: string; email: string; role: Role };
/** The signed-in person (GET /api/auth/me): an id and a role, nothing else is needed here. */
export type Me = { id: string; role: Role };

export type Chip = "all" | "managers" | "agents";

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** People are listed by name, A to Z. Never by a number: this is the one sort the team has. */
export function byName<T extends { name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => collator.compare(a.name, b.name));
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export function filterMembers(members: readonly Member[], query: string, chip: Chip): Member[] {
  const q = query.trim().toLowerCase();
  return byName(members).filter((m) => {
    if (q && !m.name.toLowerCase().includes(q) && !m.email.toLowerCase().includes(q)) return false;
    if (chip === "managers") return m.role !== "agent";
    if (chip === "agents") return m.role === "agent";
    return true;
  });
}

export function roleCounts(members: readonly Member[]): Record<Role | "all" | "managers", number> {
  const count = (role: Role) => members.filter((m) => m.role === role).length;
  return { all: members.length, owner: count("owner"), admin: count("admin"), agent: count("agent"), managers: count("owner") + count("admin") };
}

export function namesWithRole(members: readonly Member[], role: Role): string[] {
  return byName(members.filter((m) => m.role === role)).map((m) => m.name);
}

// ── who may do what (the server enforces the same; this only keeps the screen from offering it) ──

export type Refusal = "not_manager" | "owner_only" | "last_owner" | "yourself";

const owners = (members: readonly Member[]) => members.filter((m) => m.role === "owner").length;

/** Why `me` may not move `target` to `next`, or null when they may. Mirrors core/auth.py change_role. */
export function roleChangeRefusal(me: Me, members: readonly Member[], target: Member, next: Role): Refusal | null {
  if (me.role === "agent") return "not_manager";
  if (next === target.role) return null;
  if ((next === "owner" || target.role === "owner") && me.role !== "owner") return "owner_only";
  if (target.role === "owner" && owners(members) <= 1) return "last_owner";
  return null;
}

/** Why `me` may not remove `target`, or null. Mirrors core/auth.py remove_member; a person does not remove themselves here. */
export function removeRefusal(me: Me, members: readonly Member[], target: Member): Refusal | null {
  if (me.role === "agent") return "not_manager";
  if (target.id === me.id) return "yourself";
  if (target.role === "owner" && me.role !== "owner") return "owner_only";
  if (target.role === "owner" && owners(members) <= 1) return "last_owner";
  return null;
}

/** The roles `me` may give when inviting: an admin cannot make an owner. */
export function invitableRoles(me: Me): Role[] {
  if (me.role === "agent") return [];
  return me.role === "owner" ? ["agent", "admin", "owner"] : ["agent", "admin"];
}

export function validInvite(name: string, email: string): { name: boolean; email: boolean } {
  return { name: name.trim().length > 0, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) };
}

// ── the report ──────────────────────────────────────────

export type Outcome = "sold" | "booked" | "answered" | "lost";
export const OUTCOMES: readonly Outcome[] = ["sold", "booked", "answered", "lost"];
export type Period = 1 | 7 | 30;
export const PERIODS: readonly Period[] = [1, 7, 30];

/** One person of GET /api/team/performance, as the API sends it. Money is in fils. */
export type RawPerson = {
  id: string | null;
  name: string;
  role: string;
  open: number;
  waiting: number;
  oldest_wait_minutes: number | null;
  replies: number;
  median_reply_seconds: number | null;
  closed: Partial<Record<Outcome | "unsaid", number>>;
  closed_total: number;
  orders: number;
  sales: number;
  bookings_completed: number;
  no_shows: number;
};

export type RawPerformance = {
  days: number;
  since: string;
  waiting_minutes: number;
  can_see_everyone: boolean;
  unassigned: { open: number; waiting: number; oldest_wait_minutes: number | null; orders: number; sales: number };
  totals: { waiting: number; open: number; closed: number; sold: number; sales: number; median_reply_seconds: number | null };
  people: RawPerson[];
};

export type WorkRow = {
  id: string | null;
  name: string;
  role: Role | null;
  open: number;
  waiting: number;
  oldestWait: number | null;
  replies: number;
  /** The median first answer in seconds, or null when the person has typed no reply in the period. */
  firstAnswer: number | null;
  closed: Record<Outcome | "unsaid", number>;
  closedTotal: number;
  came: number;
  noShows: number;
  orders: number;
  sales: number;
};

export type Report = {
  days: Period;
  since: string;
  waitingMinutes: number;
  /** False for an agent: the report holds that one person's own row and nothing else is drawn. */
  everyone: boolean;
  rows: WorkRow[];
  nobody: WorkRow;
  all: WorkRow;
};

const roleOf = (value: string): Role | null => (value === "owner" || value === "admin" || value === "agent" ? value : null);

function blankClosed(): WorkRow["closed"] {
  return { sold: 0, booked: 0, answered: 0, lost: 0, unsaid: 0 };
}

function rowOf(p: RawPerson): WorkRow {
  return {
    id: p.id,
    name: p.name,
    role: roleOf(p.role),
    open: p.open,
    waiting: p.waiting,
    oldestWait: p.oldest_wait_minutes,
    replies: p.replies,
    firstAnswer: p.median_reply_seconds,
    closed: { ...blankClosed(), ...p.closed },
    closedTotal: p.closed_total,
    came: p.bookings_completed,
    noShows: p.no_shows,
    orders: p.orders,
    sales: p.sales,
  };
}

const longest = (values: Array<number | null>): number | null => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? Math.max(...known) : null;
};

/** The report as the screen reads it: people A to Z, "nobody yet" from `unassigned`, "everyone" from the totals. */
export function normalise(raw: RawPerformance): Report {
  const rows = byName(raw.people.map(rowOf));
  const u = raw.unassigned;
  const nobody: WorkRow = {
    ...blankRow("", null), open: u.open, waiting: u.waiting, oldestWait: u.oldest_wait_minutes, orders: u.orders, sales: u.sales,
  };
  const closed = blankClosed();
  for (const row of rows) for (const key of Object.keys(closed) as Array<keyof typeof closed>) closed[key] += row.closed[key];
  const all: WorkRow = {
    ...blankRow("", null),
    open: raw.totals.open,
    waiting: raw.totals.waiting,
    oldestWait: longest([...rows.map((r) => r.oldestWait), nobody.oldestWait]),
    replies: rows.reduce((n, r) => n + r.replies, 0),
    firstAnswer: raw.totals.median_reply_seconds,
    closed,
    closedTotal: raw.totals.closed,
    came: rows.reduce((n, r) => n + r.came, 0),
    noShows: rows.reduce((n, r) => n + r.noShows, 0),
    orders: rows.reduce((n, r) => n + r.orders, 0) + nobody.orders,
    sales: raw.totals.sales,
  };
  const days: Period = raw.days === 1 || raw.days === 30 ? raw.days : 7;
  return { days, since: raw.since, waitingMinutes: raw.waiting_minutes, everyone: raw.can_see_everyone, rows, nobody, all };
}

function blankRow(name: string, id: string | null): WorkRow {
  return {
    id, name, role: null, open: 0, waiting: 0, oldestWait: null, replies: 0, firstAnswer: null,
    closed: blankClosed(), closedTotal: 0, came: 0, noShows: 0, orders: 0, sales: 0,
  };
}

/** A person with nothing counted in the period: they get words in their cells, not a row of zeros. */
export function isIdle(row: WorkRow): boolean {
  return row.open === 0 && row.replies === 0 && row.closedTotal === 0 && row.orders === 0 && row.came + row.noShows === 0;
}

/** No numbers at all yet: a new business where nobody has replied, closed or sold. */
export function isEmptyReport(report: Report): boolean {
  return report.rows.every(isIdle) && report.nobody.open === 0 && report.nobody.orders === 0;
}

/** The row of the signed-in person, for an agent's own view. */
export function ownRow(report: Report, me: Me): WorkRow | null {
  return report.rows.find((r) => r.id === me.id) ?? null;
}

/** First answer in whole minutes: under a minute is 0, so the screen can say "Under a minute". */
export function answerMinutes(seconds: number | null): number | null {
  return seconds === null ? null : Math.round(seconds / 60);
}

export type StackTone = "ink" | "strong" | "ctl" | "bad";

/** How conversations ended, as the parts of one bar: sold, booked, answered, lost. Zero parts drop out in the chart. */
export function outcomeParts(closed: WorkRow["closed"]): Array<{ value: number; tone: StackTone }> {
  return [
    { value: closed.sold, tone: "ink" },
    { value: closed.booked, tone: "strong" },
    { value: closed.answered, tone: "ctl" },
    { value: closed.lost, tone: "bad" },
  ];
}

/** What removing a person changes, from the report's own fields: their open conversations go back to nobody (core/auth.py), and their orders are counted under nobody yet. */
export function removeImpact(report: Report | null, personId: string): { conversations: number; orders: number } | null {
  const row = report?.rows.find((r) => r.id === personId);
  return row ? { conversations: row.open, orders: row.orders } : null;
}
