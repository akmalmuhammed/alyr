// Every word of giving a customer a copy of their data and of forgetting a customer who asked to
// be deleted, in English and Arabic (go-live checklist item 19, ALY-119, specs/038). The Arabic
// is a draft until a native speaker has been through it (ALY-66). Both languages are written
// against one shape, so a missing Arabic line is a type error.

import type { Lang } from "./catalogCopy";

const en = {
  export: "Download their data",
  exportHint: "A file of everything you hold about them, to check and send them when they ask to see it.",
  open: "Forget this customer",
  title: (name: string) => `Forget ${name}?`,
  intro: "Do this only when the customer asks to be deleted. It cannot be undone.",
  loading: "Checking what they have with you…",
  deleted: "Deleted",
  identity: "Their number, name and email",
  messages: "Messages and the pictures in them",
  notes: "Your team's notes on them",
  consent: "What they agreed to receive, and anything they asked to be told about",
  kept: "Kept, as “Forgotten customer”",
  orders: "Orders, without the delivery address or note",
  bookings: "Bookings, without the note",
  account: "Their credit account, if they have one",
  documents: "Receipts and invoices, unchanged: the law requires you to keep them",
  owes: (amount: string) => `They still owe you ${amount}. Once forgotten, you cannot remind them.`,
  blocked: "Finish or cancel their open orders and upcoming bookings first.",
  openOrders: "Open orders",
  upcoming: "Upcoming bookings",
  again: "If they write again, they start as a new customer.",
  confirm: "Forget for good",
  cancel: "Cancel",
  failed: "That did not work. Try again.",
};

const ar: typeof en = {
  export: "تنزيل بياناته",
  exportHint: "ملف بكل ما لديك عنه، لتراجعه وترسله إليه عندما يطلب الاطلاع على بياناته.",
  open: "حذف بيانات هذا العميل",
  title: (name: string) => `حذف بيانات ${name}؟`,
  intro: "افعل هذا فقط عندما يطلب العميل حذف بياناته. لا يمكن التراجع عنه.",
  loading: "نتحقق مما لديه عندك…",
  deleted: "ما سيُحذف",
  identity: "رقمه واسمه وبريده",
  messages: "الرسائل والصور التي فيها",
  notes: "ملاحظات فريقك عنه",
  consent: "ما وافق على استلامه، وما طلب أن نُعلمه به",
  kept: "ما يبقى، باسم «عميل محذوف»",
  orders: "الطلبات، دون عنوان التوصيل أو الملاحظة",
  bookings: "الحجوزات، دون الملاحظة",
  account: "حساب الآجل، إن كان له حساب",
  documents: "الإيصالات والفواتير كما هي: القانون يلزمك بحفظها",
  owes: (amount: string) => `ما زال عليه لك ${amount}. بعد الحذف لن تستطيع تذكيره.`,
  blocked: "أكمل طلباته المفتوحة وحجوزاته القادمة أو ألغها أولاً.",
  openOrders: "طلبات مفتوحة",
  upcoming: "حجوزات قادمة",
  again: "إن راسلك مرة أخرى، يبدأ كعميل جديد.",
  confirm: "حذف نهائي",
  cancel: "إلغاء",
  failed: "لم ينجح ذلك. حاول مرة أخرى.",
};

export const FORGET: Record<Lang, typeof en> = { en, ar };
