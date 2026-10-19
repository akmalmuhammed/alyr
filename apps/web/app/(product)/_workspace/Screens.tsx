"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatPrice } from "../_customer/price";
import { OrderMargin, useOrderMargins } from "./Margin";
import { OrderSum } from "./OrderSum";
import { FulfilDetails, FulfilFilters, FulfilPill, matchesFilter, type FulfilFilter } from "./OrderFulfil";
import type { Fulfilment } from "../_customer/fulfil";
import { DELIVERY } from "./deliveryCopy";
import { PRICING } from "./pricingCopy";
import "./pricing.css";

type Choice = { id: string; title: string };
type Message = {
  direction: "in" | "out";
  kind: string;
  body: string;
  payload: { choices?: Choice[]; template?: string; category?: string };
  status?: string;
  error?: string | null;
  created_at: string;
};
type Buckets = { d0_30: number; d31_60: number; d61_90: number; d90_plus: number };
type Customer = {
  id: string; name: string; phone: string | null; balance: number; balance_text: string;
  oldest_days: number; buckets: Buckets; over_limit: boolean; promised_until: string | null;
  opted_out: boolean; assigned: Person | null;
  last_reminded_at?: string | null; promise_passed?: boolean;
};
type Person = { id: string; name: string };
type Activity = {
  id: string; subject: "conversation" | "order" | "booking" | "account"; action: string;
  detail: Record<string, string | number>; actor_name: string; created_at: string;
};
type Summary = {
  shop: { name: string; name_ar: string };
  outstanding_text: string; outstanding: number; buckets: Buckets;
  customers_owing: number; customers: Customer[];
  collected_by_link_text: string; payments_by_link: number;
};
type BookingRow = {
  id: string; number: number; service: string; when_text: string; status: string;
  customer: string; note: string; starts_at: string; assigned: Person | null;
};
// What an order was given off (ALY-150): only on an order that had a discount, so an order
// without one has none of these keys and is drawn exactly as before.
type OrderDiscount = {
  kind: "coupon" | "auto"; code: string; name: string; name_ar: string; text: string; text_ar: string;
  amount: number; amount_text: string; returned: boolean;
};
type OrderRow = {
  id: string; number: number; status: string; payment: string; total: number; total_text: string;
  subtotal?: number; discount_total?: number; discounts?: OrderDiscount[];
  // How it reaches the customer (ALY-150 part 2): only on an order made while Delivery and pickup was on.
  fulfilment?: Fulfilment;
  customer: string; items: { name: string; quantity: number; line_text: string; sku?: string; discount?: number }[];
  assigned: Person | null;
  // The table the order is for, from a QR code on a table ("" for none).
  table?: string;
  // The price group the order was charged under, as named then (null for orders before groups).
  price_group?: { name: string; name_ar: string; is_default: boolean } | null;
};
type PriceGroupOption = { id: string; name: string; name_ar: string; is_default: boolean };
type InboxRow = {
  id: string; name: string; phone: string | null; username: string | null;
  status: "open" | "closed"; assistant_paused: boolean; opted_out: boolean;
  window_open: boolean; window_closes_at: string | null; unread: number;
  assigned: { id: string; name: string } | null;
  last: { body: string; direction: "in" | "out"; kind: string; status: string; created_at: string };
};
type InboxMessage = Message & { id: string; sent_by: string };
type StaffNote = { id: string; body: string; author_name: string; created_at: string };
type Thread = {
  customer: Omit<InboxRow, "unread" | "last"> & { price_group_id?: string | null };
  messages: InboxMessage[]; notes: StaffNote[];
  activity: Activity[];
};
type SavedReply = { id: string; title: string; body: string };
type Me = { signed_in: boolean; id: string | null; name: string; email: string; role: string };
type Member = { id: string; name: string; email: string; role: string };
type Entry = { kind: string; amount_text: string; note: string; created_at: string };
// `key` is what the simulator addresses the phone by: its number, or its WhatsApp user ID
// when the customer uses a username and shows no number.
type Persona = {
  key: string; name: string; phone: string | null; user_id: string | null;
  username?: string | null; kind: "staff" | "customer";
};

const BUCKET_KEYS = ["d0_30", "d31_60", "d61_90", "d90_plus"] as const;

const T = {
  en: {
    ledger: "Credit ledger", sub: "Who owes what, and for how long", outstanding: "Outstanding",
    owing: (n: number) => `${n} customers owe money`, remind: "Send reminders",
    remindHint: "To customers whose oldest unpaid purchase is 30+ days old",
    sent: (n: number, skipped: number) =>
      `${n} reminders sent` + (skipped ? `, ${skipped} skipped (promised a date, reminded in the last 3 days, or said stop)` : ""),
    collected: "Collected through payment links", payments: (n: number) => `${n} payments`,
    promised: (d: string) => `Promised by ${d}`, overLimit: "Over credit limit", optedOut: "Said stop", customer: "Customer", balance: "Balance", age: "Oldest debt",
    days: (n: number) => `${n} days`, settled: "Settled", entries: "Entries",
    buckets: ["0–30 days", "31–60 days", "61–90 days", "Over 90 days"],
    kinds: { sale: "Credit sale", payment: "Payment", adjustment: "Adjustment", reversal: "Sale cancelled" } as Record<string, string>,
    lang: "العربية",
    tabTeam: "Team", teamSub: "Who can sign in to this workspace",
    roles: { owner: "Owner", admin: "Admin", agent: "Agent" } as Record<string, string>,
    addMember: "Add", remove: "Remove", name: "Name", email: "Email", role: "Role",
    teamAgent: "Only an owner or admin can change the team.",
    everyone: "Everyone", mine: "Mine", unassigned: "Unassigned", assignedTo: "Handled by", nobody: "Nobody",
    priceGroup: "Price group",
    noteMode: "Note", noteHere: "Write a note only your team can see", addNote: "Add note",
    noteLabel: "Staff note, not sent to the customer", saveReply: "Save as quick reply", quick: "Quick replies",
    tabInbox: "Inbox", inboxSub: "Every customer conversation, answered by the assistant or by you",
    open: "Open", closed: "Closed", noChats: "No conversations here. As a customer in the chat, send \"hello\".",
    pick: "Choose a conversation to read it.", you: "You", assistant: "Assistant", customerSays: "Customer",
    paused: "You are answering", pausedHint: "The assistant is quiet for this customer until you close the conversation or hand it back.",
    handBack: "Hand back to assistant", close: "Close", reopen: "Reopen", reply: "Reply", replyHere: "Write a reply",
    windowOpen: (h: number) => (h < 1 ? "Free replies allowed for less than an hour" : `Free replies allowed for ${h} more hours`),
    windowClosed: "More than 24 hours since their last message. WhatsApp only allows an approved template now; typed replies are refused.",
    notSent: "Not sent",
    tabBookings: "Bookings", bookingsSub: "Today and the next seven days, booked from the chat",
    noBookings: "No bookings in the next week. In the chat, send \"book\" as a customer.",
    when: "When", service: "Service", came: "Came", noShow: "No-show", cancel: "Cancel",
    bk: { booked: "Booked", completed: "Came", cancelled: "Cancelled", no_show: "No-show" } as Record<string, string>,
    tabLedger: "Credit ledger", tabOrders: "Orders", ordersSub: "Placed through the order link",
    noOrders: "No orders yet. In the chat, tap \"Place an order\" as a customer.", table: (label: string) => `Table ${label}`,
    orderNo: "Order", items: "Items", payment: "Payment", status: "Status",
    pay: { unpaid: "Not paid", paid: "Paid", on_account: "On account" } as Record<string, string>,
    st: { new: "New", confirmed: "Confirmed", ready: "Ready", done: "Done", cancelled: "Cancelled" } as Record<string, string>,
    next: { new: "Confirm", confirmed: "Mark ready", ready: "Mark done" } as Record<string, string>,
    followsUp: "Follows up", total: "Total",
    howEnded: "How did it end?", cancelClose: "Keep open", why: "Why was it lost?",
    outcomes: { sold: "Sold", booked: "Booked", answered: "Answered", lost: "Lost" } as Record<string, string>,
    reasons: {
      price: "Price", not_available: "Not available", no_reply: "Stopped replying",
      went_elsewhere: "Went elsewhere", other: "Other",
    } as Record<string, string>,
    did: (a: Activity, outcomes: Record<string, string>, reasons: Record<string, string>) => {
      const who = a.actor_name;
      const n = a.detail.number ? ` #${a.detail.number}` : "";
      const thing = { conversation: "this conversation", order: `order${n}`, booking: `booking${n}`, account: "the credit account" }[a.subject];
      switch (a.action) {
        case "took": return `${who} took ${thing}`;
        case "assigned": return a.detail.to ? `${who} gave ${thing} to ${a.detail.to}` : `${who} took ${thing} back from ${a.detail.from}`;
        case "closed": return a.detail.outcome
          ? `${who} closed it: ${outcomes[a.detail.outcome]}${a.detail.reason ? `, ${reasons[a.detail.reason].toLowerCase()}` : ""}`
          : `${who} closed it`;
        case "reopened": return `${who} reopened it`;
        case "placed": return `Customer placed order${n}, ${a.detail.total}`;
        case "booked": return `Customer booked${n}: ${a.detail.service}`;
        case "paid": return a.subject === "order" ? `Customer paid order${n}` : `Customer paid ${a.detail.amount} on account`;
        case "reminded": return `${who} sent a payment reminder for ${a.detail.balance}`;
        case "completed": return `${who} marked booking${n}: came`;
        case "no_show": return `${who} marked booking${n}: no-show`;
        case "moved": return `${who} moved booking${n}`;
        case "price_group": return `${who} changed the price group from ${a.detail.from} to ${a.detail.to}`;
        case "asked_person": return `${who} needs a person to reply (the chat could not read or help with the message)`;
        default: return `${who}: ${thing} ${a.action}`;
      }
    },
  },
  ar: {
    ledger: "دفتر الديون", sub: "من عليه مبلغ، ومنذ متى", outstanding: "إجمالي المستحق",
    owing: (n: number) => `${n} عميل عليهم مبالغ`, remind: "إرسال التذكيرات",
    remindHint: "للعملاء الذين مضى على أقدم فاتورة غير مدفوعة ٣٠ يوماً أو أكثر",
    sent: (n: number, skipped: number) =>
      `تم إرسال ${n} تذكير` + (skipped ? `، وتم تخطي ${skipped} (وعدوا بتاريخ أو تم تذكيرهم خلال ٣ أيام أو طلبوا الإيقاف)` : ""),
    collected: "المحصّل عبر روابط الدفع", payments: (n: number) => `${n} دفعة`,
    promised: (d: string) => `وعد بالدفع قبل ${d}`, overLimit: "تجاوز حد الائتمان", optedOut: "طلب الإيقاف", customer: "العميل", balance: "الرصيد", age: "أقدم دين",
    days: (n: number) => `${n} يوم`, settled: "مسدد", entries: "الحركات",
    buckets: ["٠–٣٠ يوم", "٣١–٦٠ يوم", "٦١–٩٠ يوم", "أكثر من ٩٠ يوم"],
    kinds: { sale: "بيع آجل", payment: "دفعة", adjustment: "تعديل", reversal: "إلغاء بيع آجل" } as Record<string, string>,
    lang: "English",
    tabTeam: "الفريق", teamSub: "من يستطيع الدخول إلى مساحة العمل",
    roles: { owner: "مالك", admin: "مدير", agent: "موظف" } as Record<string, string>,
    addMember: "إضافة", remove: "إزالة", name: "الاسم", email: "البريد الإلكتروني", role: "الدور",
    teamAgent: "تعديل الفريق متاح للمالك أو المدير فقط.",
    everyone: "الكل", mine: "محادثاتي", unassigned: "غير مسندة", assignedTo: "المسؤول", nobody: "لا أحد",
    priceGroup: "مجموعة الأسعار",
    noteMode: "ملاحظة", noteHere: "اكتب ملاحظة يراها فريقك فقط", addNote: "إضافة ملاحظة",
    noteLabel: "ملاحظة داخلية، لا تُرسل للعميل", saveReply: "حفظ كرد سريع", quick: "ردود سريعة",
    tabInbox: "المحادثات", inboxSub: "كل محادثات العملاء، يرد عليها المساعد أو أنت",
    open: "مفتوحة", closed: "مغلقة", noChats: "لا توجد محادثات. أرسل \"hello\" كعميل في المحادثة.",
    pick: "اختر محادثة لقراءتها.", you: "أنت", assistant: "المساعد", customerSays: "العميل",
    paused: "أنت من يرد", pausedHint: "المساعد متوقف لهذا العميل حتى تغلق المحادثة أو تعيدها إليه.",
    handBack: "إعادة للمساعد", close: "إغلاق", reopen: "إعادة فتح", reply: "إرسال", replyHere: "اكتب رداً",
    windowOpen: (h: number) => (h < 1 ? "الرد الحر متاح لأقل من ساعة" : `الرد الحر متاح لمدة ${h} ساعة`),
    windowClosed: "مضى أكثر من ٢٤ ساعة على آخر رسالة من العميل. واتساب يسمح الآن بالقوالب المعتمدة فقط، والردود المكتوبة مرفوضة.",
    notSent: "لم تُرسل",
    tabBookings: "الحجوزات", bookingsSub: "اليوم والأيام السبعة القادمة، من المحادثة",
    noBookings: "لا توجد حجوزات خلال الأسبوع القادم. أرسل \"book\" كعميل في المحادثة.",
    when: "الموعد", service: "الخدمة", came: "حضر", noShow: "لم يحضر", cancel: "إلغاء",
    bk: { booked: "محجوز", completed: "حضر", cancelled: "ملغي", no_show: "لم يحضر" } as Record<string, string>,
    tabLedger: "دفتر الديون", tabOrders: "الطلبات", ordersSub: "الطلبات الواردة من رابط الطلب",
    noOrders: "لا توجد طلبات بعد. في المحادثة اضغط \"اطلب الآن\" كعميل.", table: (label: string) => `طاولة ${label}`,
    orderNo: "الطلب", items: "الأصناف", payment: "الدفع", status: "الحالة",
    pay: { unpaid: "غير مدفوع", paid: "مدفوع", on_account: "على الحساب" } as Record<string, string>,
    st: { new: "جديد", confirmed: "مؤكد", ready: "جاهز", done: "منجز", cancelled: "ملغي" } as Record<string, string>,
    next: { new: "تأكيد", confirmed: "جاهز للاستلام", ready: "تم الإنجاز" } as Record<string, string>,
    followsUp: "المتابع", total: "المجموع",
    howEnded: "كيف انتهت؟", cancelClose: "أبقِها مفتوحة", why: "لماذا خسرناه؟",
    outcomes: { sold: "تم البيع", booked: "تم الحجز", answered: "تمت الإجابة", lost: "خسرناه" } as Record<string, string>,
    reasons: {
      price: "السعر", not_available: "غير متوفر", no_reply: "توقف عن الرد",
      went_elsewhere: "ذهب لغيرنا", other: "سبب آخر",
    } as Record<string, string>,
    did: (a: Activity, outcomes: Record<string, string>, reasons: Record<string, string>) => {
      const who = a.actor_name === "Customer" ? "العميل" : a.actor_name === "Assistant" ? "المساعد" : a.actor_name;
      const n = a.detail.number ? ` رقم ${a.detail.number}` : "";
      const thing = { conversation: "المحادثة", order: `الطلب${n}`, booking: `الحجز${n}`, account: "الحساب الآجل" }[a.subject];
      switch (a.action) {
        case "took": return `${who} تولّى ${thing}`;
        case "assigned": return a.detail.to ? `${who} أسند ${thing} إلى ${a.detail.to}` : `${who} سحب ${thing} من ${a.detail.from}`;
        case "closed": return a.detail.outcome
          ? `${who} أغلقها: ${outcomes[a.detail.outcome]}${a.detail.reason ? `، ${reasons[a.detail.reason]}` : ""}`
          : `${who} أغلقها`;
        case "reopened": return `${who} أعاد فتحها`;
        case "placed": return `العميل طلب${n}، ${a.detail.total}`;
        case "booked": return `العميل حجز${n}: ${a.detail.service}`;
        case "paid": return a.subject === "order" ? `العميل دفع الطلب${n}` : `العميل دفع ${a.detail.amount} على الحساب`;
        case "reminded": return `${who} أرسل تذكيراً بالدفع بمبلغ ${a.detail.balance}`;
        case "completed": return `${who}: العميل حضر${n ? ` (الحجز${n})` : ""}`;
        case "no_show": return `${who}: العميل لم يحضر${n ? ` (الحجز${n})` : ""}`;
        case "moved": return `${who} غيّر موعد الحجز${n}`;
        case "price_group": return `${who} غيّر مجموعة الأسعار من ${a.detail.from} إلى ${a.detail.to}`;
        case "asked_person": return `${who} يحتاج رداً من موظف (لم تستطع المحادثة قراءة الرسالة أو مساعدته)`;
        default: return `${who}: ${thing} ${a.action}`;
      }
    },
  },
};

const BLOCK_REASON: Record<string, string> = {
  opted_out: "customer said stop",
  no_consent: "customer has not agreed to messages",
  no_marketing_consent: "customer has not agreed to offers",
  window_closed: "more than 24 hours since their last message",
};
const NEXT_STATUS: Record<string, string> = { new: "confirmed", confirmed: "ready", ready: "done" };

const qar = (dirhams: number) =>
  "QAR " + (dirhams / 100).toLocaleString("en", { maximumFractionDigits: 2 });

function bucketIndex(days: number) {
  return days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
}

/** Like getJson, but a module the shop has not switched on (403) gives `fallback`. */
async function maybe<R>(url: string, fallback: R): Promise<R> {
  const response = await fetch(url, { cache: "no-store" });
  if (response.status === 403) return fallback;
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

async function getJson<R>(url: string, init?: RequestInit): Promise<R> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Who is responsible for one item. Changing it is recorded in the item's history. */
function AssignSelect({ value, members, label, nobody, onChange }: {
  value: Person | null; members: Member[]; label: string; nobody: string;
  onChange: (userId: string | null) => void;
}) {
  return (
    <select className="assign-select" aria-label={label} value={value?.id ?? ""}
      onChange={(e) => onChange(e.target.value || null)} onClick={(e) => e.stopPropagation()}>
      <option value="">{nobody}</option>
      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
}

export type WorkspaceTab = "inbox" | "ledger" | "orders" | "bookings" | "team";

/** The lists ALYR Agent links to (`/app/orders?show=unconfirmed`): exactly the rows its rule
 * counted, so "Show me" lands on them. */
export const SHOWS: Record<string, { tab: WorkspaceTab; en: string; ar: string }> = {
  waiting: { tab: "inbox", en: "Customers waiting for an answer", ar: "عملاء بانتظار الرد" },
  unconfirmed: { tab: "orders", en: "Orders not confirmed", ar: "طلبات لم تُؤكَّد بعد" },
  ready: { tab: "orders", en: "Orders ready, not collected", ar: "طلبات جاهزة لم تُستلم" },
  unpaid: { tab: "orders", en: "Orders with a payment link still open", ar: "طلبات برابط دفع مفتوح" },
  paid: { tab: "orders", en: "Orders paid by link", ar: "طلبات مدفوعة عبر الرابط" },
  unmarked: { tab: "bookings", en: "Visits not marked yet", ar: "زيارات لم تُسجَّل بعد" },
  no_show: { tab: "bookings", en: "No-shows", ar: "حالات الغياب" },
  repeat_no_show: { tab: "bookings", en: "Booked again after missing twice", ar: "محجوزون بعد غياب مرتين" },
  overdue: { tab: "ledger", en: "Owed 30+ days, no promise, no reminder in 7 days", ar: "مستحق منذ 30 يوماً أو أكثر دون وعد ودون تذكير خلال 7 أيام" },
  promised: { tab: "ledger", en: "Promised to pay", ar: "وعدوا بالسداد" },
  promise_passed: { tab: "ledger", en: "Promised date passed, nothing paid", ar: "مضى موعد الوعد ولم يُدفع شيء" },
  over_limit: { tab: "ledger", en: "Over their credit limit", ar: "تجاوزوا حد الائتمان" },
};
const DAY_MS = 86_400_000;

type ScreensProps = {
  /** Inside the workspace shell: no demo header, no chat simulator, no tab bar. */
  embedded?: boolean;
  /** Which screen to show; the shell's navigation decides. */
  section?: WorkspaceTab;
  lang?: "en" | "ar";
  /** Shown under the screen's title, before its own content (the shell's team report). */
  intro?: React.ReactNode;
  /** A filter from ALYR Agent (`?show=`), and how to clear it. */
  show?: string | null;
  onClearShow?: () => void;
};

/**
 * The workspace's working screens: inbox, credit accounts, orders, bookings and team.
 * The sales demo at /whatsapp shows them beside the chat simulator; the workspace shell
 * at /app shows one at a time under its own navigation.
 */
export function Screens({ embedded = false, section, lang: langProp, intro, show = null, onClearShow }: ScreensProps = {}) {
  const router = useRouter();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [phone, setPhone] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tabState, setTab] = useState<WorkspaceTab>("ledger");
  const tab = section ?? tabState;
  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  // The shop's customer price groups (wholesale); empty where the Catalog is not switched on.
  const [priceGroups, setPriceGroups] = useState<{ groups: PriceGroupOption[]; can_manage: boolean }>({ groups: [], can_manage: false });
  const [canManage, setCanManage] = useState(false);
  const [newMember, setNewMember] = useState({ name: "", email: "", role: "agent" });
  const [teamError, setTeamError] = useState("");
  const [inboxRows, setInboxRows] = useState<InboxRow[]>([]);
  const [inboxFilter, setInboxFilter] = useState<"open" | "closed">("open");
  const [assignedFilter, setAssignedFilter] = useState<"any" | "me" | "none">("any");
  const [savedReplies, setSavedReplies] = useState<SavedReply[]>([]);
  const [composeMode, setComposeMode] = useState<"reply" | "note">("reply");
  const [closing, setClosing] = useState<"" | "outcome" | "reason">("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [hoursLeft, setHoursLeft] = useState(0);
  // Refreshed with the data, so "has this visit started" never calls the clock while rendering.
  const [now, setNow] = useState(0);
  const threadEnd = useRef<HTMLDivElement>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [fulfilFilter, setFulfilFilter] = useState<FulfilFilter>("all");
  // The estimated margin of each order (ALY-150): only for an owner or admin of a shop that keeps costs.
  const orderMargins = useOrderMargins(canManage, orders);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [langState, setLang] = useState<"en" | "ar">("en");
  const lang = langProp ?? langState;
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const t = T[lang];
  const filter = show && SHOWS[show] && SHOWS[show].tab === (section ?? tabState) ? show : null;
  const filterLine = filter ? (
    <p className="show-filter" role="status">
      <span>{SHOWS[filter][lang]}</span>
      {onClearShow && <button type="button" className="btn small" onClick={onClearShow}>{lang === "ar" ? "اعرض الكل" : "Show all"}</button>}
    </p>
  ) : null;
  const persona = personas.find((p) => p.key === phone);

  const loadPersonas = useCallback(async () => {
    const data = await getJson<{
      staff: { name: string; phone: string; user_id: null };
      customers: { name: string; phone: string | null; user_id: string | null; username: string | null }[];
    }>("/sim/personas");
    const list: Persona[] = [
      ...data.customers.map((c) => ({ ...c, key: c.phone ?? c.user_id ?? "", kind: "customer" as const })),
      { ...data.staff, key: data.staff.phone, kind: "staff" as const },
    ];
    setPersonas(list);
    setPhone((current) => current || data.staff.phone);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        maybe<Summary | null>("/api/ledger/summary", null),
        phone
          ? getJson<{ messages: Message[] }>(`/sim/conversations/${phone}`)
          : Promise.resolve({ messages: [] }),
      ]);
      setSummary(s);
      setMessages(c.messages);
      setOrders((await maybe<{ orders: OrderRow[] }>("/api/orders", { orders: [] })).orders);
      const lookBack = show && SHOWS[show]?.tab === "bookings";
      const range = lookBack
        ? `?first=${new Date(Date.now() - 90 * DAY_MS).toISOString().slice(0, 10)}&last=${new Date(Date.now() + 8 * DAY_MS).toISOString().slice(0, 10)}`
        : "";
      setBookings((await maybe<{ bookings: BookingRow[] }>(`/api/bookings${range}`, { bookings: [] })).bookings);
      setMe(await getJson<Me>("/api/auth/me"));
      setNow(Date.now());
      {
        const team = await getJson<{ members: Member[]; can_manage: boolean }>("/api/team");
        setMembers(team.members);
        setCanManage(team.can_manage);
      }
      const rows = (
        await maybe<{ conversations: InboxRow[] }>(
          `/api/inbox/conversations?status=${inboxFilter}&assigned=${assignedFilter}`,
          { conversations: [] },
        )
      ).conversations;
      setInboxRows(rows);
      if (tab === "inbox") {
        setSavedReplies((await getJson<{ replies: SavedReply[] }>("/api/inbox/saved-replies")).replies);
      }
      if (tab === "inbox" && chatId) {
        const loaded = await getJson<Thread>(`/api/inbox/conversations/${chatId}`);
        setThread(loaded);
        setPriceGroups(await maybe("/api/price-groups", { groups: [], can_manage: false }));
        const closes = loaded.customer.window_closes_at;
        setHoursLeft(closes ? Math.floor((new Date(closes).getTime() - Date.now()) / 3_600_000) : 0);
        // Reading a conversation on screen is what marks it read.
        if (rows.find((r) => r.id === chatId)?.unread) {
          await getJson(`/api/inbox/conversations/${chatId}/read`, { method: "POST" });
        }
      }
      if (selected) {
        const e = await getJson<{ entries: Entry[] }>(`/api/ledger/customers/${selected}/entries`);
        setEntries(e.entries);
      }
      setError("");
    } catch {
      setError("Cannot reach the Alyr API. Start it on port 8000, then this page recovers by itself.");
    }
  }, [phone, selected, inboxFilter, assignedFilter, tab, chatId, show]);

  useEffect(() => {
    // The simulator only exists in the demo.
    const first = setTimeout(() => { if (!embedded) loadPersonas().catch(() => undefined); }, 0);
    return () => clearTimeout(first);
  }, [loadPersonas, embedded]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 1500);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const threadLength = thread?.messages.length ?? 0;
  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "nearest" });
  }, [threadLength, chatId]);

  async function send(text: string, replyId = "") {
    if (!persona || (!text.trim() && !replyId)) return;
    setDraft("");
    const data = await getJson<{ messages: Message[] }>("/sim/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from_number: persona.phone ?? "", from_user_id: persona.user_id ?? "",
        username: persona.username ?? "", text, reply_id: replyId,
      }),
    });
    setMessages(data.messages);
    refresh();
  }

  async function remind() {
    setBusy(true);
    try {
      const data = await getJson<{
        sent: number; skipped_promised: number; skipped_recent: number; skipped_opted_out: number;
      }>("/api/ledger/reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ min_days: 30 }),
      });
      setNote(t.sent(data.sent, data.skipped_promised + data.skipped_recent + data.skipped_opted_out));
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function inboxPost(path: string, body?: object) {
    if (!chatId) return;
    await getJson(`/api/inbox/conversations/${chatId}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    refresh();
  }

  async function setCustomerGroup(groupId: string) {
    if (!chatId) return;
    await getJson(`/api/price-groups/customers/${chatId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ group_id: groupId }),
    });
    refresh();
  }

  async function sendReply() {
    const text = replyDraft.trim();
    if (!text) return;
    setReplyDraft("");
    await inboxPost(composeMode === "note" ? "notes" : "reply", { text });
  }

  async function saveQuickReply() {
    const body = replyDraft.trim();
    if (!body) return;
    await getJson("/api/inbox/saved-replies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: body.slice(0, 28), body }),
    });
    refresh();
  }

  async function deleteQuickReply(id: string) {
    await getJson(`/api/inbox/saved-replies/${id}`, { method: "DELETE" });
    refresh();
  }

  async function teamCall(url: string, method: string, body?: object) {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    setTeamError(response.ok ? "" : String(data.detail ?? "That did not work."));
    if (response.ok) setNewMember({ name: "", email: "", role: "agent" });
    refresh();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  async function bookingAction(booking: BookingRow, action: "completed" | "no_show" | "cancel") {
    const cancel = action === "cancel";
    await getJson(`/api/bookings/${booking.id}/${cancel ? "cancel" : "outcome"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: cancel ? undefined : JSON.stringify({ status: action }),
    });
    refresh();
  }

  async function giveTo(path: string, userId: string | null) {
    await getJson(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    refresh();
  }

  async function closeAs(outcome: string, reason?: string) {
    setClosing("");
    await inboxPost("status", { status: "closed", outcome, ...(reason ? { reason } : {}) });
  }

  async function advance(order: OrderRow) {
    await getJson(`/api/orders/${order.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: NEXT_STATUS[order.status] }),
    });
    refresh();
  }

  async function reset() {
    setBusy(true);
    try {
      await getJson("/sim/reset", { method: "POST" });
      setSelected(null);
      setChatId(null);
      setThread(null);
      setEntries([]);
      setNote("");
      await loadPersonas();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const suggestions =
    persona?.kind === "staff"
      ? ["Ahmed 450 credit", "Ahmed paid 200"]
      : ["كم حسابي؟", "hello", "I want to order", "book a visit", "my booking"];
  const total = summary ? Math.max(summary.outstanding, 1) : 1;
  const upcoming = bookings.filter((b) => b.status === "booked").length;
  // The rows each ALYR Agent filter counts, with the same rules as the engine's.
  const missedTwice = new Set(
    Object.entries(
      bookings.filter((b) => b.status === "no_show").reduce<Record<string, number>>(
        (n, b) => ({ ...n, [b.customer]: (n[b.customer] ?? 0) + 1 }), {}),
    ).filter(([, n]) => n >= 2).map(([name]) => name),
  );
  const shownChats = filter === "waiting"
    ? inboxRows.filter((r) => r.status === "open" && r.last.direction === "in"
        && now - new Date(r.last.created_at).getTime() > 10 * 60_000)
    : inboxRows;
  const shownOrders = orders.filter((o) => {
    if (!matchesFilter(o, fulfilFilter)) return false;
    if (filter === "unconfirmed") return o.status === "new";
    if (filter === "ready") return o.status === "ready";
    if (filter === "unpaid") return o.payment === "unpaid" && !["cancelled", "done"].includes(o.status);
    if (filter === "paid") return o.payment === "paid";
    return true;
  });
  const shownBookings = bookings.filter((b) => {
    const started = new Date(b.starts_at).getTime() < now;
    if (filter === "unmarked") return b.status === "booked" && started;
    if (filter === "no_show") return b.status === "no_show";
    if (filter === "repeat_no_show") return b.status === "booked" && !started && missedTwice.has(b.customer);
    return true;
  });
  const shownCustomers = (summary?.customers ?? []).filter((c) => {
    if (filter === "overdue") {
      const reminded = c.last_reminded_at ? new Date(c.last_reminded_at).getTime() : 0;
      return c.balance > 0 && c.oldest_days >= 30 && !c.promised_until && now - reminded > 7 * DAY_MS;
    }
    if (filter === "promised") return Boolean(c.promised_until);
    if (filter === "promise_passed") return Boolean(c.promise_passed) && c.balance > 0;
    if (filter === "over_limit") return c.over_limit;
    return true;
  });
  const selectedCustomer = summary?.customers.find((c) => c.id === selected);
  const unreadChats = inboxRows.filter((r) => r.unread > 0).length;
  const openThread = thread && thread.customer.id === chatId ? thread : null;
  // Customer messages, staff notes and what the team did, in one timeline, oldest first.
  const timeline = openThread
    ? [...openThread.messages, ...openThread.notes, ...(openThread.activity ?? [])]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
    : [];

  return (
    <div className="shell">
      {!embedded && (
      <header className="topbar">
        <span className="brand">Alyr</span>
        <span className="where">Demo 1 · the credit ledger in a chat · sample data, fictional shop</span>
        <span className="spacer" />
        {me && (me.signed_in ? (
          <span className="who-am-i">
            {me.name} · {T.en.roles[me.role]}
            <button className="btn small" onClick={signOut}>Sign out</button>
          </span>
        ) : (
          <span className="who-am-i">Open demo, not signed in <a className="btn small" href="/login">Sign in</a></span>
        ))}
        <button className="btn" onClick={reset} disabled={busy}>Reset demo</button>
      </header>
      )}

      <div className={embedded ? "panes embedded" : "panes"}>
        {!embedded && (
        <section className="chat" aria-label="Chat simulator">
          <div className="chat-head">
            <label htmlFor="persona">Chat simulator · you are holding this phone</label>
            <select id="persona" value={phone} onChange={(e) => setPhone(e.target.value)}>
              {personas.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.kind === "staff" ? "Staff · " : "Customer · "}{p.name}
                  {p.username ? ` · @${p.username}, no phone number` : ""}
                </option>
              ))}
            </select>
            <span className="to">Chatting with: {summary?.shop.name ?? "…"}</span>
          </div>

          <div className="msgs">
            {messages.length === 0 && (
              <p className="empty">No messages yet. Tap a suggestion below or type one.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`bub ${m.direction === "in" ? "me" : ""}`} dir="auto">
                <Linked text={m.body} />
                {m.payload.choices && (
                  <div className="choices">
                    {m.payload.choices.map((c) => (
                      <button key={c.id} onClick={() => send(c.title, c.id)}>{c.title}</button>
                    ))}
                  </div>
                )}
                {m.status === "failed" && <span className="tag bad" dir="ltr">Not delivered</span>}
                {m.status === "blocked" && (
                  <span className="tag bad" dir="ltr">Not sent: {BLOCK_REASON[m.error ?? ""] ?? "blocked"}</span>
                )}
                {m.status === "queued" && <span className="tag" dir="ltr">Sending…</span>}
                {m.kind === "template" && (
                  <span className="tag" dir="ltr">
                    Template · {m.payload.category} · charged when sent outside the 24-hour window
                  </span>
                )}
              </div>
            ))}
            <div ref={bottom} />
          </div>

          <div className="chips">
            {suggestions.map((s) => (
              <button key={s} onClick={() => send(s)} dir="auto">{s}</button>
            ))}
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <input
              id="draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message"
              dir="auto"
              autoComplete="off"
            />
            <button className="btn primary" type="submit">Send</button>
          </form>
        </section>
        )}

        <main className="work" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
          {error && <div className="error" dir="ltr">{error}</div>}
          <div className="work-head">
            <div>
              {embedded && (
                <h1 className="work-title">
                  {{ inbox: t.tabInbox, ledger: t.tabLedger, orders: t.tabOrders, bookings: t.tabBookings, team: t.tabTeam }[tab]}
                </h1>
              )}
              {!embedded && (
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === "ledger"} onClick={() => setTab("ledger")}>{t.tabLedger}</button>
                <button role="tab" aria-selected={tab === "inbox"} onClick={() => setTab("inbox")}>
                  {t.tabInbox}{inboxFilter === "open" && unreadChats ? ` (${unreadChats})` : ""}
                </button>
                <button role="tab" aria-selected={tab === "orders"} onClick={() => setTab("orders")}>
                  {t.tabOrders}{orders.length ? ` (${orders.length})` : ""}
                </button>
                <button role="tab" aria-selected={tab === "bookings"} onClick={() => setTab("bookings")}>
                  {t.tabBookings}{upcoming ? ` (${upcoming})` : ""}
                </button>
                <button role="tab" aria-selected={tab === "team"} onClick={() => setTab("team")}>{t.tabTeam}</button>
              </div>
              )}
              <p>
                {lang === "ar" ? summary?.shop.name_ar : summary?.shop.name} · {tab === "ledger" ? t.sub : tab === "orders" ? t.ordersSub : tab === "bookings" ? t.bookingsSub : tab === "team" ? t.teamSub : t.inboxSub}
              </p>
            </div>
            <span className="spacer" />
            {!embedded && (
              <button className="btn" onClick={() => setLang(lang === "en" ? "ar" : "en")}>{t.lang}</button>
            )}
          </div>

          {intro}

          {tab === "inbox" && (
            <div className="inbox">
              <div className="inbox-list">
                <div className="seg">
                  {(["open", "closed"] as const).map((f) => (
                    <button key={f} aria-pressed={inboxFilter === f} onClick={() => setInboxFilter(f)}>{t[f]}</button>
                  ))}
                </div>
                <div className="seg">
                  {([["any", t.everyone], ["me", t.mine], ["none", t.unassigned]] as const).map(([f, label]) => (
                    <button
                      key={f} aria-pressed={assignedFilter === f} onClick={() => setAssignedFilter(f)}
                      disabled={f === "me" && !me?.signed_in}
                    >{label}</button>
                  ))}
                </div>
                {filterLine}
                {shownChats.length === 0 && <p className="empty-note">{t.noChats}</p>}
                {shownChats.map((r) => (
                  <button
                    key={r.id}
                    className={`conv ${r.id === chatId ? "sel" : ""}`}
                    onClick={() => { setChatId(r.id); setReplyDraft(""); }}
                  >
                    <span className="conv-top">
                      <b>{r.name}</b>
                      {r.unread > 0 && <span className="pill p1 num">{r.unread}</span>}
                    </span>
                    <span className="conv-last" dir="auto">
                      {r.last.direction === "out" ? "↩ " : ""}{r.last.body}
                    </span>
                    <span className="conv-flags">
                      {r.assigned && <span className="pill p0">{r.assigned.name}</span>}
                      {r.assistant_paused && !r.assigned && <span className="pill promise">{t.paused}</span>}
                      {r.opted_out && <span className="pill none">{t.optedOut}</span>}
                      {r.last.status === "blocked" && <span className="pill p3">{t.notSent}</span>}
                    </span>
                  </button>
                ))}
              </div>

              <div className="inbox-thread">
                {!openThread ? (
                  <p className="empty-note">{t.pick}</p>
                ) : (
                  <>
                    <div className="thread-head">
                      <div>
                        <b>{openThread.customer.name}</b>
                        <span className="mono" dir="ltr">
                          {openThread.customer.phone ? `+${openThread.customer.phone}` : `@${openThread.customer.username}`}
                        </span>
                      </div>
                      <span className="spacer" />
                      <label className="assign">
                        {t.assignedTo}
                        <select
                          value={openThread.customer.assigned?.id ?? ""}
                          onChange={(e) => inboxPost("assign", { user_id: e.target.value || null })}
                        >
                          <option value="">{t.nobody}</option>
                          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </label>
                      {priceGroups.groups.length > 1 && (
                        <label className="assign">
                          {t.priceGroup}
                          <select
                            value={openThread.customer.price_group_id ?? priceGroups.groups.find((g) => g.is_default)?.id ?? ""}
                            disabled={!priceGroups.can_manage}
                            onChange={(e) => setCustomerGroup(e.target.value)}
                          >
                            {priceGroups.groups.map((g) => (
                              <option key={g.id} value={g.id}>{lang === "ar" ? g.name_ar || g.name : g.name}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      {openThread.customer.assistant_paused && (
                        <button className="btn small" onClick={() => inboxPost("assistant", { paused: false })}>{t.handBack}</button>
                      )}
                      <button
                        className="btn small"
                        aria-expanded={openThread.customer.status === "open" ? closing !== "" : undefined}
                        onClick={() => openThread.customer.status === "open"
                          ? setClosing(closing ? "" : "outcome")
                          : inboxPost("status", { status: "open" })}
                      >
                        {openThread.customer.status === "open" ? t.close : t.reopen}
                      </button>
                    </div>
                    {closing && (
                      <div className="closing" role="group" aria-label={closing === "outcome" ? t.howEnded : t.why}>
                        <span>{closing === "outcome" ? t.howEnded : t.why}</span>
                        {closing === "outcome"
                          ? (["sold", "booked", "answered", "lost"] as const).map((o) => (
                              <button key={o} className={`outcome o-${o}`}
                                onClick={() => (o === "lost" ? setClosing("reason") : closeAs(o))}>
                                {t.outcomes[o]}
                              </button>
                            ))
                          : Object.keys(t.reasons).map((r) => (
                              <button key={r} className="outcome o-lost" onClick={() => closeAs("lost", r)}>{t.reasons[r]}</button>
                            ))}
                        <button className="btn small" onClick={() => setClosing("")}>{t.cancelClose}</button>
                      </div>
                    )}
                    {openThread.customer.assistant_paused && <p className="thread-note">{t.pausedHint}</p>}
                    <div className="msgs thread-msgs">
                      {timeline.map((m) => "action" in m ? (
                        <div key={m.id} className="sysline" dir={lang === "ar" ? "rtl" : "ltr"}>
                          <span>{t.did(m, t.outcomes, t.reasons)}</span>
                          <time className="mono" dir="ltr">
                            {new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </time>
                        </div>
                      ) : "author_name" in m ? (
                        <div key={m.id} className="bub staffnote" dir="auto">
                          <span className="who" dir={lang === "ar" ? "rtl" : "ltr"}>{m.author_name} · {t.noteLabel}</span>
                          {m.body}
                        </div>
                      ) : (
                        <div key={m.id} className={`bub ${m.direction === "out" ? "me" : ""}`} dir="auto">
                          <span className="who" dir={lang === "ar" ? "rtl" : "ltr"}>
                            {m.direction === "in" ? t.customerSays : m.sent_by || t.assistant}
                          </span>
                          <Linked text={m.body} />
                          {m.payload.choices && (
                            <span className="tag" dir="ltr">Buttons: {m.payload.choices.map((c) => c.title).join(" · ")}</span>
                          )}
                          {m.status === "failed" && <span className="tag bad" dir="ltr">Not delivered</span>}
                          {m.status === "blocked" && (
                            <span className="tag bad" dir="ltr">Not sent: {BLOCK_REASON[m.error ?? ""] ?? "blocked"}</span>
                          )}
                        </div>
                      ))}
                      <div ref={threadEnd} />
                    </div>
                    <p className={`thread-note ${openThread.customer.window_open ? "" : "warn"}`}>
                      {openThread.customer.window_open ? t.windowOpen(hoursLeft) : t.windowClosed}
                    </p>
                    <div className="quick" aria-label={t.quick}>
                      <div className="seg small">
                        <button aria-pressed={composeMode === "reply"} onClick={() => setComposeMode("reply")}>{t.reply}</button>
                        <button aria-pressed={composeMode === "note"} onClick={() => setComposeMode("note")}>{t.noteMode}</button>
                      </div>
                      {composeMode === "reply" && savedReplies.map((r) => (
                        <span key={r.id} className="quickchip">
                          <button dir="auto" title={r.body} onClick={() => setReplyDraft(r.body)}>{r.title}</button>
                          <button aria-label={`${t.remove}: ${r.title}`} onClick={() => deleteQuickReply(r.id)}>×</button>
                        </span>
                      ))}
                    </div>
                    <form
                      className={`composer ${composeMode === "note" ? "noting" : ""}`}
                      onSubmit={(e) => { e.preventDefault(); sendReply(); }}
                    >
                      <input
                        id="reply"
                        aria-label={composeMode === "note" ? t.noteHere : t.replyHere}
                        value={replyDraft}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        placeholder={composeMode === "note" ? t.noteHere : t.replyHere}
                        disabled={composeMode === "reply" && !openThread.customer.window_open}
                        dir="auto"
                        autoComplete="off"
                      />
                      {composeMode === "reply" && replyDraft.trim() && (
                        <button className="btn small" type="button" onClick={saveQuickReply}>{t.saveReply}</button>
                      )}
                      <button
                        className="btn primary" type="submit"
                        disabled={composeMode === "reply" && !openThread.customer.window_open}
                      >{composeMode === "note" ? t.addNote : t.reply}</button>
                    </form>
                  </>
                )}
              </div>
            </div>
          )}

          {tab === "team" && (
            <>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr><th>{t.name}</th><th>{t.email}</th><th>{t.role}</th><th /></tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="norow">
                        <td>{m.name}</td>
                        <td dir="ltr">{m.email}</td>
                        <td><span className="pill none">{t.roles[m.role]}</span></td>
                        <td className="r">
                          {canManage && m.id !== me?.id && (
                            <button className="btn small" onClick={() => teamCall(`/api/team/${m.id}`, "DELETE")}>{t.remove}</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canManage ? (
                <form
                  className="team-add"
                  onSubmit={(e) => { e.preventDefault(); teamCall("/api/team", "POST", newMember); }}
                >
                  <input aria-label={t.name} placeholder={t.name} required value={newMember.name}
                    onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} />
                  <input aria-label={t.email} placeholder={t.email} type="email" required dir="ltr" value={newMember.email}
                    onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} />
                  <select aria-label={t.role} value={newMember.role}
                    onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}>
                    {["agent", "admin", "owner"].map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
                  </select>
                  <button className="btn primary" type="submit">{t.addMember}</button>
                </form>
              ) : (
                <p className="empty-note">{t.teamAgent}</p>
              )}
              {teamError && <p className="error" dir="ltr" role="alert">{teamError}</p>}
            </>
          )}

          {tab === "bookings" && filterLine}
          {tab === "bookings" && (
            shownBookings.length === 0 ? (
              <p className="empty-note">{t.noBookings}</p>
            ) : (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.when}</th>
                      <th>{t.service}</th>
                      <th>{t.customer}</th>
                      <th>{t.assignedTo}</th>
                      <th>{t.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownBookings.map((b) => (
                      <tr key={b.id} className="norow">
                        <td><b className="num" dir="ltr">{b.when_text}</b><br /><span className="mono">#{b.number}</span></td>
                        <td>{b.service}{b.note && <div className="booking-said" dir="auto">{b.note}</div>}</td>
                        <td>{b.customer}</td>
                        <td>
                          <AssignSelect value={b.assigned} members={members} label={t.assignedTo} nobody={t.nobody}
                            onChange={(id) => giveTo(`/api/bookings/${b.id}/assign`, id)} />
                        </td>
                        <td>
                          <span className={`pill ${b.status === "booked" ? "p0" : b.status === "completed" ? "none" : "p1"}`}>{t.bk[b.status]}</span>
                          {b.status === "booked" && (
                            <span className="booking-acts">
                              {new Date(b.starts_at).getTime() < now && (
                                <>
                                  <button className="btn small" onClick={() => bookingAction(b, "completed")}>{t.came}</button>
                                  <button className="btn small" onClick={() => bookingAction(b, "no_show")}>{t.noShow}</button>
                                </>
                              )}
                              <button className="btn small" onClick={() => bookingAction(b, "cancel")}>{t.cancel}</button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === "orders" && filterLine}
          {tab === "orders" && <FulfilFilters value={fulfilFilter} onChange={setFulfilFilter} lang={lang} show={orders.some((o) => o.fulfilment)} />}
          {tab === "orders" && (
            shownOrders.length === 0 ? (
              <p className="empty-note">{orders.length > 0 && fulfilFilter !== "all" ? DELIVERY[lang].order.none : t.noOrders}</p>
            ) : (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.orderNo}</th>
                      <th>{t.items}</th>
                      <th className="r">{t.total}</th>
                      <th>{t.payment}</th>
                      <th>{t.assignedTo}</th>
                      <th>{t.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownOrders.map((o) => (
                      <tr key={o.id} className="norow">
                        <td>
                          <b className="num">#{o.number}</b><br />{o.customer}
                          {o.price_group && !o.price_group.is_default && (
                            <><br /><span className="pill none">{lang === "ar" ? o.price_group.name_ar || o.price_group.name : o.price_group.name}</span></>
                          )}
                          {o.table && <><br /><span className="pill p1">{t.table(o.table)}</span></>}
                          {o.fulfilment && <><br /><FulfilPill fulfilment={o.fulfilment} lang={lang} /></>}
                        </td>
                        <td>{o.items.map((i, k) => (
                          <div key={k}>{i.quantity} × {i.name}{i.sku ? <> <small className="mono" dir="ltr">{i.sku}</small></> : null}
                            {i.discount ? <small className="pr-lineoff">{PRICING[lang].order.lineOff(formatPrice(i.discount, lang))}</small> : null}</div>
                        ))}
                          {o.fulfilment && <FulfilDetails fulfilment={o.fulfilment} lang={lang} />}
                          {o.discount_total || o.fulfilment?.mode === "delivery" ? <OrderSum order={o} lang={lang} /> : null}
                          {orderMargins && <OrderMargin lang={lang} margin={orderMargins[o.id]} />}</td>
                        <td className="r num" dir="ltr">{o.total_text}</td>
                        <td><span className={`pill ${o.payment === "unpaid" ? "p1" : "p0"}`}>{t.pay[o.payment]}</span></td>
                        <td>
                          <AssignSelect value={o.assigned} members={members} label={t.assignedTo} nobody={t.nobody}
                            onChange={(id) => giveTo(`/api/orders/${o.id}/assign`, id)} />
                        </td>
                        <td>
                          <span className="pill none">{t.st[o.status]}</span>
                          {NEXT_STATUS[o.status] && (
                            <button className="btn small" onClick={() => advance(o)}>{t.next[o.status]}</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === "ledger" && summary && (
            <>
              <div className="tiles">
              <div className="totals">
                <span className="label">{t.outstanding}</span>
                <span className="big num" dir="ltr">{summary.outstanding_text}</span>
                <span>{t.owing(summary.customers_owing)}</span>
                <div className="agebar" aria-hidden="true">
                  {BUCKET_KEYS.map((k, i) => (
                    <span key={k} className={`a${i}`} style={{ width: `${(summary.buckets[k] / total) * 100}%` }} />
                  ))}
                </div>
                <div className="legend">
                  {BUCKET_KEYS.map((k, i) => (
                    <div key={k}>
                      <small><i className={`a${i}`} />{t.buckets[i]}</small>
                      <b className="num" dir="ltr">{qar(summary.buckets[k])}</b>
                    </div>
                  ))}
                </div>
              </div>

              <div className="totals">
                <span className="label">{t.collected}</span>
                <span className="big num" dir="ltr">{summary.collected_by_link_text}</span>
                <span>{t.payments(summary.payments_by_link)}</span>
              </div>
              </div>

              <div className="actions">
                <button className="btn primary" onClick={remind} disabled={busy}>{t.remind}</button>
                <span style={{ color: "var(--muted)", fontSize: 13.5 }}>{t.remindHint}</span>
                {note && <span className="note">{note}</span>}
              </div>

              {filterLine}
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.customer}</th>
                      <th className="r">{t.balance}</th>
                      <th>{t.age}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownCustomers.map((c) => (
                      <tr key={c.id} className={c.id === selected ? "sel" : ""} onClick={() => setSelected(c.id)}>
                        <td>
                          {c.name}
                          {c.assigned && <span className="pill none gap">{c.assigned.name}</span>}
                          {c.over_limit && <span className="pill p3 gap">{t.overLimit}</span>}
                          {c.opted_out && <span className="pill none gap">{t.optedOut}</span>}
                        </td>
                        <td className="r num" dir="ltr">{c.balance_text}</td>
                        <td>
                          {c.balance > 0 ? (
                            <>
                              <span className={`pill p${bucketIndex(c.oldest_days)}`}>{t.days(c.oldest_days)}</span>
                              {c.promised_until && (
                                <span className="pill promise gap">
                                  {t.promised(new Date(c.promised_until).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }))}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="pill none">{t.settled}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedCustomer && (
                <div className="entries">
                  <div className="entries-head">
                    <h2>{t.entries} · {selectedCustomer.name}</h2>
                    <label className="assign">
                      {t.followsUp}
                      <AssignSelect value={selectedCustomer.assigned} members={members} label={t.followsUp} nobody={t.nobody}
                        onChange={(id) => giveTo(`/api/ledger/customers/${selectedCustomer.id}/assign`, id)} />
                    </label>
                  </div>
                  <ul>
                    {entries.map((e, i) => (
                      <li key={i}>
                        <span className="mono" dir="ltr">
                          {new Date(e.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </span>
                        <span>{t.kinds[e.kind]}{e.note ? ` · ${e.note}` : ""}</span>
                        <b className={`num ${e.kind === "payment" || e.kind === "reversal" ? "minus" : "plus"}`} dir="ltr">
                          {e.kind === "payment" || e.kind === "reversal" ? "−" : "+"}{e.amount_text}
                        </b>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
