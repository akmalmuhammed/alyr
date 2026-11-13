/**
 * English and Arabic copy for the redesigned Orders area (J01).
 *
 * Rules:
 * - No AI / smart / assistant words
 * - Exact status names and honest consequences
 * - Both languages match key-for-key
 */

export type Lang = "en" | "ar";

const en = {
  // Title & Header
  title: "Orders",
  subtitleOpen: (n: number) => (n === 1 ? "1 open order." : `${n} open orders.`),

  // Banners
  lateOrdersBanner: (n: number, items: string) =>
    n === 1
      ? `1 order has been new for more than 15 min: ${items}. Nobody has confirmed it yet.`
      : `${n} orders have been new for more than 15 min: ${items}. Nobody has confirmed them yet.`,
  showThem: "Show them",
  showAll: "Show all",

  // Tabs
  tabOpen: "Open",
  tabNew: "New",
  tabConfirmed: "Confirmed",
  tabReady: "Ready",
  tabDone: "Done",
  tabCancelled: "Cancelled",
  tabAll: "All",

  // Filters
  searchPlaceholder: "Search order, customer, phone or item",
  filterAll: "All",
  filterPickup: "Pickup",
  filterDelivery: "Delivery",
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

  // Table columns
  colOrder: "Order",
  colPlaced: "Placed",
  colCustomer: "Customer",
  colItems: "Items",
  colHandOver: "Hand-over",
  colPayment: "Payment",
  colHandledBy: "Handled by",
  colStatus: "Status",
  colTotal: "Total",

  // Status & Payment badges
  stNew: "New",
  stConfirmed: "Confirmed",
  stReady: "Ready",
  stDone: "Done",
  stCancelled: "Cancelled",
  payPaid: "Paid",
  payNotPaid: "Not paid",
  payOnAccount: "On account",
  payLinkOpen: "Pay link open",
  tagTestOrder: "Test order",

  // Fulfilment & Time
  pickupAtShop: "Pickup",
  deliveryMode: "Delivery",
  todayWord: "today",
  nobodyAssigned: "Nobody",
  nobodyYet: "Nobody yet",

  // Pager & Notes
  openRuleFooter: (amount: string) =>
    `By rule: open orders are New, Confirmed and Ready, plus any unpaid order that is not cancelled · ${amount}`,
  past30DaysNote: "Done and cancelled orders from the last 30 days.",
  updatedAt: (time: string) => `Updated ${time}`,
  showingCount: (shown: number, total: number) => `Showing ${shown} of ${total} open orders`,
  showMore: "Show more",

  // Drawer & Detail
  drawerTitle: (n: number) => `Order #${n}`,
  detailTitle: (n: number) => `Order #${n}`,
  openFullPage: "Open full page",
  backToOrders: "Back to orders",
  previousOrder: "Previous order",
  nextOrder: "Next order",
  conversationBtn: "Conversation",
  openConversation: "Open conversation",
  replyWindowHours: (h: number) => `Typed replies allowed for ${h} more hours`,
  replyWindowClosed: "The 24-hour window is closed",

  // Section headers
  sectionItems: (count: number) => `Items · ${count}`,
  sectionHandOver: "Hand-over",
  sectionPayment: "Payment",
  sectionTimeline: "Timeline",
  timelineSteps: (count: number) => (count === 1 ? "1 step" : `${count} steps`),
  newestFirst: "Newest first",
  codeLabel: "Code",

  // Sum block
  sumItems: "Items",
  sumDelivery: "Delivery fee",
  sumPickupFree: "Pickup at the shop",
  noFee: "None",
  sumTotal: "Total",

  // Margin block (managers only)
  marginTitle: "Estimated margin",
  ownersAndAdmins: "Owners and admins",
  marginRule: (rev: string, cost: string) =>
    `By rule: items after discounts (${rev}) minus the cost kept for each item (${cost}). The delivery fee is left out.`,
  marginIncomplete: "Some items have no cost kept; the margin counts the rest.",
  marginBelowCost: "Below cost",

  // Tracking page panel ("What customer sees")
  whatCustomerSeesTitle: (name: string) => `What ${name} sees`,
  trackingDesc:
    "Their tracking page shows four steps with the time of each and staff first name: placed, confirmed, ready, complete.",
  copyLink: "Copy link",
  linkCopied: "Link copied",
  openPage: "Open page",
  nowShowing: (step: string) => `Now showing: ${step}`,

  // Document panel
  documentTitle: "Document",
  openInDocuments: "Open in Documents",
  docImmutableNote: "A document that is issued cannot be edited. A correction is a credit note.",

  // Status step buttons
  btnConfirmOrder: "Confirm order",
  btnMarkReady: "Mark ready",
  btnMarkDone: "Mark done",
  btnCancelOrder: "Cancel order",
  btnMarkPaid: "Mark paid",

  // Step notes before taking action
  noteConfirming: (name: string, n: number) =>
    `Confirming tells ${name} on WhatsApp: “Order #${n} is confirmed.”`,
  noteReadyPickup: (name: string, n: number) =>
    `Marking ready tells ${name} on WhatsApp: “Order #${n} is ready for collection.”`,
  noteReadyDelivery: (name: string, n: number) =>
    `Marking ready tells ${name} on WhatsApp: “Order #${n} is ready for delivery.”`,
  noteDone: (name: string, n: number) =>
    `Marking done tells ${name} on WhatsApp: “Order #${n} is complete. Thank you.”`,

  // Mark paid modal
  markPaidTitle: (n: number) => `Mark order #${n} as paid`,
  howDidTheyPay: "How did they pay?",
  methodCash: "Cash",
  methodBankTransfer: "Bank transfer",
  methodCardTerminal: "Card machine",
  methodCheque: "Cheque",
  hintBankTransfer: "Reference from the transfer",
  hintCardTerminal: "Slip number",
  hintCheque: "Cheque number",
  refOptional: "Reference (optional)",
  refPlaceholder: "Up to 80 characters",
  receiptNotice: (name: string) => `A receipt is made and sent to ${name} on WhatsApp.`,
  timelineNotice: "The timeline shows who recorded it and when. The order keeps its step.",
  btnSaveAsPaid: "Save as paid",
  btnSaving: "Saving...",
  btnCancel: "Cancel",

  // Cancel modal
  cancelTitle: (n: number) => `Cancel order #${n}?`,
  keepOrder: "Keep the order",
  cannotBeUndone: "This cannot be undone.",
  checkRestock: "Put the items back in stock",
  checkRestockSub: (items: string) => `${items} go back to stock.`,
  whatHappensHeading: "What happens",
  whStock: "Stock",
  whStockBack: (n: number) => (n === 1 ? "1 item back in stock" : `${n} items back in stock`),
  whStockStays: "Stock stays as it is",
  whRefundDue: "Refund due",
  whNone: "None",
  whCredit: "Credit account",
  whCreditReversed: "The sale is taken off the customer's account",
  whCreditNone: "Nothing was put on account",
  whDocCreditNote: (num: string) => `Receipt ${num} is cancelled by a credit note`,
  refundBanner: (amount: string) =>
    `A refund of ${amount} is due. You make it in your own provider account; ALYR does not move money.`,
  customerToldOnWa: (name: string) => `${name} is told on WhatsApp`,
  waMsgCancelled: (n: number) => `Order #${n} has been cancelled.`,
  sentAutomatically: "sent automatically",
  windowOpenExplanation: (time: string) =>
    `They wrote at ${time}, so the message goes as written.`,
  windowClosedExplanation: "The 24-hour window is closed, so the message goes as the approved template.",
  optedOutExplanation: "They asked not to get messages, so nothing is sent.",
  creditReversalNotice: "Their balance on account is also sent to them.",

  // States
  loadingOrders: "Loading orders",
  emptyFirstRunTitle: "No orders yet",
  emptyFirstRunSub:
    "Share your order link or its QR code. New orders show up here by themselves.",
  copyOrderLink: "Copy the order link",
  orderLinkCopied: "Order link copied",
  emptyFilteredTitle: "No orders match this filter",
  clearFilters: "Clear filters",
  showAllOpenOrders: "Show all open orders",
  errorTitle: "Orders could not be loaded.",
  errorSub: (time: string) =>
    `You are looking at what was here at ${time}; nothing newer is shown until the connection is back.`,
  tryAgain: "Try again",
  offlineBanner: (time: string) =>
    `You are offline. What you see was loaded at ${time}. Changes cannot be saved until the connection is back.`,

  // Toasts
  toastStepDone: (n: number, step: string, name: string) =>
    `Order #${n} is ${step}. ${name} was told on WhatsApp.`,
  toastStepDoneOptedOut: (n: number, step: string, name: string) =>
    `Order #${n} is ${step}. ${name} asked not to get messages, so nobody was told.`,
  toastSaveFailed: (n: number, step: string, name: string) =>
    `That did not save. Order #${n} is still ${step} and ${name} has not been told.`,
  toastAlreadyPaid: (n: number) => `Order #${n} is already paid.`,
  toastMarkedPaid: (n: number, method: string, amount: string) =>
    `Order #${n} is marked paid: ${method}, ${amount}.`,
  toastCancelled: (n: number, stockMsg: string) => `Order #${n} is cancelled. ${stockMsg}`,
  openOrderAction: "Open order",
};

const ar: typeof en = {
  // Title & Header
  title: "الطلبات",
  subtitleOpen: (n: number) => (n === 1 ? "طلب مفتوح واحد." : `${n} طلبات مفتوحة.`),

  // Banners
  lateOrdersBanner: (n: number, items: string) =>
    n === 1
      ? `طلب واحد جديد منذ أكثر من 15 دقيقة: ${items}. لم يؤكده أحد بعد.`
      : `${n} طلبات جديدة منذ أكثر من 15 دقيقة: ${items}. لم يؤكدها أحد بعد.`,
  showThem: "عرضها",
  showAll: "عرض الكل",

  // Tabs
  tabOpen: "مفتوحة",
  tabNew: "جديدة",
  tabConfirmed: "مؤكدة",
  tabReady: "جاهزة",
  tabDone: "مكتملة",
  tabCancelled: "ملغاة",
  tabAll: "الكل",

  // Filters
  searchPlaceholder: "ابحث برقم الطلب، العميل، الهاتف أو الصنف",
  filterAll: "الكل",
  filterPickup: "استلام",
  filterDelivery: "توصيل",
  paymentLabel: "الدفع",
  paymentAny: "أي حالة",
  paymentPaid: "مدفوع",
  paymentNotPaid: "غير مدفوع",
  paymentOnAccount: "على الحساب",
  handledByLabel: "المسؤول",
  handledByAnyone: "الكل",
  handledByNobody: "بلا مسؤول",
  sortNewest: "الأحدث أولاً",
  sortOldest: "الأقدم أولاً",

  // Table columns
  colOrder: "الطلب",
  colPlaced: "وقت الطلب",
  colCustomer: "العميل",
  colItems: "الأصناف",
  colHandOver: "التسليم",
  colPayment: "الدفع",
  colHandledBy: "المسؤول",
  colStatus: "الحالة",
  colTotal: "المجموع",

  // Status & Payment badges
  stNew: "جديد",
  stConfirmed: "مؤكد",
  stReady: "جاهز",
  stDone: "مكتمل",
  stCancelled: "ملغي",
  payPaid: "مدفوع",
  payNotPaid: "غير مدفوع",
  payOnAccount: "على الحساب",
  payLinkOpen: "رابط الدفع مفتوح",
  tagTestOrder: "طلب تجريبي",

  // Fulfilment & Time
  pickupAtShop: "استلام من المتجر",
  deliveryMode: "توصيل",
  todayWord: "اليوم",
  nobodyAssigned: "بلا مسؤول",
  nobodyYet: "بلا مسؤول بعد",

  // Pager & Notes
  openRuleFooter: (amount: string) =>
    `حسب القاعدة: الطلبات المفتوحة تشمل الجديدة، المؤكدة، الجاهزة، وأي طلب غير مدفوع لم يُلغَ · ${amount}`,
  past30DaysNote: "الطلبات المكتملة والملغاة من آخر 30 يوماً.",
  updatedAt: (time: string) => `تم التحديث ${time}`,
  showingCount: (shown: number, total: number) => `عرض ${shown} من أصل ${total} طلبات مفتوحة`,
  showMore: "عرض المزيد",

  // Drawer & Detail
  drawerTitle: (n: number) => `الطلب رقم ${n}`,
  detailTitle: (n: number) => `الطلب رقم ${n}`,
  openFullPage: "فتح الصفحة الكاملة",
  backToOrders: "العودة للطلبات",
  previousOrder: "الطلب السابق",
  nextOrder: "الطلب التالي",
  conversationBtn: "المحادثة",
  openConversation: "فتح المحادثة",
  replyWindowHours: (h: number) => `الرد المباشر متاح لمدة ${h} ساعات قادمة`,
  replyWindowClosed: "نافذة الـ 24 ساعة مغلقة",

  // Section headers
  sectionItems: (count: number) => `الأصناف · ${count}`,
  sectionHandOver: "التسليم",
  sectionPayment: "الدفع",
  sectionTimeline: "سجل الإجراءات",
  timelineSteps: (count: number) => (count === 1 ? "خطوة واحدة" : `${count} خطوات`),
  newestFirst: "الأحدث أولاً",
  codeLabel: "الرمز",

  // Sum block
  sumItems: "الأصناف",
  sumDelivery: "رسوم التوصيل",
  sumPickupFree: "استلام من المتجر",
  noFee: "مجاناً",
  sumTotal: "المجموع",

  // Margin block (managers only)
  marginTitle: "هامش الربح التقديري",
  ownersAndAdmins: "للمالك والمسؤولين",
  marginRule: (rev: string, cost: string) =>
    `حسب القاعدة: الأصناف بعد الخصومات (${rev}) ناقص تكلفة كل صنف (${cost}). رسوم التوصيل مستثناة.`,
  marginIncomplete: "بعض الأصناف لا تحتوي على تكلفة مسجلة؛ يحتسب الهامش الباقي.",
  marginBelowCost: "أقل من التكلفة",

  // Tracking page panel ("What customer sees")
  whatCustomerSeesTitle: (name: string) => `ما يراه ${name}`,
  trackingDesc:
    "تعرض صفحة التتبع أربع خطوات مع وقت كل منها واسم الموظف: تم الطلب، مؤكد، جاهز، مكتمل.",
  copyLink: "نسخ الرابط",
  linkCopied: "تم نسخ الرابط",
  openPage: "فتح الصفحة",
  nowShowing: (step: string) => `يظهر الآن: ${step}`,

  // Document panel
  documentTitle: "المستند",
  openInDocuments: "فتح في المستندات",
  docImmutableNote: "لا يمكن تعديل مستند بعد إصداره. التصحيح يتم عبر إشعار دائن.",

  // Status step buttons
  btnConfirmOrder: "تأكيد الطلب",
  btnMarkReady: "تجهيز الطلب",
  btnMarkDone: "إتمام الطلب",
  btnCancelOrder: "إلغاء الطلب",
  btnMarkPaid: "تسجيل كمدفوع",

  // Step notes before taking action
  noteConfirming: (name: string, n: number) =>
    `التأكيد يرسل رسالة إلى ${name} عبر واتساب: «تم تأكيد الطلب رقم ${n}.»`,
  noteReadyPickup: (name: string, n: number) =>
    `تحديد الجاهزية يرسل إلى ${name} عبر واتساب: «طلبك رقم ${n} جاهز للاستلام.»`,
  noteReadyDelivery: (name: string, n: number) =>
    `تحديد الجاهزية يرسل إلى ${name} عبر واتساب: «طلبك رقم ${n} جاهز للتوصيل.»`,
  noteDone: (name: string, n: number) =>
    `الإتمام يرسل إلى ${name} عبر واتساب: «اكتمل الطلب رقم ${n}. شكراً لك.»`,

  // Mark paid modal
  markPaidTitle: (n: number) => `تسجيل الطلب رقم ${n} كمدفوع`,
  howDidTheyPay: "كيف دفع؟",
  methodCash: "نقداً",
  methodBankTransfer: "تحويل بنكي",
  methodCardTerminal: "بطاقة عبر الجهاز",
  methodCheque: "شيك",
  hintBankTransfer: "المرجع من التحويل",
  hintCardTerminal: "رقم الإيصال",
  hintCheque: "رقم الشيك",
  refOptional: "المرجع (اختياري)",
  refPlaceholder: "حتى 80 حرفاً",
  receiptNotice: (name: string) => `يتم إصدار إيصال وإرساله إلى ${name} عبر واتساب.`,
  timelineNotice: "يظهر السجل من قام بالتسجيل ووقته. ويحتفظ الطلب بخطوته الحالية.",
  btnSaveAsPaid: "حفظ كمدفوع",
  btnSaving: "جارٍ الحفظ...",
  btnCancel: "إلغاء",

  // Cancel modal
  cancelTitle: (n: number) => `إلغاء الطلب رقم ${n}؟`,
  keepOrder: "الإبقاء على الطلب",
  cannotBeUndone: "لا يمكن التراجع عن هذا الإجراء.",
  checkRestock: "إعادة الأصناف إلى المخزون",
  checkRestockSub: (items: string) => `تعود ${items} إلى المخزون.`,
  whatHappensHeading: "ماذا يحدث",
  whStock: "المخزون",
  whStockBack: (n: number) => (n === 1 ? "صنف واحد يعود للمخزون" : `${n} أصناف تعود للمخزون`),
  whStockStays: "يبقى المخزون كما هو",
  whRefundDue: "مستحق الاسترداد",
  whNone: "لا يوجد",
  whCredit: "الحساب الآجل",
  whCreditReversed: "تُخصم العملية من حساب العميل",
  whCreditNone: "لم يُقيد شيء على الحساب",
  whDocCreditNote: (num: string) => `يُلغى الإيصال ${num} بإشعار دائن`,
  refundBanner: (amount: string) =>
    `يستحق استرداد بقيمة ${amount}. يمكنك إجراؤه عبر حساب بوابة الدفع الخاصة بك؛ ألير لا تنقل الأموال.`,
  customerToldOnWa: (name: string) => `يتم إبلاغ ${name} عبر واتساب`,
  waMsgCancelled: (n: number) => `تم إلغاء الطلب رقم ${n}.`,
  sentAutomatically: "أُرسلت تلقائياً",
  windowOpenExplanation: (time: string) =>
    `كتب في ${time}، لذا تُرسل الرسالة كنص مباشر.`,
  windowClosedExplanation: "نافذة الـ 24 ساعة مغلقة، لذا تُرسل الرسالة كقالب معتمد.",
  optedOutExplanation: "طلب عدم استلام رسائل، لذا لن يُرسل شيء.",
  creditReversalNotice: "يتم إرسال رصيد حسابه إليه أيضاً.",

  // States
  loadingOrders: "جارٍ تحميل الطلبات",
  emptyFirstRunTitle: "لا توجد طلبات بعد",
  emptyFirstRunSub:
    "شارك رابط الطلب أو رمز الاستجابة السريعة QR. ستظهر الطلبات الجديدة هنا تلقائياً.",
  copyOrderLink: "نسخ رابط الطلب",
  orderLinkCopied: "تم نسخ رابط الطلب",
  emptyFilteredTitle: "لا توجد طلبات تطابق هذا الفلتر",
  clearFilters: "مسح الفلاتر",
  showAllOpenOrders: "عرض كل الطلبات المفتوحة",
  errorTitle: "تعذر تحميل الطلبات.",
  errorSub: (time: string) =>
    `أنت تشاهد البيانات كما كانت عند ${time}؛ لن تظهر بيانات أحدث حتى عودة الاتصال.`,
  tryAgain: "إعادة المحاولة",
  offlineBanner: (time: string) =>
    `أنت غير متصل بالإنترنت. ما تراه تم تحميله عند ${time}. لا يمكن حفظ التغييرات حتى عودة الاتصال.`,

  // Toasts
  toastStepDone: (n: number, step: string, name: string) =>
    `الطلب رقم ${n} ${step}. تم إبلاغ ${name} عبر واتساب.`,
  toastStepDoneOptedOut: (n: number, step: string, name: string) =>
    `الطلب رقم ${n} ${step}. طلب ${name} عدم تلقي الرسائل، لذا لم يتم إبلاغه.`,
  toastSaveFailed: (n: number, step: string, name: string) =>
    `لم يُحفظ التغيير. لا يزال الطلب رقم ${n} بحالة ${step} ولم يتم إبلاغ ${name}.`,
  toastAlreadyPaid: (n: number) => `الطلب رقم ${n} مدفوع بالفعل.`,
  toastMarkedPaid: (n: number, method: string, amount: string) =>
    `تم تسجيل الطلب ${n} كمدفوع: ${method}، ${amount}.`,
  toastCancelled: (n: number, stockMsg: string) => `تم إلغاء الطلب ${n}. ${stockMsg}`,
  openOrderAction: "فتح الطلب",
};

export const ORDERS_COPY: Record<Lang, typeof en> = { en, ar };
export const copy = (lang: Lang) => ORDERS_COPY[lang] || ORDERS_COPY.en;
