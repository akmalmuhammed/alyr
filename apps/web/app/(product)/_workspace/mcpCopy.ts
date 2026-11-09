// Every word the connected-apps screen says, in English and Arabic, in one place so a reviewer can
// read them together (ALY-292, specs/067-mcp-connector, D-170). The components hold no text. Both
// languages are written against one shape, so a missing Arabic line is a type error, not a hole on
// a phone. The Arabic is a draft until the native review (ALY-66).
//
// Voice (docs/agent-dashboard/06-messaging.md, alyr-design/honesty.md): ALYR does not think and
// calls no model. The only AI words are the owner's own tool, named once as "your own AI app, such
// as Claude or ChatGPT" (the screen's sentence under its heading, and the Connections link), because
// that is what the owner is connecting; everywhere else it is "an app". The screen says plainly what
// an app is given (D-170: a first name and the last three digits of a phone, never a message body,
// an ID or a salary) and that it goes to the owner's own provider under the owner's own account.
// Nothing "coming" is drawn. The words for what an app may do are the ones the sign-in page uses
// (modules/mcp/scopes.py), shortened for a tag.
//
// What the API sends already in words is not here: nothing (it sends codes, which this file words).
// Times come from discoveryLogic (the shop's clock, Western digits); counts agree through `an()`.

import type { Lang } from "./lang";

export type { Lang };

/** Arabic count with its noun: 1 and 2 are words, 3 to 10 the plural, 11 and more the singular. */
function an(n: number, one: string, two: string, few: string, many: string): string {
  return n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
}
const pl = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

const en = {
  // ── the section ──────────────────────────────────────
  eyebrow: "Connections",
  title: "Connected apps",
  sub: "Let your own AI app, such as Claude or ChatGPT, ask ALYR about this business. You decide who connects, and you can stop it at any moment.",
  linkSub: "Your own AI app, such as Claude or ChatGPT, asking ALYR about your business.",
  loading: "Loading connected apps",
  retry: "Try again",
  offline: "Cannot reach ALYR right now. Try again in a moment.",
  failed: "That did not work. Try again.",
  close: "Close", cancel: "Cancel", dismiss: "Dismiss", undo: "Undo",
  copy: "Copy", copied: "Copied", refresh: "Refresh",
  someone: "Someone", anApp: "An app",

  // ── the two states that offer no action ──────────────
  unavailableTitle: "Not available on this server",
  unavailable: "ALYR has not switched connected apps on here, so no app can connect and nothing is shared. There is nothing to change on this screen.",
  forbiddenTitle: "For owners and admins",
  forbidden: "Only an owner or an admin can see or change connected apps. An app outside ALYR can be given information about the business, so the people who run it decide.",

  // ── the status card and its controls ─────────────────
  statusTitle: "Status",
  stateOff: "Off", stateOn: "On", statePaused: "Paused",
  offOwner: "Off. No app can connect, and nothing is shared with any app until you turn this on.",
  offOther: "Off. Only an owner can turn this on. An owner confirms first that what ALYR sends to an app leaves ALYR and is handled by the provider of the owner's own app, under the owner's own account.",
  on: "On. Connected apps can ask ALYR about this business, within what was allowed for each one.",
  paused: (who: string, when: string) => `Paused by ${who} on ${when}. Every request from every app is refused now. The connections are kept, and they work again when it is resumed.`,
  pausedWhileOff: (who: string, when: string) => `Paused by ${who} on ${when}. It stays paused after it is turned on, until it is resumed.`,
  capHit: (when: string) => `A daily limit was reached on ${when}. An app's request that went over it was refused.`,
  caps: (changes: number, sends: number) => `Daily limits for all apps together: ${pl(changes, "change", "changes")} and ${pl(sends, "message to customers", "messages to customers")}.`,
  turnOn: "Turn on", pause: "Pause all apps", resume: "Resume",
  pauseHint: "Pausing refuses every request at once and keeps the connections.",
  turnedOnToast: "Turned on. Connected apps can now ask ALYR about this business.",
  pausedToast: "Paused. Every request from your apps is refused now.",
  resumedToast: "Resumed. Connected apps can ask again.",

  // ── turning it on: the owner's confirmation ──────────
  turnOnTitle: "Turn on connected apps",
  turnOnIntro: "Read this before you turn it on.",
  confirm: "I understand that what ALYR sends to my app leaves ALYR and is handled by the provider I use there, under my own account.",
  tickHint: "Tick the box to turn this on.",
  mustTick: "Tick the box to turn this on.",

  // ── what an app is given ─────────────────────────────
  sharedTitle: "What an app is given",
  shared: [
    "A customer appears as a first name and the last three digits of their phone number.",
    "Message text, ID numbers and salaries are never given to an app.",
    "An app can do only what was allowed when it was connected. Each connection lists it.",
    "What an app receives is handled by its provider, under your own account there. ALYR does not run your app. The app asks, and ALYR answers.",
  ],

  // ── the connections ──────────────────────────────────
  connTitle: "Connections",
  connCount: (n: number) => pl(n, "app connected", "apps connected"),
  connIntro: "Each row is one app that one person signed in. The apps choose their own names.",
  connEmptyTitle: "No app is connected",
  connEmpty: "When an app is connected, it shows here with who connected it and when it last asked.",
  how: "To connect one, add this address as a connector in your app's settings, then sign in with your ALYR email and choose this business.",
  addressLabel: "Address for your app",
  connectedPill: "Connected",
  allowed: "Allowed",
  scopeNames: {
    read: "See how the business is doing", stock: "Change stock", bookings: "Change bookings",
    orders: "Change orders", send: "Send messages to customers",
  } as Record<string, string>,
  connectedBy: (who: string) => `Connected by ${who}`,
  since: (d: string) => `since ${d}`,
  endsOn: (d: string) => `ends ${d}`,
  lastUsed: (when: string) => `Last used ${when}`,
  neverUsed: "Not used yet",
  end: "End",
  endAria: (app: string) => `End the connection of ${app}`,
  endTitle: (app: string) => `End the connection of ${app}?`,
  endBody: "The app stops working at once, and its next request is refused. It can be connected again, and it will need your approval again.",
  endAction: "End connection",
  endAll: "End all connections",
  endAllTitle: "End all connections?",
  endAllBody: (n: number) => `This ends ${pl(n, "connection", "connections")} at once. Every app stops working until it is connected again.`,
  endAllAction: "End all",
  endedToast: (app: string) => `Ended the connection of ${app}.`,
  endedAllToast: (n: number) => `Ended ${pl(n, "connection", "connections")}.`,
  alreadyEnded: "That connection had already ended.",
  endedTitle: (n: number) => `Ended connections (${n})`,
  endedWhy: {
    ended_by_workspace: "Ended in the workspace",
    all_ended_by_workspace: "Ended with all connections in the workspace",
    replaced: "Replaced by a newer connection of the same person",
    request_reused: "Stopped for safety: a sign-in was used twice",
    code_reused: "Stopped for safety: a sign-in was used twice",
    refresh_reused: "Stopped for safety: a sign-in key was used twice",
    person_removed: "Ended because the person left the team",
    revoked_by_app: "Ended by the app",
    ended_by_alyr: "Ended by ALYR",
  } as Record<string, string>,
  endedUnknown: "Ended",
  expired: (d: string) => `Expired on ${d}`,
  endedLine: (why: string, by: string, when: string) => `${why}${by ? `, by ${by}` : ""}, on ${when}`,

  // ── what the apps did ────────────────────────────────
  logTitle: "What the apps did",
  logIntro: "Every request an app makes, newest first, as the activity record keeps it. It shows what the app asked for, never what ALYR answered.",
  tabCalls: (n: number) => `Requests (${n})`,
  tabEvents: (n: number) => `Connection changes (${n})`,
  logCap: (n: number) => `Showing the newest ${n} records.`,
  logEmpty: "No app has asked anything yet. Each request shows here as soon as it is made.",
  eventsEmpty: "Nothing has changed yet.",
  phase: { read: "Read", preview: "Preview", confirm: "Change confirmed" } as Record<string, string>,
  result: {
    ok: "Done", refused: "Refused", error: "Failed", capped: "Stopped by the daily limit",
    bad_confirm: "Confirmation did not match", over_size: "Answer too large",
  } as Record<string, string>,
  askedFor: "What it asked for",
  byApp: (app: string, person: string) => `${app}, for ${person}`,
  records: (n: number) => pl(n, "record", "records"),
  millis: (n: number) => `${n} ms`,
  eventOptedIn: (who: string) => `${who} turned on connected apps`,
  eventSwitchedOff: (who: string) => `${who} turned off connected apps`,
  eventPaused: (who: string) => `${who} paused all apps`,
  eventResumed: (who: string) => `${who} resumed the apps`,
  eventGrantCreated: (who: string, app: string) => `${who} connected ${app}`,
  eventGrantRevoked: (who: string, app: string) => app ? `${who} ended the connection of ${app}` : `${who} ended a connection`,
  eventCap: "A daily limit was reached",
  eventOther: (action: string) => `Recorded: ${action}`,
};

const ar: typeof en = {
  eyebrow: "الاتصالات",
  title: "التطبيقات المتصلة",
  sub: "اسمح لتطبيق الذكاء الاصطناعي الخاص بك، مثل Claude أو ChatGPT، بأن يسأل ALYR عن هذا النشاط. أنت تقرر من يتصل، ويمكنك إيقاف ذلك في أي لحظة.",
  linkSub: "تطبيق الذكاء الاصطناعي الخاص بك، مثل Claude أو ChatGPT، وهو يسأل ALYR عن نشاطك.",
  loading: "جارٍ تحميل التطبيقات المتصلة",
  retry: "حاول مجدداً",
  offline: "لا يمكن الوصول إلى ALYR الآن. حاول بعد قليل.",
  failed: "لم تنجح العملية. حاول مجدداً.",
  close: "إغلاق", cancel: "إلغاء", dismiss: "إخفاء", undo: "تراجع",
  copy: "نسخ", copied: "تم النسخ", refresh: "تحديث",
  someone: "شخص", anApp: "تطبيق",

  unavailableTitle: "غير متاح على هذا الخادم",
  unavailable: "لم تفعّل ALYR التطبيقات المتصلة هنا، لذلك لا يمكن لأي تطبيق أن يتصل ولا تُشارك أي معلومات. لا يوجد ما يمكن تغييره في هذه الشاشة.",
  forbiddenTitle: "لأصحاب النشاط والمديرين",
  forbidden: "يمكن لمالك النشاط أو المدير فقط الاطلاع على التطبيقات المتصلة أو تغييرها. فقد يحصل تطبيق خارج ALYR على معلومات عن النشاط، لذلك يقرر ذلك من يديره.",

  statusTitle: "الحالة",
  stateOff: "غير مفعّلة", stateOn: "مفعّلة", statePaused: "موقوفة مؤقتاً",
  offOwner: "غير مفعّلة. لا يمكن لأي تطبيق أن يتصل، ولا تُشارك أي معلومات مع أي تطبيق إلى أن تفعّلها.",
  offOther: "غير مفعّلة. يفعّلها المالك فقط. يؤكد المالك أولاً أن ما ترسله ALYR إلى التطبيق يخرج منها ويعالجه مزوّد تطبيقه، بحسابه هو.",
  on: "مفعّلة. يمكن للتطبيقات المتصلة أن تسأل ALYR عن هذا النشاط، ضمن ما سُمح به لكل تطبيق.",
  paused: (who, when) => `أوقفها ${who} في ${when}. يُرفض الآن كل طلب من كل تطبيق. تبقى الاتصالات كما هي، وتعمل من جديد عند الاستئناف.`,
  pausedWhileOff: (who, when) => `أوقفها ${who} في ${when}. تبقى موقوفة بعد التفعيل إلى أن تُستأنف.`,
  capHit: (when) => `بُلغ حد يومي في ${when}. رُفض كل طلب من تطبيق تجاوز الحد.`,
  caps: (changes, sends) => `الحدود اليومية لكل التطبيقات معاً: ${an(changes, "تغيير واحد", "تغييران", "تغييرات", "تغييراً")} و${an(sends, "رسالة واحدة إلى العملاء", "رسالتان إلى العملاء", "رسائل إلى العملاء", "رسالة إلى العملاء")}.`,
  turnOn: "تفعيل", pause: "إيقاف كل التطبيقات مؤقتاً", resume: "استئناف",
  pauseHint: "يرفض الإيقاف المؤقت كل طلب فوراً ويُبقي الاتصالات كما هي.",
  turnedOnToast: "تم التفعيل. يمكن للتطبيقات المتصلة الآن أن تسأل ALYR عن هذا النشاط.",
  pausedToast: "تم الإيقاف المؤقت. يُرفض الآن كل طلب من تطبيقاتك.",
  resumedToast: "تم الاستئناف. يمكن للتطبيقات المتصلة أن تسأل من جديد.",

  turnOnTitle: "تفعيل التطبيقات المتصلة",
  turnOnIntro: "اقرأ هذا قبل التفعيل.",
  confirm: "أفهم أن ما ترسله ALYR إلى تطبيقي يخرج من ALYR ويعالجه المزوّد الذي أستخدمه هناك، بحسابي أنا.",
  tickHint: "ضع علامة في المربع للتفعيل.",
  mustTick: "ضع علامة في المربع للتفعيل.",

  sharedTitle: "ما يحصل عليه التطبيق",
  shared: [
    "يظهر العميل باسمه الأول وآخر ثلاثة أرقام من رقم هاتفه.",
    "لا يحصل أي تطبيق على نص الرسائل ولا على أرقام الهوية ولا على الرواتب.",
    "لا يستطيع التطبيق إلا ما سُمح له به عند ربطه، ويُدرج كل اتصال ما سُمح له.",
    "يعالج مزوّد التطبيق ما يستلمه التطبيق، بحسابك أنت هناك. لا تشغّل ALYR تطبيقك. التطبيق يسأل، وتجيب ALYR.",
  ],

  connTitle: "الاتصالات",
  connCount: (n) => an(n, "تطبيق واحد متصل", "تطبيقان متصلان", "تطبيقات متصلة", "تطبيقاً متصلاً"),
  connIntro: "كل صف هو تطبيق واحد سجّل شخص واحد دخوله. تختار التطبيقات أسماءها بنفسها.",
  connEmptyTitle: "لا يوجد تطبيق متصل",
  connEmpty: "عند ربط تطبيق يظهر هنا مع من ربطه ومتى سأل آخر مرة.",
  how: "لربط تطبيق، أضف هذا العنوان كموصّل في إعدادات تطبيقك، ثم سجّل الدخول ببريدك الإلكتروني المسجل في ALYR واختر هذا النشاط.",
  addressLabel: "عنوان تطبيقك",
  connectedPill: "متصل",
  allowed: "المسموح",
  scopeNames: {
    read: "الاطلاع على سير العمل", stock: "تغيير المخزون", bookings: "تغيير الحجوزات",
    orders: "تغيير الطلبات", send: "إرسال رسائل إلى العملاء",
  },
  connectedBy: (who) => `ربطه ${who}`,
  since: (d) => `منذ ${d}`,
  endsOn: (d) => `ينتهي في ${d}`,
  lastUsed: (when) => `آخر استخدام ${when}`,
  neverUsed: "لم يُستخدم بعد",
  end: "إنهاء",
  endAria: (app) => `إنهاء اتصال ${app}`,
  endTitle: (app) => `إنهاء اتصال ${app}؟`,
  endBody: "يتوقف التطبيق فوراً ويُرفض طلبه التالي. يمكن ربطه من جديد، وسيحتاج إلى موافقتك مرة أخرى.",
  endAction: "إنهاء الاتصال",
  endAll: "إنهاء كل الاتصالات",
  endAllTitle: "إنهاء كل الاتصالات؟",
  endAllBody: (n) => `سينتهي ${an(n, "اتصال واحد", "اتصالان", "اتصالات", "اتصالاً")} فوراً. يتوقف كل تطبيق إلى أن يُربط من جديد.`,
  endAllAction: "إنهاء الكل",
  endedToast: (app) => `تم إنهاء اتصال ${app}.`,
  endedAllToast: (n) => `عدد الاتصالات التي أُنهيت: ${n}.`,
  alreadyEnded: "كان هذا الاتصال قد انتهى.",
  endedTitle: (n) => `الاتصالات المنتهية (${n})`,
  endedWhy: {
    ended_by_workspace: "أُنهي من مساحة العمل",
    all_ended_by_workspace: "أُنهي مع كل الاتصالات من مساحة العمل",
    replaced: "حلّ محلّه اتصال أحدث لنفس الشخص",
    request_reused: "أُوقف للأمان: استُخدم تسجيل الدخول مرتين",
    code_reused: "أُوقف للأمان: استُخدم تسجيل الدخول مرتين",
    refresh_reused: "أُوقف للأمان: استُخدم مفتاح الدخول مرتين",
    person_removed: "أُنهي لأن الشخص غادر الفريق",
    revoked_by_app: "أنهاه التطبيق",
    ended_by_alyr: "أنهته ALYR",
  },
  endedUnknown: "أُنهي",
  expired: (d) => `انتهت صلاحيته في ${d}`,
  endedLine: (why, by, when) => `${why}${by ? `، بواسطة ${by}` : ""}، في ${when}`,

  logTitle: "ما فعلته التطبيقات",
  logIntro: "كل طلب يقدمه تطبيق، الأحدث أولاً، كما يحفظه سجل النشاط. يعرض ما طلبه التطبيق، ولا يعرض ما أجابت به ALYR.",
  tabCalls: (n) => `الطلبات (${n})`,
  tabEvents: (n) => `تغييرات الاتصالات (${n})`,
  logCap: (n) => `عدد السجلات المعروضة: ${n}، وهي الأحدث.`,
  logEmpty: "لم يسأل أي تطبيق عن شيء بعد. يظهر كل طلب هنا فور تقديمه.",
  eventsEmpty: "لم يتغير شيء بعد.",
  phase: { read: "قراءة", preview: "معاينة", confirm: "تغيير مؤكَّد" },
  result: {
    ok: "تم", refused: "مرفوض", error: "تعذّر", capped: "أوقفه الحد اليومي",
    bad_confirm: "التأكيد لا يطابق الطلب", over_size: "الإجابة كبيرة جداً",
  },
  askedFor: "ما طلبه",
  byApp: (app, person) => `${app}، باسم ${person}`,
  records: (n) => an(n, "سجل واحد", "سجلان", "سجلات", "سجلاً"),
  millis: (n) => `${n} مللي ثانية`,
  eventOptedIn: (who) => `فعّل ${who} التطبيقات المتصلة`,
  eventSwitchedOff: (who) => `ألغى ${who} تفعيل التطبيقات المتصلة`,
  eventPaused: (who) => `أوقف ${who} كل التطبيقات مؤقتاً`,
  eventResumed: (who) => `استأنف ${who} عمل التطبيقات`,
  eventGrantCreated: (who, app) => `ربط ${who} تطبيق ${app}`,
  eventGrantRevoked: (who, app) => app ? `أنهى ${who} اتصال ${app}` : `أنهى ${who} اتصالاً`,
  eventCap: "بُلغ حد يومي",
  eventOther: (action) => `سُجّل: ${action}`,
};

export const T = { en, ar };
export type Copy = typeof en;
