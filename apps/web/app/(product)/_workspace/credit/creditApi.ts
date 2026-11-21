// The calls the Credit screens make. Each one throws when the API refuses or cannot be reached: nothing here falls back to
// sample data, and nothing reports a send that did not happen. The shell passes these to `CreditWorkbench` as its `actions`.
import { api } from "../../../_ui/api";
import { entriesFromApi, paymentBody, reminderResult, rowsFromSummary, type EntryJson, type ReminderResult, type Summary } from "./creditMap";
import type { CreditAccountRow, CreditEntry } from "./logic";
import type { PaymentInput } from "./CreditPaymentDialog";

export async function loadSummary(): Promise<{ shopName: string; rows: CreditAccountRow[] }> {
  const summary = await api<Summary>("/api/ledger/summary");
  return { shopName: summary.shop.name, rows: rowsFromSummary(summary) };
}

export async function loadEntries(contactId: string): Promise<CreditEntry[]> {
  const body = await api<{ entries: EntryJson[] }>(`/api/ledger/customers/${contactId}/entries`);
  return entriesFromApi(body.entries);
}

/** Reminds every customer the rules reach whose oldest sale is at least `minDays` old (the API's own run). */
export async function sendReminders(minDays: number): Promise<ReminderResult> {
  const json = await api<{ sent: number; skipped_promised: number; skipped_recent: number; skipped_opted_out: number }>(
    "/api/ledger/reminders", { method: "POST", body: { min_days: minDays } },
  );
  return reminderResult(json);
}

export async function assignFollowUp(contactId: string, userId: string | null): Promise<void> {
  await api(`/api/ledger/customers/${contactId}/assign`, { method: "POST", body: { user_id: userId } });
}

/** Writes down money the owner already received. The key makes a second press return the same payment. */
export async function recordPayment(input: PaymentInput): Promise<void> {
  await api("/api/documents/payments", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: paymentBody(input),
  });
}
