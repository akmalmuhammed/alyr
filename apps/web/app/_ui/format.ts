// How the product writes a number, a time, a date and an empty value, in English and Arabic.
// One place, so a screen never invents its own (the old screens have 13 money helpers). Pure
// functions with no imports and erasable TypeScript, so `node --test` runs them directly.
//
// The rules, from the redesign's format guide and the API (`core/words.py`, `agent/words.py`):
//
//   money      Amounts are integers in dirhams (100 to the riyal), as the API sends them.
//              English «QAR 85», «QAR 85.50», «QAR 1,234»; Arabic «85 ر.ق»; Western digits in
//              both; no «.00» except on paper (`paper: true` gives two decimals always); three
//              decimals only for a Meta rate (`rate: true`, «QAR 0.124»). The currency sits
//              next to the number with a no-break space, so a cell never wraps between them.
//   time       Doha's clock (Asia/Qatar, UTC+3, no summer time), whatever the device says.
//              24 hour by default («09:40»); `setClock(12)` flips every call at once («9:40 AM»,
//              «9:40 ص»), the founder's 12 or 24 hour decision being open. Western digits.
//   date       «Thu 12 Nov», with the year when it is not the current year («Mon 8 Feb 2027»);
//              Arabic «الخميس 12 نوفمبر». Ranges join with an en dash and no spaces.
//   ago        «4 min», «3 h», «2 d»; Arabic «4 د», «3 س», «يومان». «Just now» under a minute.
//   none       The empty value is the word, never an em dash.
//
// Arabic runs of numbers and times need `<bdi>` (or `<bdi dir="ltr">` for a range) where the
// page renders them; `isolate()` does the same for a string that is not rendered as markup
// (an aria-label, a title attribute). Every Arabic word here is a draft until the native
// review (ALY-66).

export type Lang = "en" | "ar";
/** What a formatter accepts as a point in time: an instant, epoch milliseconds, or text. */
export type Moment = Date | number | string;

/** U+00A0. Between a currency or a unit and its number, so the pair never breaks across lines. */
export const NBSP = " ";
/** The en dash that joins a range, with no spaces: «07:00–22:00», «4–10 Oct». */
export const EN_DASH = "–";
/** Doha's zone. Qatar has been UTC+3 with no summer time since 1972, so the offset is fixed. */
export const ZONE = "Asia/Qatar";

const OFFSET_MS = 3 * 3_600_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// ── the empty value ───────────────────────────────────────

const NONE: Record<Lang, string> = { en: "None", ar: "لا يوجد" };

/** The word for an empty value in a cell or a key-value row. Never an em dash. */
export function none(lang: Lang): string {
  return NONE[lang];
}

// ── money ─────────────────────────────────────────────────

export type MoneyOptions = {
  /** A paper document (invoice, receipt, credit note): always two decimals, «3,110.00». */
  paper?: boolean;
  /** A Meta per-message rate: up to three decimals, at least two, «0.124», «7.56», «0.10». */
  rate?: boolean;
};

function group(whole: number): string {
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Just the number, no currency: «85», «85.50», «1,234», «3,110.00» (paper), «0.124» (rate). */
export function amount(dirhams: number, options: MoneyOptions = {}): string {
  const negative = dirhams < 0;
  let whole: number;
  let decimals: string;
  if (options.rate) {
    // A rate can have a fraction of a dirham, so count in mils (a thousandth of a riyal).
    const mils = Math.round(Math.abs(dirhams) * 10);
    whole = Math.floor(mils / 1000);
    decimals = String(mils % 1000).padStart(3, "0");
    if (decimals.endsWith("0")) decimals = decimals.slice(0, 2);
  } else {
    const fils = Math.round(Math.abs(dirhams));
    whole = Math.floor(fils / 100);
    const part = fils % 100;
    decimals = options.paper || part ? String(part).padStart(2, "0") : "";
  }
  return `${negative && (whole || decimals.replace(/0/g, "")) ? "-" : ""}${group(whole)}${decimals ? `.${decimals}` : ""}`;
}

/** «QAR 85» in English, «85 ر.ق» in Arabic. An unknown amount is the empty value. */
export function money(dirhams: number | null | undefined, lang: Lang, options: MoneyOptions = {}): string {
  if (dirhams === null || dirhams === undefined || !Number.isFinite(dirhams)) return none(lang);
  const figure = amount(dirhams, options);
  if (lang === "ar") return `${figure}${NBSP}ر.ق`;
  // The minus sits before the currency: «-QAR 24», as the API writes it.
  return figure.startsWith("-") ? `-QAR${NBSP}${figure.slice(1)}` : `QAR${NBSP}${figure}`;
}

// ── agreement (Arabic counts) ─────────────────────────────

/**
 * A noun in both languages. English: [one, many]. Arabic: [one, two, three to ten, eleven and
 * up]; the first two are whole phrases («صنف واحد», «صنفان»), the last two the noun alone.
 * The same shape as `Noun` in the API's `core/words.py`, so a word list can be copied across.
 */
export type Noun = {
  en: readonly [one: string, many: string];
  ar: readonly [one: string, two: string, few: string, many: string];
};

/** «1 order», «3 orders»; «طلب واحد», «طلبان», «3 طلبات», «11 طلباً». Mirrors the API's `counted`. */
export function counted(n: number, noun: Noun, lang: Lang): string {
  const digits = n.toLocaleString("en");
  if (lang === "ar") {
    const [one, two, few, many] = noun.ar;
    if (n === 1) return one;
    if (n === 2) return two;
    const tail = Math.abs(n) % 100;
    return n === 0 || (tail >= 3 && tail <= 10) ? `${digits}${NBSP}${few}` : `${digits}${NBSP}${many}`;
  }
  const [one, many] = noun.en;
  return `${digits}${NBSP}${n === 1 ? one : many}`;
}

/** The form of an Arabic verb or pronoun that agrees with a count: one, two, or more. Mirrors `agree`. */
export function agree<T>(n: number, one: T, two: T, many: T): T {
  return n === 1 ? one : n === 2 ? two : many;
}

// ── reading a moment in Doha ──────────────────────────────

type Fields = {
  /** Calendar year, month (0 to 11) and day of the month, in Doha. */
  year: number;
  month: number;
  day: number;
  /** The clock, in Doha. `null` when the input was a date alone. */
  hour: number | null;
  minute: number;
  /** 0 is Sunday. `null` when the input was a time alone. */
  weekday: number | null;
  /** Whether this is an instant (it can be subtracted), or only text on a wall. */
  instant: number | null;
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_TIME = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;
const NAIVE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month, day)).getUTCDay();
}

/**
 * Doha's fields for a moment. A Date, epoch milliseconds or ISO text with a zone is an
 * instant, converted to Doha. «2026-11-12» is that calendar day, «2026-11-12T09:40» is that
 * time on Doha's wall (no zone means Doha), and «09:40» is a time alone. Anything else is null.
 */
function read(value: Moment | null | undefined): Fields | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const text = value.trim();
    let hit = DATE_ONLY.exec(text);
    if (hit) {
      const [year, month, day] = [Number(hit[1]), Number(hit[2]) - 1, Number(hit[3])];
      return { year, month, day, hour: null, minute: 0, weekday: weekdayOf(year, month, day), instant: null };
    }
    hit = WALL_TIME.exec(text);
    if (hit) {
      const [hour, minute] = [Number(hit[1]), Number(hit[2])];
      if (hour > 23 || minute > 59) return null;
      return { year: 0, month: 0, day: 0, hour, minute, weekday: null, instant: null };
    }
    hit = NAIVE.exec(text);
    if (hit) {
      const [year, month, day, hour, minute] = [Number(hit[1]), Number(hit[2]) - 1, Number(hit[3]), Number(hit[4]), Number(hit[5])];
      return { year, month, day, hour, minute, weekday: weekdayOf(year, month, day), instant: Date.UTC(year, month, day, hour, minute) - OFFSET_MS };
    }
  }
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const doha = new Date(ms + OFFSET_MS);
  return {
    year: doha.getUTCFullYear(),
    month: doha.getUTCMonth(),
    day: doha.getUTCDate(),
    hour: doha.getUTCHours(),
    minute: doha.getUTCMinutes(),
    weekday: doha.getUTCDay(),
    instant: ms,
  };
}

/** Doha's calendar year now (or at `now`), to decide whether a date needs its year. */
function yearOf(now: Moment | undefined): number {
  return read(now ?? Date.now())?.year ?? new Date().getUTCFullYear();
}

// ── time ──────────────────────────────────────────────────

let clockHours: 12 | 24 = 24;

/** The one switch: 24 (the default) or 12 hour time for every `formatTime` call. */
export function setClock(hours: 12 | 24): void {
  clockHours = hours;
}
export function getClock(): 12 | 24 {
  return clockHours;
}

const PERIOD: Record<Lang, readonly [am: string, pm: string]> = { en: ["AM", "PM"], ar: ["ص", "م"] };

export type TimeOptions = {
  /** 12 or 24 for this call; default is the switch (`setClock`). */
  clock?: 12 | 24;
};

/** «09:40» (24 hour), «9:40 AM» or «9:40 ص» (12 hour). Doha's time; a time alone ("09:40") is kept as written. */
export function formatTime(value: Moment | null | undefined, lang: Lang, options: TimeOptions = {}): string {
  const at = read(value);
  if (!at || at.hour === null) return none(lang);
  const minute = String(at.minute).padStart(2, "0");
  if ((options.clock ?? clockHours) === 24) return `${String(at.hour).padStart(2, "0")}:${minute}`;
  const hour12 = at.hour % 12 === 0 ? 12 : at.hour % 12;
  return `${hour12}:${minute}${NBSP}${PERIOD[lang][at.hour < 12 ? 0 : 1]}`;
}

// ── date ──────────────────────────────────────────────────

const MONTH: Record<Lang, readonly string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
};
/** Sunday first, as the shop's week runs. */
const WEEKDAY: Record<Lang, readonly string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
};
/** One letter for a tight column, Sunday first (arabic.md). English uses the same first letters. */
export const WEEKDAY_INITIAL: Record<Lang, readonly string[]> = {
  en: ["S", "M", "T", "W", "T", "F", "S"],
  ar: ["ح", "ن", "ث", "ر", "خ", "ج", "س"],
};

export type DateOptions = {
  /** «auto» (default): the year when it is not the current year. */
  year?: "auto" | "always" | "never";
  /** Leave the weekday out: «12 Nov». Default true. */
  weekday?: boolean;
  /** What "now" is, for the year rule. Default the clock. */
  now?: Moment;
};

/** «Thu 12 Nov», «Mon 8 Feb 2027»; Arabic «الخميس 12 نوفمبر». The day, month and year never break apart; the weekday may wrap. */
export function formatDate(value: Moment | null | undefined, lang: Lang, options: DateOptions = {}): string {
  const at = read(value);
  if (!at || at.weekday === null) return none(lang);
  const mode = options.year ?? "auto";
  const showYear = mode === "always" || (mode === "auto" && at.year !== yearOf(options.now));
  const day = `${at.day}${NBSP}${MONTH[lang][at.month]}${showYear ? `${NBSP}${at.year}` : ""}`;
  return options.weekday === false ? day : `${WEEKDAY[lang][at.weekday]} ${day}`;
}

/** «Thu 12 Nov, 09:40»: a date and a time. The comma is the one separator between them. */
export function formatDateTime(value: Moment | null | undefined, lang: Lang, options: DateOptions & TimeOptions = {}): string {
  const date = formatDate(value, lang, options);
  const time = formatTime(value, lang, options);
  return date === none(lang) || time === none(lang) ? none(lang) : `${date}, ${time}`;
}

// ── ranges ────────────────────────────────────────────────

/** «07:00–22:00», «0–30»: two parts joined by an en dash with no spaces. In Arabic put it in `<bdi dir="ltr">`. */
export function range(from: string | number, to: string | number): string {
  return `${from}${EN_DASH}${to}`;
}

/** Two clock times: «07:00–22:00». */
export function timeRange(from: Moment, to: Moment, lang: Lang, options: TimeOptions = {}): string {
  return range(formatTime(from, lang, options), formatTime(to, lang, options));
}

/** Two days: «4–10 Oct» in one month, «28 Oct–3 Nov» across two; the year at the end when it is not this year's. */
export function dateRange(from: Moment, to: Moment, lang: Lang, options: Pick<DateOptions, "now"> = {}): string {
  const a = read(from);
  const b = read(to);
  if (!a || !b || a.weekday === null || b.weekday === null) return none(lang);
  const showYear = b.year !== yearOf(options.now) || a.year !== b.year;
  const left = a.year === b.year && a.month === b.month ? String(a.day) : `${a.day}${NBSP}${MONTH[lang][a.month]}${a.year !== b.year ? `${NBSP}${a.year}` : ""}`;
  const right = `${b.day}${NBSP}${MONTH[lang][b.month]}${showYear ? `${NBSP}${b.year}` : ""}`;
  return range(left, right);
}

// ── how long ago ──────────────────────────────────────────

const MINUTES_AR = "د";
const HOURS_AR = "س";
const DAYS_AR: Noun["ar"] = ["يوم واحد", "يومان", "أيام", "يوماً"];

/**
 * «4 min», «3 h», «2 d»; Arabic «4 د», «3 س», «يومان». Under a minute is «Just now» («الآن»),
 * and from 30 days on it is the date. A moment in the future (a clock a little ahead) reads as now.
 */
export function ago(value: Moment | null | undefined, lang: Lang, now: Moment = Date.now()): string {
  const then = read(value)?.instant;
  const here = read(now)?.instant;
  if (then === null || then === undefined || here === null || here === undefined) return none(lang);
  const elapsed = Math.max(here - then, 0);
  if (elapsed < MINUTE) return lang === "ar" ? "الآن" : "Just now";
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes}${NBSP}${lang === "ar" ? MINUTES_AR : "min"}`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours}${NBSP}${lang === "ar" ? HOURS_AR : "h"}`;
  }
  const days = Math.floor(elapsed / DAY);
  if (days < 30) return lang === "ar" ? counted(days, { en: ["day", "days"], ar: DAYS_AR }, lang) : `${days}${NBSP}d`;
  return formatDate(value, lang, { now });
}

// ── people ────────────────────────────────────────────────

const ARABIC = /[؀-ۿ]/;
const PHONE_ONLY = /^[+\d\s()-]+$/;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Initials for an avatar: the first letters of the first two words in capitals («Hana Saleh»
 * gives «HS»); one letter for an Arabic name, past the article (النور gives «ن»). A name that
 * is only a phone number (a WhatsApp contact with no profile name) or empty gives `fallback`.
 */
export function initials(name: string | null | undefined, fallback = "·"): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length || PHONE_ONLY.test(words.join(" "))) return fallback;
  if (ARABIC.test(words.join(" "))) {
    const first = words[0].replace(/^ال/, "") || words[0];
    return Array.from(first)[0] ?? fallback;
  }
  const letters = words.map((word) => Array.from(word).find((char) => LETTER_OR_DIGIT.test(char)) ?? "");
  return letters.slice(0, 2).join("").toUpperCase() || fallback;
}

// ── for strings that are not markup ───────────────────────

/** Wrap text in a left-to-right isolate (U+2066 … U+2069): a time, a range or a number in an
 * Arabic aria-label or title, where `<bdi dir="ltr">` cannot go. */
export function isolate(text: string): string {
  return `⁦${text}⁩`;
}
