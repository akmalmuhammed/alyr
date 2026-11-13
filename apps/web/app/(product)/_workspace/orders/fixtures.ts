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
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

export const FIXTURE_ORDERS: OrderRowFixture[] = [
  {
    id: "ord-1042",
    number: 1042,
    status: "new",
    payment: "unpaid",
    pay_link: "open",
    total: 37500,
    customer: "Aisha Al-Kuwari",
    contact_id: "c-1042",
    phone: "97455550112",
    created_at: minutesAgo(18), // 18 min ago (late!)
    fulfilment: {
      mode: "delivery",
      fee: 2500,
      zone: "Al Dafna",
      zone_ar: "الدفنة",
      address: "Villa 12, Street 840, Zone 66",
      note: "Please ring the bell twice",
      deliver_on: new Date().toISOString(),
    },
    items: [
      {
        name: "Switch",
        name_ar: "مفتاح كهربائي",
        quantity: 1,
        variant: "Single pole",
        variant_ar: "قطب واحد",
        sku: "SW-01",
        price: 8500,
        line_total: 8500,
      },
      {
        name: "Cable 2.5 mm",
        name_ar: "سلك كهربائي 2.5 مم",
        quantity: 2,
        variant: "100 m reel",
        variant_ar: "بكرة 100 م",
        sku: "CB-25",
        price: 13250,
        line_total: 26500,
      },
    ],
  },
  {
    id: "ord-1041",
    number: 1041,
    status: "new",
    payment: "unpaid",
    pay_link: "open",
    total: 12000,
    customer: "Khalid Al-Hajri",
    contact_id: "c-1041",
    phone: "97455550113",
    created_at: minutesAgo(4), // 4 min ago
    fulfilment: {
      mode: "pickup",
      fee: 0,
    },
    items: [
      {
        name: "Socket",
        name_ar: "مقبس كهرباء",
        quantity: 4,
        variant: "Double 13A",
        variant_ar: "مزدوج 13 أمبير",
        sku: "SK-13",
        price: 3000,
        line_total: 12000,
      },
    ],
  },
  {
    id: "ord-1040",
    number: 1040,
    status: "confirmed",
    payment: "paid",
    total: 17000,
    customer: "Fatima Al-Thani",
    contact_id: "c-1040",
    phone: "97455550114",
    created_at: minutesAgo(35),
    fulfilment: {
      mode: "pickup",
      fee: 0,
    },
    assigned: { id: "u-salma", name: "Salma" },
    items: [
      {
        name: "Switch",
        name_ar: "مفتاح كهربائي",
        quantity: 2,
        variant: "Two gang",
        variant_ar: "مزدوج",
        sku: "SW-02",
        price: 8500,
        line_total: 17000,
      },
    ],
  },
  {
    id: "ord-1039",
    number: 1039,
    status: "ready",
    payment: "paid",
    total: 42500,
    customer: "Yousef Al-Baker",
    contact_id: "c-1039",
    phone: "97455550115",
    created_at: minutesAgo(50),
    fulfilment: {
      mode: "delivery",
      fee: 0,
      zone: "West Bay",
      zone_ar: "الخليج الغربي",
      address: "Tower 4, Floor 18, Flat 1802",
      note: "Leave with reception",
      deliver_on: new Date().toISOString(),
    },
    assigned: { id: "u-salma", name: "Salma" },
    items: [
      {
        name: "Cable 2.5 mm",
        name_ar: "سلك كهربائي 2.5 مم",
        quantity: 5,
        variant: "100 m reel",
        variant_ar: "بكرة 100 م",
        sku: "CB-25",
        price: 8500,
        line_total: 42500,
      },
    ],
  },
  {
    id: "ord-1038",
    number: 1038,
    status: "ready",
    payment: "paid",
    total: 8500,
    customer: "Mariam Al-Sulaiti",
    contact_id: "c-1038",
    phone: "97455550116",
    created_at: hoursAgo(1),
    fulfilment: {
      mode: "pickup",
      fee: 0,
    },
    items: [
      {
        name: "Switch",
        name_ar: "مفتاح كهربائي",
        quantity: 1,
        variant: "Single pole",
        variant_ar: "قطب واحد",
        sku: "SW-01",
        price: 8500,
        line_total: 8500,
      },
    ],
  },
  {
    id: "ord-1037",
    number: 1037,
    status: "confirmed",
    payment: "unpaid",
    total: 30000,
    customer: "Hassan Al-Nuaimi",
    contact_id: "c-1037",
    phone: "97455550117",
    created_at: hoursAgo(2),
    fulfilment: {
      mode: "pickup",
      fee: 0,
    },
    assigned: { id: "u-yusuf", name: "Yusuf" },
    items: [
      {
        name: "Socket",
        name_ar: "مقبس كهرباء",
        quantity: 10,
        variant: "Double 13A",
        variant_ar: "مزدوج 13 أمبير",
        sku: "SK-13",
        price: 3000,
        line_total: 30000,
      },
    ],
  },
  {
    id: "ord-1036",
    number: 1036,
    status: "done",
    payment: "paid",
    total: 25500,
    customer: "Noor Al-Kuwari",
    contact_id: "c-1036",
    phone: "97455550118",
    created_at: hoursAgo(3),
    fulfilment: {
      mode: "delivery",
      fee: 3000,
      zone: "The Pearl",
      zone_ar: "اللؤلؤة",
      address: "Porto Arabia, Tower 12",
      deliver_on: new Date().toISOString(),
    },
    items: [
      {
        name: "Switch",
        name_ar: "مفتاح كهربائي",
        quantity: 3,
        variant: "Single pole",
        variant_ar: "قطب واحد",
        sku: "SW-01",
        price: 7500,
        line_total: 22500,
      },
    ],
  },
  {
    id: "ord-1035",
    number: 1035,
    status: "done",
    payment: "paid",
    total: 8500,
    customer: "Salem Al-Marri",
    contact_id: "c-1035",
    phone: "97455550119",
    created_at: hoursAgo(4),
    fulfilment: {
      mode: "pickup",
      fee: 0,
    },
    items: [
      {
        name: "Cable 2.5 mm",
        name_ar: "سلك كهربائي 2.5 مم",
        quantity: 1,
        variant: "100 m reel",
        variant_ar: "بكرة 100 م",
        sku: "CB-25",
        price: 8500,
        line_total: 8500,
      },
    ],
  },
  {
    id: "ord-1034",
    number: 1034,
    status: "done",
    payment: "paid",
    total: 18000,
    customer: "Dana Al-Ansari",
    contact_id: "c-1034",
    phone: "97455550120",
    created_at: daysAgo(1),
    fulfilment: {
      mode: "delivery",
      fee: 3000,
      zone: "Lusail",
      zone_ar: "لوسيل",
      address: "Fox Hills, Building 4",
      deliver_on: daysAgo(1),
    },
    items: [
      {
        name: "Socket",
        name_ar: "مقبس كهرباء",
        quantity: 6,
        variant: "Double 13A",
        variant_ar: "مزدوج 13 أمبير",
        sku: "SK-13",
        price: 2500,
        line_total: 15000,
      },
    ],
  },
  {
    id: "ord-1033",
    number: 1033,
    status: "done",
    payment: "paid",
    total: 34000,
    customer: "Ali Al-Kuwari",
    contact_id: "c-1033",
    phone: "97455550121",
    created_at: daysAgo(2),
    fulfilment: {
      mode: "pickup",
      fee: 0,
    },
    items: [
      {
        name: "Switch",
        name_ar: "مفتاح كهربائي",
        quantity: 4,
        variant: "Single pole",
        variant_ar: "قطب واحد",
        sku: "SW-01",
        price: 8500,
        line_total: 34000,
      },
    ],
  },
  {
    id: "ord-1032",
    number: 1032,
    status: "done",
    payment: "paid",
    total: 85000,
    customer: "Omar Al-Attiyah",
    contact_id: "c-1032",
    phone: "97455550122",
    created_at: daysAgo(3),
    fulfilment: {
      mode: "delivery",
      fee: 2500,
      zone: "Al Sadd",
      zone_ar: "السد",
      address: "Suhaim Bin Hamad St",
      deliver_on: daysAgo(3),
    },
    document: {
      id: "doc-rc-0004",
      kind: "receipt",
      number: "RC-0004",
      status: "issued",
    },
    items: [
      {
        name: "Cable 2.5 mm",
        name_ar: "سلك كهربائي 2.5 مم",
        quantity: 10,
        variant: "100 m reel",
        variant_ar: "بكرة 100 م",
        sku: "CB-25",
        price: 8250,
        line_total: 82500,
      },
    ],
  },
  {
    id: "ord-1031",
    number: 1031,
    status: "done",
    payment: "paid",
    total: 6000,
    customer: "Reem Al-Mohannadi",
    contact_id: "c-1031",
    phone: "97455550123",
    created_at: daysAgo(4),
    fulfilment: {
      mode: "pickup",
      fee: 0,
    },
    items: [
      {
        name: "Socket",
        name_ar: "مقبس كهرباء",
        quantity: 2,
        variant: "Double 13A",
        variant_ar: "مزدوج 13 أمبير",
        sku: "SK-13",
        price: 3000,
        line_total: 6000,
      },
    ],
  },
  {
    id: "ord-1030",
    number: 1030,
    status: "cancelled",
    payment: "unpaid",
    total: 8500,
    customer: "Nasser Al-Kaabi",
    contact_id: "c-1030",
    phone: "97455550124",
    created_at: daysAgo(5),
    fulfilment: {
      mode: "pickup",
      fee: 0,
    },
    items: [
      {
        name: "Switch",
        name_ar: "مفتاح كهربائي",
        quantity: 1,
        variant: "Single pole",
        variant_ar: "قطب واحد",
        sku: "SW-01",
        price: 8500,
        line_total: 8500,
      },
    ],
  },
  {
    id: "ord-1029",
    number: 1029,
    status: "done",
    payment: "paid",
    total: 25500,
    customer: "Mona Al-Khater",
    contact_id: "c-1029",
    phone: "97455550125",
    created_at: daysAgo(6),
    fulfilment: {
      mode: "delivery",
      fee: 2500,
      zone: "Al Rayyan",
      zone_ar: "الريان",
      address: "Al Shafi Street",
      deliver_on: daysAgo(6),
    },
    items: [
      {
        name: "Cable 2.5 mm",
        name_ar: "سلك كهربائي 2.5 مم",
        quantity: 3,
        variant: "100 m reel",
        variant_ar: "بكرة 100 م",
        sku: "CB-25",
        price: 7666,
        line_total: 23000,
      },
    ],
  },
];

export const FIXTURE_COUNTS = {
  all: 14,
  open: 5,
  new: 2,
  confirmed: 2,
  ready: 2,
  done: 7,
  cancelled: 1,
  pickup: 9,
  delivery: 5,
};

export const FIXTURE_LATE_NEW = {
  count: 1,
  items: [{ number: 1042, minutes: 18 }],
};

export const FIXTURE_OPEN_TOTAL = 107000; // QAR 1,070

export const FIXTURE_TEAM = [
  { id: "u-salma", name: "Salma Al-Mansoor", email: "salma@example.com", role: "admin" },
  { id: "u-yusuf", name: "Yusuf Al-Baker", email: "yusuf@example.com", role: "agent" },
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
