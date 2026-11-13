"use client";

// Every component of the kit in every state, in both languages and both themes. Not part of the
// product: it is a 404 in a production build (page.tsx). The words here are samples; the product
// takes its own from each screen's copy.

import { useEffect, useState } from "react";
import {
  Avatar, Banner, Band, BandItem, Button, Check, Chip, DashedSlot, Empty, Field, FormSection, IconButton, Input,
  KV, KVList, Kbd, Meter, PageTitle, Panel, PanelBody, PanelFooter, PanelHeader, Radio, Search, Section,
  SectionLabel, Select, Stat, Status, Steps, Tabs, Tag, Textarea, Thumb, Timeline, Toggle, UTabs, UiIcon, UiRoot,
  tabPanelId,
} from "../../_ui";
import "../../_ui/ui.css";
import "./gallery.css";

type Words = typeof EN;

const NB = " ";

const EN = {
  barTitle: "ALYR UI kit, part 1: controls and content blocks",
  languageNames: ["English", "العربية"],
  themeNames: ["Device", "Light", "Dark"],
  note: "Every component in every state. Sample data: Nuqta Car Care, Thursday 12 November 2026.",
  // buttons
  buttons: "Buttons",
  buttonsNote: "One Volt button per screen: its words and nothing else, its top inline-end corner cut. A Volt button that cannot be pressed is drawn as an outline. Other kinds may carry a 16 px icon. Heights 28, 32, 36 and 44.",
  newOrder: "New order", export: "Export", save: "Save", cancelOrder: "Cancel order", download: "Download", close: "Close",
  sendAgain: "Send again", sending: "Sending the invite", add: "Add a category", open: "Open inbox",
  kinds: ["Volt", "Dark", "Line", "Quiet", "Bad"],
  sizes: ["xs 28", "sm 32", "md 36", "touch 44"],
  states: ["Default", "With icon", "Disabled", "Busy", "Link", "Full width"],
  iconButtons: "Icon buttons", more: "More", previous: "Previous", next: "Next", clear: "Clear search",
  // tags
  tags: "Tags and statuses",
  tagsNote: "A tag is a state of an object in a table or a header. A status is a dot and a word in a cell. Volt dot: happening now or just done. Green: healthy. Amber: waiting. Red: failed. Hollow ring: switched off.",
  tagWords: { n: "Confirmed", ok: "Paid", warn: "Not paid", bad: "Not delivered", ink: "New", volt: "Here now" },
  statusWords: { ok: "Paid", volt: "Here now", n: "On account", warn: "Not paid", bad: "Not delivered", off: "Switched off" },
  plainTag: "Sample",
  // chips and tabs
  chips: "Chips and tabs",
  chipsNote: "Chips are independent filters (pressed buttons). Segmented tabs switch a view of the same data. Underline tabs are the status tabs of a list or the sections of a detail page.",
  chipAll: "All", chipPickup: "Pickup", chipDelivery: "Delivery",
  period: "Period", today: "Today", week: "This week", days: "28 days",
  status: "Status", tabOpen: "Open", tabNew: "New", tabConfirmed: "Confirmed", tabReady: "Ready", tabDone: "Done", tabCancelled: "Cancelled",
  sections: "Sections", tabDetails: "Details", tabHistory: "History", tabPayments: "Payments",
  panelFor: (n: string) => `Content of ${n}.`,
  // fields
  fields: "Fields",
  fieldsNote: "A visible label for every field, never a placeholder. The hint and the error are named by the control (aria-describedby). Text is 13 px, and 16 px on a phone so it does not zoom.",
  nameEn: "Name in English", nameAr: "Name in Arabic", price: "Price", duration: "Duration", phone: "Phone", note2: "Note for the team",
  optional: "optional", hintShown: "Shown on the order page.", errName: "Enter a name for the category.", errPrice: "The price must be a number.",
  valueInterior: "Interior", placeholderNote: "Anything the team should know",
  select: "Select", payment: "Payment", any: "Any", paid: "Paid", unpaid: "Not paid", onAccount: "On account",
  choose: "Choose", category: "Category", cat1: "Wax and polish", cat2: "Cloths and tools", cat3: "Interior",
  search: "Search", searchLabel: "Search orders", searchPlaceholder: "Search order, customer, phone or item",
  shortcut: "Ctrl K", toggles: "Toggle, check and radio",
  showOnPage: "Show on the order page", shown: "Shown", hidden: "Hidden", unlabelled: "Show on the order page",
  checkA: "Pickup", checkB: "Delivery", checkAll: "All places", radioHow: "How the customer pays", radioHelp: "Choose one.", radioA: "Pay link", radioB: "On account", radioC: "Cash at pickup", radioErr: "Choose how the customer pays.",
  disabledOne: "Not available for this item",
  // panels
  panels: "Panels",
  panelsNote: "A hairline and an 8 px radius, no shadow. The header is 52 px; the footer carries the mono note, where the rule behind a count is written.",
  needsYou: "Needs you now", oldestFirst: "Oldest first", doneForYou: "Done for you", since: "since yesterday 09:40", seeAll: "Open orders",
  rowA: "Customers are waiting for a reply", rowAs: "Oldest 12 min · Fatima Darwish, Gulf Courier W.L.L.",
  rowB: "Orders are not confirmed", rowBs: "#1041 and #1040 · new for more than 15 min",
  rowC: "Bookings ended and are not marked", rowCs: "West Bay 2, Lusail 2 · came or did not come",
  rule: "By rule: a row appears when its count is above zero and leaves when it is back to zero.",
  review: "Review orders", markThem: "Mark them",
  kvTitle: "Order #1042", kvPlaced: "Placed", kvCustomer: "Customer", kvPhone: "Phone", kvTotal: "Total", kvPay: "Payment", kvHandled: "Handled by", kvNobody: "None",
  kvPlacedV: "Thu 12 Nov, 09:36", kvCustomerV: "Aisha Hamad", kvPayV: "Pay link open",
  // stat
  stats: "Stat, band and meter",
  statsNote: "A band is one per page, on Carbon, with the top inline-end corner cut. Figures 24 px and up are Instrument Sans with tabular figures; identifiers, times, phone numbers and money in a table or row are mono.",
  sales: "Sales today", bookings: "Bookings today", openOrders: "Open orders", waiting: "Waiting for a reply",
  of52: "of 52 slots", late: "late", min: "min",
  salesSub: "QAR 3,810 by 09:40 last Thursday", bookSub: "14 came, 20 to come, 4 not marked", ordSub: "Oldest waiting 42 min", waitSub: "First answer today: 2 min median",
  owed: "Owed to you", customers: "11 customers", slots: "Slots taken", slotsOf: "7 of 10", fullSoon: "Nearly full",
  // banners
  banners: "Banner, empty states and slots",
  bannersNote: "One banner per page, under the title: a soft fill, a dot, a sentence and one action. An empty list that was filtered or searched says what is true and offers a way back. A first-run object gets a dashed slot that shows where it will appear.",
  banWarn: "2 orders have been new for more than 15 min: #1041 (18 min) and #1040 (22 min). Nobody has confirmed them to the customer yet.",
  banBad: "Cannot reach ALYR right now. What you see is from 09:38. This page will try again by itself.",
  banOk: "Maha was invited. The email went to maha@nuqta.qa.",
  banN: "3 sample items show how this looks. Their names and prices are examples, and customers never see them.",
  show: "Show them", tryNow: "Try now", undo: "Undo", removeSamples: "Remove all samples",
  emptyTitle: "Nothing matches that", emptyText: "No item has “polish 1 litre” in its name, code or tags among the low-stock items.", showAll: "Show everything",
  slotTitle: "Your first order shows here", slotText: "When a customer orders through your link or on WhatsApp, it appears in this list with its status.", slotAction: "Copy the order link",
  // timeline
  timeline: "Timeline and steps",
  timelineNote: "A hairline down the start edge with a dot per event. Steps are numbered: done (Volt with a check), current (solid), to do (outlined). Volt means it really happened.",
  ev1: "Yousef Hassan paid order #1039, QAR 185", ev1m: "09:38 · pay link",
  ev2: "Booking made on WhatsApp: Full wash, Lusail, Fri 17:00", ev2m: "09:36 · automatic reply",
  ev3: "Salma confirmed order #1038", ev3m: "09:31",
  ev4: "Fatima Darwish asked for a person", ev4m: "09:28 · waiting",
  ev5: "The reply to Khalid Nasser did not reach him", ev5m: "09:21 · outside the 24-hour window",
  stepsA: ["Business", "Items", "WhatsApp", "Go live"], stepsLabel: "Setup progress", stepDone: "done", stepCurrent: "current", stepTodo: "to do",
  // people
  people: "Avatar and thumb",
  peopleNote: "Initials are the first letter of the first two words. A thumb is the item photo, or one of six shop colours with the item's initials.",
  // page title
  pageTitles: "Page title and section label",
  pageTitleText: "Orders", pageTitleSub: "14 open orders across five places. Placed through the order link, on WhatsApp or by your team.",
  sectionLabel: "Last orders", seeAll2: "All 7",
  // composition
  composition: "A list screen, put together",
  compositionNote: "The kit's parts in the arrangement of the Orders screen: title row, banner, tabs, filters, panel.",
  names: ["Aisha Hamad", "Khalid Nasser", "Gulf Courier W.L.L.", "Yousef Hassan"],
  items: ["Carnauba wax · 250 ml", "Microfibre cloth pack", "Fleet wash plan · monthly", "Air freshener · Oud"],
  money: (n: number) => `QAR${NB}${n.toLocaleString("en-US")}`,
  totals: [110, 72, 2730, 185],
  statusNew: "New", statusConfirmed: "Confirmed", statusReady: "Ready",
  shopName: "Nuqta Car Care",
};

const AR: Words = {
  barTitle: "مجموعة واجهة ALYR، الجزء الأول: عناصر التحكم وكتل المحتوى",
  languageNames: ["English", "العربية"],
  themeNames: ["الجهاز", "فاتح", "داكن"],
  note: "كل مكوّن في كل حالاته. بيانات تجريبية: Nuqta Car Care، الخميس 12 نوفمبر 2026.",
  buttons: "الأزرار",
  buttonsNote: "زر فولت واحد في كل شاشة، بكلماته فقط وزاويته العلوية عند نهاية السطر مقصوصة. زر فولت لا يمكن الضغط عليه يُرسم بإطار فقط. باقي الأنواع قد تحمل أيقونة من 16 بكسل. الارتفاعات 28 و32 و36 و44.",
  newOrder: "طلب جديد", export: "تصدير", save: "حفظ", cancelOrder: "إلغاء الطلب", download: "تنزيل", close: "إغلاق",
  sendAgain: "إرسال مجددًا", sending: "جارٍ إرسال الدعوة", add: "إضافة فئة", open: "فتح الرسائل",
  kinds: ["فولت", "داكن", "إطار", "هادئ", "خطر"],
  sizes: ["xs 28", "sm 32", "md 36", "touch 44"],
  states: ["عادي", "مع أيقونة", "معطّل", "قيد التنفيذ", "رابط", "بعرض كامل"],
  iconButtons: "أزرار الأيقونات", more: "المزيد", previous: "السابق", next: "التالي", clear: "مسح البحث",
  tags: "الوسوم والحالات",
  tagsNote: "الوسم حالة كائن في جدول أو في ترويسة. الحالة نقطة وكلمة في خلية. نقطة فولت: يحدث الآن أو تمّ للتو. الأخضر: سليم. العنبري: بانتظار. الأحمر: تعذّر. الحلقة الفارغة: متوقف.",
  tagWords: { n: "مؤكد", ok: "مدفوع", warn: "غير مدفوع", bad: "لم يصل", ink: "جديد", volt: "هنا الآن" },
  statusWords: { ok: "مدفوع", volt: "هنا الآن", n: "على الحساب", warn: "غير مدفوع", bad: "لم يصل", off: "متوقف" },
  plainTag: "تجريبي",
  chips: "الرقائق والتبويبات",
  chipsNote: "الرقائق مرشّحات مستقلة (أزرار مضغوطة). التبويبات المجزّأة تبدّل عرض البيانات نفسها. تبويبات الخط السفلي هي تبويبات حالة القائمة أو أقسام صفحة التفاصيل.",
  chipAll: "الكل", chipPickup: "استلام", chipDelivery: "توصيل",
  period: "الفترة", today: "اليوم", week: "هذا الأسبوع", days: "28 يومًا",
  status: "الحالة", tabOpen: "مفتوحة", tabNew: "جديدة", tabConfirmed: "مؤكدة", tabReady: "جاهزة", tabDone: "منجزة", tabCancelled: "ملغاة",
  sections: "الأقسام", tabDetails: "التفاصيل", tabHistory: "السجل", tabPayments: "المدفوعات",
  panelFor: (n: string) => `محتوى تبويب «${n}».`,
  fields: "الحقول",
  fieldsNote: "لكل حقل عنوان ظاهر، وليس نصًّا بديلًا. العنصر يشير إلى تلميحه وخطئه (aria-describedby). حجم النص 13 بكسل، و16 على الهاتف حتى لا يكبّر المتصفح الشاشة.",
  nameEn: "الاسم بالإنجليزية", nameAr: "الاسم بالعربية", price: "السعر", duration: "المدة", phone: "الهاتف", note2: "ملاحظة للفريق",
  optional: "اختياري", hintShown: "يظهر في صفحة الطلب.", errName: "أدخل اسمًا للفئة.", errPrice: "يجب أن يكون السعر رقمًا.",
  valueInterior: "Interior", placeholderNote: "أي شيء ينبغي أن يعرفه الفريق",
  select: "قائمة الاختيار", payment: "الدفع", any: "أي", paid: "مدفوع", unpaid: "غير مدفوع", onAccount: "على الحساب",
  choose: "اختر", category: "الفئة", cat1: "الشمع والتلميع", cat2: "الأقمشة والأدوات", cat3: "العناية الداخلية",
  search: "البحث", searchLabel: "ابحث في الطلبات", searchPlaceholder: "ابحث برقم الطلب أو العميل أو الهاتف أو المنتج",
  shortcut: "Ctrl K", toggles: "المفتاح ومربع الاختيار وزر الراديو",
  showOnPage: "إظهار في صفحة الطلب", shown: "ظاهر", hidden: "مخفي", unlabelled: "إظهار في صفحة الطلب",
  checkA: "استلام", checkB: "توصيل", checkAll: "كل الفروع", radioHow: "طريقة دفع العميل", radioHelp: "اختر واحدة.", radioA: "رابط الدفع", radioB: "على الحساب", radioC: "نقدًا عند الاستلام", radioErr: "اختر طريقة دفع العميل.",
  disabledOne: "غير متاح لهذا المنتج",
  panels: "اللوحات",
  panelsNote: "خط رفيع وانحناء 8 بكسل بلا ظل. الترويسة 52 بكسل، والتذييل يحمل الملاحظة بخط مونو حيث تُكتب القاعدة خلف كل عدد.",
  needsYou: "بانتظارك الآن", oldestFirst: "الأقدم أولًا", doneForYou: "تمّ عنك", since: "منذ أمس 09:40", seeAll: "فتح الطلبات",
  rowA: "عملاء بانتظار الرد", rowAs: "الأقدم 12 دقيقة · فاطمة درويش، Gulf Courier W.L.L.",
  rowB: "طلبات لم تُؤكَّد", rowBs: "#1041 و#1040 · جديدة منذ أكثر من 15 دقيقة",
  rowC: "حجوزات انتهت ولم تُسجَّل", rowCs: "West Bay 2، Lusail 2 · حضر أو لم يحضر",
  rule: "بحسب القاعدة: يظهر السطر حين يكون عدده فوق الصفر ويختفي حين يعود إلى الصفر.",
  review: "مراجعة الطلبات", markThem: "تسجيلها",
  kvTitle: "الطلب #1042", kvPlaced: "وقت الطلب", kvCustomer: "العميل", kvPhone: "الهاتف", kvTotal: "المجموع", kvPay: "الدفع", kvHandled: "المتابع", kvNobody: "لا أحد",
  kvPlacedV: "الخميس 12 نوفمبر، 09:36", kvCustomerV: "عائشة حمد", kvPayV: "رابط الدفع مفتوح",
  stats: "الإحصاءات والشريط والمقياس",
  statsNote: "الشريط واحد في الصفحة، على الكربون، وزاويته العلوية عند نهاية السطر مقصوصة. الأرقام من 24 بكسل فما فوق بخط Instrument Sans بأرقام متجانسة؛ أما المعرّفات والأوقات وأرقام الهاتف والمبالغ في الجداول والصفوف فبخط مونو.",
  sales: "مبيعات اليوم", bookings: "حجوزات اليوم", openOrders: "طلبات مفتوحة", waiting: "بانتظار الرد",
  of52: "من 52 موعدًا", late: "متأخرة", min: "دقيقة",
  salesSub: "3,810 ر.ق حتى 09:40 يوم الخميس الماضي", bookSub: "حضر 14 وبقي 20 ولم يُسجَّل 4", ordSub: "أقدم طلب ينتظر 42 دقيقة", waitSub: "أول رد اليوم: وسيط دقيقتين",
  owed: "مستحق لك", customers: "11 عميلًا", slots: "المواعيد المحجوزة", slotsOf: "7 من 10", fullSoon: "شبه ممتلئ",
  banners: "الشريط التنبيهي والحالات الفارغة والخانات",
  bannersNote: "شريط تنبيهي واحد في الصفحة تحت العنوان: خلفية خفيفة ونقطة وجملة وإجراء واحد. القائمة الفارغة بعد ترشيح أو بحث تقول ما هو صحيح وتعرض طريق العودة. أما الكائن الأول في بداية الاستخدام فله خانة بحدود متقطعة تُظهر مكانه.",
  banWarn: "طلبان جديدان منذ أكثر من 15 دقيقة: #1041 (18 دقيقة) و#1040 (22 دقيقة). لم يؤكدهما أحد للعميل بعد.",
  banBad: "تعذّر الوصول إلى ALYR الآن. ما تراه من الساعة 09:38. ستعيد الصفحة المحاولة تلقائيًا.",
  banOk: "دُعيت هناء. وصل البريد إلى maha@nuqta.qa.",
  banN: "ثلاثة منتجات تجريبية توضّح الشكل. أسماؤها وأسعارها أمثلة ولا يراها العملاء.",
  show: "عرضها", tryNow: "حاول الآن", undo: "تراجع", removeSamples: "حذف كل النماذج",
  emptyTitle: "لا شيء يطابق ذلك", emptyText: "لا يوجد منتج بين المنتجات منخفضة المخزون فيه «polish 1 litre» في اسمه أو رمزه أو وسومه.", showAll: "عرض كل شيء",
  slotTitle: "يظهر هنا أول طلب لك", slotText: "حين يطلب عميل عبر رابطك أو في واتساب يظهر الطلب في هذه القائمة مع حالته.", slotAction: "نسخ رابط الطلب",
  timeline: "الخط الزمني والخطوات",
  timelineNote: "خط رفيع على حافة البداية ونقطة لكل حدث. الخطوات مرقّمة: منجزة (فولت مع علامة صح)، حالية (مصمتة)، قادمة (بإطار). فولت يعني أن الأمر حدث فعلًا.",
  ev1: "دفع يوسف حسن الطلب #1039، 185 ر.ق", ev1m: "09:38 · رابط الدفع",
  ev2: "حجز عبر واتساب: غسيل كامل، Lusail، الجمعة 17:00", ev2m: "09:36 · رد تلقائي",
  ev3: "أكّدت سلمى الطلب #1038", ev3m: "09:31",
  ev4: "طلبت فاطمة درويش التحدث مع شخص", ev4m: "09:28 · بانتظار",
  ev5: "لم يصل الرد إلى خالد ناصر", ev5m: "09:21 · خارج نافذة 24 ساعة",
  stepsA: ["النشاط", "المنتجات", "واتساب", "الانطلاق"], stepsLabel: "تقدّم الإعداد", stepDone: "منجزة", stepCurrent: "الحالية", stepTodo: "قادمة",
  people: "الصورة الرمزية والصورة المصغّرة",
  peopleNote: "الأحرف الأولى هي أول حرف من أول كلمتين. الصورة المصغّرة هي صورة المنتج، أو أحد ألوان المتجر الستة مع الأحرف الأولى من اسم المنتج.",
  pageTitles: "عنوان الصفحة وعنوان القسم",
  pageTitleText: "الطلبات", pageTitleSub: "14 طلبًا مفتوحًا في خمسة فروع. وردت عبر رابط الطلب أو واتساب أو من فريقك.",
  sectionLabel: "آخر الطلبات", seeAll2: "الكل 7",
  composition: "شاشة قائمة مجمّعة",
  compositionNote: "أجزاء المجموعة بترتيب شاشة الطلبات: صف العنوان، الشريط التنبيهي، التبويبات، المرشّحات، اللوحة.",
  names: ["عائشة حمد", "خالد ناصر", "Gulf Courier W.L.L.", "يوسف حسن"],
  items: ["شمع كرنوبا · 250 مل", "حزمة قطع قماش", "خطة غسيل الأسطول · شهريًا", "معطّر · عود"],
  money: (n: number) => `${n.toLocaleString("en-US")}${NB}ر.ق`,
  totals: [110, 72, 2730, 185],
  statusNew: "جديد", statusConfirmed: "مؤكد", statusReady: "جاهز",
  shopName: "Nuqta Car Care",
};

const T = { en: EN, ar: AR };

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="u-kg-block">
      <div className="u-kg-head">
        <h2 className="u-kg-h">{title}</h2>
        {note ? <p className="u-kg-note">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Cell({ cap, children }: { cap: string; children: React.ReactNode }) {
  return (
    <div className="u-kg-cell">
      <p className="u-kg-cap">{cap}</p>
      {children}
    </div>
  );
}

export function Gallery({ lang, theme }: { lang: "en" | "ar"; theme: "light" | "dark" | null }) {
  const t = T[lang];

  // `?theme=` sets the same attribute the product layout and the site's switch set.
  useEffect(() => {
    if (!theme) return;
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const [period, setPeriod] = useState("week");
  const [status, setStatus] = useState("open");
  const [section, setSection] = useState("details");
  const [chips, setChips] = useState({ all: true, pickup: false, delivery: false });
  const [query, setQuery] = useState("Tyre");
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [checked, setChecked] = useState(true);
  const [pay, setPay] = useState("link");
  const [loading, setLoading] = useState(false);
  const [filterPay, setFilterPay] = useState("any");
  const [listStatus, setListStatus] = useState("open");

  const link = (nextLang: string, nextTheme: string | null) => `?lang=${nextLang}${nextTheme ? `&theme=${nextTheme}` : ""}`;

  return (
    <UiRoot lang={lang} className="u-kg">
      <header className="u-kg-bar">
        <h1 className="u-kg-bar-title">{t.barTitle}</h1>
        <nav className="u-kg-switch" aria-label="Language and theme">
          <Button size="xs" href={link("en", theme)} kind={lang === "en" ? "dark" : "line"}>{t.languageNames[0]}</Button>
          <Button size="xs" href={link("ar", theme)} kind={lang === "ar" ? "dark" : "line"}>{t.languageNames[1]}</Button>
          <Button size="xs" href={link(lang, null)} kind={theme === null ? "dark" : "line"}>{t.themeNames[0]}</Button>
          <Button size="xs" href={link(lang, "light")} kind={theme === "light" ? "dark" : "line"}>{t.themeNames[1]}</Button>
          <Button size="xs" href={link(lang, "dark")} kind={theme === "dark" ? "dark" : "line"}>{t.themeNames[2]}</Button>
        </nav>
      </header>

      <main className="u-kg-main">
        <p className="u-kg-note">{t.note}</p>

        {/* ── buttons ─────────────────────────────────────────── */}
        <Block title={t.buttons} note={t.buttonsNote}>
          <div className="u-kg-grid u-kg-grid--wide">
            {t.states.map((state, s) => (
              <Cell key={state} cap={state}>
                <div className="u-kg-col">
                  {(["volt", "dark", "line", "quiet", "bad"] as const).map((kind, k) => {
                    const label = [t.newOrder, t.save, t.export, t.close, t.cancelOrder][k];
                    if (kind === "volt") {
                      return (
                        <div key={kind} className="u-kg-row">
                          {(s === 3 || s === 5 ? (["md"] as const) : (["xs", "sm", "md", "touch"] as const)).map((size) =>
                            s === 1 ? null : (
                              <Button
                                key={size}
                                kind="volt"
                                size={size}
                                disabled={s === 2}
                                loading={s === 3}
                                loadingLabel={s === 3 ? t.sending : undefined}
                                href={s === 4 ? "#buttons" : undefined}
                                block={s === 5}
                              >
                                {label}
                              </Button>
                            ),
                          )}
                          {s === 1 ? <Tag tone="n" dot={false}>{t.kinds[0]}: no icon</Tag> : null}
                        </div>
                      );
                    }
                    return (
                      <div key={kind} className="u-kg-row">
                        {(s === 3 || s === 5 ? (["md"] as const) : (["xs", "sm", "md", "touch"] as const)).map((size) => (
                          <Button
                            key={size}
                            kind={kind}
                            size={size}
                            icon={s === 1 ? <UiIcon name={kind === "bad" ? "trash" : kind === "dark" ? "check" : "download"} /> : undefined}
                            disabled={s === 2}
                            loading={s === 3}
                            loadingLabel={s === 3 ? t.sending : undefined}
                            href={s === 4 ? "#buttons" : undefined}
                            block={s === 5}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </Cell>
            ))}
          </div>
          <span id="buttons" />
          <Cell cap={t.iconButtons}>
            <div className="u-kg-row">
              <IconButton icon={<UiIcon name="start" />} label={t.previous} size="xs" />
              <IconButton icon={<UiIcon name="end" />} label={t.next} size="xs" />
              <IconButton icon={<UiIcon name="dots" />} label={t.more} />
              <IconButton icon={<UiIcon name="download" />} label={t.download} />
              <IconButton icon={<UiIcon name="x" />} label={t.close} bare />
              <Button kind="quiet" onClick={() => setLoading((v) => !v)} icon={<UiIcon name="send" />}>{loading ? t.sending : t.sendAgain}</Button>
            </div>
          </Cell>
        </Block>

        {/* ── tags and statuses ───────────────────────────────── */}
        <Block title={t.tags} note={t.tagsNote}>
          <div className="u-kg-grid">
            <Cell cap="Tag">
              <div className="u-kg-row">
                {(["n", "ok", "warn", "bad", "ink", "volt"] as const).map((tone) => <Tag key={tone} tone={tone}>{t.tagWords[tone]}</Tag>)}
                <Tag tone="n" dot={false}>{t.plainTag}</Tag>
              </div>
            </Cell>
            <Cell cap="Status">
              <div className="u-kg-col">
                {(["ok", "volt", "n", "warn", "bad", "off"] as const).map((tone) => <Status key={tone} tone={tone}>{t.statusWords[tone]}</Status>)}
              </div>
            </Cell>
          </div>
        </Block>

        {/* ── chips and tabs ──────────────────────────────────── */}
        <Block title={t.chips} note={t.chipsNote}>
          <div className="u-kg-col">
            <Cell cap="Chip">
              <div className="u-kg-row">
                <Chip on={chips.all} count={14} onClick={() => setChips({ all: true, pickup: false, delivery: false })}>{t.chipAll}</Chip>
                <Chip on={chips.pickup} count={9} onClick={() => setChips((c) => ({ ...c, all: false, pickup: !c.pickup }))}>{t.chipPickup}</Chip>
                <Chip on={chips.delivery} count={5} onClick={() => setChips((c) => ({ ...c, all: false, delivery: !c.delivery }))}>{t.chipDelivery}</Chip>
                <Chip disabled>{t.disabledOne}</Chip>
              </div>
            </Cell>
            <Cell cap="Tabs">
              <div className="u-kg-row">
                <Tabs
                  label={t.period}
                  value={period}
                  onChange={setPeriod}
                  items={[{ id: "today", label: t.today }, { id: "week", label: t.week }, { id: "days", label: t.days }]}
                />
                <Tabs
                  label={t.status}
                  value={status}
                  onChange={setStatus}
                  items={[{ id: "open", label: t.tabOpen, count: 23 }, { id: "closed", label: t.tabDone, count: 4 }]}
                />
              </div>
            </Cell>
            <Cell cap="UTabs">
              <UTabs
                label={t.status}
                value={listStatus}
                onChange={setListStatus}
                idPrefix="kg-status"
                items={[
                  { id: "open", label: t.tabOpen, count: 14 }, { id: "new", label: t.tabNew, count: 3 }, { id: "confirmed", label: t.tabConfirmed, count: 6 },
                  { id: "ready", label: t.tabReady, count: 5 }, { id: "done", label: t.tabDone, count: 212 }, { id: "cancelled", label: t.tabCancelled, count: 4, disabled: true },
                ]}
              />
              <p role="tabpanel" id={tabPanelId("kg-status", listStatus)} aria-labelledby={`kg-status-tab-${listStatus}`} className="u-kg-note">{t.panelFor(listStatus)}</p>
            </Cell>
            <Cell cap="UTabs, as navigation (links)">
              <UTabs
                label={t.sections}
                value={section}
                onChange={setSection}
                items={[
                  { id: "details", label: t.tabDetails, href: "#details" }, { id: "history", label: t.tabHistory, href: "#history" },
                  { id: "payments", label: t.tabPayments, count: 2, href: "#payments" },
                ]}
              />
            </Cell>
          </div>
        </Block>

        {/* ── fields ──────────────────────────────────────────── */}
        <Block title={t.fields} note={t.fieldsNote}>
          <div className="u-kg-grid">
            <Cell cap="Field + Input">
              <div className="u-kg-col">
                <Field label={t.nameEn} hint={t.hintShown}><Input defaultValue={t.valueInterior} /></Field>
                <Field label={t.nameAr} optional={t.optional}><Input dir="rtl" lang="ar" defaultValue="العناية الداخلية" /></Field>
                <Field label={t.nameEn} error={t.errName}><Input defaultValue="" /></Field>
                <Field label={t.price} hint={t.hintShown} error={t.errPrice}><Input defaultValue="two" prefix="QAR" inputMode="decimal" /></Field>
                <Field label={t.duration}><Input defaultValue="45" suffix="min" inputMode="numeric" /></Field>
                <Field label={t.phone}><Input defaultValue="+974 5555 0134" dir="ltr" type="tel" /></Field>
                <Field label={t.nameEn}><Input disabled defaultValue={t.valueInterior} /></Field>
              </div>
            </Cell>
            <Cell cap="Textarea, Select">
              <div className="u-kg-col">
                <Field label={t.note2} optional={t.optional}><Textarea placeholder={t.placeholderNote} rows={3} /></Field>
                <Field label={t.category}>
                  <Select defaultValue=""><option value="" disabled>{t.choose}</option><option>{t.cat1}</option><option>{t.cat2}</option><option>{t.cat3}</option></Select>
                </Field>
                <Field label={t.category} error={t.errName}>
                  <Select defaultValue=""><option value="" disabled>{t.choose}</option><option>{t.cat1}</option></Select>
                </Field>
                <div className="u-kg-row">
                  <Select variant="filter" label={t.payment} value={filterPay} onChange={(e) => setFilterPay(e.target.value)}>
                    <option value="any">{t.any}</option><option value="paid">{t.paid}</option><option value="unpaid">{t.unpaid}</option><option value="account">{t.onAccount}</option>
                  </Select>
                  <Select variant="filter" label={t.payment} disabled><option>{t.any}</option></Select>
                </div>
              </div>
            </Cell>
            <Cell cap="Search, Kbd">
              <div className="u-kg-col">
                <Search value={query} onChange={setQuery} label={t.searchLabel} placeholder={t.searchPlaceholder} clearLabel={t.clear} />
                <Search value="" onChange={() => {}} label={t.searchLabel} placeholder={t.searchPlaceholder} />
                <div className="u-kg-row"><Kbd>{t.shortcut}</Kbd><Kbd>Esc</Kbd></div>
              </div>
            </Cell>
            <Cell cap={t.toggles}>
              <div className="u-kg-col">
                <Toggle checked={on} onChange={setOn}>{t.showOnPage}: {on ? t.shown : t.hidden}</Toggle>
                <Toggle checked={off} onChange={setOff} label={t.unlabelled} />
                <Toggle checked onChange={() => {}} disabled label={t.unlabelled} />
                <Check checked={checked} onChange={(e) => setChecked(e.target.checked)}>{t.checkA}</Check>
                <Check defaultChecked={false}>{t.checkB}</Check>
                <Check indeterminate>{t.checkAll}</Check>
                <Check disabled>{t.disabledOne}</Check>
              </div>
            </Cell>
            <Cell cap="FormSection + Radio">
              <div className="u-kg-col">
                <FormSection label={t.radioHow} help={t.radioHelp}>
                  <Radio name="kg-pay" checked={pay === "link"} onChange={() => setPay("link")}>{t.radioA}</Radio>
                  <Radio name="kg-pay" checked={pay === "account"} onChange={() => setPay("account")}>{t.radioB}</Radio>
                  <Radio name="kg-pay" disabled>{t.radioC}</Radio>
                </FormSection>
                <FormSection label={t.radioHow} error={t.radioErr}>
                  <Radio name="kg-pay2">{t.radioA}</Radio>
                  <Radio name="kg-pay2">{t.radioB}</Radio>
                </FormSection>
              </div>
            </Cell>
          </div>
        </Block>

        {/* ── panels ──────────────────────────────────────────── */}
        <Block title={t.panels} note={t.panelsNote}>
          <div className="u-kg-grid u-kg-grid--wide">
            <Panel clip>
              <PanelHeader title={t.needsYou} sub="6" right={<span>{t.oldestFirst}</span>} />
              <ul className="u-kg-list">
                {[[t.rowA, t.rowAs, "3", t.open, true], [t.rowB, t.rowBs, "2", t.review, false], [t.rowC, t.rowCs, "4", t.markThem, false]].map(([title, sub, n, action, main]) => (
                  <li key={String(title)} className="u-kg-listrow">
                    <div className="u-kg-listmain">
                      <span className="u-fig u-kg-big">{n as string}</span>
                      <div className="u-kg-lines"><b>{title as string}</b><span>{sub as string}</span></div>
                    </div>
                    <Button size="sm" kind={main ? "volt" : "line"}>{action as string}</Button>
                  </li>
                ))}
              </ul>
              <PanelFooter>{t.rule}</PanelFooter>
            </Panel>
            <Panel>
              <PanelHeader title={t.kvTitle} sub={<Status tone="volt">{t.statusNew}</Status>} right={<a className="u-link" href="#orders">{t.seeAll}</a>} level={3} />
              <PanelBody>
                <KVList>
                  <KV k={t.kvPlaced}>{t.kvPlacedV}</KV>
                  <KV k={t.kvCustomer}>{t.kvCustomerV}</KV>
                  <KV k={t.kvPhone} mono>+974 5555 0134</KV>
                  <KV k={t.kvPay}><Status tone="warn">{t.kvPayV}</Status></KV>
                  <KV k={t.kvHandled}>{t.kvNobody}</KV>
                  <KV k={t.kvTotal} mono>{t.money(110)}</KV>
                </KVList>
              </PanelBody>
              <PanelFooter right={<Button size="xs" kind="quiet">{t.close}</Button>}>{t.rule}</PanelFooter>
            </Panel>
          </div>
        </Block>

        {/* ── stat, band, meter ───────────────────────────────── */}
        <Block title={t.stats} note={t.statsNote}>
          <Band aria-label={t.stats}>
            <BandItem label={t.sales} value={<bdi>{t.money(4260)}</bdi>} delta="+12%" sub={t.salesSub} />
            <BandItem label={t.bookings} value="38" unit={t.of52} sub={t.bookSub} />
            <BandItem label={t.openOrders} value="14" unit={`2 ${t.late}`} delta={undefined} sub={t.ordSub} />
            <BandItem label={t.waiting} value="3" unit={`12 ${t.min}`} tone="warn" sub={t.waitSub} />
          </Band>
          <div className="u-kg-grid">
            <Stat label={t.sales} value={<bdi>{t.money(4260)}</bdi>} delta="+12%" sub={t.salesSub} />
            <Stat label={t.openOrders} value="14" delta="2" tone="warn" sub={t.ordSub} />
            <Stat label={t.owed} value={<bdi>{t.money(9840)}</bdi>} delta="−3%" tone="bad" sub={t.customers}>
              <Meter value={5120} max={9840} label={t.owed} size="md" />
            </Stat>
            <Stat label={t.waiting} value="3" delta="0" tone="n" sub={t.waitSub} />
          </div>
          <div className="u-kg-grid">
            <Cell cap={`Meter ${t.slots}`}>
              <div className="u-kg-col">
                <Meter value={7} max={10} label={t.slots} />
                <Meter value={17} max={18} label={t.slots} tone="warn" size="md" />
                <Meter value={0} max={10} label={t.slots} />
                <Meter value={10} max={10} label={t.slots} tone="ok" />
                <Meter value={3} max={8} label={t.slots} tone="volt" />
              </div>
            </Cell>
          </div>
        </Block>

        {/* ── banner, empty, slot ─────────────────────────────── */}
        <Block title={t.banners} note={t.bannersNote}>
          <div className="u-kg-col">
            <Banner tone="warn" action={<a href="#unconfirmed">{t.show}</a>}>{t.banWarn}</Banner>
            <Banner tone="bad" action={<button type="button">{t.tryNow}</button>}>{t.banBad}</Banner>
            <Banner tone="ok" action={<button type="button">{t.undo}</button>}>{t.banOk}</Banner>
            <Banner tone="n" action={<button type="button">{t.removeSamples}</button>}>{t.banN}</Banner>
          </div>
          <div className="u-kg-grid u-kg-grid--wide">
            <Panel>
              <PanelHeader title={t.emptyTitle} sub="Empty" />
              <Empty title={t.emptyTitle} action={<Button>{t.showAll}</Button>}>{t.emptyText}</Empty>
            </Panel>
            <div className="u-kg-col">
              <DashedSlot title={t.slotTitle} action={<Button icon={<UiIcon name="copy" />}>{t.slotAction}</Button>}>{t.slotText}</DashedSlot>
            </div>
          </div>
        </Block>

        {/* ── timeline, steps ─────────────────────────────────── */}
        <Block title={t.timeline} note={t.timelineNote}>
          <div className="u-kg-grid u-kg-grid--wide">
            <Panel>
              <PanelHeader title="Live" sub={t.since} />
              <PanelBody>
                <Timeline
                  items={[
                    { text: t.ev1, meta: t.ev1m, tone: "ok" },
                    { text: t.ev2, meta: t.ev2m, tone: "volt" },
                    { text: t.ev3, meta: t.ev3m },
                    { text: t.ev4, meta: t.ev4m, tone: "warn" },
                    { text: t.ev5, meta: t.ev5m, tone: "bad" },
                  ]}
                />
              </PanelBody>
            </Panel>
            <div className="u-kg-col">
              {[0, 2, 4].map((current) => (
                <Steps key={current} steps={t.stepsA} current={current} label={t.stepsLabel} stateLabels={{ done: t.stepDone, current: t.stepCurrent, todo: t.stepTodo }} />
              ))}
            </div>
          </div>
        </Block>

        {/* ── avatar, thumb ───────────────────────────────────── */}
        <Block title={t.people} note={t.peopleNote}>
          <div className="u-kg-row">
            {[20, 24, 28, 32, 36, 44, 52].map((size) => <Avatar key={size} name={t.names[size % 4]} size={size} />)}
            <Avatar name="Hana" tone="ink" />
            <Avatar initials="ع" label={t.languageNames[1]} />
            {[0, 1, 2, 3, 4, 5].map((seed) => <Thumb key={seed} seed={seed} initials={["AF", "GC", "LC", "FW", "CC", "5W"][seed]} size={40} />)}
            <Thumb size={32} />
            <Thumb size={52} seed="Air freshener" initials="AF" />
          </div>
        </Block>

        {/* ── page title, section ─────────────────────────────── */}
        <Block title={t.pageTitles}>
          <PageTitle title={t.pageTitleText} sub={t.pageTitleSub} right={<><Button icon={<UiIcon name="download" />}>{t.export}</Button><Button kind="volt">{t.newOrder}</Button></>} />
          <Section label={t.sectionLabel} right={<a className="u-link" href="#orders">{t.seeAll2}</a>}>
            <Panel><PanelBody><SectionLabel>{t.sales}</SectionLabel></PanelBody></Panel>
          </Section>
        </Block>

        {/* ── composition ─────────────────────────────────────── */}
        <Block title={t.composition} note={t.compositionNote}>
          <div className="u-kg-col">
            <PageTitle title={t.pageTitleText} sub={t.pageTitleSub} right={<><Button icon={<UiIcon name="download" />}>{t.export}</Button><Button kind="volt">{t.newOrder}</Button></>} />
            <Banner tone="warn" action={<a href="#unconfirmed">{t.show}</a>}>{t.banWarn}</Banner>
            <UTabs label={t.status} value={listStatus} onChange={setListStatus} items={[{ id: "open", label: t.tabOpen, count: 14 }, { id: "new", label: t.tabNew, count: 3 }, { id: "ready", label: t.tabReady, count: 5 }]} />
            <div className="u-kg-row">
              <Search value={query} onChange={setQuery} label={t.searchLabel} placeholder={t.searchPlaceholder} clearLabel={t.clear} />
              <Chip on count={14}>{t.chipAll}</Chip>
              <Chip count={9}>{t.chipPickup}</Chip>
              <Select variant="filter" label={t.payment} defaultValue="any"><option value="any">{t.any}</option></Select>
            </div>
            <Panel clip>
              <ul className="u-kg-list">
                {t.names.map((name, i) => (
                  <li key={name} className="u-kg-listrow">
                    <div className="u-kg-listmain">
                      <Thumb seed={i} initials={t.items[i].slice(0, 2)} size={32} />
                      <div className="u-kg-lines"><b>{name}</b><span>{t.items[i]}</span></div>
                    </div>
                    <div className="u-kg-listmain">
                      <Tag tone={i === 3 ? "n" : i === 2 ? "ok" : "ink"}>{i === 3 ? t.statusConfirmed : i === 2 ? t.statusReady : t.statusNew}</Tag>
                      <span className="u-mono"><bdi>{t.money(t.totals[i])}</bdi></span>
                    </div>
                  </li>
                ))}
              </ul>
              <PanelFooter>{t.rule}</PanelFooter>
            </Panel>
          </div>
        </Block>
      </main>
    </UiRoot>
  );
}
