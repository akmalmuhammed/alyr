// Reads the ledger API's answers into the shapes the Credit screens use. Pure: nothing is invented and nothing is
// filled in from sample data. A field the API does not send is null, and the screen draws nothing for it (see requests.md:
// the summary does not send the credit limit, the reminder count, the last message or the day a STOP came).
import type { Buckets, CreditAccountRow, CreditEntry, Lang, PayMethod } from "./logic.ts";

export type SummaryCustomer = {
  id: string;
  name: string | null;
  phone: string | null;
  lang?: string | null;
  balance: number;
  oldest_days: number;
  buckets: Buckets;
  over_limit: boolean;
  opted_out: boolean;
  promised_until: string | null;
  promise_passed: boolean;
  last_reminded_at: string | null;
  assigned: { id: string; name: string } | null;
};

export type Summary = { shop: { name: string; name_ar: string | null }; outstanding: number; customers: SummaryCustomer[] };

export function rowsFromSummary(summary: Summary): CreditAccountRow[] {
  return summary.customers.map((c) => ({
    id: c.id,
    name: c.name ?? "",
    phone: c.phone ?? "",
    balance: c.balance,
    oldestDays: c.oldest_days,
    buckets: c.buckets,
    creditLimit: null,
    overLimit: c.over_limit,
    promisedUntil: c.promised_until,
    promisePassed: c.promise_passed,
    promisePassedOn: null,
    lastRemindedAt: c.last_reminded_at,
    remindersSent: null,
    lastInboundAt: null,
    assigned: c.assigned,
    optedOut: c.opted_out,
    optedOutAt: null,
    lang: (c.lang === "ar" ? "ar" : "en") as Lang,
  }));
}

export type EntryJson = {
  kind: string;
  amount: number;
  note: string;
  created_by: string;
  created_at: string;
  document?: { number?: string } | null;
};

/** The entries the API sends, newest first, as the screen's book. An adjustment that adds counts as a sale. */
export function entriesFromApi(entries: readonly EntryJson[]): CreditEntry[] {
  return entries.map((e, i) => {
    const kind = e.kind === "payment" ? "payment" : e.kind === "sale" || (e.kind === "adjustment" && e.amount > 0) ? "sale" : "reversal";
    return {
      id: `${e.created_at}-${i}`,
      kind,
      amount: Math.abs(e.amount),
      at: e.created_at,
      ref: e.document?.number ?? "",
      against: null,
      note: e.note,
      by: e.created_by,
      method: null,
    };
  });
}

export type ReminderResult = { sent: number; skippedPromised: number; skippedRecent: number; skippedOptedOut: number };

export function reminderResult(json: { sent: number; skipped_promised: number; skipped_recent: number; skipped_opted_out: number }): ReminderResult {
  return { sent: json.sent, skippedPromised: json.skipped_promised, skippedRecent: json.skipped_recent, skippedOptedOut: json.skipped_opted_out };
}

/** The body of `POST /api/documents/payments` for a customer's balance (the money was already received). */
export function paymentBody(input: { accountId: string; amount: number; method: PayMethod; reference: string }) {
  return { subject: "credit", id: input.accountId, amount_minor: input.amount, method: input.method, reference: input.reference };
}
