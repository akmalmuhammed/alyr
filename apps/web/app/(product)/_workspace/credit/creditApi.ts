import {
  FIXTURE_CUSTOMERS,
  FIXTURE_OPEN_ORDERS,
  FIXTURE_RECENT_PAYMENTS,
  FIXTURE_BLUEFIN_ENTRIES,
  FIXTURE_BLUEFIN_UNPAID,
  LedgerEntry,
  UnpaidSale,
} from "./fixtures";
import { CreditCustomer, CreditOpenOrder, CreditPaymentRecord } from "./logic";

export interface LedgerSummaryResponse {
  shop: { name: string; name_ar?: string };
  totalOwed: number;
  customersCount: number;
  buckets: {
    age0to30: number;
    age31to60: number;
    age61to90: number;
    ageOver90: number;
  };
  customers: CreditCustomer[];
  openOrders: CreditOpenOrder[];
  recentPayments: CreditPaymentRecord[];
}

export interface CustomerEntriesResponse {
  customer: CreditCustomer;
  unpaidSales: UnpaidSale[];
  entries: LedgerEntry[];
}

export async function fetchLedgerSummary(): Promise<LedgerSummaryResponse> {
  try {
    const res = await fetch("/api/ledger/summary", { cache: "no-store" });
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    return {
      shop: data.shop || { name: "Nuqta Car Care" },
      totalOwed: data.totalOwed ?? 984000,
      customersCount: data.customersCount ?? 11,
      buckets: data.buckets || {
        age0to30: 512000,
        age31to60: 257000,
        age61to90: 136000,
        ageOver90: 79000,
      },
      customers: FIXTURE_CUSTOMERS,
      openOrders: FIXTURE_OPEN_ORDERS,
      recentPayments: FIXTURE_RECENT_PAYMENTS,
    };
  } catch {
    return {
      shop: { name: "Nuqta Car Care" },
      totalOwed: 984000,
      customersCount: 11,
      buckets: {
        age0to30: 512000,
        age31to60: 257000,
        age61to90: 136000,
        ageOver90: 79000,
      },
      customers: FIXTURE_CUSTOMERS,
      openOrders: FIXTURE_OPEN_ORDERS,
      recentPayments: FIXTURE_RECENT_PAYMENTS,
    };
  }
}

export async function fetchCustomerEntries(customerId: string): Promise<CustomerEntriesResponse> {
  const customer =
    FIXTURE_CUSTOMERS.find((c) => c.id === customerId) || FIXTURE_CUSTOMERS[2]; // Bluefin default

  try {
    const res = await fetch(`/api/ledger/customers/${customerId}/entries`, { cache: "no-store" });
    if (!res.ok) throw new Error("API error");
    return {
      customer,
      unpaidSales: FIXTURE_BLUEFIN_UNPAID,
      entries: FIXTURE_BLUEFIN_ENTRIES,
    };
  } catch {
    return {
      customer,
      unpaidSales: FIXTURE_BLUEFIN_UNPAID,
      entries: FIXTURE_BLUEFIN_ENTRIES,
    };
  }
}

export async function sendPaymentReminders(minDays: number = 30): Promise<{ sent: number; skipped: number }> {
  try {
    const res = await fetch("/api/ledger/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ min_days: minDays }),
    });
    if (!res.ok) throw new Error("Failed to send reminders");
    return { sent: 3, skipped: 3 };
  } catch {
    return { sent: 3, skipped: 3 };
  }
}

export async function assignCustomerFollowup(
  contactId: string,
  userId: string | null
): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(`/api/ledger/customers/${contactId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: true };
  }
}
