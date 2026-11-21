// The words of the two animated scenes inside the stage switch (ALY-330, D-158, the founder's
// brief of 8 Nov 2026): Discover shows a check-up score moving after one fix; Convert shows
// customers arriving from five places into one ALYR Chat inbox. Both are drawings of a fictional
// bakery with one "Sample" mark each. Nothing here claims more than runs today: the score is
// counted from what the check-up could read (spec 065, four measured parts), the action is the
// product's own "I did this", and every customer message is the customer's own words, so no
// message says where ALYR "tags" it. Arabic is a draft in Modern Standard Arabic with Western
// digits until the native review (ALY-66).

export type ScenePart = { name: string; from: number; to: number };

export type StageScenesCopy = {
  score: {
    /** What a screen reader hears for the whole drawing. */
    label: string;
    shop: string;
    title: string;
    /** Under the big number. */
    outOf: string;
    /** Beside the ring once the score has moved. */
    change: string;
    parts: ScenePart[];
    kicker: string;
    finding: string;
    why: string;
    did: string;
    run: string;
    doneTitle: string;
    doneNote: string;
    foot: string;
    /** The score before and after, for the screen reader and the ring. */
    total: { from: number; to: number };
  };
  chat: {
    label: string;
    /** `id` picks the mark (ChannelIcons.tsx): instagram, tiktok, whatsapp, google, page, qr. */
    sources: { id: string; name: string; how: string }[];
    inbox: string;
    inboxSub: string;
    /** The badge's accessible name; `{n}` is how many chats arrived. */
    badge: string;
    rows: { who: string; text: string; at: string }[];
    foot: string;
  };
  scale: {
    label: string;
    shop: string;
    title: string;
    ordersLabel: string;
    /** Under the big number: what it is counted against. */
    prev: string;
    change: string;
    legendNow: string;
    legendPrev: string;
    /** Sunday to Thursday, the days counted so far. */
    days: string[];
    /** Orders each day; the totals are the sums (50 and 45). */
    now: number[];
    before: number[];
  };
};

export const stageScenesEn: StageScenesCopy = {
  score: {
    label:
      "A sample check-up of Qirfa Bakery, a fictional business. The score starts at 58 out of 100 across four parts: Google listing 44, website 70, WhatsApp 62 and reviews 56. The owner marks one fix as done, the check-up runs again, and the score shows 71: Google listing 74 and website 92.",
    shop: "Qirfa Bakery",
    title: "Check-up",
    outOf: "out of 100",
    change: "+13 since the last check-up",
    parts: [
      { name: "Google listing", from: 44, to: 74 },
      { name: "Website", from: 70, to: 92 },
      { name: "WhatsApp", from: 62, to: 62 },
      { name: "Reviews", from: 56, to: 56 },
    ],
    kicker: "Do this next",
    finding: "Friday opening hours differ",
    why: "Why · Google says it closes at 4 pm, the website says 10 pm.",
    did: "I did this",
    run: "Run check-up",
    doneTitle: "Friday opening hours now match",
    doneNote: "Checked again on both pages.",
    foot: "The score counts only what the check-up could measure.",
    total: { from: 58, to: 71 },
  },
  chat: {
    label:
      "Six customers of Qirfa Bakery, a fictional business, reach the bakery from a link in Instagram and TikTok bios, a direct WhatsApp message, the Google profile, the order page and the QR card at the counter. Every chat opens in one ALYR Chat inbox.",
    sources: [
      { id: "instagram", name: "Instagram", how: "Link in bio" },
      { id: "tiktok", name: "TikTok", how: "Link in bio" },
      { id: "whatsapp", name: "WhatsApp", how: "Direct message" },
      { id: "google", name: "Google", how: "Profile link" },
      { id: "page", name: "Order page", how: "Order button" },
      { id: "qr", name: "Counter", how: "QR card" },
    ],
    inbox: "ALYR Chat",
    inboxSub: "One inbox",
    badge: "{n} new chats",
    rows: [
      { who: "Noura", text: "Saw your cakes on Instagram. Is the 30 cm one free on Friday?", at: "9:41" },
      { who: "Hamad", text: "Saw the reel on TikTok. Do you deliver to Lusail?", at: "9:42" },
      { who: "Salma", text: "Is my order #1441 ready?", at: "9:43" },
      { who: "Sara", text: "Found you on Google. Are you open until 10 tonight?", at: "9:44" },
      { who: "Ali", text: "Ordering from your page. Can I collect at 5?", at: "9:47" },
      { who: "Mariam", text: "Scanned the card at the counter. Menu, please?", at: "9:50" },
    ],
    foot: "Your team answers, and every order has an owner.",
  },
  scale: {
    label:
      "A sample week for Qirfa Bakery, a fictional business: 50 orders this week against 45 on the same days last week, then three actions agreed for next month.",
    shop: "Qirfa Bakery",
    title: "This week",
    ordersLabel: "Orders this week",
    prev: "Same days last week: 45",
    change: "+5 on last week",
    legendNow: "This week",
    legendPrev: "Last week",
    days: ["Sun", "Mon", "Tue", "Wed", "Thu"],
    now: [8, 11, 10, 12, 9],
    before: [9, 8, 10, 9, 9],
  },
};

export const stageScenesAr: StageScenesCopy = {
  score: {
    label:
      "مثال على فحص لمخبز قرفة، وهو نشاط غير حقيقي. تبدأ النتيجة عند 58 من 100 موزّعة على أربعة أجزاء: ملف جوجل 44، الموقع الإلكتروني 70، واتساب 62، التقييمات 56. يضع المالك علامة «تم» على إصلاح واحد، ويُعاد الفحص، فتصبح النتيجة 71: صفحة جوجل 74 والموقع 92.",
    shop: "مخبز قرفة",
    title: "الفحص",
    outOf: "من 100",
    change: "ارتفعت 13 نقطة منذ الفحص السابق",
    parts: [
      { name: "ملف جوجل", from: 44, to: 74 },
      { name: "الموقع الإلكتروني", from: 70, to: 92 },
      { name: "واتساب", from: 62, to: 62 },
      { name: "التقييمات", from: 56, to: 56 },
    ],
    kicker: "الخطوة التالية",
    finding: "ساعات العمل يوم الجمعة مختلفة",
    why: "السبب · تذكر جوجل أن الإغلاق الساعة 4 م، ويذكر الموقع الإلكتروني الساعة 10 م.",
    did: "تم",
    run: "افحص الآن",
    doneTitle: "ساعات العمل يوم الجمعة متطابقة الآن",
    doneNote: "أُعيد الفحص على الصفحتين.",
    foot: "لا تشمل النتيجة إلا ما استطاع الفحص قياسه.",
    total: { from: 58, to: 71 },
  },
  chat: {
    label:
      "ستة عملاء يصلون إلى مخبز قرفة، وهو نشاط غير حقيقي، عبر رابط في سيرة إنستغرام وتيك توك، ورسالة مباشرة على واتساب، وملف جوجل، وصفحة الطلب، وبطاقة QR عند الكاونتر. تُفتح كل المحادثات في صندوق واحد في ALYR Chat.",
    sources: [
      { id: "instagram", name: "إنستغرام", how: "الرابط في السيرة" },
      { id: "tiktok", name: "تيك توك", how: "الرابط في السيرة" },
      { id: "whatsapp", name: "واتساب", how: "رسالة مباشرة" },
      { id: "google", name: "جوجل", how: "رابط الملف" },
      { id: "page", name: "صفحة الطلب", how: "زر الطلب" },
      { id: "qr", name: "الكاونتر", how: "بطاقة QR" },
    ],
    inbox: "ALYR Chat",
    inboxSub: "صندوق واحد",
    badge: "{n} محادثات جديدة",
    rows: [
      { who: "نورة", text: "رأيت الكيك عندكم في إنستغرام. هل كيكة 30 سم متوفرة الجمعة؟", at: "9:41" },
      { who: "حمد", text: "شاهدت الفيديو في تيك توك. هل توصلون إلى لوسيل؟", at: "9:42" },
      { who: "سلمى", text: "هل طلبي رقم 1441 جاهز؟", at: "9:43" },
      { who: "سارة", text: "وجدتكم في جوجل. هل أنتم مفتوحون حتى 10 الليلة؟", at: "9:44" },
      { who: "علي", text: "أطلب من صفحتكم. هل أستلم الساعة 5؟", at: "9:47" },
      { who: "مريم", text: "مسحت البطاقة عند الكاونتر. هل يمكنني الحصول على القائمة؟", at: "9:50" },
    ],
    foot: "يردّ فريقك، ولكل طلب مسؤول.",
  },
  scale: {
    label:
      "مثال على أسبوع لمخبز قرفة، وهو نشاط غير حقيقي: 50 طلباً هذا الأسبوع مقابل 45 في الأيام نفسها من الأسبوع الماضي، ثم ثلاثة إجراءات متفق عليها للشهر القادم.",
    shop: "مخبز قرفة",
    title: "هذا الأسبوع",
    ordersLabel: "طلبات هذا الأسبوع",
    prev: "الأيام نفسها من الأسبوع الماضي: 45",
    change: "بزيادة 5 عن الأسبوع الماضي",
    legendNow: "هذا الأسبوع",
    legendPrev: "الأسبوع الماضي",
    days: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"],
    now: [8, 11, 10, 12, 9],
    before: [9, 8, 10, 9, 9],
  },
};
