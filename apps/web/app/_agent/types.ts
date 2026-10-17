// The AgentView the API sends (`GET /api/agent?lang=`, apps/api/src/alyr/modules/agent/view.py).
// Every word is already in the reader's language; the screen decides nothing.

/** Text with figures: plain strings, and `{ b }` for a figure or name kept whole in a <bdi>. */
export type Rich = (string | { b: string })[];

/** A change against the same span last week. `said` is the words for a screen reader. */
export type Change = { dir: "up" | "down" | "level" | null; text: Rich; said: string | null } | null;

export type Kpi = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  unit_first: boolean;
  money: boolean;
  href: string;
  change: Change;
};

export type Day = {
  date: string;
  label: string;
  state: "past" | "today" | "coming" | "closed" | "before";
  value: number | null;
  value_text: string | null;
  last: number | null;
  last_text: string | null;
  last_by_now: number | null;
  last_by_now_text: string | null;
  booked: number | null;
  booked_text: string | null;
};

export type AgentView = {
  version: number;
  lang: "en" | "ar";
  dir: "ltr" | "rtl";
  now: string;
  state: "empty" | "first_week" | "quiet" | "normal";
  money: boolean;
  lead: "orders" | "bookings" | "ledger" | "inbox";
  header: {
    greeting: string;
    date: string;
    updated: string;
    eyebrow: string;
    when: string;
    city: string;
    summary: { muted: boolean; text: Rich }[];
  };
  needs: {
    items: { key: string; count: number; words: Rich; detail: Rich | null; href: string | null; rule: string }[];
    empty: string;
  };
  kpis: Kpi[];
  kpi_caption: string | null;
  /** The empty state's outlines: what each will show once there are records. */
  placeholders: { kind: "week" | "hours" | "list"; text: string }[];
  suggestions: {
    key: string;
    kind: "money" | "knowledge";
    primary: boolean;
    title: Rich;
    line: Rich;
    rule: string;
    rows: { id: string; label: string }[];
    more: number;
    action: { label: string; href: string } | null;
    status: string | null;
    snooze: { key: string; fingerprint: string } | null;
  }[];
  done: { rows: { key: string; value: string; label: string; href: string }[]; empty: string };
  week: {
    title: string;
    format: "money" | "count";
    max: number;
    days: Day[];
    legend: { last: string; by_now: string; closed: string; booked: string };
  } | null;
  hours: {
    title: string;
    hours: string[];
    rows: { label: string; cells: number[] }[];
    top: { day: string; range: string };
    top3: { day: string; range: string }[];
  } | null;
  top: {
    title: string;
    change_label: string | null;
    rows: {
      name: string;
      value: number;
      value_text: string;
      share: number;
      change: { dir: string | null; text: string; said: string | null } | null;
    }[];
  } | null;
  owed: {
    title: string;
    total: { value: string; unit: string | null; unit_first: boolean };
    total_text: string;
    customers: string;
    change: Rich;
    segments: { key: string; label: string; amount_text: string; share: number }[];
    oldest: Rich | null;
    empty: string;
  } | null;
  team: {
    rows: { name: string; replies: number; first_answer: string; open: number; waiting: number; line: string }[];
    unassigned: Rich | null;
    everyone: boolean;
  } | null;
  report: Rich | null;
  comparisons_from: string | null;
};
