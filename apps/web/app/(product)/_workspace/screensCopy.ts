// Every word of the workspace's five working screens (Inbox, Credit accounts, Orders, Bookings
// list and Team), in English and Arabic, in one place so a reviewer can read them together.
// Moved out of Screens.tsx unchanged when that file was split into one file per screen; the
// screens in ./screens/ read it. `start/honesty.test.mjs` reads this block for banned words.

export type Activity = {
  id: string; subject: "conversation" | "order" | "booking" | "account"; action: string;
  detail: Record<string, string | number>; actor_name: string; created_at: string;
};

export const T = {
  en: {
    unreachable: "Cannot reach ALYR right now. This page tries again by itself.",
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
    tabInbox: "Inbox", inboxSub: "Every customer conversation, answered by automatic replies or by you",
    open: "Open", closed: "Closed", noChats: "No conversations here. As a customer in the chat, send \"hello\".",
    pick: "Choose a conversation to read it.", you: "You", assistant: "Auto-reply", customerSays: "Customer",
    paused: "You are answering", pausedHint: "Automatic replies are off for this customer until you close the conversation or turn them back on.",
    handBack: "Turn automatic replies back on", close: "Close", reopen: "Reopen", reply: "Reply", replyHere: "Write a reply",
    windowOpen: (h: number) => (h < 1 ? "Free replies allowed for less than an hour" : `Free replies allowed for ${h} more hours`),
    windowClosed: "More than 24 hours since their last message. WhatsApp only allows an approved template now; typed replies are refused.",
    notSent: "Not sent",
    tabBookings: "Bookings", bookingsSub: "The day by person or chair: booked from the chat, by phone or at the counter",
    noBookings: "No bookings in the next week. In the chat, send \"book\" as a customer.",
    when: "When", service: "Service", came: "Came", noShow: "No-show", cancel: "Cancel",
    bk: { booked: "Booked", completed: "Came", cancelled: "Cancelled", no_show: "No-show" } as Record<string, string>,
    tabLedger: "Credit ledger", tabOrders: "Orders", ordersSub: "Placed through the order link",
    noOrders: "No orders yet. In the chat, tap \"Place an order\" as a customer.", table: (label: string) => `Table ${label}`,
    testOrder: "Test order",
    docLink: (kind: string, number: string, status: string) => `${({ receipt: "Receipt", invoice: "Invoice", deposit_receipt: "Deposit receipt" } as Record<string, string>)[kind] ?? "Document"} ${number}${status === "void" ? " (cancelled)" : ""}`,
    orderNo: "Order", items: "Items", payment: "Payment", status: "Status",
    pay: { unpaid: "Not paid", paid: "Paid", on_account: "On account" } as Record<string, string>,
    st: { new: "New", confirmed: "Confirmed", ready: "Ready", done: "Done", cancelled: "Cancelled" } as Record<string, string>,
    next: { new: "Confirm", confirmed: "Mark ready", ready: "Mark done" } as Record<string, string>,
    followsUp: "Follows up", total: "Total",
    notDelivered: "Not delivered",
    howEnded: "How did it end?", cancelClose: "Keep open", why: "Why was it lost?",
    outcomes: { sold: "Sold", booked: "Booked", answered: "Answered", lost: "Lost" } as Record<string, string>,
    reasons: {
      price: "Price", not_available: "Not available", no_reply: "Stopped replying",
      went_elsewhere: "Went elsewhere", other: "Other",
    } as Record<string, string>,
    did: (a: Activity, outcomes: Record<string, string>, reasons: Record<string, string>) => {
      const who = a.actor_name === "Assistant" ? "Auto-reply" : a.actor_name;
      const n = a.detail.number ? ` #${a.detail.number}` : "";
      const thing = { conversation: "this conversation", order: `order${n}`, booking: `booking${n}`, account: "the credit account" }[a.subject];
      switch (a.action) {
        case "took": return `${who} took ${thing}`;
        case "data_exported": return `${who} downloaded this customer's data`;
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
        case "message_retried": return `${who} sent a message again that had not reached the customer`;
        default: return `${who}: ${thing} ${a.action}`;
      }
    },
  },
  ar: {
    unreachable: "تعذّر الوصول إلى ALYR الآن. تعيد هذه الصفحة المحاولة تلقائياً.",
    ledger: "دفتر الديون", sub: "من عليه مبلغ، ومنذ متى", outstanding: "إجمالي المستحق",
    owing: (n: number) => `${n} عميل عليهم مبالغ`, remind: "إرسال التذكيرات",
    remindHint: "للعملاء الذين مضى على أقدم فاتورة غير مدفوعة ٣٠ يوماً أو أكثر",
    sent: (n: number, skipped: number) =>
      `تم إرسال ${n} تذكير` + (skipped ? `، وتم تخطي ${skipped} (وعدوا بتاريخ أو تم تذكيرهم خلال ٣ أيام أو طلبوا الإيقاف)` : ""),
    collected: "المحصّل عبر روابط الدفع", payments: (n: number) => `${n} دفعة`,
    promised: (d: string) => `وعد بالدفع قبل ${d}`, overLimit: "تجاوز حد الائتمان", optedOut: "طلب الإيقاف", customer: "العميل", balance: "الرصيد", age: "أقدم مستحق",
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
    tabInbox: "المحادثات", inboxSub: "كل محادثات العملاء، ترد عليها الردود التلقائية أو أنت",
    open: "مفتوحة", closed: "مغلقة", noChats: "لا توجد محادثات. أرسل \"hello\" كعميل في المحادثة.",
    pick: "اختر محادثة لقراءتها.", you: "أنت", assistant: "رد تلقائي", customerSays: "العميل",
    paused: "أنت من يرد", pausedHint: "الردود التلقائية متوقفة لهذا العميل حتى تغلق المحادثة أو تعيد تشغيلها.",
    handBack: "أعد تشغيل الردود التلقائية", close: "إغلاق", reopen: "إعادة فتح", reply: "إرسال", replyHere: "اكتب رداً",
    windowOpen: (h: number) => (h < 1 ? "الرد الحر متاح لأقل من ساعة" : `الرد الحر متاح لمدة ${h} ساعة`),
    windowClosed: "مضى أكثر من ٢٤ ساعة على آخر رسالة من العميل. واتساب يسمح الآن بالقوالب المعتمدة فقط، والردود المكتوبة مرفوضة.",
    notSent: "لم تُرسل",
    tabBookings: "الحجوزات", bookingsSub: "اليوم حسب الموظفة أو الكرسي: من المحادثة أو الهاتف أو في المحل",
    noBookings: "لا توجد حجوزات خلال الأسبوع القادم. أرسل \"book\" كعميل في المحادثة.",
    when: "الموعد", service: "الخدمة", came: "حضر", noShow: "لم يحضر", cancel: "إلغاء",
    bk: { booked: "محجوز", completed: "حضر", cancelled: "ملغي", no_show: "لم يحضر" } as Record<string, string>,
    tabLedger: "دفتر الديون", tabOrders: "الطلبات", ordersSub: "الطلبات الواردة من رابط الطلب",
    noOrders: "لا توجد طلبات بعد. في المحادثة اضغط \"اطلب الآن\" كعميل.", table: (label: string) => `طاولة ${label}`,
    testOrder: "طلب تجريبي",
    docLink: (kind: string, number: string, status: string) => `${({ receipt: "إيصال", invoice: "فاتورة", deposit_receipt: "إيصال عربون" } as Record<string, string>)[kind] ?? "مستند"} ${number}${status === "void" ? " (ملغى)" : ""}`,
    orderNo: "الطلب", items: "الأصناف", payment: "الدفع", status: "الحالة",
    pay: { unpaid: "غير مدفوع", paid: "مدفوع", on_account: "على الحساب" } as Record<string, string>,
    st: { new: "جديد", confirmed: "مؤكد", ready: "جاهز", done: "منجز", cancelled: "ملغي" } as Record<string, string>,
    next: { new: "تأكيد", confirmed: "جاهز", ready: "تم الإنجاز" } as Record<string, string>,
    followsUp: "المتابع", total: "المجموع",
    notDelivered: "لم تصل",
    howEnded: "كيف انتهت؟", cancelClose: "أبقِها مفتوحة", why: "لماذا خسرناه؟",
    outcomes: { sold: "تم البيع", booked: "تم الحجز", answered: "تمت الإجابة", lost: "خسرناه" } as Record<string, string>,
    reasons: {
      price: "السعر", not_available: "غير متوفر", no_reply: "توقف عن الرد",
      went_elsewhere: "ذهب لغيرنا", other: "سبب آخر",
    } as Record<string, string>,
    did: (a: Activity, outcomes: Record<string, string>, reasons: Record<string, string>) => {
      const who = a.actor_name === "Customer" ? "العميل" : a.actor_name === "Assistant" ? "رد تلقائي" : a.actor_name;
      const n = a.detail.number ? ` رقم ${a.detail.number}` : "";
      const thing = { conversation: "المحادثة", order: `الطلب${n}`, booking: `الحجز${n}`, account: "الحساب الآجل" }[a.subject];
      switch (a.action) {
        case "took": return `${who} تولّى ${thing}`;
        case "data_exported": return `${who} نزّل بيانات هذا العميل`;
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
        case "message_retried": return `${who} أعاد إرسال رسالة لم تصل إلى العميل`;
        default: return `${who}: ${thing} ${a.action}`;
      }
    },
  },
};

export const BLOCK_REASON: Record<string, string> = {
  opted_out: "customer said stop",
  no_consent: "customer has not agreed to messages",
  no_marketing_consent: "customer has not agreed to offers",
  window_closed: "more than 24 hours since their last message",
  billing_paused: "ALYR paused automatic messages until your payment is recorded",
};
