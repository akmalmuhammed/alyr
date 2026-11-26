// Fixtures for the preview and tests of Checks, Proof, Answers and Set up (workstream U2), shaped
// exactly like the API's answers (discoveryApi.ts and api2.ts types), for the prototype's fictional
// car care business. The clock is the prototype's: Thursday 12 November 2026, 09:40 in Doha.
// `range` and `cited` on the answers are what workstream G adds; the preview draws them to show
// the approved design, the product hides them until the API sends them.

import type { CheckState, ChecksAnswer, Evidence, Fact, Finding, Place, Proposal, Side, TeamMember } from "../discoveryApi.ts";
import type { AnswersAnswer, ChecksBlock, Pack } from "./api2.ts";
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

export const BLOCK: ChecksBlock = { run_id: "run-1", family: "appointments", trade: "car_care", matched: 10, measured: 14, not_measured: 2, total: 16 };

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
  const rules = [...PHASE1, ...FIRST].map((id) => ({ id, part: "presence" as const, label: pick(lang, NAMES[id][0], NAMES[id][1]) }));
  return {
    run_id: "run-1", finished_at: iso("2026-11-12T06:40:00Z"), measured: true, rules, places: [],
    business: { checks: Object.fromEntries(rules.map((r) => [r.id, STATES[r.id] ?? "pass"])), fixed: ["category_missing"] },
  };
}

const ev = (label: string, value: string, where: string, at = "2026-11-12T06:40:00Z"): Evidence => ({ label, value, where, seen_at: iso(at), day_only: false });

function finding(over: Partial<Finding> & Pick<Finding, "id" | "title" | "rule_id">): Finding {
  return {
    kind: "agent", severity: "high", status: "open", why: "", what_happens: "", what_is_needed: "", evidence: [], location: null,
    first_seen_at: iso("2026-11-12T06:40:00Z"), last_seen_at: iso("2026-11-12T06:40:00Z"), steps: [], proposals: [], needs_fact: null, can_propose: false, proposals_waiting: 0,
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

const plain = (text: string): Side => ({ text, lines: [] });
const hours = (sat: string): Side => ({ text: `Sat ${sat}`, lines: [{ day: "sat", text: sat }] });

function proposal(over: Partial<Proposal> & Pick<Proposal, "id" | "field" | "field_label" | "before" | "after" | "status">): Proposal {
  return {
    finding_id: `f-${over.id}`, rule_id: "category_missing", type: "set", target: "listing", severity: "medium", title: "", why: "", rule: "",
    location: { id: LOC, name: "Nuqta Car Care" }, where: "", change_hash: "h", context: null, evidence: [], proposer: "rule",
    proposed_at: null, expires_at: null, decided: null, undone: null, applied_at: null, undo_until: null, failure: null, verification: null, sample: false,
    can: { approve: false, decline: false, undo: false }, already: false,
    ...over,
  };
}

export function proofFixture(lang: D2Lang): { proposals: Proposal[]; done: Finding[]; team: TeamMember[] } {
  const hana = pick(lang, "Hana", "هناء"), omar = pick(lang, "Omar", "عمر");
  return {
    team: [{ id: "u-hana", name: hana, role: "owner" }, { id: "u-omar", name: omar, role: "admin" }],
    proposals: [
      proposal({ id: "p-cat", field: "category", field_label: pick(lang, "Main category", "التصنيف الرئيسي"), status: "applied", before: plain(pick(lang, "None", "لا شيء")), after: plain(pick(lang, "Car wash", "غسيل السيارات")),
        proposed_at: iso("2026-11-08T06:00:00Z"), decided: { by: hana, channel: "portal", at: iso("2026-11-09T05:12:00Z") }, applied_at: iso("2026-11-09T11:20:00Z"),
        undo_until: iso("2026-11-16T11:20:00Z"), verification: "confirmed", can: { approve: false, decline: false, undo: true } }),
      proposal({ id: "p-name", field: "name", field_label: pick(lang, "Name", "الاسم"), status: "applied", before: plain("Nuqta Car Wash"), after: plain("Nuqta Car Care"),
        proposed_at: iso("2026-11-08T06:00:00Z"), decided: { by: omar, channel: "whatsapp", at: iso("2026-11-09T05:30:00Z") }, applied_at: iso("2026-11-09T12:02:00Z"),
        undo_until: iso("2026-11-16T12:02:00Z"), verification: "confirmed", can: { approve: false, decline: false, undo: true } }),
      proposal({ id: "p-phone", field: "phone", field_label: pick(lang, "Phone number", "رقم الهاتف"), status: "expired", before: plain("+974 5555 0110"), after: plain("+974 5555 0101"),
        proposed_at: iso("2026-10-15T06:00:00Z"), expires_at: iso("2026-10-29T06:00:00Z") }),
      proposal({ id: "p-sat", field: "hours", field_label: pick(lang, "Saturday hours", "ساعات السبت"), status: "undone", before: hours("07:00–22:00"), after: hours("07:00–23:00"),
        proposed_at: iso("2026-10-27T06:00:00Z"), decided: { by: hana, channel: "portal", at: iso("2026-10-27T16:40:00Z") }, applied_at: iso("2026-10-27T16:41:00Z"),
        undone: { by: hana, channel: "portal", at: iso("2026-10-28T07:05:00Z") } }),
    ],
    done: [
      finding({ id: "f-site-phone", rule_id: "phone_conflict", kind: "owner", status: "verified", title: pick(lang, "Phone number on your website", "رقم الهاتف على موقعك"), last_seen_at: iso("2026-11-07T06:40:00Z") }),
      finding({ id: "f-site-hours", rule_id: "hours_conflict", kind: "owner", status: "verified", title: pick(lang, "Friday hours on your website", "ساعات الجمعة على موقعك"), last_seen_at: iso("2026-11-07T06:40:00Z") }),
    ],
  };
}

// ── answers ────────────────────────────────────────────

export function answersFixture(lang: D2Lang, state: "default" | "off" = "default"): AnswersAnswer {
  const base = {
    engines: [], trade: pick(lang, "Car care", "العناية بالسيارات"), city: pick(lang, "Doha", "الدوحة"),
    headline: "", sampleNote: "",
    rule: pick(lang, "By rule: an answer names your business when it contains the name of the business or of one of its places. Position is its place in the answer's list.", "بالقاعدة: تذكر الإجابة نشاطك عندما تتضمن اسم النشاط أو اسم أحد فروعه. الترتيب هو مكانه في قائمة الإجابة."),
    limits: pick(lang, "Names are matched as written: a nickname or a misspelling is not counted. An answer with no list can name your business but gives no position.", "تُطابَق الأسماء كما هي مكتوبة: لا يُحتسب اسم التدلل ولا الخطأ الإملائي. قد تذكر الإجابة التي بلا قائمة نشاطك لكنها لا تعطي ترتيباً."),
    caution: pick(lang, "Answers change from one asking to the next. A few points is not a trend.", "تتغير الإجابات من مرة سؤال إلى أخرى. بضع نقاط ليست اتجاهاً."),
  };
  if (state === "off") return { ...base, enabled: false, last: null, previous: null, range: null, cited: null };
  const tools = [pick(lang, "Answer tool 1", "أداة الإجابة 1"), pick(lang, "Answer tool 2", "أداة الإجابة 2"), pick(lang, "Answer tool 3", "أداة الإجابة 3")];
  const named: Record<string, boolean[]> = { en: [true, false, true, true, true, false], ar: [false, false, false, false, false, false] };
  const qs = { en: ["best car care in Doha", "where can I find good car care in Doha?"], ar: ["أفضل العناية بالسيارات في الدوحة", "أين أجد عناية جيدة بالسيارات في الدوحة؟"] };
  const text = "For car care in Doha, these are often recommended:\n1. Sahm Auto Spa: polishing and full wash, West Bay.\n2. Nuqta Car Care: full wash, interior detail and ceramic coating. Listed as closed on Fridays.\n3. Hayat Detailing Lab: paint correction and ceramic coating.\n4. Basma Car Spa: express wash, open late.";
  const answers = (["en", "ar"] as const).flatMap((l) => tools.flatMap((tool, i) => [0, 1].map((q) => {
    const isNamed = named[l][i * 2 + q];
    return { id: `a-${l}-${i}-${q}`, engine: `tool${i + 1}`, engine_label: tool, lang: l, question: qs[l][q], status: "ok", named: isNamed, position: isNamed ? 2 : null, matched: isNamed ? "Nuqta Car Care" : "", text: l === "en" && i === 1 && q === 0 ? text : "" };
  })));
  return {
    ...base, enabled: true,
    last: { run_id: "run-1", asked_at: iso("2026-11-10T06:12:00Z"), named: 4, counted: 12, measured: true, sample: false, answers },
    previous: { run_id: "run-0", asked_at: iso("2026-11-03T06:12:00Z"), named: 3, counted: 12, measured: true },
    range: { low: 2, high: 7 },
    cited: [
      { kind: "google", title: pick(lang, "Google Maps page", "صفحة خرائط Google"), host: "", cites: 9, state: "differs", note: "" },
      { kind: "website", title: pick(lang, "Your website", "موقعك"), host: "nuqtacarcare.qa", cites: 6, state: "matches", note: "" },
      { kind: "directory", title: pick(lang, "A business directory", "دليل أعمال"), host: "", cites: 4, state: "differs", note: "" },
    ],
  };
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
