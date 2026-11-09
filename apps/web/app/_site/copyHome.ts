// The homepage's words for the four stages (ALY-330, D-156): the funnel figure in the hero, the
// five numbers, and one panel for each of Discover, Convert, Manage and Scale. The page's other
// sections keep their words in copy.ts. Arabic is a draft until the native review (ALY-66).
//
// Honest by construction: where the software is not built, "Our team" does the step and the
// panel says so (the dashed rule); the product's own names stand only on what runs today. No
// AI wording here (D-153 allows the headline and the line under it, and nothing else). The
// figures are the fictional Qirfa Bakery's and carry the Sample mark.

export type StageKey = "discover" | "convert" | "manage" | "scale";

/** One station of the hero's funnel: a small card of the bakery's own screen, in three lines. */
export type FunnelStation = {
  key: StageKey;
  name: string;
  /** What happens at this station, one sentence (the phone shows it in place of the card). */
  line: string;
  /** Three lines of the drawn card: a label, the main line, a note. */
  card: [string, string, string];
  /** Who does the work here. `team` draws a dashed dot: our people do it by hand. */
  tag: string;
  team: boolean;
};

export type FiveNumber = { k: string; value: string; unit: string; note: string };

export type StagePanel = {
  key: StageKey;
  /** The chapter number in the index and the panel's chip. */
  n: string;
  name: string;
  /** Two lines: the first in ink, the second in Concrete. */
  title: [string, string];
  body: string;
  /** What runs today, with the product's own name. Empty where nothing is built yet. */
  runs: string[];
  /** What our team does for you. */
  team: string[];
};

export type HomeStages = {
  funnel: {
    label: string;
    shop: string;
    sub: string;
    stations: FunnelStation[];
  };
  /** The window under the headline: the film when there is one, else the drawn figure. */
  video: { title: string; label: string; captions: string };
  numbers: {
    title: string;
    body: string;
    label: string;
    shop: string;
    items: FiveNumber[];
  };
  stages: {
    title: string;
    body: string;
    indexLabel: string;
    runsLabel: string;
    teamLabel: string;
    panels: StagePanel[];
    /** The drawn windows inside the Discover and Scale panels. */
    discover: { title: string; rows: { label: string; state: string; done: boolean }[] };
    scale: { title: string; kicker: string; rows: { label: string; state: string; done: boolean }[]; foot: string };
    /** The Agent's screen and the order's flow keep their own captions (copy.ts). */
    agentLabel: string;
    agentMore: string;
  };
};

export const homeStagesEn: HomeStages = {
  video: { title: "How ALYR works", label: "A film of how ALYR works for a business", captions: "English captions" },
  funnel: {
    label: "One enquiry, followed through four stages of Qirfa Bakery, a fictional sample business",
    shop: "Qirfa Bakery",
    sub: "One enquiry, four stages",
    stations: [
      { key: "discover", name: "Discover", line: "A customer finds the bakery.", card: ["Qirfa Bakery", "Bakery · Doha", "Open until 10 pm"], tag: "Our team", team: true },
      { key: "convert", name: "Convert", line: "She asks, and the order lands in one inbox.", card: ["Is my order ready?", "Order #1442", "Confirmed"], tag: "ALYR Chat", team: false },
      { key: "manage", name: "Manage", line: "The office pays on account, and it is on the ledger.", card: ["Marina Desk Co-working", "Oldest unpaid 35 days", "Promised by 22 Oct"], tag: "ALYR Accounts", team: false },
      { key: "scale", name: "Scale", line: "The week is counted against the last.", card: ["Orders this week", "50", "Same days last week 45"], tag: "ALYR Agent", team: false },
    ],
  },
  numbers: {
    title: "Five numbers, counted for every shop.",
    body: "We record them at the check-up and count them again every month. Each is a count you can open, never a score.",
    label: "The five numbers at a first check-up",
    shop: "Qirfa Bakery",
    items: [
      { k: "Found", value: "6 of 9", unit: "checks passed", note: "Google, Instagram, listings and your own link, checked one by one." },
      { k: "Chosen", value: "4 of 7", unit: "checks passed", note: "Your profile, photos, hours and reviews, as a customer sees them." },
      { k: "Answered", value: "48 min", unit: "to a first reply", note: "How long an enquiry waits before someone answers." },
      { k: "Paid", value: "11 of 19", unit: "enquiries", note: "Enquiries that became a paid order or a booking." },
      { k: "Return", value: "5 of 14", unit: "customers", note: "Customers who bought again within 60 days." },
    ],
  },
  stages: {
    title: "One business, four stages.",
    body: "Each stage has one job. Where our software is not built yet, our team does the step with you, and says so.",
    indexLabel: "The four stages",
    runsLabel: "Runs today",
    teamLabel: "Our team does",
    panels: [
      {
        key: "discover", n: "01", name: "Discover",
        title: ["Be found.", "Be the one they pick."],
        body: "We check how customers reach you today, then fix what costs you orders.",
        runs: [],
        team: [
          "The check-up, then your Google profile, link in bio and counter QR card, set up.",
          "The five numbers, recorded as your starting point.",
        ],
      },
      {
        key: "convert", n: "02", name: "Convert",
        title: ["Every channel, every enquiry,", "one inbox."],
        body: "Chats, orders and bookings in one place. Your team answers, and every order has an owner.",
        runs: [
          "ALYR Chat: one inbox. ALYR Shelf: your menu and an order page.",
          "ALYR Bookings: slots, reminders and a booking page.",
        ],
        team: ["We load your menu and train your counter staff."],
      },
      {
        key: "manage", n: "03", name: "Manage",
        title: ["Run the day", "from one screen."],
        body: "Who owes you, what sold, what needs you now, with the reason beside each line.",
        runs: [
          "ALYR Accounts: credit, ageing and reminders.",
          "ALYR Agent: what needs you now, and the week in numbers.",
        ],
        team: ["We set up your accounts and check the first numbers with you."],
      },
      {
        key: "scale", n: "04", name: "Scale",
        title: ["Grow with proof,", "every month."],
        body: "Each month we count the five numbers again and agree three things to do next.",
        runs: ["ALYR Agent: this week against the same days last week."],
        team: ["A monthly review: the five numbers and three actions."],
      },
    ],
    discover: {
      title: "The check-up's channel map",
      rows: [
        { label: "Google profile", state: "Set up", done: true },
        { label: "Link in bio", state: "Set up", done: true },
        { label: "QR card at the counter", state: "Set up", done: true },
        { label: "Opening hours on Google", state: "To fix", done: false },
        { label: "Reply to new reviews", state: "To fix", done: false },
      ],
    },
    scale: {
      title: "The monthly review",
      kicker: "Three actions",
      rows: [
        { label: "Reply to enquiries the same day", state: "Agreed", done: true },
        { label: "Phone customers who have not ordered in 60 days", state: "Agreed", done: true },
        { label: "Add photos to your Google profile", state: "Next", done: false },
      ],
      foot: "Counted again next month",
    },
    agentLabel: "The ALYR Agent home screen of the sample business",
    agentMore: "See the whole screen",
  },
};

export const homeStagesAr: HomeStages = {
  video: { title: "كيف تعمل ALYR", label: "فيلم يعرض كيف تعمل ALYR مع نشاط تجاري", captions: "ترجمة عربية" },
  funnel: {
    label: "استفسار واحد يمرّ بأربع مراحل في مخبز قرفة، وهو نشاط غير حقيقي",
    shop: "مخبز قرفة",
    sub: "استفسار واحد، أربع مراحل",
    stations: [
      { key: "discover", name: "الاكتشاف", line: "عميلة تجد المخبز.", card: ["مخبز قرفة", "مخبز · الدوحة", "مفتوح حتى 10 مساءً"], tag: "فريقنا", team: true },
      { key: "convert", name: "الطلبات", line: "تسأل، فيصل الطلب إلى صندوق واحد.", card: ["هل طلبي جاهز؟", "طلب #1442", "تم التأكيد"], tag: "ALYR Chat", team: false },
      { key: "manage", name: "الإدارة", line: "المكتب يدفع بالآجل، وكل شيء في دفتر الحسابات.", card: ["Marina Desk Co-working", "أقدم دين منذ 35 يوماً", "وعد بالدفع قبل 22 أكتوبر"], tag: "ALYR Accounts", team: false },
      { key: "scale", name: "التوسّع", line: "يُحسب هذا الأسبوع مقابل الذي قبله.", card: ["طلبات هذا الأسبوع", "50", "الأيام نفسها الأسبوع الماضي 45"], tag: "ALYR Agent", team: false },
    ],
  },
  numbers: {
    title: "خمسة أرقام، تُحسب لكل نشاط.",
    body: "نسجّلها عند الفحص الأول ونعدّها من جديد كل شهر. كل رقم عدّ يمكنك فتحه، وليس درجة.",
    label: "الأرقام الخمسة عند الفحص الأول",
    shop: "مخبز قرفة",
    items: [
      { k: "الظهور", value: "6 من 9", unit: "فحوصات ناجحة", note: "جوجل وإنستغرام والقوائم ورابطك الخاص، واحداً واحداً." },
      { k: "الاختيار", value: "4 من 7", unit: "فحوصات ناجحة", note: "ملفك وصورك وساعات عملك وتقييماتك كما يراها العميل." },
      { k: "الرد", value: "48 دقيقة", unit: "حتى أول رد", note: "كم ينتظر الاستفسار قبل أن يردّ عليه أحد." },
      { k: "الدفع", value: "11 من 19", unit: "استفساراً", note: "استفسارات صارت طلباً مدفوعاً أو حجزاً." },
      { k: "العودة", value: "5 من 14", unit: "عميلاً", note: "عملاء اشتروا مرة أخرى خلال 60 يوماً." },
    ],
  },
  stages: {
    title: "نشاط واحد، أربع مراحل.",
    body: "لكل مرحلة مهمة واحدة. وحيث لم يكتمل برنامجنا بعد، يتولى فريقنا الخطوة معك، ونقول ذلك.",
    indexLabel: "المراحل الأربع",
    runsLabel: "يعمل اليوم",
    teamLabel: "يتولاه فريقنا",
    panels: [
      {
        key: "discover", n: "01", name: "الاكتشاف",
        title: ["أن يجدك العملاء.", "وأن تكون خيارهم."],
        body: "نفحص كيف يصل إليك العملاء اليوم، ثم نصلح ما يُضيّع عليك طلبات.",
        runs: [],
        team: [
          "الفحص، ثم نجهّز لك ملف نشاطك في جوجل، والرابط في سيرة حسابك على إنستغرام وتيك توك، وبطاقة QR عند الكاونتر.",
          "نسجّل لك الأرقام الخمسة نقطة بداية.",
        ],
      },
      {
        key: "convert", n: "02", name: "الطلبات",
        title: ["كل قناة، وكل استفسار،", "في صندوق واحد."],
        body: "المحادثات والطلبات والحجوزات في مكان واحد. يرد فريقك، ولكل طلب مسؤول.",
        runs: [
          "ALYR Chat: صندوق واحد. ALYR Shelf: قائمتك وصفحة طلب.",
          "ALYR Bookings: مواعيد وتذكيرات وصفحة حجز.",
        ],
        team: ["نُدخل قائمتك ونُري فريقك كيف تعمل."],
      },
      {
        key: "manage", n: "03", name: "الإدارة",
        title: ["أدِر يومك", "من شاشة واحدة."],
        body: "من عليه مستحقات لك، وما الذي بِيع، وما الذي يحتاجك الآن، وبجانب كل سطر سببه.",
        runs: [
          "ALYR Accounts: الآجل ومدة التأخر والتذكيرات.",
          "ALYR Agent: ما يحتاجك الآن، وأرقام الأسبوع.",
        ],
        team: ["نجهّز ALYR Accounts ونراجع معك الأرقام الأولى."],
      },
      {
        key: "scale", n: "04", name: "التوسّع",
        title: ["نمِّ نشاطك بالأرقام،", "كل شهر."],
        body: "كل شهر نحسب الأرقام الخمسة من جديد، ونتفق على ثلاث خطوات تالية.",
        runs: ["ALYR Agent: هذا الأسبوع مقابل الأيام نفسها من الأسبوع الماضي."],
        team: ["مراجعة شهرية: الأرقام الخمسة وثلاث خطوات."],
      },
    ],
    discover: {
      title: "خريطة قنوات الفحص",
      rows: [
        { label: "ملف جوجل", state: "جاهز", done: true },
        { label: "رابط الحساب", state: "جاهز", done: true },
        { label: "بطاقة QR عند الكاونتر", state: "جاهزة", done: true },
        { label: "ساعات العمل في جوجل", state: "للتصحيح", done: false },
        { label: "الرد على التقييمات الجديدة", state: "للتصحيح", done: false },
      ],
    },
    scale: {
      title: "المراجعة الشهرية",
      kicker: "ثلاث خطوات",
      rows: [
        { label: "الرد على الاستفسارات في اليوم نفسه", state: "متفق عليه", done: true },
        { label: "الاتصال بعملاء لم يطلبوا منذ 60 يوماً", state: "متفق عليه", done: true },
        { label: "إضافة صور إلى ملف نشاطك في جوجل", state: "التالي", done: false },
      ],
      foot: "نحسبها من جديد الشهر القادم",
    },
    agentLabel: "الشاشة الرئيسية لـ ALYR Agent لنشاط غير حقيقي",
    agentMore: "اعرض الشاشة كاملة",
  },
};
