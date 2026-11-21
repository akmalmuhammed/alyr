/**
 * Sample data for the Inbox preview: the fictional business Nuqta Car Care, one moment (Thu 12 Nov
 * 2026, 09:48 in Doha), and the same people as the drawings (inbox-01, inbox-02, inbox-03).
 * It is the shape the API returns, so the screens draw sample and live data the same way.
 * Times carry Doha's offset (+03:00) so no device's time zone changes what is drawn.
 */

import type { ConversationItem } from "./logic.ts";
import type {
  Bi, ClosedData, CustomerContext, NotSentRow, SavedReply, Template, ThreadItem,
} from "./types.ts";

/** The moment the preview draws: Thu 12 Nov 2026, 09:48 in Doha. */
export const NOW = Date.parse("2026-11-12T09:48:00+03:00");
/** The signed-in person (Hana, an owner) in the sample. */
export const ME = { id: "u-hana", name: "Hana" };
/** Whole dirhams from riyals, as the API sends money. */
const QAR = (riyals: number) => riyals * 100;
const t = (day: number, hhmm: string) => `2026-11-${String(day).padStart(2, "0")}T${hhmm}:00+03:00`;

const auto = (en: string, ar: string): Bi => ({ en, ar });

export const FIXTURE_CONVERSATIONS: ConversationItem[] = [
  {
    id: "yh-1039", name: "Yousef Hassan", phone: "+974 5555 0102", status: "open",
    assistant_paused: false, opted_out: false, window_closes_at: t(13, "09:38"), unread: 0,
    assigned: null,
    last: {
      body: auto("Paid. Order 1039 is confirmed.", "تم الدفع. تم تأكيد الطلب 1039."),
      direction: "out", status: "read", created_at: t(12, "09:38"), by: "auto",
    },
  },
  {
    id: "gc-vans", name: "Gulf Courier W.L.L.", phone: "+974 5555 0150", status: "open",
    assistant_paused: false, opted_out: false, window_closes_at: t(13, "09:36"), unread: 2,
    assigned: null,
    last: { body: "6 vans on Sunday, same as last time?", direction: "in", status: "received", created_at: t(12, "09:36") },
  },
  {
    id: "lf-book", name: "Layla Farouk", phone: "+974 5555 0141", status: "open",
    assistant_paused: false, opted_out: false, window_closes_at: t(13, "09:36"), unread: 0,
    assigned: null,
    last: {
      body: auto("Booked. Full wash, Fri 17:00", "تم الحجز. غسيل كامل، الجمعة 17:00"),
      direction: "out", status: "delivered", created_at: t(12, "09:36"), by: "auto",
    },
  },
  {
    id: "fd-card", name: "Fatima Darwish", phone: "+974 5555 0122", status: "open",
    assistant_paused: true, opted_out: false, window_closes_at: t(13, "09:33"), unread: 1,
    assigned: { id: "u-salma", name: "Salma" },
    last: { body: "Is the 5-wash card still valid?", direction: "in", status: "received", created_at: t(12, "09:33") },
  },
  {
    id: "rm-148", name: "Rashid Mahmoud", phone: "+974 5555 0134", status: "open",
    assistant_paused: true, opted_out: false, window_closes_at: t(13, "09:27"), unread: 0,
    assigned: ME,
    last: { body: "Can I bring the car Friday night and leave it with you? I travel early on Saturday.", direction: "in", status: "received", created_at: t(12, "09:27") },
  },
  {
    id: "na-visit", name: "Noor Abdullah", phone: "+974 5555 0133", status: "open",
    assistant_paused: false, opted_out: false, window_closes_at: t(13, "09:20"), unread: 0,
    assigned: null,
    last: {
      body: auto("How was your visit?", "كيف كانت زيارتك؟"),
      direction: "out", status: "delivered", created_at: t(12, "09:20"), by: "auto",
    },
  },
  {
    id: "kn-ar", name: "Khalid Nasser", phone: "+974 5555 0112", status: "open",
    assistant_paused: true, opted_out: false, window_closes_at: t(13, "08:52"), unread: 0,
    assigned: { id: "u-yusuf", name: "Yusuf" },
    last: { body: "شكرا، أشوفكم بكرة", direction: "in", status: "received", created_at: t(12, "08:52") },
  },
  {
    id: "ms-saleh", name: "Mariam Saleh", phone: "+974 5555 0117", status: "open",
    assistant_paused: true, opted_out: false, window_closes_at: null, unread: 0,
    assigned: { id: "u-reem", name: "Reem" },
    last: {
      body: "Hi Mariam, 18:30 tomorrow is still free. Shall I hold it for you?",
      direction: "out", status: "blocked", created_at: t(11, "19:05"), by: "Reem",
    },
  },
  {
    id: "oa-ali", name: "Omar Ali", phone: "+974 5555 0108", status: "open",
    assistant_paused: true, opted_out: false, window_closes_at: null, unread: 0,
    assigned: { id: "u-bilal", name: "Bilal" },
    last: { body: "Ok, I will come next week", direction: "in", status: "received", created_at: t(10, "14:00") },
  },
  {
    id: "bs-school", name: "Bayview School", phone: "+974 5555 0152", status: "open",
    assistant_paused: true, opted_out: false, window_closes_at: null, unread: 0,
    assigned: { id: "u-omar", name: "Omar" },
    last: {
      body: "Statement for October, QAR 1,360. Can you confirm the amount?",
      direction: "out", status: "blocked", created_at: t(11, "16:40"), by: "Omar",
    },
  },
  {
    id: "pc-closed", name: "Palm Court Offices", phone: "+974 5555 0166", status: "closed",
    assistant_paused: false, opted_out: false, window_closes_at: t(12, "18:40"), unread: 0,
    assigned: { id: "u-omar", name: "Omar" },
    last: { body: "Thank you, see you Saturday", direction: "in", status: "received", created_at: t(11, "18:40") },
  },
];

const RASHID_THREAD: ThreadItem[] = [
  { kind: "message", id: "r1", at: t(11, "16:06"), direction: "in", text: "تمام، الساعة 8 الصبح" },
  {
    kind: "activity", id: "r2", at: t(11, "16:06"), action: "booked", actor: "customer",
    detail: { number: 148, service: { en: "Ceramic coating", ar: "طلاء سيراميك" }, startsAt: t(14, "08:00") },
  },
  { kind: "activity", id: "r3", at: t(11, "16:11"), action: "paid_deposit", actor: "customer", detail: { amount: QAR(300) } },
  { kind: "message", id: "r4", at: t(12, "09:27"), direction: "in", text: "Can I bring the car Friday night and leave it with you? I travel early on Saturday." },
  {
    kind: "message", id: "r5", at: t(12, "09:28"), direction: "out", by: "auto",
    text: auto(
      "A person from the team will answer you about leaving the car overnight.",
      "سيرد عليك أحد أعضاء الفريق بخصوص إبقاء السيارة حتى الصباح.",
    ),
    delivery: { status: "read", at: t(12, "09:29") },
  },
  { kind: "activity", id: "r6", at: t(12, "09:28"), action: "asked_person", actor: "auto" },
  { kind: "note", id: "r7", at: t(12, "09:31"), author: "Salma", text: "The shop closes at 22:00. Bilal says a car can stay inside overnight if it arrives before 21:30." },
  { kind: "activity", id: "r8", at: t(12, "09:39"), action: "took", actor: "Hana" },
];

const MARIAM_THREAD: ThreadItem[] = [
  { kind: "message", id: "m1", at: t(10, "18:12"), direction: "in", text: "Do you have a slot for interior detail on Thursday evening?" },
  {
    kind: "message", id: "m2", at: t(10, "18:12"), direction: "out", by: "auto",
    text: auto(
      "Interior detail: QAR 150, 90 minutes. Thursday 12 Nov: 17:00 or 18:30 with Yusuf.",
      "تفصيل داخلي: 150 ر.ق، 90 دقيقة. الخميس 12 نوفمبر: 17:00 أو 18:30 مع يوسف.",
    ),
    buttons: [auto("17:00", "17:00"), auto("18:30", "18:30"), auto("Another day", "يوم آخر")],
    delivery: { status: "read", at: t(10, "18:13") },
  },
  { kind: "message", id: "m3", at: t(10, "18:14"), direction: "in", text: "خليني أتأكد وأرد عليكم" },
  {
    kind: "message", id: "m4", at: t(11, "19:05"), direction: "out", by: "Reem",
    text: "Hi Mariam, 18:30 tomorrow is still free. Shall I hold it for you?",
    delivery: { status: "blocked", reason: "window_closed" },
  },
];

const SAMPLE_REPLIES: SavedReply[] = [
  { id: "sr1", title: { en: "Opening hours", ar: "ساعات العمل" }, body: { en: "We are open 07:00–22:00 every day.", ar: "نعمل من 07:00 إلى 22:00 كل يوم." } },
  { id: "sr2", title: { en: "Directions", ar: "الاتجاهات" }, body: { en: "We are behind the petrol station on C Ring Road.", ar: "نحن خلف محطة الوقود على طريق الدائري سي." } },
  { id: "sr3", title: { en: "Deposit", ar: "العربون" }, body: { en: "A deposit of QAR 300 holds the slot. You can pay it from the link we send.", ar: "عربون 300 ر.ق يحجز الموعد. يمكنك دفعه من الرابط الذي نرسله." } },
  { id: "sr4", title: { en: "Ready for pickup", ar: "جاهزة للاستلام" }, body: { en: "Your car is ready for pickup.", ar: "سيارتك جاهزة للاستلام." } },
];

export const FIXTURE_SAVED_REPLIES = SAMPLE_REPLIES;

/** A short thread for a customer who has no longer sample history: just the last words. */
function plainThread(c: ConversationItem): ThreadItem[] {
  return [{
    kind: "message", id: `${c.id}-last`, at: c.last.created_at, direction: c.last.direction,
    by: c.last.by, text: c.last.body,
    delivery: c.last.direction === "out"
      ? { status: c.last.status as "read" | "delivered" | "blocked", reason: c.last.status === "blocked" ? "window_closed" : undefined }
      : undefined,
  }];
}

export function fixtureThread(id: string): ThreadItem[] {
  if (id === "rm-148") return RASHID_THREAD;
  if (id === "ms-saleh") return MARIAM_THREAD;
  const c = FIXTURE_CONVERSATIONS.find((x) => x.id === id);
  return c ? plainThread(c) : [];
}

const RASHID_CONTEXT: CustomerContext = {
  id: "rm-148", name: "Rashid Mahmoud", phone: "+974 5555 0134", since: "2025-03-14", visits: 9,
  spent12mo: QAR(2310), balanceOwed: QAR(250), owedSince: "2026-10-28T10:00:00+03:00",
  ordersTotal: 7,
  nextBooking: {
    number: 148, startsAt: t(14, "08:00"), service: { en: "Ceramic coating", ar: "طلاء سيراميك" },
    length: 240, status: "booked", depositPaid: QAR(300), receipt: "R-2026-1893",
  },
  orders: [
    { number: 1013, items: { en: "Tyre shine, Air freshener", ar: "ملمع إطارات، معطر جو" }, at: t(3, "11:20"), paid: true, total: QAR(45) },
    { number: 1005, items: { en: "Carnauba wax 500 ml", ar: "شمع كارنوبا 500 مل" }, at: "2026-10-21T15:05:00+03:00", paid: true, total: QAR(65) },
    { number: 1002, items: { en: "Microfibre cloth pack × 2", ar: "عبوة مناشف مايكروفايبر × 2" }, at: "2026-10-06T12:40:00+03:00", paid: true, total: QAR(50) },
  ],
  consent: {
    service: { state: "agreed", at: "2025-03-14" },
    offers: { state: "agreed", at: "2025-06-02" },
    backInStock: { state: "not_asked" },
  },
  priceGroup: { en: "Standard", ar: "عادية" }, writesIn: ["ar", "en"],
};

const MARIAM_CONTEXT: CustomerContext = {
  id: "ms-saleh", name: "Mariam Saleh", phone: "+974 5555 0117", since: "2026-06-08", visits: 4,
  spent12mo: QAR(510), balanceOwed: 0, ordersTotal: 2, nextBooking: null,
  lastVisit: { service: { en: "Full wash", ar: "غسيل كامل" }, at: "2026-11-02T10:30:00+03:00" },
  orders: [
    { number: 1010, items: { en: "Air freshener × 2", ar: "معطر جو × 2" }, at: "2026-11-02T10:45:00+03:00", paid: true, total: QAR(30) },
    { number: 1001, items: { en: "Glass cleaner", ar: "منظف زجاج" }, at: "2026-09-29T17:10:00+03:00", paid: true, total: QAR(22) },
  ],
  consent: {
    service: { state: "agreed", at: "2026-06-08" },
    offers: { state: "not_agreed" },
    backInStock: { state: "not_asked" },
  },
  priceGroup: { en: "Standard", ar: "عادية" }, writesIn: ["ar", "en"],
};

export function fixtureContext(id: string): CustomerContext {
  if (id === "rm-148") return RASHID_CONTEXT;
  if (id === "ms-saleh") return MARIAM_CONTEXT;
  const c = FIXTURE_CONVERSATIONS.find((x) => x.id === id) ?? FIXTURE_CONVERSATIONS[0];
  return {
    id: c.id, name: c.name, phone: c.phone, visits: 0, nextBooking: null, orders: [],
    consent: { service: { state: "agreed" }, offers: { state: "not_asked" } },
  };
}

export const FIXTURE_TEMPLATES: Template[] = [
  {
    id: "slot_free", name: { en: "Slot still free", ar: "الموعد ما زال متاحا" }, category: "utility", blocked: null,
    preview: {
      en: "Hello {first}, you asked about Interior detail. Thu 12 Nov 18:30 is still free. Reply here and we will hold it for you.",
      ar: "مرحبا {first}، سألت عن التفصيل الداخلي. الخميس 12 نوفمبر 18:30 ما زال متاحا. ردّ هنا وسنحجزه لك.",
    },
    buttons: { en: "Hold it · No thanks", ar: "احجزه · لا شكرا" },
  },
  {
    id: "tried_reach", name: { en: "We tried to reach you", ar: "حاولنا التواصل معك" }, category: "utility", blocked: null,
    preview: {
      en: "Hello {first}, we tried to reach you about your enquiry. Please reply when it suits you.",
      ar: "مرحبا {first}، حاولنا التواصل معك بخصوص استفسارك. تفضل بالرد عندما يناسبك.",
    },
    buttons: { en: "Reply · Call us", ar: "ردّ · اتصل بنا" },
  },
  {
    id: "payment_reminder", name: { en: "Payment reminder", ar: "تذكير بالدفع" }, category: "utility",
    blocked: { en: "Nothing owed", ar: "لا مستحقات" }, preview: { en: "", ar: "" },
  },
  {
    id: "november_offer", name: { en: "November offer", ar: "عرض نوفمبر" }, category: "marketing",
    blocked: { en: "No OK to offers", ar: "لا موافقة على العروض" }, preview: { en: "", ar: "" },
  },
];

export const FIXTURE_NOT_SENT: { days: number; sentTotal: number; rows: NotSentRow[] } = {
  days: 14,
  sentTotal: 3406,
  rows: [
    {
      id: "n1", contactId: "ms-saleh", customer: "Mariam Saleh", phone: "+974 5555 0117",
      body: "Hi Mariam, 18:30 tomorrow is still free. Shall I hold it for you?", status: "blocked",
      reason: "window_closed", createdAt: t(11, "19:05"), canRetry: false, whyNot: "window_closed",
    },
    {
      id: "n2", contactId: "bs-school", customer: "Bayview School", phone: "+974 5555 0152",
      body: "Statement for October, QAR 1,360. Can you confirm the amount?", status: "blocked",
      reason: "window_closed", createdAt: t(11, "16:40"), canRetry: false, whyNot: "window_closed",
    },
    {
      id: "n3", contactId: "sh-129", customer: "Sara Haddad", phone: "+974 5555 0129",
      body: "Payment reminder: QAR 120 since 3 Oct", status: "blocked", reason: "opted_out",
      createdAt: t(8, "10:00"), canRetry: false, whyNot: "opted_out",
    },
    {
      id: "n4", contactId: "oa-ali", customer: "Omar Ali", phone: "+974 5555 0108",
      body: "This weekend: Interior detail QAR 120", status: "blocked", reason: "no_marketing_consent",
      createdAt: t(7, "09:00"), canRetry: false, whyNot: "no_marketing_consent",
    },
    {
      id: "n5", contactId: "lf-book", customer: "Layla Farouk", phone: "+974 5555 0141",
      body: "Carnauba wax 500 ml is back on the shelf", status: "blocked", reason: "no_back_in_stock_consent",
      createdAt: t(5, "12:30"), canRetry: false, whyNot: "no_back_in_stock_consent",
    },
    {
      id: "n6", contactId: "u-0188", customer: "", phone: "+974 5555 0188",
      body: "Your car is ready.", status: "blocked", reason: "no_consent",
      createdAt: "2026-10-31T18:20:00+03:00", canRetry: false, whyNot: "no_consent",
    },
    {
      id: "f1", contactId: "dh-161", customer: "Dana Home Services", phone: "+974 5555 0161",
      body: "Invoice INV-2026-0418, QAR 720, is ready", status: "failed", reason: "whatsapp",
      whatsappSaid: "Message undeliverable (131026)", createdAt: t(12, "08:12"), canRetry: true, whyNot: null,
    },
    {
      id: "f2", contactId: "be-173", customer: "Bluefin Events", phone: "+974 5555 0173",
      body: "Receipt R-2026-1877 for QAR 60", status: "failed", reason: "gave_up",
      createdAt: t(10, "14:05"), canRetry: true, whyNot: null,
    },
    {
      id: "f3", contactId: "kn-ar", customer: "Khalid Nasser", phone: "+974 5555 0112",
      body: "Before and after, 2 pictures", status: "failed", reason: "whatsapp",
      whatsappSaid: "Media upload error (131053)", createdAt: t(9, "17:48"), canRetry: false, whyNot: "file_lost",
    },
  ],
};

export const FIXTURE_CLOSED: ClosedData = {
  rows: [
    { id: "c1", customer: "Aisha Hamad", phone: "+974 5555 0101", outcome: "booked", booking: 147, by: "Salma", at: t(12, "09:14") },
    { id: "c2", customer: "Dana Home Services", phone: "+974 5555 0161", outcome: "sold", order: { number: 1037, total: QAR(720) }, by: "Salma", at: t(12, "08:50") },
    { id: "c3", customer: null, phone: "+974 5555 0190", outcome: "lost", reason: "not_available", by: "Bilal", at: t(12, "08:31"), teamNote: "Asked for ceramic coating for a motorbike. Bilal answered that Nuqta coats cars only.", messages: 7, minutes: 4 },
    { id: "c4", customer: "Palm Court Offices", phone: "+974 5555 0166", outcome: "booked", booking: 139, by: "Omar", at: t(11, "18:40") },
    { id: "c5", customer: "Bluefin Events", phone: "+974 5555 0173", outcome: "answered", note: { en: "Opening hours on Friday", ar: "ساعات العمل يوم الجمعة" }, by: "Reem", at: t(11, "17:22") },
    { id: "c6", customer: null, phone: "+974 5555 0193", outcome: "lost", reason: "price", by: "Reem", at: t(11, "15:05") },
    { id: "c7", customer: null, phone: "+974 5555 0187", outcome: "sold", order: { number: 1031, total: QAR(95) }, by: "Yusuf", at: t(11, "13:48") },
    { id: "c8", customer: null, phone: "+974 5555 0182", outcome: "answered", note: { en: "Car ready for pickup", ar: "السيارة جاهزة للاستلام" }, by: "Yusuf", at: t(11, "12:10") },
    { id: "c9", customer: null, phone: "+974 5555 0179", outcome: "lost", reason: "no_reply", by: "Reem", at: t(11, "11:30") },
    { id: "c10", customer: null, phone: "+974 5555 0171", outcome: "sold", order: { number: 1019, total: QAR(60) }, by: "Bilal", at: t(10, "19:02") },
  ],
  week: { total: 142, lastWeekToDate: 130 },
  soldValue: QAR(4870),
  trend: {
    total: [24, 31, 28, 30, 29],
    sold: [5, 7, 6, 7, 6],
    booked: [8, 10, 9, 9, 8],
    answered: [10, 13, 12, 12, 11],
    lost: [1, 1, 2, 2, 3],
  },
  whyLost: [
    { reason: "no_reply", count: 4 },
    { reason: "price", count: 2 },
    { reason: "not_available", count: 2 },
    { reason: "went_elsewhere", count: 1 },
    { reason: "other", count: 0 },
  ],
  firstAnswer: { today: 2, median: 3, waitedOver15: 6 },
};

