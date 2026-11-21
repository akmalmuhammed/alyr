/**
 * The shapes the Orders API answers with (`GET /api/orders`, `GET /api/orders/{id}`), as the screens
 * read them. Money is integer dirhams (100 = QAR 1); the `*_text` fields the API also sends are never
 * printed (the kit's `money()` writes every figure). Types only: erasable, so `node --test` loads them.
 */

export type OrderStatus = "new" | "confirmed" | "ready" | "done" | "cancelled";
export type PaymentState = "paid" | "unpaid" | "on_account";
export type PayMethod = "cash" | "bank_transfer" | "card_terminal" | "cheque";
export type Mode = "pickup" | "delivery";

export interface OrderItem {
  name: string;
  name_ar?: string;
  quantity: number;
  unit?: string;
  unit_shown?: boolean;
  variant?: string | null;
  variant_ar?: string;
  options?: string[];
  options_ar?: string[];
  /** The code of the item (the API's `sku`; the screens say "Code"). */
  sku?: string | null;
  /** The price of one, in dirhams. */
  price?: number;
  discount?: number;
}

export interface OrderDiscount {
  text?: string;
  text_ar?: string;
  amount?: number;
  returned?: boolean;
}

export interface Fulfilment {
  mode: Mode;
  fee: number;
  zone?: string | null;
  zone_ar?: string | null;
  address?: string | null;
  note?: string | null;
  deliver_on?: string | null;
}

export interface DocumentRef {
  id: string;
  kind: "receipt" | "invoice" | "quote" | string;
  number: string;
  status: "issued" | "draft" | "cancelled" | string;
}

export interface Order {
  id: string;
  number: number;
  status: OrderStatus;
  payment: PaymentState;
  pay_link?: "open";
  total: number;
  subtotal?: number;
  discount_total?: number;
  discounts?: OrderDiscount[];
  customer: string;
  contact_id: string;
  phone: string;
  created_at: string;
  test?: boolean;
  table?: string | null;
  fulfilment?: Fulfilment | null;
  items: OrderItem[];
  price_group?: { name: string; name_ar?: string | null; is_default: boolean } | null;
  assigned?: { id: string; name: string } | null;
  document?: DocumentRef;
}

export interface OrderLine {
  name: string;
  name_ar?: string;
  variant?: string | null;
  variant_ar?: string;
  options?: string[];
  options_ar?: string[];
  code?: string | null;
  quantity: number;
  unit?: string;
  unit_shown?: boolean;
  unit_price: number;
  line_total: number;
  discount?: number;
}

export interface ActivityRow {
  action: string;
  actor_name?: string | null;
  detail?: Record<string, unknown>;
  channel?: string | null;
  created_at?: string | null;
}

export interface OrderDetail {
  order: Order;
  lines: OrderLine[];
  customer: {
    id: string;
    name: string;
    phone: string;
    lang: "ar" | "en";
    window_until?: string | null;
    opted_out: boolean;
  };
  payment: {
    state: PaymentState;
    link?: "open" | null;
    link_sent_at?: string | null;
    paid_at?: string | null;
    method?: string | null;
    reference?: string | null;
    recorded_by?: string | null;
    amount_minor?: number | null;
  };
  activity: ActivityRow[];
  document?: DocumentRef;
  track_url: string;
  access: Access;
}

export interface Access {
  can_manage: boolean;
  can_record_payments: boolean;
  can_cancel: boolean;
  receipt_on_payment: boolean;
}

export interface Counts {
  all: number;
  open: number;
  new: number;
  confirmed: number;
  ready: number;
  done: number;
  cancelled: number;
  pickup: number;
  delivery: number;
}

export interface LateNew {
  count: number;
  items: Array<{ number: number; minutes: number }>;
}

/** What one order earns, from the costs the shop keeps (`GET /api/orders/margins`, owners and admins). */
export interface Margin {
  revenue: number;
  cost: number;
  amount: number;
  pct: number;
  complete: boolean;
}

export interface OrdersList {
  slug: string;
  orders: Order[];
  total: number;
  counts: Counts;
  late_new: LateNew;
  /** Only owners and admins receive it; the key is absent for an agent. */
  open_total?: number;
  access: Access;
  /** The server's clock, when it sends one; the screens fall back to the device clock. */
  now?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  role: string;
}
