// Every word on the page a sales link opens (ALY-216, D-105), in English and Arabic. The price
// card and the terms use the sign-up screens' own words (../start/copy.ts) so an owner who came
// by a visit and one who came alone read the same sentences. Placeholders in braces (`{name}`,
// `{hint}`, `{type}`) are filled by the page inside <bdi>, so Latin names and addresses sit
// correctly in an Arabic line. The Arabic is a draft for a native reviewer (ALY-66).

export type Lang = "en" | "ar";

const en = {
  brand: "ALYR",
  lang: "العربية",
  offline: "Cannot reach ALYR. Check your connection and try again.",
  working: "Opening your offer…",
  open: {
    kicker: "Your offer from ALYR",
    title: "ALYR has prepared an offer for {name}",
    sub: "{type}. To open it, we email a code to the address ALYR has for you.",
    codeTo: "The code goes to {hint}.",
    send: "Email me the code",
    sending: "Sending the code…",
  },
  code: {
    title: "Enter the code we emailed you",
    sub: "Sent to {hint}. It works for 10 minutes.",
    label: "Code",
    devCode: (code: string) => `Local development only, no email was sent: your code is ${code}`,
    verify: "Continue",
    again: "Send a new code",
    wrong: "That code is wrong or has expired. Check it, or ask for a new one.",
    tooMany: "Too many tries. Wait a little and try again.",
    cannotSend: "The code could not be sent. Try again in a minute.",
    expired: "This step has expired. Ask for a new code.",
    changed: "Your price changed a moment ago. Ask for a new code to see it.",
  },
  offer: {
    kicker: "Your price",
    title: "The price ALYR prepared for you",
    sub: "Nothing is paid on this page. Next comes your go-live list, where you see what to pay and how.",
    gets: "What your business gets",
    name: "Your name",
    accept: "Accept and continue",
    accepting: "Setting up your business…",
    failed: "Your business could not be set up. Try again in a moment, or message ALYR.",
  },
  gone: {
    unknown: { title: "This link does not work", body: "Check that you opened the whole link, or ask ALYR for a new one." },
    expired: { title: "This link has run out", body: "Ask ALYR for a new link and it will open straight away." },
    revoked: { title: "ALYR has withdrawn this link", body: "Ask ALYR for a new one." },
    used: { title: "This link has already been used", body: "Your business was set up from it. Sign in to carry on.", action: "Sign in" },
  },
};

const ar: typeof en = {
  brand: "ALYR",
  lang: "English",
  offline: "تعذّر الوصول إلى ALYR. تحقق من اتصالك وحاول مرة أخرى.",
  working: "نفتح عرضك…",
  open: {
    kicker: "عرضك من ALYR",
    title: "جهّزت ALYR عرضاً لنشاط {name}",
    sub: "{type}. لفتح العرض نرسل رمزاً إلى البريد الذي سجّلته ALYR لك.",
    codeTo: "يُرسل الرمز إلى {hint}.",
    send: "أرسل لي الرمز",
    sending: "نرسل الرمز…",
  },
  code: {
    title: "أدخل الرمز الذي أرسلناه إلى بريدك",
    sub: "أُرسل إلى {hint}. صالح لمدة 10 دقائق.",
    label: "الرمز",
    devCode: (code) => `للتطوير المحلي فقط، لم يُرسل بريد: رمزك ${code}`,
    verify: "متابعة",
    again: "أرسل رمزاً جديداً",
    wrong: "الرمز غير صحيح أو انتهت صلاحيته. تحقق منه أو اطلب رمزاً جديداً.",
    tooMany: "محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.",
    cannotSend: "تعذّر إرسال الرمز. حاول بعد دقيقة.",
    expired: "انتهت صلاحية هذه الخطوة. اطلب رمزاً جديداً.",
    changed: "تغيّر سعرك قبل لحظات. اطلب رمزاً جديداً لتراه.",
  },
  offer: {
    kicker: "سعرك",
    title: "السعر الذي جهّزته ALYR لك",
    sub: "لا يُدفع شيء في هذه الصفحة. بعدها تصل إلى قائمة البدء، وفيها ترى ما عليك دفعه وكيف.",
    gets: "ما يحصل عليه نشاطك",
    name: "اسمك",
    accept: "أوافق وأتابع",
    accepting: "نجهّز نشاطك…",
    failed: "تعذّر إنشاء نشاطك. حاول بعد لحظات أو راسل ALYR.",
  },
  gone: {
    unknown: { title: "هذا الرابط لا يعمل", body: "تأكد من أنك فتحت الرابط كاملاً، أو اطلب من ALYR رابطاً جديداً." },
    expired: { title: "انتهت صلاحية هذا الرابط", body: "اطلب من ALYR رابطاً جديداً وسيُفتح فوراً." },
    revoked: { title: "سحبت ALYR هذا الرابط", body: "اطلب منها رابطاً جديداً." },
    used: { title: "استُخدم هذا الرابط من قبل", body: "أُنشئ نشاطك من هذا الرابط. سجّل الدخول لتتابع.", action: "سجّل الدخول" },
  },
};

export const COPY = { en, ar };
export type Copy = typeof en;
