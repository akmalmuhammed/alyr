// The AgentView the API sends (`GET /api/agent?lang=`, apps/api/src/alyr/modules/agent/view.py).
// Every word is already in the reader's language; the screen decides nothing.

/** Text with figures: plain strings, and `{ b }` for a figure kept whole in a <bdi>. */
export type Rich = (string | { b: string })[];

export type Change = { dir: "up" | "down" | "level" | null; text: Rich } | null;

export type AgentView = {
  version: number;
  lang: "en" | "ar";
  dir: "ltr" | "rtl";
  now: string;
  state: "empty" | "first_week" | "quiet" | "normal";
  money: boolean;
  lead: "orders" | "bookings" | "ledger" | "inbox";
  header: {
    eyebrow: string;
    greeting: string;
    summary: { muted: boolean; text: Rich }[];
    updated: string;
  };
  needs: {
    items: { key: string; count: number; words: Rich; detail: Rich | null; href: string | null; rule: string }[];
    empty: string;
  };
  kpis: { key: string; label: string; value: string; money: boolean; href: string; change: Change }[];
  placeholders: string[];
  suggestions: {
    key: string;
    kind: "money" | "knowledge";
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
    total_text: string;
    days: {
      date: string;
      label: string;
      state: "past" | "today" | "coming";
      value: number | null;
      value_text: string | null;
      last: number;
      last_text: string;
      booked: number | null;
    }[];
  } | null;
  hours: { title: string; hours: string[]; rows: { label: string; cells: number[] }[]; top: string; top3: string[] } | null;
  top: {
    title: string;
    rows: { name: string; value: number; value_text: string; share: number; change: { dir: string | null; text: string } }[];
  } | null;
  owed: {
    title: string;
    total_text: string;
    customers: string;
    segments: { key: string; label: string; amount_text: string; share: number }[];
    oldest: Rich | null;
    empty: string;
  } | null;
  team: {
    rows: { name: string; replies: number; first_answer: string; open: number; waiting: number }[];
    unassigned: Rich | null;
    everyone: boolean;
  } | null;
  report: Rich | null;
  comparisons_from: string | null;
};
