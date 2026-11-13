/**
 * English and Arabic copy for the redesigned Inbox area (J04).
 *
 * Rules:
 * - No AI / banned words
 * - Exact consequence statements
 * - Strictly paired keys between English and Arabic
 */

export type Lang = "en" | "ar";

const en = {
  // Title & Header
  title: "Inbox",
  unreadCount: (n: number) => (n === 1 ? "1 unread" : `${n} unread`),
  liveStatus: "WhatsApp live",

  // Tabs & Views
  tabOpen: "Open",
  tabClosed: "Closed",
  viewConversations: "Conversations",
  viewNotDelivered: "Not delivered",
  viewClosed: "Closed conversations",

  // Search & Chips
  searchConversations: "Search name, number or message",
  searchNotDelivered: "Search customer or message",
  searchClosed: "Search name or number",
  chipWaiting: "Waiting",
  chipMine: "Mine",
  chipUnassigned: "Unassigned",
  chipNotDelivered: "Not delivered",
  chipWindowClosed: "Window closed",
  chipAll: "All",
  chipHeldBack: "Held back",
  chipFailed: "Failed",

  // Conversation List
  automaticReplies: "Automatic replies",
  nobodyYet: "Nobody yet",
  you: "You",
  waitingMin: (m: number) => `Waiting ${m} min`,
  templateOnly: "Template only",
  today: "Today",
  yesterday: "Yesterday",

  // Thread Header & Controls
  handledBy: "Handled by",
  closeBtn: "Close",
  turnBackOn: "Turn back on",
  answersSince: (name: string, time: string, first: string) =>
    `${name} answers since ${time} · automatic replies are off for ${first}`,

  // 24-hour Window
  windowOpenTitle: (hours: number) =>
    hours === 1 ? "Typed replies allowed for 1 more hour" : `Typed replies allowed for ${hours} more hours`,
  windowClosesAt: (time: string) => `WINDOW CLOSES ${time}`,
  windowClosedBanner:
    "More than 24 hours since their last message. WhatsApp only allows an approved template now; typed replies are refused.",

  // Composer
  tabReply: "Reply",
  tabNote: "Note",
  replyPlaceholder: "Write a message to the customer...",
  notePlaceholder: "Internal note for the team (not sent to the customer)...",
  ctrlEnterSends: "Ctrl Enter sends",
  charCount: (len: number, max: number) => `${len} of ${max.toLocaleString()}`,
  btnReply: "Reply",
  btnSaveNote: "Save note",
  chipOpeningHours: "Opening hours",
  chipPayLink: "Pay link",
  chipDirections: "Directions",
  chipAllSaved: "All saved",

  // Message Bubbles & Activity
  staffNoteLabel: (name: string) => `${name} · Staff note, not sent to the customer`,
  buttonsCues: (btns: string) => `Buttons: ${btns}`,
  readStatus: "Read",
  failedStatus: (reason: string) => `Not sent: ${reason}`,
  needsPersonActivity: "Needs a person: automatic replies could not help",
  tookConversationActivity: (name: string) => `${name} took this conversation`,
  bookingMadeActivity: (num: number, time: string) => `Booking ${num} made: ${time}`,
  paidDepositActivity: (amount: string) => `Paid the ${amount} deposit by pay link`,

  // Customer Context Pane
  profileLink: "Profile",
  addLabel: "Label",
  visitsStat: "Visits",
  spentStat: "Spent, 12 mo",
  sinceStat: "Since",
  owesTitle: "Owes",
  creditAccountLink: "Credit account",
  nothingOwed: "Nothing owed",
  noCreditAccountSub: "No credit account. They pay at the counter or by pay link.",
  owesDays: (amount: string, days: number) => `${amount} for ${days} days`,
  limitAndPromise: (limit: string) => `Limit ${limit}. No promise to pay yet.`,
  nextBookingTitle: "Next booking",
  noBookingAhead: "No booking ahead",
  lastVisitSub: (visit: string) => `Last visit: ${visit}. Came.`,
  btnMove: "Move",
  btnOpenBooking: "Open booking",
  btnBookForHer: "Book for them",
  lastOrdersTitle: "Last orders",
  allOrdersLink: (n: number) => `All ${n}`,
  messagesAllowedTitle: "Messages allowed",
  purposeBookings: "Bookings and receipts",
  purposeOffers: "Offers",
  purposeBackInStock: "Back in stock",
  priceGroupLabel: "Price group",
  writesInLabel: "Writes in",
  agreedOn: (date: string) => `Agreed · ${date}`,
  notAgreed: "Not agreed",
  notAsked: "Not asked",

  // Window Closed Template Chooser
  sendTemplateTitle: "Send an approved template",
  templateCanGoCount: (avail: number, total: number) => `${avail} OF ${total} CAN GO TO THEM`,
  metaBillingDisclaimer: "Meta charges you for a template. ALYR adds nothing.",
  btnSendTemplate: "Send template",

  // Close Conversation Modal
  closeDialogTitle: (name: string) => `Close the conversation with ${name}`,
  howDidItEnd: "How did it end?",
  outcomeSold: "Sold",
  outcomeSoldSub: "An order was placed or paid",
  outcomeBooked: "Booked",
  outcomeBookedSub: "A booking was made",
  outcomeAnswered: "Answered",
  outcomeAnsweredSub: "A question was answered, nothing to sell",
  outcomeLost: "Lost",
  outcomeLostSub: "They did not buy or book",
  whyWasItLost: "Why was it lost?",
  reasonPrice: "Price",
  reasonNotAvailable: "Not available",
  reasonStoppedReplying: "Stopped replying",
  reasonWentElsewhere: "Went elsewhere",
  reasonOther: "Other",
  noteForTeam: "Note for the team (optional)",
  closeDialogInfo:
    "Closing turns automatic replies back on for this customer. If they write again, the conversation opens again.",
  btnKeepOpen: "Keep open",
  btnCloseConversation: "Close conversation",

  // Not Delivered Screen
  notDeliveredTitle: "Not delivered",
  notDeliveredSub: "Messages of the last 14 days that did not reach a customer, and why.",
  statNotDelivered14d: "Not delivered, 14 days",
  statNotDelivered14dSub: (total: number) => `of ${total.toLocaleString()} messages sent`,
  statNewSinceYesterday: "New since yesterday",
  statNewSinceYesterdaySub: "Both outside the 24-hour window",
  statHeldBack: "Held back by a rule",
  statHeldBackSub: "ALYR did not send them",
  statFailed: "Failed",
  statFailedSub: "Can be sent again now",
  colWhen: "When",
  colCustomer: "Customer",
  colMessage: "Message",
  colWhy: "Why",
  colWhenItCanGo: "When it can go",
  colWhatsAppReason: "WhatsApp's own reason",
  btnSendAgain: "Send again",
  btnOpenConversation: "Open conversation",
  cannotGo: "Cannot go",
  heldBackFooter:
    "By rule: held back means ALYR did not send it, because WhatsApp or the customer does not allow it. A row leaves when the message goes out, or after 14 days.",
  failedFooter:
    "By rule: failed means it was sent and did not arrive. Send again makes one new try. A picture or file that was not kept is sent again from the conversation.",

  // Closed Conversations Screen
  closedTitle: "Closed conversations",
  closedSub: "How each conversation ended, from the outcome chosen when it was closed.",
  statClosedWeek: "Closed this week",
  statClosedWeekSub: "so far",
  whyLostHeader: (n: number) => `Why ${n} were lost`,
  whyLostThisWeek: "this week",
  whyLostFooter: "The reason is the one a person picks when closing. It is a count, not a cause.",
  firstAnswerHeader: "First answer by a person",
  firstAnswerToday: "Today",
  firstAnswerMedian: "This week, median",
  firstAnswerWaited15m: "Waited over 15 min",
  firstAnswerFooter:
    "By rule: from the moment a customer asks for a person, or automatic replies cannot help, to the first reply by a person.",
  btnReopen: "Reopen",
  colHowItEnded: "How it ended",
  colClosedBy: "Closed by",
  colClosed: "Closed",
  colOrderBookingNote: "Order, booking or note",

  // States
  loadingTitle: "Loading inbox",
  emptyFirstRunTitle: "No conversations yet",
  emptyFirstRunSub:
    "When a customer writes to your WhatsApp number, their conversation shows up here automatically.",
  emptyFilteredTitle: "No conversations match this filter",
  btnClearFilters: "Clear filters",
  offlineBanner: (time: string) =>
    `You are offline. What you see was loaded at ${time}. Replies cannot be sent until the connection is back.`,

  // Mobile
  waitingForPersonGroup: "Waiting for a person",
  answeredGroup: "Answered, or handled by automatic replies",
  backToInbox: "Inbox",
  ordersCount: (n: number) => (n === 1 ? "1 order" : `${n} orders`),
  nextBookingBrief: (time: string) => `Next: ${time}`,
};

const ar: typeof en = {
  // Title & Header
  title: "صندوق الوارد",
  unreadCount: (n: number) => (n === 1 ? "رسالة غير مقروءة" : `${n} غير مقروءة`),
  liveStatus: "واتساب نشط",

  // Tabs & Views
  tabOpen: "المفتوحة",
  tabClosed: "المغلقة",
  viewConversations: "المحادثات",
  viewNotDelivered: "لم تصل",
  viewClosed: "المحادثات المغلقة",

  // Search & Chips
  searchConversations: "ابحث بالاسم أو الرقم أو الرسالة",
  searchNotDelivered: "ابحث بالعميل أو الرسالة",
  searchClosed: "ابحث بالاسم أو الرقم",
  chipWaiting: "في الانتظار",
  chipMine: "خاصة بي",
  chipUnassigned: "غير مسندة",
  chipNotDelivered: "لم تصل",
  chipWindowClosed: "النافذة مغلقة",
  chipAll: "الكل",
  chipHeldBack: "موقوفة بقاعدة",
  chipFailed: "تعذر الإرسال",

  // Conversation List
  automaticReplies: "ردود تلقائية",
  nobodyYet: "لم تُسند بعد",
  you: "أنت",
  waitingMin: (m: number) => `تنتظر منذ ${m} د`,
  templateOnly: "قالب فقط",
  today: "اليوم",
  yesterday: "أمس",

  // Thread Header & Controls
  handledBy: "المسؤول",
  closeBtn: "إغلاق",
  turnBackOn: "إعادة التفعيل",
  answersSince: (name: string, time: string, first: string) =>
    `${name} يجيب منذ ${time} · الردود التلقائية متوقفة مؤقتا لـ ${first}`,

  // 24-hour Window
  windowOpenTitle: (hours: number) =>
    hours === 1 ? "الردود المكتوبة مسموحة لساعة إضافية" : `الردود المكتوبة مسموحة لـ ${hours} ساعات إضافية`,
  windowClosesAt: (time: string) => `تُغلق النافذة ${time}`,
  windowClosedBanner:
    "مر أكثر من 24 ساعة منذ آخر رسالة من العميل. يسمح واتساب فقط بقالب معتمد الآن؛ الردود المكتوبة مرفوضة.",

  // Composer
  tabReply: "رد",
  tabNote: "ملاحظة",
  replyPlaceholder: "اكتب رسالة للعميل...",
  notePlaceholder: "ملاحظة داخلية للفريق (لا تُرسل للعميل)...",
  ctrlEnterSends: "Ctrl Enter للإرسال",
  charCount: (len: number, max: number) => `${len} من ${max.toLocaleString()}`,
  btnReply: "إرسال الرد",
  btnSaveNote: "حفظ الملاحظة",
  chipOpeningHours: "أوقات العمل",
  chipPayLink: "رابط الدفع",
  chipDirections: "الموقع والاتجاهات",
  chipAllSaved: "كل الردود",

  // Message Bubbles & Activity
  staffNoteLabel: (name: string) => `${name} · ملاحظة داخلية، لا تُرسل للعميل`,
  buttonsCues: (btns: string) => `الأزرار: ${btns}`,
  readStatus: "تمت القراءة",
  failedStatus: (reason: string) => `لم تُرسل: ${reason}`,
  needsPersonActivity: "بحاجة لموظف: تعذر على الردود التلقائية المساعدة",
  tookConversationActivity: (name: string) => `استلم ${name} هذه المحادثة`,
  bookingMadeActivity: (num: number, time: string) => `تم إنشاء حجز ${num}: ${time}`,
  paidDepositActivity: (amount: string) => `تم دفع العربون ${amount} عبر رابط الدفع`,

  // Customer Context Pane
  profileLink: "الملف الشخصي",
  addLabel: "وسم",
  visitsStat: "الزيارات",
  spentStat: "الإنفاق، 12 شهر",
  sinceStat: "عميل منذ",
  owesTitle: "المستحقات",
  creditAccountLink: "حساب الآجل",
  nothingOwed: "لا مستحقات",
  noCreditAccountSub: "لا يوجد حساب آجل. الدفع نقداً عند الصندوق أو عبر رابط الدفع.",
  owesDays: (amount: string, days: number) => `${amount} منذ ${days} يوم`,
  limitAndPromise: (limit: string) => `الحد ${limit}. لا يوجد وعد بالسداد بعد.`,
  nextBookingTitle: "الحجز القادم",
  noBookingAhead: "لا يوجد حجز قادم",
  lastVisitSub: (visit: string) => `آخر زيارة: ${visit}. حضر.`,
  btnMove: "تعديل",
  btnOpenBooking: "فتح الحجز",
  btnBookForHer: "حجز موعد",
  lastOrdersTitle: "آخر الطلبات",
  allOrdersLink: (n: number) => `الكل (${n})`,
  messagesAllowedTitle: "الرسائل المصرح بها",
  purposeBookings: "الحجوزات والإيصالات",
  purposeOffers: "العروض",
  purposeBackInStock: "توفر المنتجات",
  priceGroupLabel: "فئة السعر",
  writesInLabel: "لغة المحادثة",
  agreedOn: (date: string) => `موافق · ${date}`,
  notAgreed: "غير موافق",
  notAsked: "لم يُطلب الإذن",

  // Window Closed Template Chooser
  sendTemplateTitle: "إرسال قالب معتمد",
  templateCanGoCount: (avail: number, total: number) => `${avail} من ${total} يمكن إرسالها للعميل`,
  metaBillingDisclaimer: "تفرض ميتا رسوماً على القوالب. لا يضيف ALYR أي رسوم إضافية.",
  btnSendTemplate: "إرسال القالب",

  // Close Conversation Modal
  closeDialogTitle: (name: string) => `إغلاق المحادثة مع ${name}`,
  howDidItEnd: "كيف انتهت المحادثة؟",
  outcomeSold: "بيع",
  outcomeSoldSub: "تم تقديم طلب أو دفع قيمته",
  outcomeBooked: "حجز",
  outcomeBookedSub: "تم تأكيد موعد حجز",
  outcomeAnswered: "إجابة استفسار",
  outcomeAnsweredSub: "تمت الإجابة عن السؤال، دون عملية بيع",
  outcomeLost: "فقدت",
  outcomeLostSub: "لم يقم بالشراء أو الحجز",
  whyWasItLost: "ما سبب عدم الشراء؟",
  reasonPrice: "السعر",
  reasonNotAvailable: "غير متوفر",
  reasonStoppedReplying: "توقف عن الرد",
  reasonWentElsewhere: "اختار متجراً آخر",
  reasonOther: "سبب آخر",
  noteForTeam: "ملاحظة للفريق (اختياري)",
  closeDialogInfo:
    "إغلاق المحادثة يعيد تفعيل الردود التلقائية لهذا العميل. إذا تواصل مجدداً، يُعاد فتح المحادثة تلقائياً.",
  btnKeepOpen: "إبقاء مفتوحة",
  btnCloseConversation: "إغلاق المحادثة",

  // Not Delivered Screen
  notDeliveredTitle: "رسائل لم تصل",
  notDeliveredSub: "الرسائل خلال آخر 14 يوماً التي لم تصل للعميل، وأسبابها.",
  statNotDelivered14d: "لم تصل، 14 يوماً",
  statNotDelivered14dSub: (total: number) => `من إجمالي ${total.toLocaleString()} رسالة مرسلة`,
  statNewSinceYesterday: "جديدة منذ الأمس",
  statNewSinceYesterdaySub: "كلاها خارج نافذة الـ 24 ساعة",
  statHeldBack: "موقوفة بقاعدة",
  statHeldBackSub: "لم يقم ALYR بإرسالها",
  statFailed: "تعذر الإرسال",
  statFailedSub: "يمكن إعادة إرسالها الآن",
  colWhen: "الوقت",
  colCustomer: "العميل",
  colMessage: "الرسالة",
  colWhy: "السبب",
  colWhenItCanGo: "متى يمكن الإرسال",
  colWhatsAppReason: "سبب واتساب",
  btnSendAgain: "إعادة الإرسال",
  btnOpenConversation: "فتح المحادثة",
  cannotGo: "لا يمكن الإرسال",
  heldBackFooter:
    "بحكم النظام: موقوفة تعني أن ALYR لم يرسلها لأن سياسة واتساب أو إذن العميل لا يسمح بذلك. يُحذف السجل بعد الإرسال أو بانقضاء 14 يوماً.",
  failedFooter:
    "بحكم النظام: تعذر الإرسال تعني أنها أُرسلت ولم تصل. يؤدي زر إعادة الإرسال لمحاولة جديدة واحدة. الصور أو الملفات غير المحفوظة يُعاد إرسالها من المحادثة.",

  // Closed Conversations Screen
  closedTitle: "المحادثات المغلقة",
  closedSub: "كيف انتهت كل محادثة، بناءً على النتيجة المسجلة عند إغلاقها.",
  statClosedWeek: "أغلقت هذا الأسبوع",
  statClosedWeekSub: "حتى الآن",
  whyLostHeader: (n: number) => `أسباب فقدان ${n} عملاء`,
  whyLostThisWeek: "هذا الأسبوع",
  whyLostFooter: "السبب هو ما يسجله الموظف عند الإغلاق. هو رصد عددي لا استنتاج سببي.",
  firstAnswerHeader: "أول رد بشري",
  firstAnswerToday: "اليوم",
  firstAnswerMedian: "متوسط هذا الأسبوع",
  firstAnswerWaited15m: "انتظروا أكثر من 15 دقيقة",
  firstAnswerFooter:
    "بحكم النظام: من لحظة طلب العميل موظفاً، أو تعذر مساعدة الردود التلقائية، حتى وصول أول رد بشري.",
  btnReopen: "إعادة الفتح",
  colHowItEnded: "النتيجة",
  colClosedBy: "أغلقها",
  colClosed: "وقت الإغلاق",
  colOrderBookingNote: "الطلب، الحجز أو الملاحظة",

  // States
  loadingTitle: "جارٍ تحميل صندوق الوارد",
  emptyFirstRunTitle: "لا توجد محادثات بعد",
  emptyFirstRunSub:
    "عندما يكتب العميل إلى رقم الواتساب الخاص بالمتجر، ستظهر محادثته هنا تلقائياً.",
  emptyFilteredTitle: "لا توجد محادثات تطابق هذا الفلتر",
  btnClearFilters: "مسح الفلاتر",
  offlineBanner: (time: string) =>
    `أنت غير متصل بالإنترنت. البيانات المعروضة حُملت عند ${time}. لا يمكن إرسال الردود حتى تعود الشبكة.`,

  // Mobile
  waitingForPersonGroup: "في انتظار موظف",
  answeredGroup: "تم الرد، أو قيد الردود التلقائية",
  backToInbox: "الوارد",
  ordersCount: (n: number) => (n === 1 ? "طلب واحد" : `${n} طلبات`),
  nextBookingBrief: (time: string) => `القادم: ${time}`,
};

export function copy(lang: Lang): typeof en {
  return lang === "ar" ? ar : en;
}
