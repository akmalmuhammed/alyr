/**
 * English and Arabic words for the Orders screens (J01). Every string a person reads is here, in both
 * languages, with the same keys; components hold no words. Arabic is a careful draft for the native
 * review (ALY-66). Money and times are written by the kit's formatters (`_ui/format.ts`) and passed in
 * already written, so a sentence here never builds a figure itself.
 *
 * Rules kept here: no AI words, no "free replies" ("Typed replies allowed for N more hours"), the word
 * "Code" and never "SKU", "By rule: ..." for a counted figure, an empty value is "None", Latin digits in
 * both languages. A number or an amount inside an Arabic sentence is wrapped in a left-to-right isolate
 * so a hash or a currency never reorders.
 */

import { isolate } from "../../../_ui/format.ts";

export type Lang = "en" | "ar";

/** The filters in force, as the words of a sentence: `by` is a first name, null for "nobody", undefined for no one in particular. */
export interface FilterWords {
  payment?: string;
  mode?: string;
  by?: string | null;
}

/** An order number, a time or an amount that must keep its own direction inside an Arabic sentence. */
const bidi = (lang: Lang, text: string | number) => (lang === "ar" ? isolate(String(text)) : String(text));

/** Arabic counts: one and two are whole phrases, 3 to 10 take the plural, 11 and up the singular. */
function arCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  const tail = Math.abs(n) % 100;
  return n === 0 || (tail >= 3 && tail <= 10) ? `${n} ${few}` : `${n} ${many}`;
}

const en = {
  // Page
  title: "Orders",
  openOrders: (n: number) => (n === 1 ? "1 open order." : `${n} open orders.`),

  // Banners
  lateOrders: (n: number, list: string) =>
    n === 1
      ? `1 order has been new for more than 15 min: ${list}. Nobody has confirmed it yet.`
      : `${n} orders have been new for more than 15 min: ${list}. Nobody has confirmed them yet.`,
  lateEntry: (num: number, minutes: number, lang: Lang = "en") => `${bidi(lang, `#${num}`)} (${bidi(lang, `${minutes} min`)})`,
  joinList: (parts: string[]) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`),
  showThem: "Show them",
  showAll: "Show all",
  showUnconfirmed: "Orders not confirmed",
  showReady: "Orders ready, not collected",
  showUnpaid: "Orders with a payment link still open",
  showPaid: "Orders paid by link",

  // Tabs
  tabOpen: "Open",
  tabNew: "New",
  tabConfirmed: "Confirmed",
  tabReady: "Ready",
  tabDone: "Done",
  tabCancelled: "Cancelled",
  tabAll: "All",
  tabsLabel: "Order status",

  // Filters
  searchLabel: "Search orders",
  searchPlaceholder: "Search order, customer, phone or item",
  clearSearch: "Clear the search",
  filterAll: "All",
  filterPickup: "Pickup",
  filterDelivery: "Delivery",
  handOverFilter: "Hand-over",
  paymentLabel: "Payment",
  paymentAny: "Any",
  paymentPaid: "Paid",
  paymentNotPaid: "Not paid",
  paymentOnAccount: "On account",
  handledByLabel: "Handled by",
  handledByAnyone: "Anyone",
  handledByNobody: "Nobody",
  sortNewest: "Newest first",
  sortOldest: "Oldest first",
  sortLabel: "Sort",
  filtersButton: "Filters",
  filtersTitle: "Filters",
  filtersShow: "Show",
  filtersDone: "Done",

  // Table
  colOrder: "Order",
  colPlaced: "Placed",
  colCustomer: "Customer",
  colItems: "Items",
  colHandOver: "Hand-over",
  colPayment: "Payment",
  colHandledBy: "Handled by",
  colStatus: "Status",
  colTotal: "Total",
  colItem: "Item",
  colCode: "Code",
  colQty: "Qty",
  colPrice: "Price",
  colLine: "Line",

  // Words for a status, a payment and a hand-over
  stNew: "New",
  stConfirmed: "Confirmed",
  stReady: "Ready",
  stDone: "Done",
  stCancelled: "Cancelled",
  stillNew: "New",
  stillConfirmed: "Confirmed",
  stillReady: "Ready",
  stillDone: "Done",
  payPaid: "Paid",
  payNotPaid: "Not paid",
  payOnAccount: "On account",
  payLinkOpen: "Pay link open",
  tagTestOrder: "Test order",
  modePickup: "Pickup",
  modeDelivery: "Delivery",
  todayWord: "today",
  nobodyAssigned: "Nobody",
  nobodyYet: "Nobody yet",
  selectHandledBy: "Handled by",

  // Pager and the notes under the list
  pagerRange: (from: number, to: number, total: number) => `${from}–${to} of ${total}`,
  pagerPrevious: "Previous page",
  pagerNext: "Next page",
  pagerLabel: "Pages of orders",
  openRuleFooter: (amount: string) =>
    `By rule: open orders are New, Confirmed and Ready, plus any unpaid order that is not cancelled · ${amount}`,
  past30Days: "Done and cancelled orders from the last 30 days.",
  updatedAt: (time: string) => `Updated ${time}`,
  showingOf: (shown: number, total: number) => `Showing ${shown} of ${total} orders`,
  showMore: "Show more",

  // Drawer and detail
  orderTitle: (n: number) => `Order #${n}`,
  openFullPage: "Open full page",
  closeDrawer: "Close",
  backToOrders: "Back to orders",
  previousOrder: "Previous order",
  nextOrder: "Next order",
  conversationBtn: "Conversation",
  openConversation: "Open conversation",
  replyWindowHours: (h: number) => `Typed replies allowed for ${h} more hours`,
  replyWindowLess: "Typed replies allowed for less than an hour",
  replyWindowClosed: "The 24-hour window is closed",
  placedAt: (time: string, mode: "pickup" | "delivery" | null, day: string) =>
    mode === "delivery"
      ? `Placed ${day} at ${time} · for delivery`
      : `Placed ${day} at ${time}`,
  placedPhone: (time: string, age: string) => `Placed ${time} · ${age}`,
  dayToday: "today",

  sectionItems: (count: number) => `Items · ${count}`,
  itemsInLines: (qty: number, lines: number) =>
    `${qty} ${qty === 1 ? "item" : "items"} in ${lines} ${lines === 1 ? "line" : "lines"}`,
  sectionHandOver: "Hand-over",
  sectionPayment: "Payment",
  sectionTimeline: "Timeline",
  timelineSteps: (count: number) => (count === 1 ? "1 step" : `${count} steps`),
  newestFirst: "Newest first",
  codeOf: (code: string) => `Code ${code}`,
  qtyTimes: (qty: string, price: string) => `${qty} × ${price}`,
  dayFull: (date: string) => `Today, ${date}`,
  customerPanel: "Customer",
  priceGroup: "Price group",
  priceGroupStandard: "Standard",

  // Sums
  sumItems: "Items",
  sumDelivery: "Delivery fee",
  sumDeliveryTo: (zone: string) => `Delivery to ${zone}`,
  sumPickup: "Pickup at the shop",
  sumTotal: "Total",
  free: "Free",

  // Hand-over rows
  kvPickup: "Pickup",
  atTheShop: "At the shop",
  kvArea: "Area",
  areaFee: (zone: string, fee: string) => `${zone} · fee ${fee}`,
  kvDay: "Day",
  kvAddress: "Address in words",
  kvNote: "Note from the customer",
  kvPayLink: "Pay link",
  payLinkOpenSent: (time: string) => `Open · sent ${time}, not paid yet`,
  kvPaid: "Paid",
  kvHow: "How",
  kvReference: "Reference",
  kvAmount: "Amount",
  kvRecordedBy: "Recorded by",
  methodCash: "Cash",
  methodBankTransfer: "Bank transfer",
  methodCardTerminal: "Card machine",
  methodCheque: "Cheque",
  methodLink: "Payment link",
  payLinkTitle: "Pay link",
  payLinkSentTo: (name: string) => `Link sent to ${name} on WhatsApp`,
  payLinkPaid: "Paid",
  refundDueNote: (amount: string) =>
    `A refund of ${amount} is due. You make it in your own provider account; ALYR does not move money.`,

  // Steps rail
  stepPlaced: "Placed",
  stepConfirmed: "Confirmed",
  stepReadyPickup: "Ready for collection",
  stepReadyDelivery: "Ready for delivery",
  stepDone: "Done",
  stepNext: "Next",
  stepWhenHandedOver: "When it is handed over",
  stepToDo: "To do",
  stepsLabel: "Order progress",
  stepStateDone: "done",
  stepStateCurrent: "current step",
  stepStateTodo: "to do",

  // Margin (owners and admins of a shop that keeps costs)
  marginTitle: "Margin, from your costs",
  marginPct: (pct: number, revenue: string) => `${pct}% of ${revenue}`,
  marginRule: (revenue: string, cost: string) =>
    `By rule: items after discounts (${revenue}) minus the cost kept for each item (${cost}). The delivery fee is left out.`,
  marginIncomplete: "Some items have no cost kept; the margin counts the rest.",
  marginBelowCost: "Below cost",

  // What the customer sees
  customerSeesTitle: (name: string) => `What ${name} sees`,
  trackingBody: (name: string, staff: string) =>
    staff
      ? `${name}'s tracking page shows four steps with the time of each and ${staff}'s first name: placed, confirmed, ready, complete.`
      : `${name}'s tracking page shows four steps with the time of each: placed, confirmed, ready, complete.`,
  copyLink: "Copy link",
  linkCopied: "Link copied",
  openPage: "Open page",
  nowShowing: (step: string) => `Now showing: ${step}`,
  trackStage: (status: string, delivery: boolean) =>
    ({ new: "placed", confirmed: "confirmed", ready: delivery ? "ready for delivery" : "ready for collection", done: "complete", cancelled: "cancelled" } as Record<string, string>)[status] ?? status,

  // Document
  documentTitle: "Document",
  openInDocuments: "Open in Documents",
  docKindReceipt: "Receipt",
  docKindInvoice: "Invoice",
  docKindQuote: "Quote",
  docIssued: "Issued",
  docDraft: "Draft",
  docCancelled: "Cancelled",
  docImmutable: "A document that is issued cannot be edited. A correction is a credit note.",

  // Actions
  btnConfirmOrder: "Confirm order",
  btnMarkReady: "Mark ready",
  btnMarkDone: "Mark done",
  btnCancelOrder: "Cancel order",
  btnCancelShort: "Cancel",
  btnMarkPaid: "Mark paid",
  btnSaving: "Saving",
  btnClose: "Close",

  // What a step tells the customer
  noteConfirm: (name: string, n: number, lang: Lang = "en") => `Confirming tells ${name} on WhatsApp: “Order ${bidi(lang, `#${n}`)} is confirmed.”`,
  noteReadyPickup: (name: string, n: number, lang: Lang = "en") => `Marking ready tells ${name} on WhatsApp: “Order ${bidi(lang, `#${n}`)} is ready for collection.”`,
  noteReadyDelivery: (name: string, n: number, lang: Lang = "en") => `Marking ready tells ${name} on WhatsApp: “Order ${bidi(lang, `#${n}`)} is ready for delivery.”`,
  noteDone: (name: string, n: number, lang: Lang = "en") => `Marking done tells ${name} on WhatsApp: “Order ${bidi(lang, `#${n}`)} is complete. Thank you.”`,
  noteOptedOut: (name: string) => `${name} asked not to get messages, so nobody is told.`,

  // Mark paid dialog
  markPaidTitle: (n: number) => `Mark order #${n} as paid`,
  howDidTheyPay: "How did they pay?",
  hintBankTransfer: "Reference from the transfer",
  hintCardTerminal: "Slip number",
  hintCheque: "Cheque number",
  refOptional: "Reference (optional)",
  refPlaceholder: "Up to 80 characters",
  receiptNotice: (name: string) => `A receipt is made and sent to ${name} on WhatsApp.`,
  recordNotice: "The timeline shows who recorded it and when. The order keeps its step.",
  btnSaveAsPaid: "Save as paid",

  // Cancel dialog
  cancelTitle: (n: number) => `Cancel order #${n}?`,
  keepOrder: "Keep the order",
  cannotBeUndone: "This cannot be undone.",
  checkRestock: "Put the items back in stock",
  checkRestockSub: (items: string) => `${items} go back to stock.`,
  whatHappens: "What happens",
  whStock: "Stock",
  whStockBack: (n: number) => (n === 1 ? "1 item back in stock" : `${n} items back in stock`),
  whStockStays: "Stock stays as it is",
  whRefundDue: "Refund due",
  whCredit: "Credit account",
  whCreditReversed: "The sale is taken off the customer's account",
  whCreditNone: "Nothing was put on account",
  whDocCreditNote: (number: string) => `${number} is cancelled by a credit note`,
  cancelTileConfirmedBy: (actor: string, time: string) => `Confirmed by ${actor} at ${time}`,
  cancelTilePlaced: (time: string) => `Placed at ${time}`,
  cancelTileConfirmedAt: (time: string) => `Confirmed at ${time}`,
  cancelTileDelivery: (zone: string, day: string) => `delivery to ${zone} ${day}`,
  cancelTilePickup: (day: string) => `pickup ${day}`,
  cancelTilePaidByLink: "paid by link",
  cancelTilePaid: "paid",
  cancelTileOnAccount: "on account",
  cancelTileNotPaid: "not paid",
  toldOnWhatsApp: (name: string) => `${name} is told on WhatsApp`,
  waCancelled: (n: number, lang: Lang = "en") => `Order ${bidi(lang, `#${n}`)} has been cancelled.`,
  sentAutomatically: "sent automatically",
  windowOpenNote: (name: string, time: string) => `${name} wrote at ${time}, so the message goes as written.`,
  windowClosedNote: "The 24-hour window is closed, so the message goes as the approved template.",
  optedOutNote: (name: string) => `${name} asked not to get messages, so nothing is sent.`,
  noWindowNote: (name: string) => `${name} has not written to the shop, so the message goes as the approved template.`,
  balanceNotice: (name: string) => `${name}'s balance on account is also sent.`,
  testOrderNote: "This is a test order, so nobody is told.",
  cancelFailed: "That did not save. The order is unchanged.",
  saveFailed: "That did not save. Try again.",

  // States
  loadingOrders: "Loading orders",
  emptyTitle: "No orders yet",
  emptyBody: "Share your order link or its QR code. New orders show up here by themselves.",
  copyOrderLink: "Copy the order link",
  orderLinkCopied: "Order link copied",
  filteredTitle: "No orders match this filter",
  filteredSearch: (q: string) => `No orders match “${q}”.`,
  filteredBody: (open: number, f: FilterWords) => {
    const adj = f.payment === "paid" ? "paid " : f.payment === "unpaid" ? "unpaid " : "";
    const noun = f.mode === "delivery" ? "delivery" : f.mode === "pickup" ? "pickup" : "order";
    const onAccount = f.payment === "on_account" ? " on account" : "";
    const by = f.by === undefined ? "" : f.by === null ? " handled by nobody" : ` handled by ${f.by}`;
    return `None of the ${open} open orders is ${/^[aeiou]/.test(adj || noun) ? "an" : "a"} ${adj}${noun}${onAccount}${by}.`;
  },
  clearFilters: "Clear filters",
  errorLoaded: (time: string) => `Orders could not be loaded. You are looking at what was here at ${time}; nothing newer is shown until the connection is back.`,
  errorNever: "Orders could not be loaded.",
  tryAgain: "Try again",
  offlineBanner: (time: string) => `You are offline. What you see was loaded at ${time}. Changes cannot be saved until the connection is back.`,
  detailMissing: "This order could not be found.",
  detailMissingBody: "The link may be old, or the order is not in this shop.",

  // Toasts
  toastStep: (n: number, to: "confirmed" | "ready" | "done", name: string, told: boolean, lang: Lang = "en") =>
    told
      ? `Order ${bidi(lang, `#${n}`)} is ${to}. ${name} was told on WhatsApp.`
      : `Order ${bidi(lang, `#${n}`)} is ${to}. ${name} asked not to get messages, so nobody was told.`,
  toastStepFailed: (n: number, status: string, name: string, lang: Lang = "en") =>
    `That did not save. Order ${bidi(lang, `#${n}`)} is still ${status} and ${name} has not been told.`,
  toastPaid: (n: number, method: string, amount: string, lang: Lang = "en") => `Order ${bidi(lang, `#${n}`)} is marked paid: ${method.toLowerCase()}, ${amount}.`,
  receiptMeta: (number: string) => `Receipt ${number}`,
  errAlreadyPaid: (n: number, lang: Lang = "en") => `Order ${bidi(lang, `#${n}`)} is already paid.`,
  errCancelled: "This order is cancelled.",
  errOnAccount: "This order is on the customer's account. Record the payment in Credit.",
  errTest: "A test order moves no money.",
  errNotAllowed: "Only owners and admins can mark orders paid.",
  errBackwards: "An order cannot go back a step.",
  toastCancelled: (n: number, stock: number, refund: string | null, credit: boolean, lang: Lang = "en") =>
    `Order ${bidi(lang, `#${n}`)} is cancelled.${stock > 0 ? ` ${stock === 1 ? "1 item went" : `${stock} items went`} back to stock.` : ""}${refund ? ` A refund of ${refund} is due.` : ""}${credit ? " The sale was taken off the account." : ""}`,


  // Timeline sentences
  automatically: "Automatically",
  actPlaced: (customer: string) => `${customer} placed the order`,
  actTook: (actor: string) => `${actor} took the order`,
  actAssigned: (actor: string, to: string) => `${actor} gave the order to ${to}`,
  actUnassigned: (actor: string) => `${actor} left the order with nobody`,
  actConfirmed: (actor: string) => `${actor} confirmed the order`,
  actReady: (actor: string) => `${actor} marked the order ready`,
  actDone: (actor: string) => `${actor} marked the order done`,
  actPaid: (method: string | null, amount: string, actor: string) =>
    method === null
      ? `Paid by link${amount ? `, ${amount}` : ""}.`
      : `Paid, ${method.toLowerCase()}${amount ? `, ${amount}` : ""}. ${actor} recorded it.`,
  actCancelled: (actor: string, reason: string, stock: number) =>
    `${actor} cancelled the order${reason ? ` (${reason})` : ""}${stock > 0 ? ` · Stock went back: ${stock}` : ""}`,
  actRefundDue: (amount: string) => `A refund of ${amount} is due`,
  actLatePayment: "A payment arrived after the link ran out",

  // Names for screen readers
  assignFailed: "That did not save. Nobody was changed.",
};

const ar: typeof en = {
  // Page
  title: "الطلبات",
  openOrders: (n: number) => {
    if (n === 0) return "لا توجد طلبات مفتوحة.";
    if (n === 1) return "طلب واحد مفتوح.";
    if (n === 2) return "طلبان مفتوحان.";
    const tail = n % 100;
    return tail >= 3 && tail <= 10 ? `${n} طلبات مفتوحة.` : `${n} طلباً مفتوحاً.`;
  },

  // Banners
  lateOrders: (n: number, list: string) => {
    const head = arCount(n, "طلب واحد جديد", "طلبان جديدان", "طلبات جديدة", "طلباً جديداً");
    const tail = n === 1 ? "لم يؤكده أحد بعد." : n === 2 ? "لم يؤكدهما أحد بعد." : "لم يؤكدها أحد بعد.";
    return `${head} منذ أكثر من 15 دقيقة: ${list}. ${tail}`;
  },
  lateEntry: (num: number, minutes: number, lang: Lang = "ar") => `${bidi(lang, `#${num}`)} (${bidi(lang, `${minutes} د`)})`,
  joinList: (parts: string[]) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join("، ")} و${parts[parts.length - 1]}`),
  showThem: "عرضها",
  showAll: "عرض الكل",
  showUnconfirmed: "طلبات لم تُؤكَّد بعد",
  showReady: "طلبات جاهزة لم تُستلم",
  showUnpaid: "طلبات برابط دفع مفتوح",
  showPaid: "طلبات مدفوعة عبر الرابط",

  // Tabs
  tabOpen: "مفتوحة",
  tabNew: "جديدة",
  tabConfirmed: "مؤكدة",
  tabReady: "جاهزة",
  tabDone: "منجزة",
  tabCancelled: "ملغاة",
  tabAll: "الكل",
  tabsLabel: "حالة الطلب",

  // Filters
  searchLabel: "البحث في الطلبات",
  searchPlaceholder: "ابحث برقم الطلب أو العميل أو الهاتف أو الصنف",
  clearSearch: "مسح البحث",
  filterAll: "الكل",
  filterPickup: "استلام",
  filterDelivery: "توصيل",
  handOverFilter: "التسليم",
  paymentLabel: "الدفع",
  paymentAny: "أي حالة",
  paymentPaid: "مدفوع",
  paymentNotPaid: "غير مدفوع",
  paymentOnAccount: "على الحساب",
  handledByLabel: "المسؤول",
  handledByAnyone: "الجميع",
  handledByNobody: "بلا مسؤول",
  sortNewest: "الأحدث أولاً",
  sortOldest: "الأقدم أولاً",
  sortLabel: "الترتيب",
  filtersButton: "عوامل التصفية",
  filtersTitle: "عوامل التصفية",
  filtersShow: "عرض",
  filtersDone: "تم",

  // Table
  colOrder: "الطلب",
  colPlaced: "وقت الطلب",
  colCustomer: "العميل",
  colItems: "الأصناف",
  colHandOver: "التسليم",
  colPayment: "الدفع",
  colHandledBy: "المسؤول",
  colStatus: "الحالة",
  colTotal: "المجموع",
  colItem: "الصنف",
  colCode: "الرمز",
  colQty: "الكمية",
  colPrice: "السعر",
  colLine: "الإجمالي",

  // Words for a status, a payment and a hand-over
  stNew: "جديد",
  stConfirmed: "مؤكد",
  stReady: "جاهز",
  stDone: "منجز",
  stCancelled: "ملغي",
  stillNew: "جديداً",
  stillConfirmed: "مؤكداً",
  stillReady: "جاهزاً",
  stillDone: "منجزاً",
  payPaid: "مدفوع",
  payNotPaid: "غير مدفوع",
  payOnAccount: "على الحساب",
  payLinkOpen: "رابط الدفع مفتوح",
  tagTestOrder: "طلب تجريبي",
  modePickup: "استلام",
  modeDelivery: "توصيل",
  todayWord: "اليوم",
  nobodyAssigned: "بلا مسؤول",
  nobodyYet: "بلا مسؤول بعد",
  selectHandledBy: "المسؤول",

  // Pager and the notes under the list
  pagerRange: (from: number, to: number, total: number) => `${from}–${to} من ${total}`,
  pagerPrevious: "الصفحة السابقة",
  pagerNext: "الصفحة التالية",
  pagerLabel: "صفحات الطلبات",
  openRuleFooter: (amount: string) =>
    `حسب القاعدة: الطلبات المفتوحة هي الجديدة والمؤكدة والجاهزة، وأي طلب غير مدفوع لم يُلغَ · ${bidi("ar", amount)}`,
  past30Days: "الطلبات المكتملة والملغاة خلال آخر 30 يوماً.",
  updatedAt: (time: string) => `آخر تحديث ${bidi("ar", time)}`,
  showingOf: (shown: number, total: number) => `عرض ${shown} من ${total} طلباً`,
  showMore: "عرض المزيد",

  // Drawer and detail
  orderTitle: (n: number) => `الطلب رقم ${bidi("ar", n)}`,
  openFullPage: "فتح الصفحة الكاملة",
  closeDrawer: "إغلاق",
  backToOrders: "العودة إلى الطلبات",
  previousOrder: "الطلب السابق",
  nextOrder: "الطلب التالي",
  conversationBtn: "المحادثة",
  openConversation: "فتح المحادثة",
  replyWindowHours: (h: number) =>
    h === 1 ? "الردود المكتوبة متاحة لمدة ساعة أخرى" : h === 2 ? "الردود المكتوبة متاحة لمدة ساعتين أخريين" : h <= 10 ? `الردود المكتوبة متاحة لمدة ${h} ساعات أخرى` : `الردود المكتوبة متاحة لمدة ${h} ساعة أخرى`,
  replyWindowLess: "الردود المكتوبة متاحة لأقل من ساعة",
  replyWindowClosed: "نافذة الـ 24 ساعة مغلقة",
  placedAt: (time: string, mode: "pickup" | "delivery" | null, day: string) =>
    mode === "delivery"
      ? `تم الطلب ${day} عند ${bidi("ar", time)} · للتوصيل`
      : `تم الطلب ${day} عند ${bidi("ar", time)}`,
  placedPhone: (time: string, age: string) => `تم الطلب ${bidi("ar", time)} · ${bidi("ar", age)}`,
  dayToday: "اليوم",

  sectionItems: (count: number) => `الأصناف · ${count}`,
  itemsInLines: (qty: number, lines: number) => `${qty} قطع في ${lines} بنود`,
  sectionHandOver: "التسليم",
  sectionPayment: "الدفع",
  sectionTimeline: "السجل",
  timelineSteps: (count: number) => (count === 1 ? "خطوة واحدة" : count === 2 ? "خطوتان" : count <= 10 ? `${count} خطوات` : `${count} خطوة`),
  newestFirst: "الأحدث أولاً",
  codeOf: (code: string) => `الرمز ${code}`,
  qtyTimes: (qty: string, price: string) => `${qty} × ${price}`,
  dayFull: (date: string) => `اليوم، ${date}`,
  customerPanel: "العميل",
  priceGroup: "مجموعة الأسعار",
  priceGroupStandard: "القياسية",

  // Sums
  sumItems: "الأصناف",
  sumDelivery: "رسوم التوصيل",
  sumDeliveryTo: (zone: string) => `التوصيل إلى ${zone}`,
  sumPickup: "الاستلام من المتجر",
  sumTotal: "المجموع",
  free: "مجاني",

  // Hand-over rows
  kvPickup: "الاستلام",
  atTheShop: "من المتجر",
  kvArea: "المنطقة",
  areaFee: (zone: string, fee: string) => `${zone} · رسوم ${bidi("ar", fee)}`,
  kvDay: "اليوم",
  kvAddress: "العنوان بالكلمات",
  kvNote: "ملاحظة العميل",
  kvPayLink: "رابط الدفع",
  payLinkOpenSent: (time: string) => `مفتوح · أُرسل ${bidi("ar", time)}، لم يُدفع بعد`,
  kvPaid: "وقت الدفع",
  kvHow: "الطريقة",
  kvReference: "المرجع",
  kvAmount: "المبلغ",
  kvRecordedBy: "سجّله",
  methodCash: "نقداً",
  methodBankTransfer: "تحويل بنكي",
  methodCardTerminal: "بطاقة عبر الجهاز",
  methodCheque: "شيك",
  methodLink: "رابط الدفع",
  payLinkTitle: "رابط الدفع",
  payLinkSentTo: (name: string) => `أُرسل الرابط إلى ${name} عبر واتساب`,
  payLinkPaid: "تم الدفع",
  refundDueNote: (amount: string) =>
    `يستحق استرداد ${bidi("ar", amount)}. تُجريه من حساب مزوّد الدفع الخاص بك؛ ولا تنقل ${bidi("ar", "ALYR")} الأموال.`,

  // Steps rail
  stepPlaced: "تم الطلب",
  stepConfirmed: "تم التأكيد",
  stepReadyPickup: "جاهز للاستلام",
  stepReadyDelivery: "جاهز للتوصيل",
  stepDone: "منجز",
  stepNext: "التالي",
  stepWhenHandedOver: "عند التسليم",
  stepToDo: "لاحقاً",
  stepsLabel: "تقدم الطلب",
  stepStateDone: "تمت",
  stepStateCurrent: "الخطوة الحالية",
  stepStateTodo: "لاحقاً",

  // Margin
  marginTitle: "الهامش، من تكاليفك",
  marginPct: (pct: number, revenue: string) => `${pct}% من ${bidi("ar", revenue)}`,
  marginRule: (revenue: string, cost: string) =>
    `حسب القاعدة: الأصناف بعد الخصومات (${bidi("ar", revenue)}) ناقص التكلفة المسجلة لكل صنف (${bidi("ar", cost)}). رسوم التوصيل غير محتسبة.`,
  marginIncomplete: "بعض الأصناف بلا تكلفة مسجلة؛ يحتسب الهامش الباقي.",
  marginBelowCost: "أقل من التكلفة",

  // What the customer sees
  customerSeesTitle: (name: string) => `ما يراه ${name}`,
  trackingBody: (name: string, staff: string) =>
    staff
      ? `تعرض صفحة تتبع ${name} أربع خطوات مع وقت كل خطوة والاسم الأول لـ${staff}: تم الطلب، تم التأكيد، جاهز، مكتمل.`
      : `تعرض صفحة تتبع ${name} أربع خطوات مع وقت كل خطوة: تم الطلب، تم التأكيد، جاهز، مكتمل.`,
  copyLink: "نسخ الرابط",
  linkCopied: "تم نسخ الرابط",
  openPage: "فتح الصفحة",
  nowShowing: (step: string) => `يظهر الآن: ${step}`,
  trackStage: (status: string, delivery: boolean) =>
    ({ new: "تم الطلب", confirmed: "تم التأكيد", ready: delivery ? "جاهز للتوصيل" : "جاهز للاستلام", done: "مكتمل", cancelled: "ملغى" } as Record<string, string>)[status] ?? status,

  // Document
  documentTitle: "المستند",
  openInDocuments: "فتح في المستندات",
  docKindReceipt: "إيصال",
  docKindInvoice: "فاتورة",
  docKindQuote: "عرض سعر",
  docIssued: "صادر",
  docDraft: "مسودة",
  docCancelled: "ملغى",
  docImmutable: "المستند الصادر لا يُعدَّل. التصحيح يتم بإشعار دائن.",

  // Actions
  btnConfirmOrder: "تأكيد الطلب",
  btnMarkReady: "تحديد كجاهز",
  btnMarkDone: "تم الإنجاز",
  btnCancelOrder: "إلغاء الطلب",
  btnCancelShort: "إلغاء",
  btnMarkPaid: "تسجيل كمدفوع",
  btnSaving: "جارٍ الحفظ",
  btnClose: "إغلاق",

  // What a step tells the customer
  noteConfirm: (name: string, n: number, lang: Lang = "ar") => `التأكيد يُبلغ ${name} عبر واتساب: «تم تأكيد الطلب رقم ${bidi(lang, n)}.»`,
  noteReadyPickup: (name: string, n: number, lang: Lang = "ar") => `تحديد الجاهزية يُبلغ ${name} عبر واتساب: «الطلب رقم ${bidi(lang, n)} جاهز للاستلام.»`,
  noteReadyDelivery: (name: string, n: number, lang: Lang = "ar") => `تحديد الجاهزية يُبلغ ${name} عبر واتساب: «الطلب رقم ${bidi(lang, n)} جاهز للتوصيل.»`,
  noteDone: (name: string, n: number, lang: Lang = "ar") => `تحديد الاكتمال يُبلغ ${name} عبر واتساب: «تم إنجاز الطلب رقم ${bidi(lang, n)}. شكراً لك.»`,
  noteOptedOut: (name: string) => `${name} طلب ألا تصله رسائل، لذلك لا يُبلَّغ أحد.`,

  // Mark paid dialog
  markPaidTitle: (n: number) => `تسجيل الطلب رقم ${bidi("ar", n)} كمدفوع`,
  howDidTheyPay: "كيف دفع؟",
  hintBankTransfer: "مرجع التحويل",
  hintCardTerminal: "رقم الإيصال",
  hintCheque: "رقم الشيك",
  refOptional: "المرجع (اختياري)",
  refPlaceholder: "حتى 80 حرفاً",
  receiptNotice: (name: string) => `يُنشأ إيصال ويُرسل إلى ${name} عبر واتساب.`,
  recordNotice: "يعرض السجل من سجّل الدفع ومتى. ويبقى الطلب في خطوته.",
  btnSaveAsPaid: "حفظ كمدفوع",

  // Cancel dialog
  cancelTitle: (n: number) => `إلغاء الطلب رقم ${bidi("ar", n)}؟`,
  keepOrder: "إبقاء الطلب",
  cannotBeUndone: "لا يمكن التراجع عن هذا.",
  checkRestock: "إعادة الأصناف إلى المخزون",
  checkRestockSub: (items: string) => `تعود الأصناف التالية إلى المخزون: ${items}.`,
  whatHappens: "ماذا يحدث",
  whStock: "المخزون",
  whStockBack: (n: number) => (n === 1 ? "صنف واحد يعود إلى المخزون" : n === 2 ? "صنفان يعودان إلى المخزون" : n <= 10 ? `${n} أصناف تعود إلى المخزون` : `${n} صنفاً يعود إلى المخزون`),
  whStockStays: "يبقى المخزون كما هو",
  whRefundDue: "استرداد مستحق",
  whCredit: "حساب الآجل",
  whCreditReversed: "تُخصم عملية البيع من حساب العميل",
  whCreditNone: "لم يُقيَّد شيء على الحساب",
  whDocCreditNote: (number: string) => `يُلغى ${bidi("ar", number)} بإشعار دائن`,
  cancelTileConfirmedBy: (actor: string, time: string) => `أكّده ${actor} عند ${bidi("ar", time)}`,
  cancelTilePlaced: (time: string) => `تم الطلب عند ${bidi("ar", time)}`,
  cancelTileConfirmedAt: (time: string) => `أُكّد عند ${bidi("ar", time)}`,
  cancelTileDelivery: (zone: string, day: string) => `توصيل إلى ${zone} ${day}`,
  cancelTilePickup: (day: string) => `استلام ${day}`,
  cancelTilePaidByLink: "دُفع بالرابط",
  cancelTilePaid: "مدفوع",
  cancelTileOnAccount: "على الحساب",
  cancelTileNotPaid: "غير مدفوع",
  toldOnWhatsApp: (name: string) => `يُبلَّغ ${name} عبر واتساب`,
  waCancelled: (n: number, lang: Lang = "ar") => `تم إلغاء الطلب رقم ${bidi(lang, n)}.`,
  sentAutomatically: "تُرسل تلقائياً",
  windowOpenNote: (name: string, time: string) => `كتب ${name} عند ${bidi("ar", time)}، لذلك تُرسل الرسالة كما هي.`,
  windowClosedNote: "نافذة الـ 24 ساعة مغلقة، لذلك تُرسل الرسالة بالقالب المعتمد.",
  optedOutNote: (name: string) => `${name} طلب ألا تصله رسائل، لذلك لا يُرسل شيء.`,
  noWindowNote: (name: string) => `${name} لم يكتب إلى المتجر، لذلك تُرسل الرسالة بالقالب المعتمد.`,
  balanceNotice: (name: string) => `يُرسل إلى ${name} أيضاً رصيد حسابه.`,
  testOrderNote: "هذا طلب تجريبي، لذلك لا يُبلَّغ أحد.",
  cancelFailed: "لم يُحفظ التغيير. الطلب كما هو.",
  saveFailed: "لم يُحفظ التغيير. حاول مرة أخرى.",

  // States
  loadingOrders: "جارٍ تحميل الطلبات",
  emptyTitle: "لا توجد طلبات بعد",
  emptyBody: "شارك رابط الطلب أو رمز QR الخاص به. تظهر الطلبات الجديدة هنا من تلقاء نفسها.",
  copyOrderLink: "نسخ رابط الطلب",
  orderLinkCopied: "تم نسخ رابط الطلب",
  filteredTitle: "لا طلبات تطابق هذه التصفية",
  filteredSearch: (q: string) => `لا طلبات تطابق «${q}».`,
  filteredBody: (open: number, f: FilterWords) => {
    const noun = f.mode === "delivery" ? "طلب توصيل" : f.mode === "pickup" ? "طلب استلام" : "طلب";
    const adj = f.payment === "paid" ? " مدفوع" : f.payment === "unpaid" ? " غير مدفوع" : f.payment === "on_account" ? " على الحساب" : "";
    const by = f.by === undefined ? "" : f.by === null ? " بلا مسؤول" : ` يتولاه ${f.by}`;
    return `لا يوجد بين الطلبات المفتوحة (${open}) ${noun}${adj}${by}.`;
  },
  clearFilters: "مسح التصفية",
  errorLoaded: (time: string) => `تعذر تحميل الطلبات. ما تراه هو ما كان هنا عند ${bidi("ar", time)}؛ ولن يظهر أحدث منه حتى يعود الاتصال.`,
  errorNever: "تعذر تحميل الطلبات.",
  tryAgain: "حاول مرة أخرى",
  offlineBanner: (time: string) => `أنت غير متصل. ما تراه حُمّل عند ${bidi("ar", time)}. لا يمكن حفظ التغييرات حتى يعود الاتصال.`,
  detailMissing: "تعذر العثور على هذا الطلب.",
  detailMissingBody: "قد يكون الرابط قديماً، أو أن الطلب ليس في هذا المتجر.",

  // Toasts
  toastStep: (n: number, to: "confirmed" | "ready" | "done", name: string, told: boolean, lang: Lang = "ar") => {
    const phrase = to === "confirmed" ? `تم تأكيد الطلب رقم ${bidi(lang, n)}` : to === "done" ? `تم إنجاز الطلب رقم ${bidi(lang, n)}` : `الطلب رقم ${bidi(lang, n)} جاهز`;
    return told ? `${phrase}. أُبلغ ${name} عبر واتساب.` : `${phrase}. ${name} طلب ألا تصله رسائل، لذلك لم يُبلَّغ أحد.`;
  },
  toastStepFailed: (n: number, status: string, name: string, lang: Lang = "ar") =>
    `لم يُحفظ التغيير. الطلب رقم ${bidi(lang, n)} ما زال ${status} ولم يُبلَّغ ${name}.`,
  toastPaid: (n: number, method: string, amount: string, lang: Lang = "ar") => `تم تسجيل دفع الطلب رقم ${bidi(lang, n)}: ${method}، ${bidi(lang, amount)}.`,
  receiptMeta: (number: string) => `إيصال ${number}`,
  errAlreadyPaid: (n: number, lang: Lang = "ar") => `الطلب رقم ${bidi(lang, n)} مدفوع بالفعل.`,
  errCancelled: "هذا الطلب ملغى.",
  errOnAccount: "هذا الطلب على حساب العميل. سجّل الدفع من الائتمان.",
  errTest: "الطلب التجريبي لا ينقل أي مال.",
  errNotAllowed: "تسجيل الدفع للمالكين والمسؤولين فقط.",
  errBackwards: "لا يمكن إرجاع الطلب خطوة.",
  toastCancelled: (n: number, stock: number, refund: string | null, credit: boolean, lang: Lang = "ar") =>
    `تم إلغاء الطلب رقم ${bidi(lang, n)}.${stock > 0 ? (stock === 1 ? " عاد صنف واحد إلى المخزون." : stock === 2 ? " عاد صنفان إلى المخزون." : stock <= 10 ? ` عادت ${stock} أصناف إلى المخزون.` : ` عاد ${stock} صنفاً إلى المخزون.`) : ""}${refund ? ` يستحق استرداد ${bidi(lang, refund)}.` : ""}${credit ? " خُصمت عملية البيع من الحساب." : ""}`,


  // Timeline sentences
  automatically: "تلقائياً",
  actPlaced: (customer: string) => `قدّم ${customer} الطلب`,
  actTook: (actor: string) => `استلم ${actor} الطلب`,
  actAssigned: (actor: string, to: string) => `أسند ${actor} الطلب إلى ${to}`,
  actUnassigned: (actor: string) => `ترك ${actor} الطلب بلا مسؤول`,
  actConfirmed: (actor: string) => `أكّد ${actor} الطلب`,
  actReady: (actor: string) => `حدّد ${actor} الطلب كجاهز`,
  actDone: (actor: string) => `أنجز ${actor} الطلب`,
  actPaid: (method: string | null, amount: string, actor: string) =>
    method === null
      ? `تم الدفع بالرابط${amount ? `، ${isolate(amount)}` : ""}.`
      : `تم الدفع، ${method}${amount ? `، ${isolate(amount)}` : ""}. سجّله ${actor}.`,
  actCancelled: (actor: string, reason: string, stock: number) =>
    `ألغى ${actor} الطلب${reason ? ` (${reason})` : ""}${stock > 0 ? ` · عاد إلى المخزون: ${stock}` : ""}`,
  actRefundDue: (amount: string) => `يستحق استرداد ${isolate(amount)}`,
  actLatePayment: "وصلت دفعة بعد انتهاء صلاحية الرابط",

  // Names for screen readers
  assignFailed: "لم يُحفظ التغيير. لم يتغير أحد.",
};

export const ORDERS_COPY: Record<Lang, typeof en> = { en, ar };
export const copy = (lang: Lang): typeof en => ORDERS_COPY[lang] ?? ORDERS_COPY.en;
