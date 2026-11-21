// The shapes the Credit screens read, kept apart from the code that draws them. Money in dirhams, times as ISO text.
import type { CreditAccountRow, CreditEntry, Payment } from "./logic.ts";

export type OpenOrder = {
  id: string;
  number: number;
  customerName: string;
  status: "new" | "confirmed" | "ready";
  amount: number;
  limit: number;
  owes: number;
};

export type ReminderEvent =
  | { id: string; kind: "promise"; at: string; until: string }
  | { id: string; kind: "reminder"; at: string; tone: "gentle" | "firm" | "final"; amount: number; readAt: string | null; by: string };

export type EarlierStatement = { id: string; number: string; at: string; amount: number; read: boolean };

export type PromiseRecord = { madeAt: string; via: "button" | "staff"; until: string; amount: number | null; note: string };

/** What the account page shows beyond the book: each part is optional, and a missing one is not drawn. */
export type AccountExtras = {
  since: string | null;
  promise: PromiseRecord | null;
  reminders: ReminderEvent[] | null;
  /** A deposit that belongs to the customer and is not part of this account. */
  separate: { amount: number; booking: number } | null;
  lastStatement: EarlierStatement | null;
  email: string | null;
};

export type CreditData = {
  now: string;
  shop: { name: string; nameAr: string; phone: string; address: string };
  rows: CreditAccountRow[];
  /** Money taken in the month, or null when there is no source for it. */
  payments: Payment[] | null;
  openOrders: OpenOrder[] | null;
  team: readonly { id: string; name: string }[];
  /** Each customer's book of entries. */
  books: Record<string, CreditEntry[]>;
  extras: Record<string, Partial<AccountExtras>>;
  /** The pay link a reminder or statement carries, or null when the shop takes no money online. */
  payLink: string | null;
  /** The sentence that stands in for the link in a reminder when there is none. */
  payHow: string | null;
  bank: { name: string; account: string; iban: string } | null;
  earlier: EarlierStatement[] | null;
  nextStatementNumber: string;
  lastStatementEnd: string | null;
};
