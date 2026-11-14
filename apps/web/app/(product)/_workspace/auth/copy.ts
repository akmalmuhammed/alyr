export interface AuthCopyStrings {
  // Common Top & Foot
  brandName: string;
  needHand: string;
  supportEmail: string;
  languageName: string;
  locationQatar: string;
  customerAgreement: string;
  privacyNotice: string;
  appDomain: string;
  back: string;
  continueBtn: string;
  enterKey: string;

  // Sign In Email
  signInKicker: string;
  signInTitle: string;
  signInSubtitle: string;
  workEmailLabel: string;
  workEmailPlaceholder: string;
  keepMeSignedIn: string;
  sendCodeBtn: string;
  noCodeHelp: string;
  newToAlyr: string;
  setUpBusiness: string;

  // Sign In Code
  codeKicker: string;
  codeTitle: string;
  codeSubtitle: (email: string) => string;
  signInBtn: string;
  resendCountdown: (time: string) => string;
  useDifferentEmail: string;
  maxTriesNotice: string;
  codeHint: string;
  sessionInfo: string;

  // Choose Business
  chooseKicker: (email: string) => string;
  chooseTitle: string;
  chooseSubtitle: string;
  usedLast: string;
  ownerSub: (places: number) => string;
  adminSub: (places: number) => string;
  rememberChoice: string;
  openBusinessBtn: (name: string) => string;
  signOutBtn: string;
  switchAnytimeNote: string;

  // States
  wrongCodeTitle: string;
  wrongCodeSub: string;
  wrongCodeError: string;
  sendNewCodeBtn: string;
  triesLeft: (count: number) => string;

  tooManyCodesTitle: string;
  tooManyCodesSub: string;
  tooManyCodesError: string;
  retryAtTime: (time: string) => string;
  lastCodeStillWorks: (time: string) => string;

  noConnectionTitle: string;
  noConnectionSub: string;
  noConnectionError: string;
  tryAgainBtn: string;
  retryingInSeconds: (sec: number) => string;

  sessionEndedTitle: string;
  sessionEndedSub: string;
  sessionEndedHeadline: string;
  sessionEndedBanner: string;
  returnToOrderNote: string;
  statesFooterNote: string;

  // Sign Up Steps
  steps: string[];

  // Sign Up Business Type
  signupTypeKicker: string;
  signupTypeTitle: string;
  signupTypeSubtitle: string;
  types: Record<string, { title: string; desc: string; badge?: string }>;
  startWithTitle: string;
  startWithSub: string;
  startItems: { title: string; desc: string }[];
  customerSeeHeader: string;
  signupTypeChosenNote: (name: string) => string;
  phonePreviewCaptionType: string;

  // Sign Up Guided Setup (Price List)
  signupOfferKicker: string;
  signupOfferTitle: string;
  signupOfferSubtitle: string;
  colService: string;
  colLength: string;
  colPrice: string;
  colDeposit: string;
  newServicePlaceholder: string;
  savedAsYouType: string;
  lastSavedMeta: string;
  photosArabicLaterNote: string;
  whereUsedTitle: string;
  whereUsedItems: { title: string; desc: string }[];
  liveBadge: string;
  depositHoldSlotNote: string;
  signupOfferActionsNote: (count: number) => string;
  phonePreviewCaptionOffer: string;

  // Sign Up Plan & Price
  signupPlanKicker: string;
  signupPlanTitle: string;
  signupPlanSubtitle: string;
  priceCardTitle: string;
  publishedMeta: string;
  pricePerMonthAmount: string;
  pricePerMonthLabel: string;
  planBreakdown: { name: string; note: string; amount: string }[];
  sumEachMonthLabel: string;
  sumOnceLabel: string;
  sumDueNowLabel: string;
  teamPricingNote: string;
  countOnTitle: string;
  countOnItems: string[];
  waChargesTitle: string;
  waChargesSub: string;
  setupSoFarTitle: string;
  setupSoFarItems: { title: string; sub: string }[];
  phonePreviewCaptionPlan: string;
  acceptPlanBtn: string;
  acceptPlanNote: string;
}

export const AUTH_COPY: Record<"en" | "ar", AuthCopyStrings> = {
  en: {
    brandName: "ALYR",
    needHand: "Need a hand?",
    supportEmail: "hello@alyr.qa",
    languageName: "العربية",
    locationQatar: "ALYR · Doha, Qatar",
    customerAgreement: "Customer Agreement",
    privacyNotice: "Privacy Notice",
    appDomain: "app.alyr.qa",
    back: "Back",
    continueBtn: "Continue",
    enterKey: "Enter",

    signInKicker: "Sign in",
    signInTitle: "Sign in to your workspace",
    signInSubtitle: "ALYR emails you a 6-digit code each time you sign in. There is no password.",
    workEmailLabel: "Work email",
    workEmailPlaceholder: "hana@nuqta.qa",
    keepMeSignedIn: "Keep me signed in on this device for 30 days",
    sendCodeBtn: "Send me a code",
    noCodeHelp: "No code? Use the email address you signed up with, or the one ALYR set up for you.",
    newToAlyr: "New to ALYR?",
    setUpBusiness: "Set up your business",

    codeKicker: "Sign in · the code",
    codeTitle: "Enter the code we emailed you",
    codeSubtitle: (email: string) => `If ${email} has an account, a 6-digit code is on its way. It works for 10 minutes.`,
    signInBtn: "Sign in",
    resendCountdown: (time: string) => `Send a new code in ${time}`,
    useDifferentEmail: "Use a different email",
    maxTriesNotice: "5 tries, then ask for a new code",
    codeHint: "Paste works, and so do Arabic digits: ٧٣٠٥١٨ is read as 730518.",
    sessionInfo: "Signing in on Chrome on Windows · Doha · Thu 12 Nov 09:40",

    chooseKicker: (email: string) => `Signed in as ${email}`,
    chooseTitle: "Which business?",
    chooseSubtitle: "You work for two businesses on ALYR. Each keeps its own customers, orders and team.",
    usedLast: "Used last",
    ownerSub: (places: number) => `You are the owner · ${places} places`,
    adminSub: (places: number) => `You are an admin · ${places} place`,
    rememberChoice: "Open the one I used last without asking",
    openBusinessBtn: (name: string) => `Open ${name}`,
    signOutBtn: "Sign out",
    switchAnytimeNote: "You can switch at any time from the business name at the top of the sidebar.",

    wrongCodeTitle: "Wrong code",
    wrongCodeSub: "2 of 5 tries used",
    wrongCodeError: "That code is wrong or has expired. Check it, or request a new one.",
    sendNewCodeBtn: "Send a new code",
    triesLeft: (count: number) => `${count} tries left`,

    tooManyCodesTitle: "Too many codes",
    tooManyCodesSub: "after 5 codes in an hour",
    tooManyCodesError: "Too many codes requested. Try again in an hour.",
    retryAtTime: (time: string) => `Again at ${time}`,
    lastCodeStillWorks: (time: string) => `The last code we sent still works until ${time}.`,

    noConnectionTitle: "No connection",
    noConnectionSub: "the typed code is kept",
    noConnectionError: "Cannot reach ALYR. Check your connection and try again.",
    tryAgainBtn: "Try again",
    retryingInSeconds: (sec: number) => `Trying by itself in ${sec} s`,

    sessionEndedTitle: "Sign-in ended",
    sessionEndedSub: "after 30 days on one device",
    sessionEndedHeadline: "Sign in again to carry on",
    sessionEndedBanner: "Your sign-in on this device ended after 30 days. Nothing was lost.",
    returnToOrderNote: "After the code you go back to Orders · Order 1042.",
    statesFooterNote: "Codes cannot be sent right now. Try again shortly. · shown the same way when the email service is down",

    steps: [
      "Sign in",
      "Your business",
      "What you offer",
      "Hours and rules",
      "Try it",
      "Plan",
      "Go live"
    ],

    signupTypeKicker: "Step 2 of 7 · Your business",
    signupTypeTitle: "What kind of business is it?",
    signupTypeSubtitle: "We set things up the way your trade works. You can change anything later.",
    types: {
      salon: { title: "Salon & barber", desc: "Bookings, reminders" },
      spa: { title: "Spa & wellness", desc: "Bookings, packages" },
      carcare: { title: "Car care & garage", desc: "Bookings by bay, a shelf" },
      home: { title: "Home services", desc: "Visits, quotes" },
      restaurant: { title: "Restaurant & café", desc: "Orders, delivery" },
      bakery: { title: "Bakery & home kitchen", desc: "Daily limits, pre-orders" },
      grocery: { title: "Grocery & baqala", desc: "Counted stock, low-stock alerts" },
      retail: { title: "Shop & retail", desc: "Orders, payments" },
      fashion: { title: "Fashion & gifts", desc: "Sizes, colours, link sharing" },
      wholesale: { title: "Wholesale & trading", desc: "ALYR sets this one up with you", badge: "WITH ALYR" },
      travel: { title: "Travel & documents", desc: "ALYR sets this one up with you", badge: "WITH ALYR" },
      other: { title: "Any other business", desc: "A plain setup you shape yourself" }
    },
    startWithTitle: "Car care starts with",
    startWithSub: "All of it can be changed later",
    startItems: [
      { title: "Bookings", desc: "By bay and by person, with a reminder the day before" },
      { title: "A price list", desc: "6 typical services with sample prices to edit" },
      { title: "A shelf", desc: "For the items you sell at the till" },
      { title: "One inbox", desc: "Your team answers together on one number" }
    ],
    customerSeeHeader: "What your customers see",
    signupTypeChosenNote: (name: string) => `Chosen: ${name}. Change it later in Settings · Business; nothing is deleted.`,
    phonePreviewCaptionType: "A drawing with sample prices for car care. It fills in with your own details as you type them in the next steps.",

    signupOfferKicker: "Step 3 of 7 · What you offer",
    signupOfferTitle: "Your price list, ready to edit",
    signupOfferSubtitle: "Started from a typical list for car care. The prices are samples: set your own, and watch the customer's side change.",
    colService: "Service",
    colLength: "Length",
    colPrice: "Price",
    colDeposit: "Deposit to book",
    newServicePlaceholder: "New service",
    savedAsYouType: "Saved as you type",
    lastSavedMeta: "LAST SAVED 09:40",
    photosArabicLaterNote: "Photos, Arabic names and who does each service come later, in Bookings · Services.",
    whereUsedTitle: "Where the list is used",
    whereUsedItems: [
      { title: "On WhatsApp", desc: "A customer who asks for prices gets this list, in their language." },
      { title: "On the booking page", desc: "They pick a service and see the free times that fit its length." },
      { title: "With a deposit", desc: "The slot is held while the customer pays the deposit by link." },
      { title: "In reminders", desc: "The service name and the time go in the reminder the day before." }
    ],
    liveBadge: "Live",
    depositHoldSlotNote: "Ceramic coating needs a QAR 300 deposit to hold the slot.",
    signupOfferActionsNote: (count: number) => `${count} services. At least one is needed to go on.`,
    phonePreviewCaptionOffer: "The marked line is the one you are typing. Customers who write in Arabic get the same list in Arabic.",

    signupPlanKicker: "Step 6 of 7 · Plan",
    signupPlanTitle: "One plan for your business",
    signupPlanSubtitle: "Nothing to pay now. You pay when you go live, once you have tried it and it works.",
    priceCardTitle: "Your ALYR price",
    publishedMeta: "PUBLISHED BY ALYR · WED 11 NOV",
    pricePerMonthAmount: "QAR 500",
    pricePerMonthLabel: "a month, for the business",
    planBreakdown: [
      { name: "ALYR Bookings", note: "your first product", amount: "QAR 450" },
      { name: "ALYR Chat", note: "a further product", amount: "QAR 50" },
      { name: "ALYR Shelf", note: "comes with every product", amount: "Included" },
      { name: "ALYR Agent", note: "your numbers and the Sunday report", amount: "Included" }
    ],
    sumEachMonthLabel: "Each month",
    sumOnceLabel: "Once",
    sumDueNowLabel: "Due when you go live",
    teamPricingNote: "Note from ALYR: priced for one WhatsApp number and the team you have today. A further team member is QAR 40 a month.",
    countOnTitle: "What you can count on",
    countOnItems: [
      "One price for the business. ALYR adds no fee per message.",
      "Stop with seven days' notice.",
      "Your data is yours: download all of it at any time.",
      "A person answers: hello@alyr.qa"
    ],
    waChargesTitle: "Separately, WhatsApp charges per message",
    waChargesSub: "Replying to customers is free. Reminders sent later are charged by Meta to your own card, a few cents each.",
    setupSoFarTitle: "Your setup so far",
    setupSoFarItems: [
      { title: "Nuqta Car Care", sub: "Car care & garage · Al Sadd · Arabic and English" },
      { title: "6 services", sub: "QAR 35 to QAR 1,200 · one with a deposit" },
      { title: "Open 07:00 to 22:00", sub: "Friday from 13:00 · a reminder the day before" },
      { title: "It works", sub: "Test booking: Full wash, Thursday 17:00" }
    ],
    phonePreviewCaptionPlan: "Your own test from the last step. Customers get the same answers once you are live.",
    acceptPlanBtn: "Accept this price",
    acceptPlanNote: "Accepting records your name and the time. Nothing is charged until you go live."
  },
  ar: {
    brandName: "ALYR",
    needHand: "هل تحتاج مساعدة؟",
    supportEmail: "hello@alyr.qa",
    languageName: "English",
    locationQatar: "ALYR · الدوحة، قطر",
    customerAgreement: "اتفاقية العميل",
    privacyNotice: "إشعار الخصوصية",
    appDomain: "app.alyr.qa",
    back: "رجوع",
    continueBtn: "متابعة",
    enterKey: "Enter",

    signInKicker: "تسجيل الدخول",
    signInTitle: "تسجيل الدخول إلى مساحة عملك",
    signInSubtitle: "يرسل لك ALYR رمزاً مكوناً من 6 أرقام عبر البريد الإلكتروني في كل مرة تسجل فيها الدخول. لا توجد كلمة مرور.",
    workEmailLabel: "البريد الإلكتروني للعمل",
    workEmailPlaceholder: "hana@nuqta.qa",
    keepMeSignedIn: "إبقائي مسجلاً للدخول على هذا الجهاز لمدة 30 يوماً",
    sendCodeBtn: "أرسل لي الرمز",
    noCodeHelp: "لم يصلك الرمز؟ استخدم عنوان البريد الذي سجلت به، أو الذي أعده لك ALYR.",
    newToAlyr: "جديد في ALYR؟",
    setUpBusiness: "إعداد عملك التجاري",

    codeKicker: "تسجيل الدخول · الرمز",
    codeTitle: "أدخل الرمز المرسل إلى بريدك الإلكتروني",
    codeSubtitle: (email: string) => `إذا كان لدى ${email} حساب، فالرمز المكون من 6 أرقام في طريقه إليك. يعمل لمدة 10 دقائق.`,
    signInBtn: "تسجيل الدخول",
    resendCountdown: (time: string) => `إرسال رمز جديد خلال ${time}`,
    useDifferentEmail: "استخدام بريد إلكتروني آخر",
    maxTriesNotice: "5 محاولات، ثم اطلب رمزاً جديداً",
    codeHint: "اللصق مدعوم، وكذلك الأرقام العربية تقرأ مباشرة.",
    sessionInfo: "تسجيل الدخول عبر Chrome على Windows · الدوحة · الخميس 12 نوفمبر 09:40",

    chooseKicker: (email: string) => `مسجل كـ ${email}`,
    chooseTitle: "أي نشاط تجاري؟",
    chooseSubtitle: "تعمل لصالح نشاطين تجاريين على ALYR. يحتفظ كل منهما بعملائه وطلباته وفريقه.",
    usedLast: "استخدم أخيراً",
    ownerSub: (places: number) => `أنت المالك · ${places} فروع`,
    adminSub: (places: number) => `أنت مسؤول · ${places} فرع`,
    rememberChoice: "فتح النشاط المستخدم أخيراً دون سؤالي",
    openBusinessBtn: (name: string) => `فتح ${name}`,
    signOutBtn: "تسجيل الخروج",
    switchAnytimeNote: "يمكنك التبديل في أي وقت من اسم النشاط أعلى الشريط الجانبي.",

    wrongCodeTitle: "رمز غير صحيح",
    wrongCodeSub: "تم استخدام 2 من 5 محاولات",
    wrongCodeError: "الرمز غير صحيح أو انتهت صلاحيته. تأكد منه أو اطلب رمزاً جديداً.",
    sendNewCodeBtn: "إرسال رمز جديد",
    triesLeft: (count: number) => `تبقى ${count} محاولات`,

    tooManyCodesTitle: "طلبات رموز كثيرة",
    tooManyCodesSub: "بعد 5 رموز خلال ساعة واحدة",
    tooManyCodesError: "تم طلب رموز كثيرة جداً. حاول مرة أخرى بعد ساعة.",
    retryAtTime: (time: string) => `مرة أخرى عند ${time}`,
    lastCodeStillWorks: (time: string) => `الرمز الأخير الذي أرسلناه يظل صالحاً حتى ${time}.`,

    noConnectionTitle: "لا يوجد اتصال",
    noConnectionSub: "تم حفظ الرمز المكتوب",
    noConnectionError: "تعذر الاتصال بـ ALYR. تحقق من اتصالك وحاول ثانية.",
    tryAgainBtn: "إعادة المحاولة",
    retryingInSeconds: (sec: number) => `إعادة المحاولة تلقائياً خلال ${sec} ثوانٍ`,

    sessionEndedTitle: "انتهت الجلسة",
    sessionEndedSub: "بعد 30 يوماً على جهاز واحد",
    sessionEndedHeadline: "سجل الدخول مجدداً للمتابعة",
    sessionEndedBanner: "انتهت جلستك على هذا الجهاز بعد 30 يوماً. لم تفقد أي بيانات.",
    returnToOrderNote: "بعد إدخال الرمز ستعود مباشرة إلى الطلبات · الطلب 1042.",
    statesFooterNote: "لا يمكن إرسال الرموز حالياً. حاول ثانية بعد قليل. · يظهر بالطريقة نفسها عند توقف خدمة البريد",

    steps: [
      "تسجيل الدخول",
      "نشاطك التجاري",
      "ما تقدمه",
      "المواعيد والقواعد",
      "التجربة",
      "الخطة",
      "الانطلاق"
    ],

    signupTypeKicker: "الخطوة 2 من 7 · نشاطك التجاري",
    signupTypeTitle: "ما نوع نشاطك التجاري؟",
    signupTypeSubtitle: "نقوم بإعداد كل شيء ليتناسب مع طبيعة مجالك. يمكنك تعديل أي خيار لاحقاً.",
    types: {
      salon: { title: "صالون وحلاقة", desc: "حجوزات وتذكيرات" },
      spa: { title: "سبا واستجمام", desc: "حجوزات وباقات" },
      carcare: { title: "عناية بالسيارات وكراج", desc: "حجوزات بالمسار ورف منتجات" },
      home: { title: "خدمات منزلية", desc: "زيارات وعروض أسعار" },
      restaurant: { title: "مطعم ومقهى", desc: "طلبات وتوصيل" },
      bakery: { title: "مخبز ومطبخ منزلي", desc: "حصص يومية وطلبات مسبقة" },
      grocery: { title: "بقالة وتموينات", desc: "مخزون محصي وتنبيهات نفاد" },
      retail: { title: "متجر وتجزئة", desc: "طلبات ومدفوعات" },
      fashion: { title: "أزياء وهدايا", desc: "مقاسات وألوان ومشاركة الروابط" },
      wholesale: { title: "تجارة وجملة", desc: "يعدها فريق ALYR معك", badge: "مع ALYR" },
      travel: { title: "سفر ومعاملات", desc: "يعدها فريق ALYR معك", badge: "مع ALYR" },
      other: { title: "أي نشاط آخر", desc: "إعداد أساسي تشكله بنفسك" }
    },
    startWithTitle: "تبدأ العناية بالسيارات بـ",
    startWithSub: "يمكن تغيير كل ذلك لاحقاً",
    startItems: [
      { title: "الحجوزات", desc: "حسب المسار والموظف، مع تذكير في اليوم السابق" },
      { title: "قائمة أسعار", desc: "6 خدمات شائعة بأسعار نموذجية قابلة للتعديل" },
      { title: "رف منتجات", desc: "للمواد التي تبيعها عند نقطة الدفع" },
      { title: "صندوق وارد واحد", desc: "يجيب فريقك معاً على رقم موحد" }
    ],
    customerSeeHeader: "ما يراه عملاؤك",
    signupTypeChosenNote: (name: string) => `المحدد: ${name}. يمكنك تغييره لاحقاً من الإعدادات · النشاط؛ لا يتم حذف شيء.`,
    phonePreviewCaptionType: "رسم توضيحي بأسعار تقريبية للعناية بالسيارات. سيمتلئ ببياناتك الفعلية فور كتابتها في الخطوات التالية.",

    signupOfferKicker: "الخطوة 3 من 7 · ما تقدمه",
    signupOfferTitle: "قائمة أسعارك جاهزة للتعديل",
    signupOfferSubtitle: "بدأت بقائمة نموذجية للعناية بالسيارات. الأسعار تقريبية: ضع أسعارك وتابع كيف تتحدث واجهة العميل مباشرة.",
    colService: "الخدمة",
    colLength: "المدة",
    colPrice: "السعر",
    colDeposit: "العربون للحجز",
    newServicePlaceholder: "خدمة جديدة",
    savedAsYouType: "حفظ تلقائي أثناء الكتابة",
    lastSavedMeta: "آخر حفظ 09:40",
    photosArabicLaterNote: "الصور والأسماء والموظفون لكل خدمة تضاف لاحقاً من الحجوزات · الخدمات.",
    whereUsedTitle: "أين تُستخدم القائمة",
    whereUsedItems: [
      { title: "على واتساب", desc: "يحصل العميل الذي يطلب الأسعار على هذه القائمة بلغته." },
      { title: "في صفحة الحجز", desc: "يختار العميل الخدمة ويرى الأوقات الشاغرة المناسبة لمدتها." },
      { title: "مع العربون", desc: "يُحجز الموعد مؤقتاً أثناء سداد العميل للعربون عبر الرابط." },
      { title: "في التذكيرات", desc: "يُدرج اسم الخدمة وتوقيتها في تذكير اليوم السابق." }
    ],
    liveBadge: "مباشر",
    depositHoldSlotNote: "تتطلب طبقة النانو سيراميك عربوناً قدره 300\u00a0ر.ق لحجز الموعد.",
    signupOfferActionsNote: (count: number) => `${count} خدمات. يلزم وجود خدمة واحدة على الأقل للمتابعة.`,
    phonePreviewCaptionOffer: "السطر المحدد هو ما تكتبه الآن. يتلقى العملاء الذين يراسلونك بالعربية القائمة نفسها بالعربية.",

    signupPlanKicker: "الخطوة 6 من 7 · الخطة",
    signupPlanTitle: "خطة موحدة لنشاطك التجاري",
    signupPlanSubtitle: "لا تدفع شيئاً الآن. الدفع عند الانطلاق بعد التجربة والتأكد من مناسبتها لعملك.",
    priceCardTitle: "سعرك على ALYR",
    publishedMeta: "نشر بواسطة ALYR · الأربعاء 11 نوفمبر",
    pricePerMonthAmount: "500\u00a0ر.ق",
    pricePerMonthLabel: "شهرياً، للنشاط التجاري",
    planBreakdown: [
      { name: "حجوزات ALYR", note: "منتجك الأول", amount: "450\u00a0ر.ق" },
      { name: "محادثات ALYR", note: "منتج إضافي", amount: "50\u00a0ر.ق" },
      { name: "رف ALYR", note: "مشمول مع كل منتج", amount: "مشمول" },
      { name: "وكيل ALYR", note: "أرقامك وتقرير الأحد", amount: "مشمول" }
    ],
    sumEachMonthLabel: "كل شهر",
    sumOnceLabel: "مرة واحدة",
    sumDueNowLabel: "المستحق عند الانطلاق",
    teamPricingNote: "ملاحظة من ALYR: مسعر لرقم واتساب واحد والفريق الحالي. تبلغ تكلفة إضافة عضو إضافي 40\u00a0ر.ق شهرياً.",
    countOnTitle: "ما نضمنه لك",
    countOnItems: [
      "سعر واحد للنشاط التجاري. لا يضيف ALYR أي رسوم على الرسائل.",
      "إمكانية الإلغاء بإشعار مدته 7 أيام.",
      "بياناتك ملك لك: قم بتنزيلها بالكامل في أي وقت.",
      "فريق حقيقي يجيبك: hello@alyr.qa"
    ],
    waChargesTitle: "رسوم واتساب المنفصلة لكل رسالة",
    waChargesSub: "الردود على العملاء مجانية. التذكيرات المرسلة لاحقاً تخصمها شركة Meta من بطاقتك مباشرة ببضعة سنتات لكل رسالة.",
    setupSoFarTitle: "ما أنجزته حتى الآن",
    setupSoFarItems: [
      { title: "نقطة للعناية بالسيارات", sub: "عناية بالسيارات وكراج · السد · عربي وإنجليزي" },
      { title: "6 خدمات", sub: "من 35\u00a0ر.ق إلى 1,200\u00a0ر.ق · إحداها بعربون" },
      { title: "العمل من 07:00 إلى 22:00", sub: "الجمعة بدءاً من 13:00 · تذكير في اليوم السابق" },
      { title: "يعمل بنجاح", sub: "حجز تجريبي: غسيل كامل، الخميس 17:00" }
    ],
    phonePreviewCaptionPlan: "اختبارك الخاص من الخطوة السابقة. يحصل عملاؤك على الردود نفسها فور الانطلاق.",
    acceptPlanBtn: "قبول هذا السعر",
    acceptPlanNote: "يسجل القبول اسمك وتاريخ الموافقة. لا يتم خصم أي مبالغ حتى الانطلاق الفعلي."
  }
};
