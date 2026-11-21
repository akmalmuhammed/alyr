/**
 * The shapes the Inbox screens draw (J04). They follow what the API returns today
 * (`GET /api/inbox/conversations`, `/conversations/{id}`, `/customer/{id}`, `GET /api/messages/not-sent`);
 * a field the API does not send is optional here, and a screen draws it only when it is there.
 */

/** A text in both languages (a line ALYR writes, or a name the shop entered in both). */
export type Bi = { en: string; ar: string };

/** A message's delivery, from the message's own `status` (and the time of that status when the API gives one). */
export type Delivery = {
  status: "queued" | "sent" | "delivered" | "read" | "failed" | "blocked" | "preview";
  at?: string;
  /** Why a refused or failed message did not go: the API's `blocked` code, or WhatsApp's words. */
  reason?: string;
};

export type ThreadMessage = {
  kind: "message";
  id: string;
  at: string;
  direction: "in" | "out";
  /** Who sent an outbound message: a person's first name, or "auto" for an automatic reply. */
  by?: string;
  /** What was written: a plain string is the customer's or a person's own words; a pair is ALYR's line. */
  text: string | Bi;
  /** Quick-reply button labels sent with the message. */
  buttons?: Bi[];
  delivery?: Delivery;
};

export type ThreadNote = { kind: "note"; id: string; at: string; author: string; text: string };

/** What the team or the customer did, as `activity` rows give it (`subject`, `action`, `detail`). */
export type ActivityAction = "booked" | "paid_deposit" | "asked_person" | "took" | "closed" | "reopened";
export type ThreadActivity = {
  kind: "activity";
  id: string;
  at: string;
  action: ActivityAction;
  actor: string;
  detail?: { number?: number; service?: Bi; amount?: number; startsAt?: string; outcome?: string; reason?: string };
};

export type ThreadItem = ThreadMessage | ThreadNote | ThreadActivity;

export type CustomerOrder = {
  number: number;
  /** What was on the order: the shop's own item names. */
  items?: Bi;
  at: string;
  paid: boolean;
  /** Dirhams (the API sends whole dirhams as integers; `money()` writes riyals). */
  total: number;
};

export type CustomerBooking = {
  number: number;
  startsAt: string;
  service: Bi;
  /** Minutes. */
  length?: number;
  status: "booked" | "confirmed" | "pending";
  depositPaid?: number;
  receipt?: string;
};

export type Agreement = { state: "agreed" | "not_agreed" | "not_asked"; at?: string };

/** The right pane. `spent12mo` and `balanceOwed` are absent for the agent role: the server does not send them. */
export type CustomerContext = {
  id: string;
  name: string;
  phone: string;
  since?: string;
  visits: number;
  spent12mo?: number;
  balanceOwed?: number;
  /** Where the debt began; the "for N days" is counted from it. */
  owedSince?: string;
  ordersTotal?: number;
  nextBooking: CustomerBooking | null;
  lastVisit?: { service: Bi; at: string };
  orders: CustomerOrder[];
  consent: { service: Agreement; offers: Agreement; backInStock?: Agreement };
  priceGroup?: Bi;
  writesIn?: ("ar" | "en")[];
};

export type Role = "owner" | "admin" | "agent";

/** One row of `GET /api/messages/not-sent`. */
export type NotSentReason =
  | "window_closed" | "opted_out" | "no_consent" | "no_marketing_consent" | "no_back_in_stock_consent"
  | "billing_paused" | "gave_up" | "whatsapp";

export type NotSentRow = {
  id: string;
  contactId: string;
  customer: string;
  phone: string;
  body: string | Bi;
  status: "blocked" | "failed";
  reason: NotSentReason;
  /** WhatsApp's own words, in English, when it was WhatsApp that refused. */
  whatsappSaid?: string | null;
  createdAt: string;
  canRetry: boolean;
  /** Why it cannot go now: a reason above, or "file_lost". */
  whyNot: string | null;
};

export type ClosedRow = {
  id: string;
  customer: string | null;
  phone: string;
  outcome: "sold" | "booked" | "answered" | "lost";
  /** For a lost customer, the reason a person picked. */
  reason?: "price" | "not_available" | "no_reply" | "went_elsewhere" | "other";
  booking?: number;
  order?: { number: number; total: number };
  note?: string | Bi;
  /** What the person who closed it wrote for the team, and how long the chat was. */
  teamNote?: string;
  messages?: number;
  minutes?: number;
  by: string;
  at: string;
};

export type ClosedData = {
  rows: ClosedRow[];
  /** Closed this week and by Thursday last week, for the first figure. */
  week: { total: number; lastWeekToDate: number };
  /** Dirhams of orders closed as sold this week (an aggregate: owners and admins only). */
  soldValue?: number;
  /** Daily counts since the week began (the shop's week starts on Sunday), per outcome, for the sparklines. */
  trend: Record<"total" | "sold" | "booked" | "answered" | "lost", number[]>;
  whyLost: { reason: NonNullable<ClosedRow["reason"]>; count: number }[];
  /** Minutes: today, this week's median; and how many waited over 15 minutes. */
  firstAnswer: { today: number; median: number; waitedOver15: number };
};

export type SavedReply = { id: string; title: Bi | string; body: Bi | string };

export type Template = {
  id: string;
  name: Bi;
  /** utility or marketing: marketing needs the customer's OK to offers. */
  category: "utility" | "marketing";
  /** Why it cannot go to this customer (shown with a lock), or null when it can. */
  blocked: Bi | null;
  preview: Bi;
  buttons?: Bi;
};
