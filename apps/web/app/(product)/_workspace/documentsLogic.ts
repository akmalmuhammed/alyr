// The Documents screens' pure parts (ALY-146, spec 015): money, the totals a draft shows while
// it is typed, the filters of the list and the link they travel in, and what is still missing
// before a draft can be issued. No React, no fetch: `documents.test.mjs` runs these under
// `node --test`, and the totals are checked against the same vectors the engine's own tests use
// (`apps/api/tests/test_documents_money.py`), because a total on screen that differs from the
// total on paper by one dirham is the worst bug this feature can have.
//
// The rule (spec 011): a line's quantity times its price is rounded half up to a whole minor
// unit, the discount comes off, tax is worked out on that and rounded the same way, nothing is
// added up and then rounded. Cash rounding is a line of its own. All of it is integers: a
// quantity travels as thousandths, an amount as minor units. No float touches an amount.

export type Lang = "en" | "ar";

// ── digits and numbers a person types ─────────────────────

const EASTERN = "٠١٢٣٤٥٦٧٨٩";

/** Digits typed on an Arabic keyboard become 0-9; a decimal comma or Arabic separator a dot. */
export function westernDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(EASTERN.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,،]/g, ".")
    .replace(/[\s  ]/g, "");
}

/** "12.5" (as typed, in the currency's major unit) to minor units; null when it is not an amount. */
export function parseMoney(text: string, exponent = 2): number | null {
  const clean = westernDigits(text);
  if (!clean) return null;
  const match = /^(\d{1,9})(?:\.(\d*))?$/.exec(clean);
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > exponent) return null;
  return Number(match[1]) * 10 ** exponent + Number(fraction.padEnd(exponent, "0") || 0);
}

/** Minor units back to what an input holds: 1250 → "12.50", 1200 → "12". */
export function inputMoney(minor: number | null | undefined, exponent = 2): string {
  if (minor === null || minor === undefined) return "";
  const scale = 10 ** exponent;
  const whole = Math.trunc(minor / scale);
  const fraction = String(Math.abs(minor) % scale).padStart(exponent, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** "2", "0.5", "12.250" to thousandths (2000, 500, 12250); null when it is not a quantity the
 *  engine takes (more than zero, at most three decimals). */
export function parseQuantity(text: string): number | null {
  const clean = westernDigits(text);
  const match = /^(\d{1,9})(?:\.(\d{0,3}))?$/.exec(clean);
  if (!match) return null;
  const milli = Number(match[1]) * 1000 + Number((match[2] ?? "").padEnd(3, "0") || 0);
  return milli > 0 ? milli : null;
}

/** Thousandths back to the text the API takes: 2000 → "2", 500 → "0.5". */
export function quantityText(milli: number): string {
  const whole = Math.trunc(milli / 1000);
  const fraction = String(milli % 1000).padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

// ── how an amount is written ─────────────────────────────

/** 1250000 → "12,500.00" (exponent 2). Western digits, a comma between thousands. */
export function plain(minor: number, exponent = 2): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const scale = 10 ** exponent;
  const whole = Math.trunc(abs / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return sign + whole + (exponent ? `.${String(abs % scale).padStart(exponent, "0")}` : "");
}

/** «QAR 127.00» and «127.00 ر.ق»: the amount and its currency as each language writes them. */
export function written(minor: number, currency: string, exponent: number, symbolAr: string, lang: Lang): string {
  return lang === "ar" ? `${plain(minor, exponent)} ${symbolAr || currency}` : `${currency} ${plain(minor, exponent)}`;
}

// ── the totals of a draft, as the engine works them ─────────

/** Round a non-negative integer ratio half up: (a / b). */
function halfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

export type LineInput = { milli: number; price: number; discount: number; rateBp: number };
export type LineAmounts = { gross: number; net: number; tax: number; total: number };

/** gross = round(qty × price), net = gross − discount, tax = round(net × rate), total = net + tax.
 *  Null when the discount is more than the line (the engine refuses that too). */
export function lineAmounts(line: LineInput): LineAmounts | null {
  const gross = halfUp(line.milli * line.price, 1000);
  const net = gross - line.discount;
  if (net < 0) return null;
  const tax = halfUp(net * line.rateBp, 10000);
  return { gross, net, tax, total: net + tax };
}

/** The difference cash rounding makes: 12703 with a step of 5 gives +2, 12702 gives −2. */
export function roundToStep(total: number, step: number): number {
  if (step <= 0) return 0;
  return Math.floor((2 * total + step) / (2 * step)) * step - total;
}

export type DraftTotals = {
  gross: number; discount: number; tax: number; rounding: number; total: number; valid: boolean;
};

/** What the form shows under the lines. `rounds` is whether the shop's cash rounding applies to
 *  this kind (a receipt, an invoice, a deposit receipt). Invalid when a line cannot be worked out. */
export function draftTotals(lines: (LineInput | null)[], cashStep: number, rounds: boolean): DraftTotals {
  let gross = 0;
  let discount = 0;
  let tax = 0;
  let valid = true;
  for (const line of lines) {
    const amounts = line && lineAmounts(line);
    if (!line || !amounts) { valid = false; continue; }
    gross += amounts.net + line.discount;
    discount += line.discount;
    tax += amounts.tax;
  }
  const subtotal = gross - discount + tax;
  const rounding = rounds ? roundToStep(subtotal, cashStep) : 0;
  return { gross, discount, tax, rounding, total: subtotal + rounding, valid };
}

// ── the list's filters, and the link they travel in ───────

export type Filters = {
  q: string; kind: string; status: string; payment: string[]; delivery: string;
  branch: string; from: string; to: string;
};

export const NO_FILTERS: Filters = {
  q: "", kind: "", status: "", payment: [], delivery: "", branch: "", from: "", to: "",
};

/** What the home screen's two cards open (`catalog.py`, `listing.PRESETS` in the API): the same
 *  filters, spelled out, so the list shows exactly the rows the card counted. */
export const PRESETS: Record<string, Partial<Filters>> = {
  unpaid_invoices: { kind: "invoice", status: "issued", payment: ["unpaid", "part"] },
  not_delivered: { status: "issued", delivery: "not_delivered" },
};

export function presetFilters(show: string | null | undefined): Filters | null {
  const preset = show ? PRESETS[show] : undefined;
  return preset ? { ...NO_FILTERS, ...preset } : null;
}

/** The query string the API takes for these filters. */
export function filtersToQuery(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.kind) p.set("kind", f.kind);
  if (f.status) p.set("status", f.status);
  if (f.payment.length) p.set("payment", f.payment.join(","));
  if (f.delivery) p.set("delivery", f.delivery);
  if (f.branch) p.set("branch", f.branch);
  if (f.from) p.set("date_from", f.from);
  if (f.to) p.set("date_to", f.to);
  return p;
}

/** How many filters (apart from the search) are on: the number on the "Filters" button. */
export function activeFilterCount(f: Filters): number {
  return [f.kind, f.status, f.payment.length ? "x" : "", f.delivery, f.branch, f.from, f.to].filter(Boolean).length;
}

/** The two dates, in order, as a pair that is usable ("" for none). */
export function orderedDates(from: string, to: string): { from: string; to: string } {
  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}

// ── what a row says about itself ─────────────────────────

export type RowLike = {
  kind: string; status: string; total_minor: number; paid_minor: number; balance_minor: number;
};

/** The one word of money state a row carries: paid, part, unpaid; or null where it does not
 *  apply (a quote, a delivery note, a credit note, a draft or a cancelled paper). */
export function moneyState(row: RowLike): "paid" | "part" | "unpaid" | null {
  if (row.status !== "issued") return null;
  if (!["receipt", "invoice", "deposit_receipt", "statement"].includes(row.kind)) return null;
  if (row.total_minor <= 0) return null;
  if (row.paid_minor >= row.total_minor) return "paid";
  return row.paid_minor > 0 ? "part" : "unpaid";
}

export const DELIVERY_STATES = ["none", "queued", "sent", "delivered", "not_delivered"] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

/** The state a pill shows for a document: a draft was never sent and is not "not sent yet". */
export function deliveryPill(status: string, state: string): DeliveryState | null {
  if (status === "draft") return null;
  return (DELIVERY_STATES as readonly string[]).includes(state) ? (state as DeliveryState) : "none";
}

// ── what a draft still needs before it can be issued ─────

export type DraftCheck = {
  kind: string; needsCustomer: boolean; customerName: string; lineCount: number; lineTexts: string[];
  lineErrors: boolean; total: number; allowsZero: boolean; paid: number; wantsPayment: "full" | "deposit" | "none" | "optional";
};

/** The things to put right, as codes the screen words in the person's language. The engine
 *  checks them again when the document is issued; this is so the person is told before. */
export function missingForIssue(d: DraftCheck): string[] {
  const missing: string[] = [];
  if (d.needsCustomer && !d.customerName.trim()) missing.push("customer");
  if (d.lineCount === 0) missing.push("lines");
  else if (d.lineTexts.some((t) => !t.trim())) missing.push("line_text");
  if (d.lineErrors) missing.push("line_amount");
  if (!d.allowsZero && d.lineCount > 0 && !d.lineErrors && d.total <= 0) missing.push("total");
  if (d.wantsPayment === "deposit" && d.paid <= 0) missing.push("deposit");
  return missing;
}

// ── settings: what changed since it was saved ───────────

/** The fields of `edited` that differ from `saved`, to send as the update (and to try out in
 *  the preview). Objects (terms and notes per kind) are compared by their content. */
export function settingsDiff<T extends Record<string, unknown>>(saved: T, edited: T): Partial<T> {
  const changes: Partial<T> = {};
  for (const key of Object.keys(edited) as (keyof T)[]) {
    if (JSON.stringify(saved[key]) !== JSON.stringify(edited[key])) changes[key] = edited[key];
  }
  return changes;
}

/** Hex colour as the engine takes it: "#8a1c2b"; null for nothing, "" is not valid. */
export function cleanColour(text: string): string | null | "" {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const withHash = t.startsWith("#") ? t : `#${t}`;
  return /^#[0-9a-f]{6}$/.test(withHash) ? withHash : "";
}

// ── the activity record, as lines of text ───────────────

export type ActivityRow = { action: string; detail: Record<string, unknown>; actor: string; at: string };

/** A key and its pieces for one line of a document's activity; the screen words it. */
export function activityLine(row: ActivityRow): { key: string; channels: string; to: string } {
  const channels = Array.isArray(row.detail.channels) ? (row.detail.channels as string[]).join(" + ") : "";
  return { key: row.action, channels, to: String(row.detail.to ?? "") };
}

/** The shop's date and time for an instant, as a short line: "19 Oct, 14:05" (Doha time). */
export function whenText(iso: string, lang: Lang): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-QA-u-nu-latn" : "en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Qatar",
  }).format(when);
}

/** A calendar date ("2026-10-19") written out: "19 Oct 2026" / "19 أكتوبر 2026" (Western digits). */
export function dateText(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "";
  const when = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(when.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-QA-u-nu-latn" : "en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(when);
}

/** The wa.me link that opens the person's own WhatsApp on a customer's chat with the message
 *  written, for an owner who sends from their own phone (ALY-141). A Qatar number typed without
 *  its code (eight digits) gets 974, as everywhere in ALYR; with no phone, wa.me asks who to
 *  send it to. */
export function waLink(phone: string, text: string): string {
  let digits = westernDigits(phone).replace(/\D/g, "").replace(/^00/, "");
  if (digits.length === 8) digits = `974${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
