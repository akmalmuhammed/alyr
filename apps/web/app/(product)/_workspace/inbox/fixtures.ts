/**
 * Exact fixtures matching the designer drawings in Figma (inbox-01.js, inbox-02.js, inbox-03.js).
 */

import type { ConversationItem } from "./logic";

export interface MessageItem {
  id: string;
  type: "message" | "activity" | "note" | "separator";
  sender?: string;
  text?: string;
  time?: string;
  direction?: "in" | "out";
  status?: string;
  failed?: string;
  arabic?: boolean;
  buttons?: string;
  icon?: string;
}

export interface CustomerContextData {
  id: string;
  name: string;
  first: string;
  phone: string;
  lang: string;
  by: string;
  took: string;
  tags: string[];
  visits: string;
  spent: string;
  since: string;
  credit: boolean;
  owesAmount?: string;
  owesDays?: number;
  owesNote?: string;
  booking?: {
    id: string;
    number: number;
    time: string;
    title: string;
    sub: string;
    deposit: string;
  } | null;
  orders: Array<{ name: string; number: string; total: string }>;
  allow: Array<{ purpose: string; status: string; off?: boolean }>;
}

export const FIXTURE_CONVERSATIONS: ConversationItem[] = [
  {
    id: "yh-1039",
    name: "Yousef Hassan",
    phone: "+974 5555 0102",
    status: "open",
    assistant_paused: false,
    opted_out: false,
    window_open: true,
    unread: 0,
    assigned: { id: "u-auto", name: "Automatic replies" },
    last: {
      body: "Auto: Paid. Order #1039 is confirmed.",
      direction: "out",
      kind: "text",
      status: "sent",
      created_at: "2026-11-12T09:38:00Z",
    },
  },
  {
    id: "gc-vans",
    name: "Gulf Courier W.L.L.",
    phone: "+974 5555 0150",
    status: "open",
    assistant_paused: false,
    opted_out: false,
    window_open: true,
    unread: 2,
    assigned: null,
    last: {
      body: "6 vans on Sunday, same as last time?",
      direction: "in",
      kind: "text",
      status: "received",
      created_at: "2026-11-12T09:36:00Z",
    },
    mark: ["wait", "Waiting 4 min"],
  },
  {
    id: "lf-book",
    name: "Layla Farouk",
    phone: "+974 5555 0141",
    status: "open",
    assistant_paused: false,
    opted_out: false,
    window_open: true,
    unread: 0,
    assigned: { id: "u-auto", name: "Automatic replies" },
    last: {
      body: "Auto: Booked. Full wash, Fri 17:00",
      direction: "out",
      kind: "text",
      status: "sent",
      created_at: "2026-11-12T09:36:00Z",
    },
  },
  {
    id: "fd-card",
    name: "Fatima Darwish",
    phone: "+974 5555 0122",
    status: "open",
    assistant_paused: true,
    opted_out: false,
    window_open: true,
    unread: 1,
    assigned: { id: "u-salma", name: "Salma" },
    last: {
      body: "Is the 5-wash card still valid?",
      direction: "in",
      kind: "text",
      status: "received",
      created_at: "2026-11-12T09:33:00Z",
    },
    mark: ["wait", "Waiting 7 min"],
  },
  {
    id: "rm-148",
    name: "Rashid Mahmoud",
    phone: "+974 5555 0134",
    status: "open",
    assistant_paused: true,
    opted_out: false,
    window_open: true,
    window_closes_at: "2026-11-13T09:27:00Z",
    unread: 0,
    assigned: { id: "u-hana", name: "Hana" },
    last: {
      body: "Can I bring the car Friday night and…",
      direction: "in",
      kind: "text",
      status: "read",
      created_at: "2026-11-12T09:27:00Z",
    },
    mark: ["wait", "Waiting 12 min"],
  },
  {
    id: "na-visit",
    name: "Noor Abdullah",
    phone: "+974 5555 0133",
    status: "open",
    assistant_paused: false,
    opted_out: false,
    window_open: true,
    unread: 0,
    assigned: { id: "u-auto", name: "Automatic replies" },
    last: {
      body: "Auto: How was your visit?",
      direction: "out",
      kind: "text",
      status: "sent",
      created_at: "2026-11-12T09:20:00Z",
    },
  },
  {
    id: "kn-ar",
    name: "Khalid Nasser",
    phone: "+974 5555 0112",
    status: "open",
    assistant_paused: true,
    opted_out: false,
    window_open: true,
    unread: 0,
    assigned: { id: "u-yusuf", name: "Yusuf" },
    last: {
      body: "شكرا، أشوفكم بكرة",
      direction: "in",
      kind: "text",
      status: "read",
      created_at: "2026-11-12T08:52:00Z",
    },
    arabic: true,
  },
  {
    id: "ms-saleh",
    name: "Mariam Saleh",
    phone: "+974 5555 0117",
    status: "open",
    assistant_paused: true,
    opted_out: false,
    window_open: false,
    unread: 0,
    assigned: { id: "u-reem", name: "Reem" },
    last: {
      body: "Reem: Hi Mariam, 18:30 tomorrow is…",
      direction: "out",
      kind: "text",
      status: "failed",
      created_at: "2026-11-11T19:05:00Z",
    },
    mark: ["bad", "Not delivered"],
  },
  {
    id: "oa-ali",
    name: "Omar Ali",
    phone: "+974 5555 0108",
    status: "closed",
    assistant_paused: false,
    opted_out: false,
    window_open: false,
    unread: 0,
    assigned: { id: "u-bilal", name: "Bilal" },
    last: {
      body: "Ok, I will come next week",
      direction: "in",
      kind: "text",
      status: "read",
      created_at: "2026-11-10T14:00:00Z",
    },
    mark: ["lock", "Template only"],
  },
  {
    id: "bs-school",
    name: "Bayview School",
    phone: "+974 5555 0152",
    status: "open",
    assistant_paused: true,
    opted_out: false,
    window_open: false,
    unread: 0,
    assigned: { id: "u-omar", name: "Omar" },
    last: {
      body: "Omar: Statement for October, QAR 1,360",
      direction: "out",
      kind: "text",
      status: "failed",
      created_at: "2026-11-11T16:40:00Z",
    },
    mark: ["bad", "Not delivered"],
  },
];

export const FIXTURE_THREAD_RASHID: MessageItem[] = [
  { id: "m1", type: "message", direction: "in", text: "تمام، الساعة 8 الصبح", time: "16:06", arabic: true },
  { id: "a1", type: "activity", text: "Booking 148 made: Ceramic coating, Sat 14 Nov 08:00", time: "Wed 16:06", icon: "cal" },
  { id: "a2", type: "activity", text: "Paid the QAR 300 deposit by pay link", time: "Wed 16:11", icon: "card" },
  { id: "s1", type: "separator", text: "TODAY · THU 12 NOV" },
  { id: "m2", type: "message", direction: "in", text: "Can I bring the car Friday night and leave it with you? I travel early on Saturday.", time: "09:27" },
  { id: "m3", type: "message", direction: "out", sender: "Automatic reply", text: "A person from the team will answer you about leaving the car overnight.", time: "09:28", status: "Read 09:29" },
  { id: "a3", type: "activity", text: "Needs a person: automatic replies could not help", time: "09:28", icon: "flag" },
  { id: "n1", type: "note", sender: "Salma", text: "The shop closes at 22:00. Bilal says a car can stay inside overnight if it arrives before 21:30.", time: "09:31" },
  { id: "a4", type: "activity", text: "Hana took this conversation", time: "09:39", icon: "people" },
];

export const FIXTURE_THREAD_MARIAM: MessageItem[] = [
  { id: "s1", type: "separator", text: "TUE 10 NOV" },
  { id: "m1", type: "message", direction: "in", text: "Do you have a slot for interior detail on Thursday evening?", time: "18:12" },
  { id: "m2", type: "message", direction: "out", sender: "Automatic reply", text: "Interior detail: QAR 150, 90 minutes. Thursday 12 Nov: 17:00 or 18:30 with Yusuf.", time: "18:12", status: "Read 18:13", buttons: "17:00 · 18:30 · Another day" },
  { id: "m3", type: "message", direction: "in", text: "خليني أتأكد وأرد عليكم", time: "18:14", arabic: true },
  { id: "s2", type: "separator", text: "WED 11 NOV · WINDOW CLOSED 18:14" },
  { id: "m4", type: "message", direction: "out", sender: "Reem", text: "Hi Mariam, 18:30 tomorrow is still free. Shall I hold it for you?", time: "19:05", failed: "Not sent: more than 24 hours since her last message" },
];

export const FIXTURE_CONTEXT_RASHID: CustomerContextData = {
  id: "rm-148",
  name: "Rashid Mahmoud",
  first: "Rashid",
  phone: "+974 5555 0134",
  lang: "Arabic, English",
  by: "Hana",
  took: "09:39",
  tags: ["Regular", "Ceramic"],
  visits: "9",
  spent: "QAR 2,310",
  since: "Mar 2025",
  credit: true,
  owesAmount: "QAR 250",
  owesDays: 15,
  owesNote: "Ceramic top-up on account, 28 Oct. Limit QAR 500. No promise to pay yet.",
  booking: {
    id: "b-148",
    number: 148,
    time: "Sat 14 Nov 08:00",
    title: "Ceramic coating · 4 h · Ceramic · Bilal",
    sub: "Booked",
    deposit: "Deposit QAR 300 paid · R-2026-1893",
  },
  orders: [
    { name: "Tyre shine, Air freshener", number: "#1013 · 3 Nov · paid", total: "QAR 45" },
    { name: "Carnauba wax 500 ml", number: "#1005 · 21 Oct · paid", total: "QAR 65" },
    { name: "Microfibre cloth pack × 2", number: "#1002 · 6 Oct · paid", total: "QAR 50" },
  ],
  allow: [
    { purpose: "Bookings and receipts", status: "Agreed · 14 Mar 2025" },
    { purpose: "Offers", status: "Agreed · 2 Jun 2025" },
    { purpose: "Back in stock", status: "Not asked", off: true },
    { purpose: "Price group", status: "Standard" },
    { purpose: "Writes in", status: "Arabic, English" },
  ],
};

export const FIXTURE_CONTEXT_MARIAM: CustomerContextData = {
  id: "ms-saleh",
  name: "Mariam Saleh",
  first: "Mariam",
  phone: "+974 5555 0117",
  lang: "Arabic, English",
  by: "Reem",
  took: "Wed 19:04",
  tags: ["New this year"],
  visits: "4",
  spent: "QAR 510",
  since: "Jun 2026",
  credit: false,
  booking: null,
  orders: [
    { name: "Air freshener × 2", number: "#1010 · 2 Nov · paid", total: "QAR 30" },
    { name: "Glass cleaner", number: "#1001 · 29 Sep · paid", total: "QAR 22" },
  ],
  allow: [
    { purpose: "Bookings and receipts", status: "Agreed · 8 Jun 2026" },
    { purpose: "Offers", status: "Not agreed", off: true },
    { purpose: "Back in stock", status: "Not asked", off: true },
    { purpose: "Price group", status: "Standard" },
    { purpose: "Writes in", status: "Arabic, English" },
  ],
};

export const FIXTURE_NOT_DELIVERED = {
  stats: {
    total14d: 9,
    sentTotal: 3406,
    newYesterday: 2,
    heldBack: 6,
    failed: 3,
  },
  heldBack: [
    {
      when: "Wed 11 Nov 19:05",
      customer: "Mariam Saleh",
      phone: "+974 5555 0117",
      message: "Hi Mariam, 18:30 tomorrow is still free…",
      sender: "Typed reply · Reem",
      why: "Outside the 24-hour window",
      whySub: "She last wrote Tue 18:14",
      whenCanGo: "Once she writes again, or now as an approved template",
      canSendTemplate: true,
    },
    {
      when: "Wed 11 Nov 16:40",
      customer: "Bayview School",
      phone: "+974 5555 0152",
      message: "Statement for October, QAR 1,360. Can…",
      sender: "Typed reply · Omar",
      why: "Outside the 24-hour window",
      whySub: "They last wrote Mon 15:02",
      whenCanGo: "Once they write again, or now as an approved template",
      canSendTemplate: true,
    },
    {
      when: "Sun 8 Nov 10:00",
      customer: "Sara Haddad",
      phone: "+974 5555 0129",
      message: "Payment reminder: QAR 120 since 3 Oct",
      sender: "Template · sent by rule",
      why: "Asked for no more messages",
      whySub: "Wrote STOP on Mon 2 Nov",
      whenCanGo: "Only if she writes START",
      canSendTemplate: false,
    },
    {
      when: "Sat 7 Nov 09:00",
      customer: "Omar Ali",
      phone: "+974 5555 0108",
      message: "This weekend: Interior detail QAR 120",
      sender: "Template · offer",
      why: "Has not agreed to offers",
      whySub: "Bookings and receipts only",
      whenCanGo: "Only to a customer who agreed to offers",
      canSendTemplate: false,
    },
    {
      when: "Thu 5 Nov 12:30",
      customer: "Layla Farouk",
      phone: "+974 5555 0141",
      message: "Carnauba wax 500 ml is back on the shelf",
      sender: "Template · back in stock",
      why: "Did not ask about this item",
      whySub: "Asked about Tyre shine only",
      whenCanGo: "Only to a customer who asked about this item",
      canSendTemplate: false,
    },
    {
      when: "Sat 31 Oct 18:20",
      customer: "+974 5555 0188",
      phone: "No name yet",
      message: "Your car is ready.",
      sender: "Typed reply · Yusuf",
      why: "Has not agreed to messages",
      whySub: "Added by hand at the counter",
      whenCanGo: "Once the customer agrees to hear from the shop",
      canSendTemplate: false,
    },
  ],
  failed: [
    {
      id: "f-1",
      when: "Today 08:12",
      customer: "Dana Home Services",
      phone: "+974 5555 0161",
      message: "Invoice INV-2026-0418, QAR 720, is ready",
      sender: "Template · document",
      reason: "WhatsApp did not deliver it",
      reasonSub: "One try",
      error: "Message undeliverable",
      code: "code 131026",
      canRetry: true,
    },
    {
      id: "f-2",
      when: "Tue 10 Nov 14:05",
      customer: "Bluefin Events",
      phone: "+974 5555 0173",
      message: "Receipt R-2026-1877 for QAR 60",
      sender: "Template · document",
      reason: "ALYR could not hand it over",
      reasonSub: "Several tries, then stopped",
      error: "It never reached WhatsApp",
      code: "",
      canRetry: true,
    },
    {
      id: "f-3",
      when: "Mon 9 Nov 17:48",
      customer: "Khalid Nasser",
      phone: "+974 5555 0112",
      message: "Before and after, 2 pictures",
      sender: "Typed reply · Yusuf",
      reason: "WhatsApp did not deliver it",
      reasonSub: "One try",
      error: "Media upload error",
      code: "code 131053",
      canRetry: false,
    },
  ],
};

export const FIXTURE_CLOSED = {
  summary: {
    closedThisWeek: 142,
    closedSub: "130 by Thursday last week",
    sold: 31,
    soldPercent: "22%",
    soldSub: "Orders worth QAR 4,870",
    booked: 44,
    bookedPercent: "31%",
    bookedSub: "Bookings made in the chat",
    answered: 58,
    answeredPercent: "41%",
    answeredSub: "A question was answered",
    lost: 9,
    lostPercent: "6%",
    lostSub: "Mostly stopped replying",
  },
  rows: [
    { customer: "Aisha Hamad", phone: "+974 5555 0101", outcome: "Booked", note: "Booking 147", closedBy: "Salma", closedAt: "Today 09:14" },
    { customer: "Dana Home Services", phone: "+974 5555 0161", outcome: "Sold", note: "#1037 · QAR 720", closedBy: "Salma", closedAt: "Today 08:50" },
    { customer: "+974 5555 0190", phone: "No name yet", outcome: "Lost", note: "Not available", closedBy: "Bilal", closedAt: "Today 08:31" },
    { customer: "Palm Court Offices", phone: "+974 5555 0166", outcome: "Booked", note: "Booking 139", closedBy: "Omar", closedAt: "Wed 18:40" },
    { customer: "Bluefin Events", phone: "+974 5555 0173", outcome: "Answered", note: "Opening hours on Friday", closedBy: "Reem", closedAt: "Wed 17:22" },
    { customer: "+974 5555 0193", phone: "No name yet", outcome: "Lost", note: "Price", closedBy: "Reem", closedAt: "Wed 15:05" },
    { customer: "+974 5555 0187", phone: "No name yet", outcome: "Sold", note: "#1031 · QAR 95", closedBy: "Yusuf", closedAt: "Wed 13:48" },
    { customer: "+974 5555 0182", phone: "No name yet", outcome: "Answered", note: "Car ready for pickup", closedBy: "Yusuf", closedAt: "Wed 12:10" },
    { customer: "+974 5555 0179", phone: "No name yet", outcome: "Lost", note: "Stopped replying", closedBy: "Reem", closedAt: "Wed 11:30" },
    { customer: "+974 5555 0171", phone: "No name yet", outcome: "Sold", note: "#1019 · QAR 60", closedBy: "Bilal", closedAt: "Tue 19:02" },
  ],
  whyLost: [
    { reason: "Stopped replying", count: 4 },
    { reason: "Price", count: 2 },
    { reason: "Not available", count: 2 },
    { reason: "Went elsewhere", count: 1 },
    { reason: "Other", count: 0 },
  ],
  speed: {
    today: "2 min",
    median: "3 min",
    waited15m: "6 conversations",
  },
};
