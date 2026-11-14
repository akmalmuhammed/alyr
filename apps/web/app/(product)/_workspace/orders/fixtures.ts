/**
 * Mock fixtures for redesigned Orders area (J01).
 * Matches the 14 orders in Table O from orders-02.js (#1029–#1042).
 */

import type { OrderItemLine } from "./logic";

export interface OrderRowFixture {
  id: string;
  number: number;
  status: "new" | "confirmed" | "ready" | "done" | "cancelled";
  payment: "paid" | "unpaid" | "on_account";
  pay_link?: "open";
  total: number;
  total_text?: string;
  subtotal?: number;
  discount_total?: number;
  delivery_fee?: number;
  customer: string;
  contact_id: string;
  phone: string;
  created_at: string;
  test?: boolean;
  table?: string;
  fulfilment?: {
    mode: "pickup" | "delivery";
    fee: number;
    fee_text?: string;
    zone?: string;
    zone_ar?: string;
    address?: string;
    note?: string;
    deliver_on?: string;
  };
  fulfil_on?: string;
  items: OrderItemLine[];
  price_group?: {
    name: string;
    name_ar?: string;
    is_default: boolean;
  };
  assigned?: {
    id: string;
    name: string;
  };
  document?: {
    id: string;
    kind: "receipt" | "invoice";
    number: string;
    status: "issued" | "draft" | "cancelled";
  };
}

export interface OrderDetailFixture {
  order: OrderRowFixture;
  lines: OrderItemLine[];
  customer: {
    id: string;
    name: string;
    phone: string;
    lang: "ar" | "en";
    window_until?: string | null;
    opted_out: boolean;
  };
  payment: {
    state: "paid" | "unpaid" | "on_account";
    link?: "open" | null;
    link_sent_at?: string | null;
    paid_at?: string | null;
    method?: string | null;
    reference?: string | null;
    recorded_by?: string | null;
  };
  activity: Array<{
    action: string;
    actor_name: string;
    detail?: Record<string, unknown>;
    channel?: string;
    created_at: string;
  }>;
  document?: {
    id: string;
    kind: "receipt" | "invoice";
    number: string;
    status: string;
  };
  track_url: string;
  access: {
    can_manage: boolean;
    can_record_payments: boolean;
    can_cancel: boolean;
    receipt_on_payment: boolean;
  };
}

const NOW = Date.now();
const minutesAgo = (m: number) => new Date(NOW - m * 60 * 1000).toISOString();
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString();

export const FIXTURE_ORDERS: OrderRowFixture[] = [
  {
    id: "ord-1042",
    number: 1042,
    status: "new",
    payment: "unpaid",
    pay_link: "open",
    total: 11000,
    subtotal: 11000,
    delivery_fee: 0,
    customer: "Aisha Hamad",
    contact_id: "c-1042",
    phone: "97455550112",
    created_at: minutesAgo(4), // 09:36, 4 min ago
    fulfilment: {
      mode: "pickup",
      fee: 0,
      zone: "Al Sadd",
      zone_ar: "السد",
      note: "Pickup at Al Sadd · today",
    },
    items: [
      {
        name: "Carnauba wax",
        name_ar: "شمع كارنوبا",
        quantity: 1,
        variant: "250 ml",
        variant_ar: "250 مل",
        sku: "WAX-250",
        price: 6500,
        line_total: 6500,
      },
      {
        name: "Tyre shine",
        name_ar: "ملمع إطارات",
        quantity: 1,
        variant: "400 ml",
        variant_ar: "400 مل",
        sku: "TYR-400",
        price: 3000,
        line_total: 3000,
      },
      {
        name: "Air freshener",
        name_ar: "معطر جو",
        quantity: 1,
        variant: "Oud",
        variant_ar: "عود",
        sku: "AIR-OUD",
        price: 1500,
        line_total: 1500,
      },
    ],
  },
  {
    id: "ord-1041",
    number: 1041,
    status: "new",
    payment: "unpaid",
    total: 7200,
    subtotal: 7200,
    delivery_fee: 0,
    customer: "Khalid Nasser",
    contact_id: "c-1041",
    phone: "97455550113",
    created_at: minutesAgo(18), // 09:22, 18 min ago (late!)
    fulfilment: {
      mode: "pickup",
      fee: 0,
      zone: "Lusail",
      zone_ar: "لوسيل",
      note: "Pickup at Lusail · today",
    },
    items: [
      {
        name: "Microfibre cloth pack",
        name_ar: "مناشف مايكروفايبر",
        quantity: 2,
        variant: "Pack of 6 · Grey",
        variant_ar: "عبوة 6 قطع · رمادي",
        sku: "MF-06G",
        price: 2500,
        line_total: 5000,
      },
      {
        name: "Glass cleaner",
        name_ar: "منظف زجاج",
        quantity: 1,
        variant: "500 ml",
        variant_ar: "500 مل",
        sku: "GLS-500",
        price: 2200,
        line_total: 2200,
      },
    ],
  },
  {
    id: "ord-1040",
    number: 1040,
    status: "new",
    payment: "on_account",
    total: 273000,
    subtotal: 273000,
    delivery_fee: 0,
    customer: "Gulf Courier W.L.L.",
    contact_id: "c-1040",
    phone: "97455550150",
    created_at: minutesAgo(22), // 09:18, 22 min ago (late!)
    fulfilment: {
      mode: "pickup",
      fee: 0,
      zone: "Industrial Area",
      zone_ar: "المنطقة الصناعية",
      note: "Pickup at Industrial Area · today",
    },
    items: [
      {
        name: "Fleet wash plan",
        name_ar: "باقة غسيل أسطول",
        quantity: 14,
        variant: "Per car, monthly · December",
        variant_ar: "لكل سيارة شهرياً · ديسمبر",
        sku: "PLN-FLT",
        price: 18000,
        line_total: 252000,
      },
      {
        name: "Air freshener",
        name_ar: "معطر جو",
        quantity: 14,
        variant: "Citrus",
        variant_ar: "حمضيات",
        sku: "AIR-CIT",
        price: 1500,
        line_total: 21000,
      },
    ],
  },
  {
    id: "ord-1039",
    number: 1039,
    status: "confirmed",
    payment: "paid",
    total: 18500,
    subtotal: 18500,
    delivery_fee: 0,
    customer: "Yousef Hassan",
    contact_id: "c-1039",
    phone: "97455550102",
    created_at: minutesAgo(28), // 09:12, 28 min ago
    assigned: { id: "u-salma", name: "Salma" },
    fulfilment: {
      mode: "delivery",
      fee: 0,
      zone: "West Bay",
      zone_ar: "الخليج الغربي",
      address: "Tower 4, West Bay",
      deliver_on: new Date().toISOString(),
    },
    items: [
      {
        name: "Carnauba wax",
        name_ar: "شمع كارنوبا",
        quantity: 1,
        variant: "500 ml · Applicator pad",
        variant_ar: "500 مل · وسادة توزيع",
        sku: "WAX-500P",
        price: 11300,
        line_total: 11300,
      },
      {
        name: "Microfibre cloth pack",
        name_ar: "مناشف مايكروفايبر",
        quantity: 2,
        variant: "Pack of 6 · Grey",
        variant_ar: "عبوة 6 قطع · رمادي",
        sku: "MF-06G",
        price: 2500,
        line_total: 5000,
      },
      {
        name: "Glass cleaner",
        name_ar: "منظف زجاج",
        quantity: 1,
        variant: "500 ml",
        variant_ar: "500 مل",
        sku: "GLS-500",
        price: 2200,
        line_total: 2200,
      },
    ],
  },
  {
    id: "ord-1038",
    number: 1038,
    status: "confirmed",
    payment: "paid",
    total: 25000,
    subtotal: 25000,
    delivery_fee: 0,
    customer: "Mariam Saleh",
    contact_id: "c-1038",
    phone: "97455550117",
    created_at: minutesAgo(35), // 09:05, 35 min ago
    assigned: { id: "u-salma", name: "Salma" },
    fulfilment: {
      mode: "pickup",
      fee: 0,
      zone: "West Bay",
      zone_ar: "الخليج الغربي",
    },
    items: [
      {
        name: "5-wash card",
        name_ar: "بطاقة 5 غسلات",
        quantity: 1,
        variant: "Standard",
        variant_ar: "عادي",
        sku: "CRD-05",
        price: 25000,
        line_total: 25000,
      },
    ],
  },
  {
    id: "ord-1037",
    number: 1037,
    status: "confirmed",
    payment: "unpaid",
    total: 9000,
    subtotal: 9000,
    delivery_fee: 0,
    customer: "Fatima Darwish",
    contact_id: "c-1037",
    phone: "97455550125",
    created_at: minutesAgo(42), // 08:58, 42 min ago
    assigned: { id: "u-reem", name: "Reem" },
    fulfilment: {
      mode: "delivery",
      fee: 0,
      zone: "Lusail",
      zone_ar: "لوسيل",
      address: "Fox Hills, Lusail",
      deliver_on: new Date().toISOString(),
    },
    items: [
      {
        name: "Air freshener",
        name_ar: "معطر جو",
        quantity: 3,
        variant: "Oud",
        variant_ar: "عود",
        sku: "AIR-OUD",
        price: 1500,
        line_total: 4500,
      },
      {
        name: "Tyre shine",
        name_ar: "ملمع إطارات",
        quantity: 1,
        variant: "400 ml",
        variant_ar: "400 مل",
        sku: "TYR-400",
        price: 4500,
        line_total: 4500,
      },
    ],
  },
  {
    id: "ord-1036",
    number: 1036,
    status: "confirmed",
    payment: "paid",
    total: 9000,
    subtotal: 9000,
    delivery_fee: 0,
    customer: "Rashid Al-Marri",
    contact_id: "c-1036",
    phone: "97455550134",
    created_at: minutesAgo(53), // 08:47, 53 min ago
    assigned: { id: "u-bilal", name: "Bilal" },
    fulfilment: {
      mode: "pickup",
      fee: 0,
      zone: "Al Wakra",
      zone_ar: "الوكرة",
    },
    items: [
      {
        name: "Carnauba wax",
        name_ar: "شمع كارنوبا",
        quantity: 1,
        variant: "250 ml",
        variant_ar: "250 مل",
        sku: "WAX-250",
        price: 6500,
        line_total: 6500,
      },
      {
        name: "Microfibre cloth pack",
        name_ar: "مناشف مايكروفايبر",
        quantity: 1,
        variant: "Pack of 6 · Blue",
        variant_ar: "عبوة 6 قطع · أزرق",
        sku: "MF-06B",
        price: 2500,
        line_total: 2500,
      },
    ],
  },
  {
    id: "ord-1035",
    number: 1035,
    status: "confirmed",
    payment: "on_account",
    total: 23200,
    subtotal: 23200,
    delivery_fee: 0,
    customer: "Bayview School",
    contact_id: "c-1035",
    phone: "97455550160",
    created_at: minutesAgo(59), // 08:41, 59 min ago
    assigned: { id: "u-reem", name: "Reem" },
    fulfilment: {
      mode: "delivery",
      fee: 0,
      zone: "Al Sadd",
      zone_ar: "السد",
      address: "Sports City Street, Al Sadd",
      deliver_on: new Date().toISOString(),
    },
    items: [
      {
        name: "Glass cleaner",
        name_ar: "منظف زجاج",
        quantity: 6,
        variant: "500 ml",
        variant_ar: "500 مل",
        sku: "GLS-500",
        price: 2200,
        line_total: 13200,
      },
      {
        name: "Microfibre cloth pack",
        name_ar: "مناشف مايكروفايبر",
        quantity: 4,
        variant: "Pack of 6 · Grey",
        variant_ar: "عبوة 6 قطع · رمادي",
        sku: "MF-06G",
        price: 2500,
        line_total: 10000,
      },
    ],
  },
  {
    id: "ord-1034",
    number: 1034,
    status: "confirmed",
    payment: "paid",
    total: 6000,
    subtotal: 6000,
    delivery_fee: 0,
    customer: "Noor Abdullah",
    contact_id: "c-1034",
    phone: "97455550118",
    created_at: minutesAgo(70), // 08:30, 1 h 10 min ago
    assigned: { id: "u-salma", name: "Salma" },
    fulfilment: {
      mode: "pickup",
      fee: 0,
      zone: "Al Sadd",
      zone_ar: "السد",
    },
    items: [
      {
        name: "Tyre shine",
        name_ar: "ملمع إطارات",
        quantity: 2,
        variant: "400 ml",
        variant_ar: "400 مل",
        sku: "TYR-400",
        price: 3000,
        line_total: 6000,
      },
    ],
  },
  {
    id: "ord-1033",
    number: 1033,
    status: "ready",
    payment: "paid",
    total: 26500,
    subtotal: 26500,
    delivery_fee: 0,
    customer: "Layla Farouk",
    contact_id: "c-1033",
    phone: "97455550141",
    created_at: minutesAgo(88), // 08:12, 1 h 28 min ago
    assigned: { id: "u-yusuf", name: "Yusuf" },
    fulfilment: {
      mode: "pickup",
      fee: 0,
      zone: "Lusail",
      zone_ar: "لوسيل",
    },
    items: [
      {
        name: "5-wash card",
        name_ar: "بطاقة 5 غسلات",
        quantity: 1,
        variant: "Standard",
        variant_ar: "عادي",
        sku: "CRD-05",
        price: 25000,
        line_total: 25000,
      },
      {
        name: "Air freshener",
        name_ar: "معطر جو",
        quantity: 1,
        variant: "New car",
        variant_ar: "سيارة جديدة",
        sku: "AIR-NEW",
        price: 1500,
        line_total: 1500,
      },
    ],
  },
  {
    id: "ord-1032",
    number: 1032,
    status: "ready",
    payment: "unpaid",
    total: 11000,
    subtotal: 11000,
    delivery_fee: 0,
    customer: "Omar Ali",
    contact_id: "c-1032",
    phone: "97455550130",
    created_at: minutesAgo(105), // 07:55, 1 h 45 min ago
    assigned: { id: "u-salma", name: "Salma" },
    fulfilment: {
      mode: "pickup",
      fee: 0,
      zone: "West Bay",
      zone_ar: "الخليج الغربي",
    },
    items: [
      {
        name: "Carnauba wax",
        name_ar: "شمع كارنوبا",
        quantity: 1,
        variant: "500 ml",
        variant_ar: "500 مل",
        sku: "WAX-500",
        price: 11000,
        line_total: 11000,
      },
    ],
  },
  {
    id: "ord-1031",
    number: 1031,
    status: "ready",
    payment: "on_account",
    total: 36000,
    subtotal: 36000,
    delivery_fee: 0,
    customer: "Dana Home Services",
    contact_id: "c-1031",
    phone: "97455550170",
    created_at: minutesAgo(120), // 07:40, 2 h ago
    assigned: { id: "u-reem", name: "Reem" },
    fulfilment: {
      mode: "delivery",
      fee: 0,
      zone: "Industrial Area",
      zone_ar: "المنطقة الصناعية",
      address: "Street 24, Industrial Area",
      deliver_on: new Date().toISOString(),
    },
    items: [
      {
        name: "Microfibre cloth pack",
        name_ar: "مناشف مايكروفايبر",
        quantity: 10,
        variant: "Pack of 6 · Grey",
        variant_ar: "عبوة 6 قطع · رمادي",
        sku: "MF-06G",
        price: 2500,
        line_total: 25000,
      },
      {
        name: "Glass cleaner",
        name_ar: "منظف زجاج",
        quantity: 5,
        variant: "500 ml",
        variant_ar: "500 مل",
        sku: "GLS-500",
        price: 2200,
        line_total: 11000,
      },
    ],
  },
  {
    id: "ord-1030",
    number: 1030,
    status: "ready",
    payment: "paid",
    total: 17500,
    subtotal: 17500,
    delivery_fee: 0,
    customer: "Sara Haddad",
    contact_id: "c-1030",
    phone: "97455550145",
    created_at: hoursAgo(14), // Wed 11 Nov 20:15
    assigned: { id: "u-bilal", name: "Bilal" },
    fulfilment: {
      mode: "delivery",
      fee: 0,
      zone: "Al Wakra",
      zone_ar: "الوكرة",
      address: "Zone 90, Al Wakra",
      deliver_on: new Date().toISOString(),
    },
    items: [
      {
        name: "Carnauba wax",
        name_ar: "شمع كارنوبا",
        quantity: 2,
        variant: "250 ml",
        variant_ar: "250 مل",
        sku: "WAX-250",
        price: 6500,
        line_total: 13000,
      },
      {
        name: "Tyre shine",
        name_ar: "ملمع إطارات",
        quantity: 1,
        variant: "400 ml",
        variant_ar: "400 مل",
        sku: "TYR-400",
        price: 4500,
        line_total: 4500,
      },
    ],
  },
  {
    id: "ord-1029",
    number: 1029,
    status: "ready",
    payment: "on_account",
    total: 12000,
    subtotal: 12000,
    delivery_fee: 0,
    customer: "Palm Court Offices",
    contact_id: "c-1029",
    phone: "97455550180",
    created_at: hoursAgo(15), // Wed 11 Nov 19:02
    assigned: { id: "u-salma", name: "Salma" },
    fulfilment: {
      mode: "pickup",
      fee: 0,
      zone: "West Bay",
      zone_ar: "الخليج الغربي",
    },
    items: [
      {
        name: "Air freshener",
        name_ar: "معطر جو",
        quantity: 8,
        variant: "Citrus",
        variant_ar: "حمضيات",
        sku: "AIR-CIT",
        price: 1500,
        line_total: 12000,
      },
    ],
  },
];

export const FIXTURE_COUNTS = {
  all: 230,
  open: 14,
  new: 3,
  confirmed: 6,
  ready: 5,
  done: 212,
  cancelled: 4,
  pickup: 9,
  delivery: 5,
};

export const FIXTURE_LATE_NEW = {
  count: 2,
  items: [
    { number: 1041, minutes: 18 },
    { number: 1040, minutes: 22 },
  ],
};

export const FIXTURE_OPEN_TOTAL = 484900; // QAR 4,849

export const FIXTURE_TEAM = [
  { id: "u-hana", name: "Hana", email: "hana@nuqtacarcare.qa", role: "owner" },
  { id: "u-omar", name: "Omar", email: "omar@nuqtacarcare.qa", role: "admin" },
  { id: "u-salma", name: "Salma", email: "salma@nuqtacarcare.qa", role: "admin" },
  { id: "u-yusuf", name: "Yusuf", email: "yusuf@nuqtacarcare.qa", role: "agent" },
  { id: "u-bilal", name: "Bilal", email: "bilal@nuqtacarcare.qa", role: "agent" },
  { id: "u-reem", name: "Reem", email: "reem@nuqtacarcare.qa", role: "agent" },
];

export const FIXTURE_ACCESS = {
  can_manage: true,
  can_record_payments: true,
  can_cancel: true,
  receipt_on_payment: true,
};

export function getFixtureDetail(orderNoOrId: string | number): OrderDetailFixture | null {
  const num = parseInt(String(orderNoOrId).replace(/^#/, "").replace(/^ord-/, ""), 10);
  const row = FIXTURE_ORDERS.find((o) => o.number === num || o.id === String(orderNoOrId));
  if (!row) return null;

  const lines = row.items;
  const isPaid = row.payment === "paid";

  const activity: OrderDetailFixture["activity"] = [
    {
      action: "placed",
      actor_name: row.customer,
      channel: "web",
      created_at: row.created_at,
    },
  ];

  if (row.status !== "new") {
    activity.push({
      action: "confirmed",
      actor_name: row.assigned ? row.assigned.name : "Salma",
      channel: "workspace",
      created_at: minutesAgo(30),
    });
  }

  if (row.status === "ready" || row.status === "done") {
    activity.push({
      action: "ready",
      actor_name: row.assigned ? row.assigned.name : "Salma",
      channel: "workspace",
      created_at: minutesAgo(15),
    });
  }

  if (row.status === "done") {
    activity.push({
      action: "done",
      actor_name: row.assigned ? row.assigned.name : "Salma",
      channel: "workspace",
      created_at: minutesAgo(5),
    });
  }

  if (row.status === "cancelled") {
    activity.push({
      action: "cancelled",
      actor_name: "Salma",
      detail: { reason: "Customer requested cancellation", stock_returned: 1 },
      channel: "workspace",
      created_at: minutesAgo(10),
    });
  }

  if (isPaid) {
    activity.push({
      action: "paid",
      actor_name: "Salma",
      detail: { method: row.id === "ord-1039" ? "link" : "cash", amount: row.total },
      channel: row.id === "ord-1039" ? "meta" : "workspace",
      created_at: minutesAgo(25),
    });
  }

  return {
    order: row,
    lines,
    customer: {
      id: row.contact_id,
      name: row.customer,
      phone: row.phone,
      lang: "ar",
      window_until: new Date(NOW + 23 * 3600 * 1000).toISOString(),
      opted_out: false,
    },
    payment: {
      state: row.payment,
      link: row.pay_link || null,
      link_sent_at: row.pay_link ? minutesAgo(18) : null,
      paid_at: isPaid ? minutesAgo(25) : null,
      method: isPaid ? (row.id === "ord-1039" ? "link" : "cash") : null,
      reference: isPaid ? "TR-9821" : null,
      recorded_by: isPaid ? "Salma" : null,
    },
    activity,
    document: row.document,
    track_url: `http://web.test/t/demo?t=signed-token-${row.number}`,
    access: FIXTURE_ACCESS,
  };
}
