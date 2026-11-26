// Fixtures for the preview and tests of Checks, Proof, Answers and Set up (workstream U2), shaped
// exactly like the API's answers (discoveryApi.ts and api2.ts types), for the prototype's fictional
// car care business. The clock is the prototype's: Thursday 12 November 2026, 09:40 in Doha.
// The answers fixture is the raw shape of G's `GET /answers` (PR #362), read through `parseAnswers`
// exactly as the product reads it; like the sample, it never reaches 30 answers (`not_enough`).

import type { CheckState, ChecksAnswer, Evidence, Fact, Finding, Place, Proposal, Side, TeamMember } from "../discoveryApi.ts";
import { parseAnswers, type AnswersAnswer, type ChecksBlock, type Pack } from "./api2.ts";
import type { D2Lang } from "./copy.ts";

const iso = (s: string) => new Date(Date.parse(s)).toISOString();
const LOC = "0b3c6c0e-5a7e-4c62-9a52-1a2f3e4d5c01";
const pick = (lang: D2Lang, en: string, ar: string) => (lang === "ar" ? ar : en);

// ── packs (the shape of `GET /packs`, titles from packs/data.py) ──

const PHASE1 = ["listing_missing", "listing_unclaimed", "hours_missing", "hours_conflict", "phone_conflict", "name_conflict", "category_missing", "photos_few", "website_location_missing", "whatsapp_link_missing", "review_unanswered", "rating_low"];
const FIRST = ["hours_vs_activity", "own_links_present", "whatsapp_number_mismatch", "bilingual_name_rule"];

export function packsFixture(lang: D2Lang): Pack[] {
  const tr = (key: string, en: string, ar: string, ...overlays: string[]) => ({ key, title: pick(lang, en, ar), title_en: en, title_ar: ar, overlays });
  const fam = (id: string, en: string, ar: string, trades: ReturnType<typeof tr>[]): Pack => ({
    id, kind: "family", family: id, title: pick(lang, en, ar), title_en: en, title_ar: ar, trades, rules: [], checks: 0, total_checks: PHASE1.length + FIRST.length, overlays: [], skip: [],
  });
  return [
    { id: "core", kind: "core", family: null, title: pick(lang, "Checks for every business", "فحوص لكل منشأة"), title_en: "Checks for every business", title_ar: "فحوص لكل منشأة", trades: [], rules: [...PHASE1, ...FIRST], checks: PHASE1.length + FIRST.length, total_checks: PHASE1.length + FIRST.length, overlays: [], skip: [] },
    fam("food", "Food and drink", "الأطعمة والمشروبات", [tr("restaurant", "Restaurant", "مطعم"), tr("cafe", "Café", "مقهى"), tr("bakery", "Bakery and home kitchen", "مخبز ومطبخ منزلي")]),
    fam("appointments", "Appointments", "خدمات بالمواعيد", [tr("salon", "Salon and beauty", "صالون وتجميل"), tr("barber", "Barber", "صالون حلاقة"), tr("car_care", "Car care", "العناية بالسيارات"), tr("clinic", "Clinic", "عيادة", "health")]),
    fam("home_services", "Home and field services", "الخدمات المنزلية والميدانية", [tr("ac_repair", "AC repair", "إصلاح المكيفات"), tr("cleaning", "Cleaning", "التنظيف")]),
    fam("retail", "Shops and products", "المتاجر والمنتجات", [tr("shop", "Shop and retail", "متجر"), tr("fashion", "Fashion and gifts", "أزياء وهدايا"), tr("pharmacy", "Pharmacy", "صيدلية", "health")]),
    fam("stays_schools", "Stays and schools", "الإقامة والمدارس", [tr("hotel", "Hotel", "فندق"), tr("nursery", "Nursery", "حضانة أطفال")]),
    fam("online_only", "Online and trade", "البيع عبر الإنترنت والجملة", [tr("online_seller", "Online seller", "بائع عبر الإنترنت", "online_seller"), tr("wholesale", "Wholesale and trading", "جملة وتجارة")]),
    { id: "health", kind: "overlay", family: null, title: pick(lang, "Health", "الصحة"), title_en: "Health", title_ar: "الصحة", trades: [], rules: [], checks: 0, total_checks: null, overlays: [], skip: [] },
    { id: "online_seller", kind: "overlay", family: null, title: pick(lang, "No shop front", "بلا واجهة محل"), title_en: "No shop front", title_ar: "بلا واجهة محل", trades: [], rules: [], checks: 0, total_checks: null, overlays: [], skip: ["website_location_missing"] },
  ];
}

export const BLOCK: ChecksBlock = { run_id: "run-1", family: "appointments", trade: "car_care", matched: 10, measured: 14, not_measured: 2, total: 16, previous: { matched: 8, measured: 14, at: iso("2026-11-05T06:40:00Z") } };

// ── checks ─────────────────────────────────────────────

const NAMES: Record<string, [string, string]> = {
  listing_missing: ["On Google Maps", "على خرائط Google"], listing_unclaimed: ["Claimed", "مُوثّقة باسم المنشأة"], hours_missing: ["Hours shown", "ساعات العمل مذكورة"],
  hours_conflict: ["Hours match", "ساعات العمل متطابقة"], phone_conflict: ["Phone matches", "رقم الهاتف متطابق"], name_conflict: ["Name spelled one way", "الاسم بصيغة واحدة"],
  category_missing: ["Main category", "التصنيف الرئيسي"], photos_few: ["5 photos or more", "5 صور أو أكثر"], website_location_missing: ["On the website", "مذكور في الموقع الإلكتروني"],
  whatsapp_link_missing: ["WhatsApp link", "رابط واتساب"], review_unanswered: ["Reviews answered", "الرد على المراجعات"], rating_low: ["Rating 4.0 or more", "التقييم 4.0 أو أكثر"],
  hours_vs_activity: ["Hours match your orders and bookings", "الساعات توافق طلباتك وحجوزاتك"], own_links_present: ["Links to your ALYR pages", "روابط صفحاتك في ALYR"],
  whatsapp_number_mismatch: ["WhatsApp number matches", "رقم واتساب متطابق"], bilingual_name_rule: ["Name in Arabic and English", "الاسم بالعربية والإنجليزية"],
};
const STATES: Record<string, CheckState> = {
  hours_conflict: "fail", phone_conflict: "fail", whatsapp_link_missing: "fail", hours_vs_activity: "fail",
  review_unanswered: "not_measured", rating_low: "not_measured",
};

export function checksFixture(lang: D2Lang): ChecksAnswer {
  const rules = [...PHASE1, ...FIRST].map((id) => ({ id, part: "presence" as const, label: pick(lang, NAMES[id][0], NAMES[id][1]), pack: "core", first_party: FIRST.includes(id) }));
  return {
    run_id: "run-1", finished_at: iso("2026-11-12T06:40:00Z"), measured: true, rules, places: [],
    business: { checks: Object.fromEntries(rules.map((r) => [r.id, STATES[r.id] ?? "pass"])), fixed: ["category_missing"] },
  };
}

const ev = (label: string, value: string, where: string, at = "2026-11-12T06:40:00Z"): Evidence => ({ label, value, where, seen_at: iso(at), day_only: false, sentence: "" });

function finding(over: Partial<Finding> & Pick<Finding, "id" | "title" | "rule_id">): Finding {
  return {
    kind: "agent", severity: "high", status: "open", why: "", what_happens: "", what_is_needed: "", evidence: [], location: null,
    first_seen_at: iso("2026-11-12T06:40:00Z"), last_seen_at: iso("2026-11-12T06:40:00Z"), steps: [], proposals: [], needs_fact: null, can_propose: false, proposals_waiting: 0, website_steps: [],
    ...over,
  };
}

export function findingsFixture(lang: D2Lang): Finding[] {
  const you = pick(lang, "You confirmed", "أكّدته أنت");
  const biz = pick(lang, "The business's details in ALYR", "بيانات المنشأة في ALYR");
  const g = pick(lang, "Google listing", "صفحة Google");
  const web = pick(lang, "Website", "الموقع الإلكتروني");
  return [
    finding({ id: "f-hours", rule_id: "hours_conflict", proposals_waiting: 1, title: pick(lang, "Google says Friday is closed; your website says 13:00–22:00.", "تقول Google إن الجمعة مغلق، ويقول موقعك 13:00–22:00."),
      evidence: [ev(you, pick(lang, "Fri 13:00–22:00", "الجمعة 13:00–22:00"), biz), ev(pick(lang, "Friday", "الجمعة"), pick(lang, "Closed", "مغلق"), g), ev(pick(lang, "Friday", "الجمعة"), "13:00–22:00", web)] }),
    finding({ id: "f-phone", rule_id: "phone_conflict", proposals_waiting: 1, title: pick(lang, "Google shows a different phone number from the one you confirmed.", "تعرض Google رقم هاتف يختلف عن الرقم الذي أكّدته."),
      evidence: [ev(you, "+974 5555 0101", biz), ev(pick(lang, "Phone", "الهاتف"), "+974 5555 0110", g)] }),
    finding({ id: "f-link", rule_id: "whatsapp_link_missing", kind: "owner", severity: "medium", title: pick(lang, "Your website has no WhatsApp link.", "لا يوجد رابط واتساب على موقعك."),
      evidence: [ev(you, "+974 5555 0101", biz), ev(pick(lang, "WhatsApp link", "رابط واتساب"), pick(lang, "No link", "لا رابط"), web)] }),
    finding({ id: "f-activity", rule_id: "hours_vs_activity", proposals_waiting: 1, title: pick(lang, "Google says closed on Fridays, but you had 7 orders and 11 bookings on the last 4.", "تقول Google إنك مغلق أيام الجمعة، لكن لديك 7 طلبات و11 حجزاً في آخر أربع جُمع."),
      evidence: [ev(you, pick(lang, "Fri 13:00–22:00", "الجمعة 13:00–22:00"), biz), ev(pick(lang, "Last 4 Fridays", "آخر أربع جُمع"), pick(lang, "7 orders · 11 bookings", "7 طلبات · 11 حجزاً"), pick(lang, "Orders and bookings in ALYR", "الطلبات والحجوزات في ALYR")), ev(pick(lang, "Friday", "الجمعة"), pick(lang, "Closed", "مغلق"), g)] }),
  ];
}

// ── proof ──────────────────────────────────────────────

const plain = (text: string): Side => ({ text, lines: [], removed: false });
const hours = (sat: string): Side => ({ text: `Sat ${sat}`, lines: [{ day: "sat", text: sat }], removed: false });
/** A "before" whose Google text was removed after 30 days, as the API sends it. */
const removed = (lang: D2Lang): Side => ({ text: pick(lang, "removed after 30 days (Google's terms)", "حُذف بعد 30 يومًا (وفق شروط Google)"), lines: [], removed: true });

function proposal(over: Partial<Proposal> & Pick<Proposal, "id" | "field" | "field_label" | "before" | "after" | "status">): Proposal {
  return {
    finding_id: `f-${over.id}`, rule_id: "category_missing", type: "set", target: "listing", severity: "medium", title: "", why: "", rule: "",
    location: { id: LOC, name: "Nuqta Car Care" }, where: "", change_hash: "h", context: null, evidence: [], proposer: "rule",
    proposed_at: null, expires_at: null, decided: null, undone: null, applied_at: null, undo_until: null, failure: null, verification: null, sample: false,
    can: { approve: false, decline: false, undo: false }, already: false,
    queue: null, opened_at: null, approved_as: null, edited_from: null, life: null, life_history: [], receipt: null,
    undo_window_days: 7, next_check_at: null, verified_at: null, edit: null, also_fixes: null, expire_reason: "", closed_at: null,
    ...over,
  };
}

export function proofFixture(lang: D2Lang): { proposals: Proposal[]; done: Finding[]; team: TeamMember[] } {
  const hana = pick(lang, "Hana", "هناء"), omar = pick(lang, "Omar", "عمر");
  return {
    team: [{ id: "u-hana", name: hana, role: "owner" }, { id: "u-omar", name: omar, role: "admin" }],
    proposals: [
      proposal({ id: "p-cat", field: "category", field_label: pick(lang, "Main category", "التصنيف الرئيسي"), status: "applied", before: plain(pick(lang, "None", "لا شيء")), after: plain(pick(lang, "Car wash", "غسيل السيارات")),
        proposed_at: iso("2026-11-08T06:00:00Z"), decided: { by: hana, channel: "portal", at: iso("2026-11-09T05:12:00Z"), reason: "" }, applied_at: iso("2026-11-09T11:20:00Z"),
        undo_until: iso("2026-11-16T11:20:00Z"), verification: "confirmed", can: { approve: false, decline: false, undo: true } }),
      proposal({ id: "p-name", field: "name", field_label: pick(lang, "Name", "الاسم"), status: "applied", before: plain("Nuqta Car Wash"), after: plain("Nuqta Car Care"),
        proposed_at: iso("2026-11-08T06:00:00Z"), decided: { by: omar, channel: "whatsapp", at: iso("2026-11-09T05:30:00Z"), reason: "" }, applied_at: iso("2026-11-09T12:02:00Z"),
        undo_until: iso("2026-11-16T12:02:00Z"), verification: "confirmed", can: { approve: false, decline: false, undo: true },
        approved_as: "edited", life: { state: "live", at: iso("2026-11-10T08:10:00Z"), text: "" },
        receipt: { at: iso("2026-11-09T12:02:00Z"), edited: true, approved_text: "", undo: { days: 7, until: iso("2026-11-16T12:02:00Z") }, next_check_at: null, verified: { at: iso("2026-11-10T08:10:00Z"), state: "live", text: "" } } }),
      proposal({ id: "p-phone", field: "phone", field_label: pick(lang, "Phone number", "رقم الهاتف"), status: "expired", before: removed(lang), after: plain("+974 5555 0101"),
        proposed_at: iso("2026-10-15T06:00:00Z"), expires_at: iso("2026-10-29T06:00:00Z"), expire_reason: "time", closed_at: iso("2026-10-29T06:10:00Z") }),
      proposal({ id: "p-sat", field: "hours", field_label: pick(lang, "Saturday hours", "ساعات السبت"), status: "undone", before: hours("07:00–22:00"), after: hours("07:00–23:00"),
        proposed_at: iso("2026-10-27T06:00:00Z"), decided: { by: hana, channel: "portal", at: iso("2026-10-27T16:40:00Z"), reason: "" }, applied_at: iso("2026-10-27T16:41:00Z"),
        undone: { by: hana, channel: "portal", at: iso("2026-10-28T07:05:00Z"), reason: "" } }),
    ],
    done: [
      finding({ id: "f-site-phone", rule_id: "phone_conflict", kind: "owner", status: "verified", title: pick(lang, "Phone number on your website", "رقم الهاتف على موقعك"), last_seen_at: iso("2026-11-07T06:40:00Z") }),
      finding({ id: "f-site-hours", rule_id: "hours_conflict", kind: "owner", status: "verified", title: pick(lang, "Friday hours on your website", "ساعات الجمعة على موقعك"), last_seen_at: iso("2026-11-07T06:40:00Z") }),
    ],
  };
}

// ── answers ────────────────────────────────────────────

export function answersFixture(lang: D2Lang, state: "default" | "off" = "default"): AnswersAnswer {
  const L = (en: string, ar: string) => pick(lang, en, ar);
  const settings = { trade: "car_care", city: "doha", area: "west_bay", trade_label: L("Car care", "العناية بالسيارات"), city_label: L("Doha", "الدوحة"), area_label: L("West Bay", "الخليج الغربي") };
  const words = {
    method: L("ALYR asked the same public questions through the developer interfaces of Answer tool 1, Answer tool 2 and Answer tool 3, as if the asker were in West Bay, Doha. Those interfaces can answer differently from the tools' own apps.",
      "طرحت ALYR الأسئلة العامة نفسها عبر واجهات المطوّرين لأداة الإجابة 1 وأداة الإجابة 2 وأداة الإجابة 3، كأن السائل في الخليج الغربي، الدوحة. وقد تجيب هذه الواجهات بخلاف تطبيقات الأدوات نفسها."),
    rule: L("By rule: an answer names your business when it contains the name of the business or of one of its places.", "بالقاعدة: تذكر الإجابة نشاطك عندما تتضمن اسم النشاط أو اسم أحد فروعه."),
    limits: L("Names are matched as written: a nickname or a misspelling is not counted.", "تُطابَق الأسماء كما هي مكتوبة: لا يُحتسب اسم التدلل ولا الخطأ الإملائي."),
    caution: L("Answers change from one asking to the next. A few answers is not a trend.", "تتغير الإجابات من مرة سؤال إلى أخرى. بضع إجابات ليست اتجاهاً."),
    range_note: L("The range is where the share of answers naming you most likely lies, for these questions and this tool (95%, Wilson method). A share is given from 30 answers. A change is named only when both check-ups counted at least 30 answers from that tool in that language and the ranges do not overlap.",
      "النطاق هو حيث تقع على الأرجح نسبة الإجابات التي تذكر نشاطك، لهذه الأسئلة ولهذه الأداة (95%، طريقة ويلسون). تُعطى النسبة من 30 إجابة. ولا يُذكر تغيّر إلا حين يعدّ الفحصان كلاهما 30 إجابة على الأقل من تلك الأداة بتلك اللغة ولا يتداخل النطاقان."),
    quote_note: L("Answers are shown as the answer tools gave them. ALYR did not write them and acts on nothing in them.", "تُعرض الإجابات كما أعطتها أدوات الإجابة. لم تكتبها ALYR ولا تنفّذ أي شيء مما ورد فيها."),
    sources_title: L("Where the answers got their facts", "من أين أخذت الإجابات معلوماتها"),
    sources_note: L("The pages each answer tool said it used. ALYR does not open them. Where a page names your business with a phone number, that number is compared with the numbers you confirmed.",
      "الصفحات التي قالت كل أداة إجابة إنها استندت إليها. لا تفتحها ALYR. وحيث تذكر الصفحة نشاطك مع رقم هاتف، يُقارن ذلك الرقم بالأرقام التي أكّدتها."),
    sample_note: "",
  };
  if (state === "off") return parseAnswers({ enabled: false, settings, last: null, previous: null, engines: [], ...words });
  const tools = [L("Answer tool 1", "أداة الإجابة 1"), L("Answer tool 2", "أداة الإجابة 2"), L("Answer tool 3", "أداة الإجابة 3")];
  const named: Record<string, boolean[]> = { en: [true, false, true, true, true, false], ar: [false, false, false, false, false, false] };
  const qs = { en: ["best car care in Doha", "where can I find good car care in Doha?"], ar: ["أفضل العناية بالسيارات في الدوحة", "أين أجد عناية جيدة بالسيارات في الدوحة؟"] };
  const text = "For car care in Doha, these are often recommended:\n1. Sahm Auto Spa: polishing and full wash, West Bay.\n2. Nuqta Car Care: full wash, interior detail and ceramic coating. Listed as closed on Fridays.\n3. Hayat Detailing Lab: paint correction and ceramic coating.\n4. Basma Car Spa: express wash, open late.";
  const check = { matches: L("Matches what you confirmed", "يطابق ما أكّدته"), differs: L("Differs from what you confirmed", "يختلف عمّا أكّدته"), not_read: L("Nothing in it to compare", "لا شيء فيها للمقارنة") };
  const answers = (["en", "ar"] as const).flatMap((l) => tools.flatMap((tool, i) => [0, 1].map((q) => {
    const isNamed = named[l][i * 2 + q];
    return {
      id: `a-${l}-${i}-${q}`, engine: `tool${i + 1}`, engine_label: tool, said_by: tool, lang: l, question: qs[l][q], status: "ok", named: isNamed,
      matched: isNamed ? "Nuqta Car Care" : "", text: l === "en" && i === 1 && q === 0 ? text : "", third_party: true, shared: true,
      sources: [{ host: "maps.example", title: "Nuqta Car Care", check: "differs", check_label: check.differs }],
    };
  })));
  // Wilson 95% ranges in whole percents, as G's stats.range_view gives them.
  const range = (k: number, nn: number) => ({ 0: { low: 0, high: 39 }, 1: { low: 3, high: 56 }, 2: { low: 30, high: 90 } } as Record<number, { low: number; high: number }>)[k] ?? (nn ? { low: 0, high: 100 } : null);
  const why = (prev: number, last: number) => L(`No change is named: that needs at least 30 answers in both check-ups, and they counted ${prev} answers and then ${last} answers.`,
    `لا يُذكر أي تغيير: يلزم لذلك 30 إجابة على الأقل في كلا الفحصين، وقد عُدّت ${prev} إجابات ثم ${last} إجابات.`);
  const groups = tools.flatMap((tool, i) => (["en", "ar"] as const).map((l) => {
    const k = named[l].slice(i * 2, i * 2 + 2).filter(Boolean).length;
    return {
      engine: `tool${i + 1}`, engine_label: tool, sample: false, lang: l, lang_label: l === "en" ? L("English", "الإنجليزية") : L("Arabic", "العربية"),
      named: k, counted: 2, asked: 2, range: range(k, 2), share: null, headline: "",
      change: { state: "not_enough", reason: why(2, 2), since_run_id: "run-0", since: { named: Math.max(0, k - 1), counted: 2, range: range(Math.max(0, k - 1), 2) } },
    };
  }));
  return parseAnswers({
    enabled: true, settings, ...words,
    engines: tools.map((label, i) => ({ kind: `tool${i + 1}`, label, sample: false, live: true })),
    last: {
      run_id: "run-1", asked_at: iso("2026-11-10T06:12:00Z"), named: 4, counted: 12, sample: false, groups, answers,
      sources: [
        { host: "maps.example", titles: [L("Nuqta Car Care on a map page", "نقطة للعناية بالسيارات على صفحة خرائط")], answers: 9, answers_without_you: 5, check: "differs", check_label: check.differs, engine_labels: tools, langs: ["en", "ar"] },
        { host: "nuqtacarcare.example", titles: [L("Nuqta Car Care: opening hours", "نقطة للعناية بالسيارات: ساعات العمل")], answers: 6, answers_without_you: 2, check: "matches", check_label: check.matches, engine_labels: tools.slice(0, 2), langs: ["en"] },
        { host: "directory.example", titles: [L("Car care in Doha, a directory", "دليل العناية بالسيارات في الدوحة")], answers: 4, answers_without_you: 4, check: "not_read", check_label: check.not_read, engine_labels: tools.slice(1), langs: ["ar"] },
      ],
      searches: [],
    },
    previous: { run_id: "run-0", asked_at: iso("2026-11-03T06:12:00Z"), named: 3, counted: 12, sample: false },
  });
}

// ── set up ─────────────────────────────────────────────

export function setupFixture(lang: D2Lang): { place: Place; facts: Fact[] } {
  return {
    place: { id: LOC, name: "Nuqta Car Care", name_ar: "نقطة للعناية بالسيارات", area: "Doha", whatsapp_e164: "+974 5555 0101", managers: null },
    facts: [
      { location_id: LOC, key: "hours", source: "owner", confirmed_by_name: pick(lang, "Hana", "هناء"), confirmed_at: iso("2026-11-10T15:12:00Z"), default: false,
        value: { sat: ["07:00", "22:00"], sun: ["07:00", "22:00"], mon: ["07:00", "22:00"], tue: ["07:00", "22:00"], wed: ["07:00", "22:00"], thu: ["07:00", "22:00"], fri: ["13:00", "22:00"] } },
      { location_id: LOC, key: "phone", source: "owner", confirmed_by_name: pick(lang, "Hana", "هناء"), confirmed_at: iso("2026-11-10T15:12:00Z"), default: false, value: { phone: "+974 5555 0101" } },
      { location_id: LOC, key: "category", source: "owner", confirmed_by_name: pick(lang, "Hana", "هناء"), confirmed_at: iso("2026-11-10T15:12:00Z"), default: false, value: { category: pick(lang, "Car wash", "غسيل السيارات") } },
    ],
  };
}
