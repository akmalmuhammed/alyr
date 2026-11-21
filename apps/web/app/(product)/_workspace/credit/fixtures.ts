// Sample data for the Credit screens: the fictional Nuqta Car Care and its customers (all invented). It has
// the shape of the API's answers (`GET /api/ledger/summary` and `.../customers/{id}/entries`), so the
// same screens read real data when the shell wires them in. Every total on a screen is counted from these
// fields; none is typed in.
import {
  type Buckets, type CreditAccountRow, type CreditEntry, type Lang, type Payment, emptyBuckets,
} from "./logic.ts";
import type { CreditData, EarlierStatement, OpenOrder, PromiseRecord, ReminderEvent } from "./types.ts";

/** The moment the sample is read at: Thu 12 Nov 2026, 09:40 in Doha. */
export const PREVIEW_NOW = "2026-11-12T09:40:00+03:00";

export const SHOP = { name: "Nuqta Car Care", nameAr: "نقطة لتلميع السيارات", phone: "+974 5555 0100", address: "Street 15, Gate 4, Doha" };

export const TEAM = [
  { id: "u-bilal", name: "Bilal" },
  { id: "u-hana", name: "Hana" },
  { id: "u-omar", name: "Omar" },
  { id: "u-reem", name: "Reem" },
  { id: "u-salma", name: "Salma" },
  { id: "u-yusuf", name: "Yusuf" },
] as const;

const who = (name: string) => TEAM.find((m) => m.name === name) ?? null;
const qar = (riyals: number) => riyals * 100;
/** Orders print with a hash: Order #1028. */
const HASH = "Order #";

function row(
  id: string, name: string, phone: string, balance: number, oldestDays: number, buckets: Partial<Buckets>,
  limit: number | null, assignee: string, rest: Partial<CreditAccountRow> = {},
): CreditAccountRow {
  return {
    id, name, phone, balance: qar(balance), oldestDays,
    buckets: Object.fromEntries(Object.entries({ ...emptyBuckets(), ...buckets }).map(([k, v]) => [k, qar(v)])) as Buckets,
    creditLimit: limit === null ? null : qar(limit),
    overLimit: limit !== null && limit > 0 && balance > limit,
    promisedUntil: null, promisePassed: false, promisePassedOn: null, lastRemindedAt: null, remindersSent: null,
    lastInboundAt: null, assigned: who(assignee), optedOut: false, optedOutAt: null, lang: "en" as Lang,
    ...rest,
  };
}

/** Fourteen customers with a limit or a balance; eleven owe, three owe nothing. */
export const ACCOUNTS: CreditAccountRow[] = [
  row("gulf-courier", "Gulf Courier W.L.L.", "+974 5555 0140", 3240, 25, { d0_30: 3240 }, 6000, "Omar"),
  row("bayview-school", "Bayview School", "+974 5555 0151", 1360, 72, { d61_90: 1360 }, 2000, "Omar", {
    lastRemindedAt: "2026-11-01T11:05:00+03:00", remindersSent: 2, lastInboundAt: "2026-11-03T08:30:00+03:00",
  }),
  row("bluefin", "Bluefin Events", "+974 5555 0188", 1264, 41, { d0_30: 224, d31_60: 1040 }, 1500, "Hana", {
    promisePassed: true, promisePassedOn: "2026-11-09T00:00:00+03:00", lastRemindedAt: "2026-11-02T10:05:00+03:00", remindersSent: 1,
    lastInboundAt: "2026-11-11T17:52:00+03:00",
  }),
  row("dana-home", "Dana Home Services", "+974 5555 0131", 1150, 28, { d0_30: 1150 }, 2000, "Reem"),
  row("palm-court", "Palm Court Offices", "+974 5555 0171", 1080, 38, { d31_60: 1080 }, 1500, "Salma", {
    lastRemindedAt: "2026-11-09T16:20:00+03:00", remindersSent: 1,
  }),
  row("omar-ali", "Omar Ali", "+974 5555 0121", 480, 112, { d90_plus: 480 }, 400, "Salma", {
    lastRemindedAt: "2026-11-01T10:30:00+03:00", remindersSent: 4, lastInboundAt: "2026-11-12T07:54:00+03:00",
  }),
  row("noor-abdullah", "Noor Abdullah", "+974 5555 0125", 450, 45, { d31_60: 450 }, 500, "Salma", {
    promisedUntil: "2026-11-18T00:00:00+03:00", lastRemindedAt: "2026-11-09T09:15:00+03:00", remindersSent: 1,
  }),
  row("sara-haddad", "Sara Haddad", "+974 5555 0118", 310, 94, { d90_plus: 310 }, 500, "Bilal", {
    optedOut: true, optedOutAt: "2026-10-21T13:10:00+03:00", lastRemindedAt: "2026-10-18T10:00:00+03:00", remindersSent: 2,
  }),
  row("rashid-mahmoud", "Rashid Mahmoud", "+974 5555 0134", 250, 15, { d0_30: 250 }, 500, "Hana"),
  row("layla-farouk", "Layla Farouk", "+974 5555 0138", 136, 6, { d0_30: 136 }, 500, "Yusuf"),
  row("aisha-hamad", "Aisha Hamad", "+974 5555 0112", 120, 10, { d0_30: 120 }, 500, "Hana"),
  row("mariam-saleh", "Mariam Saleh", "+974 5555 0199", 0, 0, {}, 2500, "Hana"),
  row("fatima-darwish", "Fatima Darwish", "+974 5555 0166", 0, 0, {}, 1000, "Omar"),
  row("khalid-nasser", "Khalid Nasser", "+974 5555 0144", 0, 0, {}, 500, "Salma"),
];

/** Money taken in November that the owner wrote down (or a pay link confirmed). */
export const PAYMENTS: Payment[] = [
  { id: "p-1", at: "2026-11-11T14:20:00+03:00", customerId: "gulf-courier", customerName: "Gulf Courier W.L.L.", amount: qar(1500), method: "bank_transfer", by: "Omar" },
  { id: "p-2", at: "2026-11-10T11:02:00+03:00", customerId: "dana-home", customerName: "Dana Home Services", amount: qar(400), method: "link", by: "Your provider" },
  { id: "p-3", at: "2026-11-05T16:45:00+03:00", customerId: "palm-court", customerName: "Palm Court Offices", amount: qar(380), method: "cheque", by: "Salma" },
  { id: "p-4", at: "2026-11-02T09:30:00+03:00", customerId: "rashid-mahmoud", customerName: "Rashid Mahmoud", amount: qar(200), method: "cash", by: "Hana" },
];

/** Orders put on account that are not handed over yet, so not in the balance. */
export const OPEN_ORDERS: OpenOrder[] = [
  { id: "o-1040", number: 1040, customerName: "Gulf Courier W.L.L.", status: "new", amount: qar(2730), limit: qar(6000), owes: qar(3240) },
  { id: "o-1031", number: 1031, customerName: "Dana Home Services", status: "ready", amount: qar(360), limit: qar(2000), owes: qar(1150) },
  { id: "o-1035", number: 1035, customerName: "Bayview School", status: "confirmed", amount: qar(232), limit: qar(2000), owes: qar(1360) },
  { id: "o-1029", number: 1029, customerName: "Palm Court Offices", status: "ready", amount: qar(120), limit: qar(1500), owes: qar(1080) },
];

const entry = (
  id: string, kind: CreditEntry["kind"], amount: number, at: string, ref: string, by: string, note: string,
  extra: Partial<CreditEntry> = {},
): CreditEntry => ({ id, kind, amount: qar(amount), at, ref, against: null, note, by, method: null, ...extra });

/** Bluefin Events' book, newest last. */
export const BLUEFIN_ENTRIES: CreditEntry[] = [
  entry("e-1", "sale", 360, "2026-09-05T13:30:00+03:00", "INV-2026-0297", "Hana", "6 × Full wash · the first sale on account"),
  entry("e-2", "payment", 360, "2026-09-21T10:12:00+03:00", "TRX-71920", "Omar", "Bank transfer · sent from Omar's WhatsApp: \"Bluefin paid 360\"", { method: "bank_transfer" }),
  entry("e-3", "sale", 1620, "2026-10-02T09:12:00+03:00", "INV-2026-0358", "Omar", "6 × Interior detail, 8 × Full wash, 3 × Engine bay clean"),
  entry("e-4", "reversal", 80, "2026-10-06T11:15:00+03:00", "CN-2026-0009", "Omar", "1 × Engine bay clean was not done · taken off INV-2026-0358", { against: "INV-2026-0358" }),
  entry("e-5", "payment", 500, "2026-10-14T18:02:00+03:00", "PL-2026-100782", "Your provider", "Paid by pay link, credit card · receipt R-2026-1688", { method: "link" }),
  entry("e-6", "sale", 224, "2026-11-12T09:26:00+03:00", HASH + "1028", "Yusuf", "12 × Air freshener · New car, 2 × Glass cleaner · handed over"),
];

export const ACCOUNT_DETAILS: Record<string, { entries: CreditEntry[]; since: string; promise: PromiseRecord | null }> = {
  bluefin: {
    entries: BLUEFIN_ENTRIES,
    since: "2026-09-05T13:30:00+03:00",
    promise: { madeAt: "2026-11-02T10:12:00+03:00", via: "button", until: "2026-11-09T00:00:00+03:00", amount: qar(1040), note: "" },
  },
};

/** What happened around the reminders sent to Bluefin Events, newest first. */
export const BLUEFIN_REMINDERS: ReminderEvent[] = [
  { id: "r-1", kind: "promise", at: "2026-11-02T10:12:00+03:00", until: "2026-11-09T00:00:00+03:00" },
  { id: "r-2", kind: "reminder", at: "2026-11-02T10:05:00+03:00", tone: "gentle", amount: qar(1040), readAt: "2026-11-02T10:11:00+03:00", by: "Hana" },
];

export const EARLIER_STATEMENTS: EarlierStatement[] = [
  { id: "s-6", number: "ST-2026-0006", at: "2026-11-01T10:00:00+03:00", amount: qar(1040), read: true },
  { id: "s-3", number: "ST-2026-0003", at: "2026-10-01T10:00:00+03:00", amount: 0, read: true },
];

export const BANK = { name: "Sample Bank", account: "Nuqta Car Care W.L.L.", iban: "QA00 SMPL 0000 0000 0000 1234 5678" };
export const PAY_LINK = "pay.alyr.qa/nuqta/s9d2-k1vb";

const AGE_OF_NEWER: Record<keyof Buckets, number> = { d0_30: 3, d31_60: 35, d61_90: 65, d90_plus: 95 };

/**
 * A book for a sample customer that has no hand-written one: one sale per age bucket that holds money,
 * the oldest as old as the account says. It reads back to the same balance, buckets and age
 * (a test holds it to that), so the account screen and the list never disagree.
 */
export function sampleBook(account: CreditAccountRow): CreditEntry[] {
  const keys = (["d90_plus", "d61_90", "d31_60", "d0_30"] as const).filter((k) => account.buckets[k] > 0);
  return keys.map((k, i) => {
    const days = i === 0 ? account.oldestDays : AGE_OF_NEWER[k];
    const at = new Date(Date.parse(PREVIEW_NOW) - days * 86_400_000 - 3_600_000).toISOString();
    return {
      id: `${account.id}-${k}`, kind: "sale" as const, amount: account.buckets[k], at,
      ref: `INV-2026-${String(300 + i + account.id.length).padStart(4, "0")}`, against: null,
      note: "Put on account", by: account.assigned?.name ?? "", method: null,
    };
  });
}

/** An account's book: Bluefin's own, or a sample one made from its row. */
export function bookOf(account: CreditAccountRow): CreditEntry[] {
  return ACCOUNT_DETAILS[account.id]?.entries ?? sampleBook(account);
}

/** Everything the preview page shows: Bluefin Events has its own history, the others a book made from their row. */
export function previewData(): CreditData {
  const books: Record<string, CreditEntry[]> = {};
  for (const a of ACCOUNTS) books[a.id] = bookOf(a);
  return {
    now: PREVIEW_NOW,
    shop: SHOP,
    rows: ACCOUNTS,
    payments: PAYMENTS,
    openOrders: OPEN_ORDERS,
    team: TEAM,
    books,
    extras: {
      bluefin: {
        since: ACCOUNT_DETAILS.bluefin.since,
        promise: ACCOUNT_DETAILS.bluefin.promise,
        reminders: BLUEFIN_REMINDERS,
        separate: { amount: qar(300), booking: 54 },
        lastStatement: EARLIER_STATEMENTS[0],
        email: "accounts@bluefinevents.example",
      },
    },
    payLink: PAY_LINK,
    payHow: null,
    bank: BANK,
    earlier: EARLIER_STATEMENTS,
    nextStatementNumber: "ST-2026-0007",
    lastStatementEnd: "2026-11-01T23:59:00+03:00",
  };
}
