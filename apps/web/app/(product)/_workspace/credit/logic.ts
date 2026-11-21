// Credit: the rules behind the screens, as pure functions (no React, no fetch), so every figure on a
// screen is counted from the fields the API sends and a test can read it. Money is an integer in
// dirhams (100 to the riyal), as the API sends it; nothing here formats money or dates for display
// (the screens use the kit's `money`, `formatDate` and `counted`).
//
// Where a rule is the server's, it says which, and mirrors it exactly: `ageing.py` (the four age
// buckets, the oldest sale paid first), `service.py` (who a reminder skips, the three tones, the
// wording) and the 24 hour WhatsApp window (`core/outbound.py`). ALYR does not move money: a payment
// recorded here is money the owner already has, written down.

export type Lang = "en" | "ar";
export type Role = "owner" | "admin" | "agent";

/** `service.REMINDER_COOLDOWN_DAYS`: a customer reminded in the last 3 days is skipped. */
export const REMINDER_COOLDOWN_DAYS = 3;
/** `service.PROMISE_DAYS`: "I'll pay within a week" sets a promise for 7 days. */
export const PROMISE_DAYS = 7;
export const FIRM_FROM_DAYS = 60;
export const FINAL_FROM_DAYS = 90;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const WINDOW_MS = 24 * HOUR_MS;

// ── who may see money ─────────────────────────────────────

/** Owners and admins see credit. An agent never sees a balance, an age or a total (guide rule 3). */
export function canSeeCredit(role: string | null | undefined): role is "owner" | "admin" {
  return role === "owner" || role === "admin";
}

// ── the age buckets (ageing.py) ───────────────────────────

export const BUCKET_KEYS = ["d0_30", "d31_60", "d61_90", "d90_plus"] as const;
export type BucketKey = (typeof BUCKET_KEYS)[number];
export type Buckets = Record<BucketKey, number>;

export function emptyBuckets(): Buckets {
  return { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
}

/** `ageing.bucket_for`: 0 to 30, 31 to 60, 61 to 90, over 90 days. */
export function bucketFor(days: number): BucketKey {
  if (days <= 30) return "d0_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90_plus";
}

export function addBuckets(a: Buckets, b: Buckets): Buckets {
  return {
    d0_30: a.d0_30 + b.d0_30,
    d31_60: a.d31_60 + b.d31_60,
    d61_90: a.d61_90 + b.d61_90,
    d90_plus: a.d90_plus + b.d90_plus,
  };
}

export function bucketTotal(b: Buckets): number {
  return b.d0_30 + b.d31_60 + b.d61_90 + b.d90_plus;
}

/** Each bucket's share of the total in whole percent (they add to 100), for the stacked bar. Empty: all 0. */
export function bucketShares(b: Buckets): Buckets {
  const total = bucketTotal(b);
  if (total <= 0) return emptyBuckets();
  const raw = BUCKET_KEYS.map((k) => (b[k] / total) * 100);
  const floors = raw.map((v) => Math.floor(v));
  let left = 100 - floors.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((x, y) => y.frac - x.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    if (raw[i] > 0) { floors[i] += 1; left -= 1; }
  }
  return { d0_30: floors[0], d31_60: floors[1], d61_90: floors[2], d90_plus: floors[3] };
}

// ── time ──────────────────────────────────────────────────

/** Whole days from `from` to `now`, the way the server counts them (`(now - at).days`). Never negative. */
export function daysSince(from: string, now: string): number {
  const diff = Date.parse(now) - Date.parse(from);
  return Number.isFinite(diff) ? Math.max(Math.floor(diff / DAY_MS), 0) : 0;
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

/** Doha's calendar day of an instant, `2026-11-12` (UTC+3, no summer time). */
export function dohaDay(iso: string): string {
  return new Date(Date.parse(iso) + 3 * HOUR_MS).toISOString().slice(0, 10);
}

/** When the customer's 24 hour window closes, or null when they never wrote. */
export function windowClosesAt(lastInboundAt: string | null): string | null {
  return lastInboundAt ? new Date(Date.parse(lastInboundAt) + WINDOW_MS).toISOString() : null;
}

export function isWindowOpen(lastInboundAt: string | null, now: string): boolean {
  const closes = windowClosesAt(lastInboundAt);
  return closes !== null && Date.parse(closes) > Date.parse(now);
}

// ── the accounts list ─────────────────────────────────────

/** One customer's credit account, in the shape of `GET /api/ledger/summary` (camelCase). */
export type CreditAccountRow = {
  id: string;
  name: string;
  phone: string;
  /** What they owe, in dirhams. */
  balance: number;
  /** Days since the oldest sale not paid yet. */
  oldestDays: number;
  buckets: Buckets;
  /** The limit in dirhams, 0 for none, or null when the API did not send it. */
  creditLimit: number | null;
  overLimit: boolean;
  /** A promise that is still open: the date (ISO). */
  promisedUntil: string | null;
  /** The promised date passed with nothing paid. */
  promisePassed: boolean;
  /** The date that passed, when the API sends it (the summary only says that it passed). */
  promisePassedOn: string | null;
  lastRemindedAt: string | null;
  remindersSent: number | null;
  /** The customer's last message to the shop: opens the 24 hour window. */
  lastInboundAt: string | null;
  assigned: { id: string; name: string } | null;
  /** They said STOP: no messages at all. */
  optedOut: boolean;
  optedOutAt: string | null;
  /** The language the customer's messages go in. */
  lang: Lang;
};

export type AccountTab = "owe" | "nothing" | "all";
export type AccountChip = "all" | "over30" | "promised" | "passed" | "overLimit" | "stop";
export type AccountSort = "owes" | "oldest" | "name";

/** The rule on the page: a customer is listed once they have a credit limit or a balance. */
export function isListed(row: CreditAccountRow): boolean {
  return row.balance > 0 || (row.creditLimit ?? 0) > 0;
}

export function inTab(row: CreditAccountRow, tab: AccountTab): boolean {
  if (!isListed(row)) return false;
  if (tab === "owe") return row.balance > 0;
  if (tab === "nothing") return row.balance <= 0;
  return true;
}

export function inChip(row: CreditAccountRow, chip: AccountChip): boolean {
  switch (chip) {
    case "over30": return row.balance > 0 && row.oldestDays > 30;
    case "promised": return row.promisedUntil !== null;
    case "passed": return row.promisePassed;
    case "overLimit": return row.overLimit;
    case "stop": return row.optedOut;
    default: return true;
  }
}

export type AccountFilters = {
  tab: AccountTab;
  chip: AccountChip;
  search: string;
  /** A team member's id, or "" for anyone. */
  assignee: string;
};

export function matchesSearch(row: CreditAccountRow, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  return row.name.toLowerCase().includes(q) || (digits.length > 0 && row.phone.replace(/\D/g, "").includes(digits));
}

export function filterAccounts(rows: readonly CreditAccountRow[], f: AccountFilters): CreditAccountRow[] {
  return rows.filter(
    (r) =>
      inTab(r, f.tab) &&
      inChip(r, f.chip) &&
      matchesSearch(r, f.search) &&
      (f.assignee === "" || r.assigned?.id === f.assignee),
  );
}

/** The counts on the chips: how many of the rows in this tab (and search and assignee) each chip would show. */
export function chipCounts(rows: readonly CreditAccountRow[], f: Omit<AccountFilters, "chip">): Record<AccountChip, number> {
  const base = rows.filter(
    (r) => inTab(r, f.tab) && matchesSearch(r, f.search) && (f.assignee === "" || r.assigned?.id === f.assignee),
  );
  const count = (chip: AccountChip) => base.filter((r) => inChip(r, chip)).length;
  return {
    all: base.length, over30: count("over30"), promised: count("promised"),
    passed: count("passed"), overLimit: count("overLimit"), stop: count("stop"),
  };
}

export function tabCounts(rows: readonly CreditAccountRow[]): Record<AccountTab, number> {
  return {
    owe: rows.filter((r) => inTab(r, "owe")).length,
    nothing: rows.filter((r) => inTab(r, "nothing")).length,
    all: rows.filter((r) => inTab(r, "all")).length,
  };
}

export function sortAccounts(rows: readonly CreditAccountRow[], sort: AccountSort): CreditAccountRow[] {
  return [...rows].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "en");
    if (sort === "oldest" && b.oldestDays !== a.oldestDays) return b.oldestDays - a.oldestDays;
    if (b.balance !== a.balance) return b.balance - a.balance;
    return a.name.localeCompare(b.name, "en");
  });
}

/** Alphabetical by name: any list of people is written A to Z, never ranked. */
export function alphabetical<T extends { name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, "en"));
}

export type LimitUse = { percent: number; left: number; over: boolean; hasLimit: boolean };

export function limitUse(balance: number, limit: number | null): LimitUse {
  if (limit === null || limit <= 0) return { percent: 0, left: 0, over: false, hasLimit: false };
  return {
    percent: Math.round((Math.max(balance, 0) / limit) * 100),
    left: Math.max(limit - balance, 0),
    over: balance > limit,
    hasLimit: true,
  };
}

export type AgeTone = "n" | "warn" | "bad";

/** The age tag's colour: grey to 30 days, amber to 60, red over 60. */
export function ageTone(days: number): AgeTone {
  return days > 60 ? "bad" : days > 30 ? "warn" : "n";
}

// ── the numbers on the band ───────────────────────────────

export type Payment = {
  id: string;
  /** ISO instant. */
  at: string;
  customerId: string;
  customerName: string;
  amount: number;
  method: PayMethod | "link";
  /** Who wrote it down: a team member's name or "Your provider". */
  by: string;
};

export type OweSummary = {
  owed: number;
  owing: number;
  buckets: Buckets;
  /** Owed more than 60 days: the two oldest buckets. */
  over60: { amount: number; names: string[]; withoutPromise: number };
  promised: { amount: number; names: string[]; passed: number };
};

export function summarise(rows: readonly CreditAccountRow[]): OweSummary {
  const owing = rows.filter((r) => r.balance > 0);
  const buckets = owing.reduce((sum, r) => addBuckets(sum, r.buckets), emptyBuckets());
  const old = owing.filter((r) => r.buckets.d61_90 + r.buckets.d90_plus > 0);
  const promised = owing.filter((r) => r.promisedUntil !== null);
  return {
    owed: owing.reduce((s, r) => s + r.balance, 0),
    owing: owing.length,
    buckets,
    over60: {
      amount: buckets.d61_90 + buckets.d90_plus,
      names: alphabetical(old).map((r) => r.name),
      withoutPromise: old.filter((r) => r.promisedUntil === null).length,
    },
    promised: {
      amount: promised.reduce((s, r) => s + r.balance, 0),
      names: alphabetical(promised).map((r) => r.name),
      passed: owing.filter((r) => r.promisePassed).length,
    },
  };
}

/** Payments inside one Doha calendar month, `2026-11`. */
export function paymentsInMonth(payments: readonly Payment[], month: string): Payment[] {
  return payments.filter((p) => dohaDay(p.at).startsWith(month));
}

// ── reminders (service.send_reminders) ────────────────────

export type Tone = "gentle" | "firm" | "final";

/** `service.reminder_tier`: gentle under 60 days, firm from 60, final from 90. */
export function reminderTier(oldestDays: number): Tone {
  return oldestDays >= FINAL_FROM_DAYS ? "final" : oldestDays >= FIRM_FROM_DAYS ? "firm" : "gentle";
}

export type SkipReason = "promise" | "recent" | "stop";
export type SendVia = "buttons" | "template";

export type ReminderGo = { row: CreditAccountRow; tone: Tone; via: SendVia };
export type ReminderSkip = { row: CreditAccountRow; reason: SkipReason; until: string | null };
export type ReminderPlan = { minDays: number; matched: number; go: ReminderGo[]; skipped: ReminderSkip[] };

/**
 * Who a run of "Send reminders" reaches and who it leaves out, by the server's own order of checks:
 * a balance and an oldest sale at least `minDays` old; then said STOP, an open promise, reminded in
 * the last 3 days. Inside the customer's 24 hour window the reminder is an ordinary message with
 * buttons; outside it only the approved template can go.
 */
export function planReminders(rows: readonly CreditAccountRow[], minDays: number, now: string): ReminderPlan {
  const matched = sortAccounts(rows.filter((r) => r.balance > 0 && r.oldestDays >= minDays), "owes");
  const go: ReminderGo[] = [];
  const skipped: ReminderSkip[] = [];
  for (const row of matched) {
    if (row.optedOut) { skipped.push({ row, reason: "stop", until: null }); continue; }
    if (row.promisedUntil) { skipped.push({ row, reason: "promise", until: row.promisedUntil }); continue; }
    if (row.lastRemindedAt) {
      const again = addDays(row.lastRemindedAt, REMINDER_COOLDOWN_DAYS);
      if (Date.parse(again) > Date.parse(now)) { skipped.push({ row, reason: "recent", until: again }); continue; }
    }
    go.push({ row, tone: reminderTier(row.oldestDays), via: isWindowOpen(row.lastInboundAt, now) ? "buttons" : "template" });
  }
  return { minDays, matched: matched.length, go, skipped };
}

/**
 * The reminder's own wording, copied from `service.reminder_text` so the preview is what is sent.
 * It goes in the customer's language, not the screen's. (The server writes «QAR» and «٩٠» in the
 * Arabic body; a request is filed to fix that, and this stays identical until it does.)
 */
export function reminderText(input: {
  lang: Lang; shop: string; shopAr: string; amount: number; days: number; tone: Tone; link: string; how: string;
}): string {
  const { lang, shop, shopAr, amount, days, tone, link, how } = input;
  const money = qarText(amount);
  if (lang === "ar") {
    const name = shopAr || shop;
    const opening: Record<Tone, string> = {
      gentle: `تذكير ودي من ${name}: عليك مبلغ ${money}.`,
      firm: `تذكير من ${name}: مبلغ ${money} متأخر السداد.`,
      final: `إشعار أخير من ${name}: مبلغ ${money} متأخر منذ أكثر من ٩٠ يوماً. نرجو السداد أو التواصل معنا اليوم.`,
    };
    return `${opening[tone]} أقدم فاتورة غير مدفوعة منذ ${days} يوماً. ${how || `للدفع: ${link}`}`;
  }
  const opening: Record<Tone, string> = {
    gentle: `A friendly reminder from ${shop}: ${money} is due.`,
    firm: `Reminder from ${shop}: ${money} is now overdue.`,
    final: `Final notice from ${shop}: ${money} has been overdue for more than 90 days. Please pay or contact us today.`,
  };
  return `${opening[tone]} Your oldest unpaid purchase was ${days} days ago. ${how || `Pay here: ${link}`}`;
}

/** `core.normalise.fmt_qar`: how the server writes an amount inside a message. */
export function qarText(dirhams: number): string {
  const sign = dirhams < 0 ? "-" : "";
  const abs = Math.abs(dirhams);
  const whole = Math.floor(abs / 100);
  const part = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}QAR ${grouped}${part ? `.${String(part).padStart(2, "0")}` : ""}`;
}

// ── the account: entries, open sales, a payment ───────────

export type PayMethod = "cash" | "bank_transfer" | "card_terminal" | "cheque";
export const PAY_METHODS: readonly PayMethod[] = ["cash", "bank_transfer", "card_terminal", "cheque"];

export type EntryKind = "sale" | "payment" | "reversal";

/** A line of the account's book. `amount` is a magnitude in dirhams; the kind says which way it moves the balance. */
export type CreditEntry = {
  id: string;
  kind: EntryKind;
  amount: number;
  /** ISO instant. */
  at: string;
  /** The document or order it is about: INV-2026-0358, Order #1028, PL-2026-100782. */
  ref: string;
  /** A reversal: the sale's ref it took money off. */
  against: string | null;
  note: string;
  /** Who wrote it down. */
  by: string;
  method: PayMethod | "link" | null;
};

/** The effect of an entry on what is owed: a sale adds, a payment or a reversal takes off. */
export function signed(entry: Pick<CreditEntry, "kind" | "amount">): number {
  return entry.kind === "sale" ? entry.amount : -entry.amount;
}

export type LedgerLine = CreditEntry & { owesAfter: number };

/** Every entry with what was owed after it, oldest first. */
export function withBalance(entries: readonly CreditEntry[]): LedgerLine[] {
  const ordered = [...entries].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let balance = 0;
  return ordered.map((e) => {
    balance += signed(e);
    return { ...e, owesAfter: balance };
  });
}

export type OpenSale = {
  ref: string;
  at: string;
  note: string;
  /** What the sale came to after anything taken off it. */
  amount: number;
  paid: number;
  remaining: number;
  days: number;
};

export type PaymentSplit = { paymentId: string; sale: string; amount: number };

/**
 * What is still owed, sale by sale. A reversal takes money off the sale it names; payments settle the
 * oldest sale first (`ageing.age`). Returns every sale (settled ones have `remaining` 0) and how each
 * payment was split.
 */
export function settle(entries: readonly CreditEntry[], now: string): { sales: OpenSale[]; splits: PaymentSplit[] } {
  const ordered = [...entries].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const sales: OpenSale[] = ordered
    .filter((e) => e.kind === "sale")
    .map((e) => ({ ref: e.ref, at: e.at, note: e.note, amount: e.amount, paid: 0, remaining: e.amount, days: 0 }));
  for (const e of ordered) {
    if (e.kind !== "reversal") continue;
    const sale = sales.find((s) => s.ref === e.against);
    if (sale) { sale.amount -= e.amount; sale.remaining -= e.amount; }
  }
  const splits: PaymentSplit[] = [];
  for (const e of ordered) {
    if (e.kind !== "payment") continue;
    let left = e.amount;
    for (const sale of sales) {
      if (left <= 0) break;
      const applied = Math.min(left, sale.remaining);
      if (applied <= 0) continue;
      sale.paid += applied;
      sale.remaining -= applied;
      left -= applied;
      splits.push({ paymentId: e.id, sale: sale.ref, amount: applied });
    }
  }
  for (const sale of sales) sale.days = daysSince(sale.at, now);
  return { sales, splits };
}

/** The sales still owed, oldest first. */
export function openSales(entries: readonly CreditEntry[], now: string): OpenSale[] {
  return settle(entries, now).sales.filter((s) => s.remaining > 0);
}

/** What the open sales say about age: the four buckets and the oldest sale's age. */
export function ageOf(entries: readonly CreditEntry[], now: string): { balance: number; oldestDays: number; buckets: Buckets } {
  const open = openSales(entries, now);
  const buckets = emptyBuckets();
  for (const s of open) buckets[bucketFor(s.days)] += s.remaining;
  return {
    balance: open.reduce((sum, s) => sum + s.remaining, 0),
    oldestDays: open.reduce((max, s) => Math.max(max, s.days), 0),
    buckets,
  };
}

export type Allocation = {
  lines: { ref: string; note: string; days: number; owed: number; applied: number; left: number }[];
  applied: number;
  owesAfter: number;
};

/** What a payment of `amount` would pay off, oldest sale first, and what would still be owed. */
export function allocatePayment(sales: readonly OpenSale[], amount: number): Allocation {
  let left = Math.max(amount, 0);
  let applied = 0;
  const lines = sales.map((s) => {
    const take = Math.min(left, s.remaining);
    left -= take;
    applied += take;
    return { ref: s.ref, note: s.note, days: s.days, owed: s.remaining, applied: take, left: s.remaining - take };
  });
  return { lines, applied, owesAfter: sales.reduce((sum, s) => sum + s.remaining, 0) - applied };
}

export type AmountCheck = { ok: true; amount: number } | { ok: false; reason: "empty" | "zero" | "more" };

/** Reads what was typed ("1,040", "1040.5", "١٬٠٤٠") into dirhams, and checks it against what they owe. */
export function checkAmount(text: string, owed: number): AmountCheck {
  const dirhams = parseAmount(text);
  if (dirhams === null) return { ok: false, reason: "empty" };
  if (dirhams <= 0) return { ok: false, reason: "zero" };
  if (dirhams > owed) return { ok: false, reason: "more" };
  return { ok: true, amount: dirhams };
}

const EASTERN = "٠١٢٣٤٥٦٧٨٩";

/** «1,040» → 104000; «12.5» → 1250; Arabic-Indic digits and separators are read too; anything else is null. */
export function parseAmount(text: string): number | null {
  const latin = text
    .replace(/[٠-٩]/g, (d) => String(EASTERN.indexOf(d)))
    .replace(/[٬،,\s ]/g, "")
    .replace(/٫/g, ".");
  if (!/^\d+(\.\d{1,2})?$/.test(latin)) return null;
  return Math.round(Number(latin) * 100);
}

export type NewPayment = { amount: number; method: PayMethod; reference: string; by: string; at: string };

/** The entry a recorded payment adds to the account's book. */
export function paymentEntry(p: NewPayment, id: string): CreditEntry {
  return {
    id, kind: "payment", amount: p.amount, at: p.at, ref: p.reference, against: null,
    note: "", by: p.by, method: p.method,
  };
}

/** The account row after a payment: any payment ends an open promise (`add_entry`), and balance and age are read again. */
export function applyPayment(row: CreditAccountRow, entries: readonly CreditEntry[], now: string): CreditAccountRow {
  const aged = ageOf(entries, now);
  return {
    ...row, balance: aged.balance, oldestDays: aged.oldestDays, buckets: aged.buckets,
    overLimit: row.creditLimit !== null && row.creditLimit > 0 && aged.balance > row.creditLimit,
    promisedUntil: null, promisePassed: false,
  };
}

// ── promise and reminder stages on one account ────────────

export type PromiseState = "none" | "open" | "passed";

export function promiseState(row: Pick<CreditAccountRow, "promisedUntil" | "promisePassed">): PromiseState {
  return row.promisedUntil ? "open" : row.promisePassed ? "passed" : "none";
}

/** The money paid after a moment (for "Paid since" under a promise). */
export function paidSince(entries: readonly CreditEntry[], since: string | null): number {
  if (!since) return 0;
  return entries
    .filter((e) => e.kind === "payment" && Date.parse(e.at) > Date.parse(since))
    .reduce((sum, e) => sum + e.amount, 0);
}

export type Stage = { tone: Tone; from: number; to: number | null; startsAt: string | null; current: boolean };

/** The three reminder tones against the oldest unpaid sale: where the debt is now and the date each stage starts. */
export function reminderStages(oldestDays: number, oldestSaleAt: string | null): Stage[] {
  const startsAt = (days: number) => (oldestSaleAt ? addDays(oldestSaleAt, days) : null);
  const now = reminderTier(oldestDays);
  return [
    { tone: "gentle", from: 0, to: FIRM_FROM_DAYS - 1, startsAt: null, current: now === "gentle" },
    { tone: "firm", from: FIRM_FROM_DAYS, to: FINAL_FROM_DAYS - 1, startsAt: startsAt(FIRM_FROM_DAYS), current: now === "firm" },
    { tone: "final", from: FINAL_FROM_DAYS, to: null, startsAt: startsAt(FINAL_FROM_DAYS), current: now === "final" },
  ];
}

// ── the statement ─────────────────────────────────────────

export type StatementOptions = { from: string | null; to: string; showPaid: boolean };

export type StatementLine = LedgerLine & { settled: boolean };

export type Statement = {
  opening: number;
  put: number;
  paid: number;
  owes: number;
  lines: StatementLine[];
  /** Lines in the period left out because they are already paid. */
  hidden: number;
  buckets: Buckets;
};

/**
 * A statement for the period: what was owed at the start, what was put on account (sales, less
 * anything taken off), what was paid, and what is owed at the end, with the age of what is open. The
 * figures always count every line of the period; hiding the lines that are already paid only
 * shortens the table, so the four figures still add up.
 */
export function statementOf(entries: readonly CreditEntry[], now: string, opts: StatementOptions): Statement {
  const lines = withBalance(entries);
  const before = (e: LedgerLine) => opts.from !== null && Date.parse(e.at) < Date.parse(opts.from);
  const inside = lines.filter((e) => !before(e) && Date.parse(e.at) <= Date.parse(opts.to));
  const opening = lines.filter(before).reduce((_, e) => e.owesAfter, 0);
  const { sales, splits } = settle(entries, now);
  const settledSale = new Set(sales.filter((s) => s.remaining <= 0).map((s) => s.ref));
  const settledPayment = (id: string) => {
    const mine = splits.filter((s) => s.paymentId === id);
    return mine.length > 0 && mine.every((s) => settledSale.has(s.sale));
  };
  const marked: StatementLine[] = inside.map((e) => ({
    ...e,
    settled: e.kind === "sale" ? settledSale.has(e.ref) : e.kind === "payment" ? settledPayment(e.id) : !!e.against && settledSale.has(e.against),
  }));
  const shown = opts.showPaid ? marked : marked.filter((l) => !l.settled);
  const put = inside.filter((e) => e.kind !== "payment").reduce((s, e) => s + signed(e), 0);
  const paid = inside.filter((e) => e.kind === "payment").reduce((s, e) => s + e.amount, 0);
  return {
    opening, put, paid, owes: opening + put - paid, lines: shown, hidden: marked.length - shown.length,
    buckets: ageOf(entries.filter((e) => Date.parse(e.at) <= Date.parse(opts.to)), opts.to).buckets,
  };
}

// ── a CSV of the entries ──────────────────────────────────

/** Rows of cells as CSV text: every cell quoted, quotes doubled, rows ended with a line break. */
export function csvOf(rows: readonly (readonly string[])[]): string {
  const cell = (c: string) => '"' + c.replace(/"/g, '""') + '"';
  return rows.map((cells) => cells.map(cell).join(",")).join("\r\n") + "\r\n";
}
