// What the back office's Discovery form does before it asks the API (D-169): the form's state for one
// place and one day, what it starts from (the last thing recorded, or nothing), and the plain body
// the API stores. Pure, so it is tested with `node --test` (`discoveryOps.test.mjs`) and the form
// holds no rule of its own.
//
// The two promises the form keeps for the API:
//   * a block staff did not look at is not sent (null), and the API reads it as "not checked", never
//     as "nothing there"; "looked, and there is nothing" is said out loud ("None shown", "None set");
//   * a review is a rating, a date and whether the business replied. Anything else on a line is
//     refused here and again by the API, so a reviewer's words or name are never typed into ALYR.

export const DAYS = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"] as const;
export type Day = (typeof DAYS)[number];
export const PLATFORMS = ["instagram", "facebook", "tiktok", "snapchat", "x", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** "" is not checked. */
export type Tri = "" | "yes" | "no";
export type Mode = "unchecked" | "none" | "set";
export type DayHours = { closed: boolean; open: string; close: string };
export type HoursForm = { mode: Mode; days: Record<Day, DayHours> };

export type ListingForm = {
  state: "unchecked" | "found" | "missing";
  claimed: Tri; name: string; phone: string; address: string; url: string;
  hours: HoursForm;
  categoriesMode: Mode; categories: string;
  photos: string; rating: string; reviewCount: string;
};
export type WebsiteForm = {
  checked: boolean; url: string; reachable: Tri; lists: Tri; page: Tri; phone: string;
  whatsappMode: Mode; whatsapp: string; hours: HoursForm;
};
export type ReviewsForm = { checked: boolean; text: string };
export type SocialForm = Record<Platform, { link: string; linked: Tri }>;
export type ObservationForm = {
  observedOn: string; where: string; listing: ListingForm; website: WebsiteForm; reviews: ReviewsForm; social: SocialForm;
};

/** The last thing recorded for a place, as `GET .../discovery` sends it. */
export type SavedObservation = {
  observed_on: string; where: string;
  listing?: Record<string, unknown> | null; website?: Record<string, unknown> | null;
  reviews?: { rating: number; posted_on: string; replied: boolean }[] | null;
  social?: Record<string, { url?: string; linked_from_site?: boolean }> | null;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const emptyHours = (): HoursForm => ({
  mode: "unchecked",
  days: Object.fromEntries(DAYS.map((d) => [d, { closed: false, open: "09:00", close: "21:00" }])) as Record<Day, DayHours>,
});

export const emptyForm = (today: string): ObservationForm => ({
  observedOn: today, where: "",
  listing: {
    state: "unchecked", claimed: "", name: "", phone: "", address: "", url: "", hours: emptyHours(),
    categoriesMode: "unchecked", categories: "", photos: "", rating: "", reviewCount: "",
  },
  website: { checked: false, url: "", reachable: "", lists: "", page: "", phone: "", whatsappMode: "unchecked", whatsapp: "", hours: emptyHours() },
  reviews: { checked: false, text: "" },
  social: Object.fromEntries(PLATFORMS.map((p) => [p, { link: "", linked: "" as Tri }])) as SocialForm,
});

// ── from what was recorded to the form ───────────────────

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? String(v) : "");
const tri = (v: unknown): Tri => (v === true ? "yes" : v === false ? "no" : "");

function hoursFrom(value: unknown): HoursForm {
  const out = emptyHours();
  if (value === undefined || value === null || typeof value !== "object") return out;
  const week = value as Record<string, unknown>;
  if (Object.keys(week).length === 0) return { ...out, mode: "none" };
  out.mode = "set";
  for (const d of DAYS) {
    const span = week[d];
    out.days[d] = Array.isArray(span) && span.length === 2
      ? { closed: false, open: str(span[0]), close: str(span[1]) }
      : { closed: true, open: "09:00", close: "21:00" };
  }
  return out;
}

export const reviewLine = (r: { rating: number; posted_on: string; replied: boolean }) => `${r.rating}, ${r.posted_on}, ${r.replied ? "yes" : "no"}`;

/** The form for a new round: the last thing recorded, so staff change what changed; the day is today's. */
export function formFrom(saved: SavedObservation | null, today: string): ObservationForm {
  const form = emptyForm(today);
  if (!saved) return form;
  form.where = saved.where ?? "";
  const l = saved.listing;
  if (l && typeof l === "object") {
    form.listing = {
      state: l.found === false ? "missing" : "found",
      claimed: tri(l.claimed), name: str(l.name), phone: str(l.phone), address: str(l.address), url: str(l.url),
      hours: hoursFrom(l.hours),
      categoriesMode: Array.isArray(l.categories) ? (l.categories.length ? "set" : "none") : "unchecked",
      categories: Array.isArray(l.categories) ? l.categories.join(", ") : "",
      photos: num(l.photo_count), rating: num(l.rating), reviewCount: num(l.review_count),
    };
  }
  const w = saved.website;
  if (w && typeof w === "object") {
    const link = w.whatsapp_link;
    form.website = {
      checked: true, url: str(w.url), reachable: tri(w.reachable), lists: tri(w.lists_location), page: tri(w.has_location_page), phone: str(w.phone),
      whatsappMode: typeof link === "string" ? (link === "" ? "none" : "set") : "unchecked", whatsapp: typeof link === "string" ? link : "",
      hours: hoursFrom(w.hours),
    };
  }
  if (Array.isArray(saved.reviews)) form.reviews = { checked: true, text: saved.reviews.map(reviewLine).join("\n") };
  if (saved.social) {
    for (const p of PLATFORMS) {
      const s = saved.social[p];
      if (s) form.social[p] = { link: str(s.url), linked: tri(s.linked_from_site) };
    }
  }
  return form;
}

// ── reviews: a rating, a date and whether the business replied ──

const YES = new Set(["yes", "y", "replied", "answered", "true", "1"]);
const NO = new Set(["no", "n", "none", "unanswered", "false", "0"]);
const WORDS_NOT_KEPT = "only a rating, a date and yes or no: a reviewer's words and name are not recorded";

export type ReviewRow = { rating: number; posted_on: string; replied: boolean };
export type ReviewsParse = { ok: true; reviews: ReviewRow[] } | { ok: false; error: string };

export function parseReviews(text: string, observedOn: string): ReviewsParse {
  const reviews: ReviewRow[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const at = `Line ${i + 1}`;
    const parts = raw.split(/[\s,;]+/).filter(Boolean);
    if (parts.length !== 3) return { ok: false, error: `${at}: ${WORDS_NOT_KEPT}. Write it as: 4, 2026-11-10, no` };
    const rating = Number(parts[0]);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: `${at}: the rating is a whole number from 1 to 5` };
    if (!DAY.test(parts[1]) || Number.isNaN(Date.parse(parts[1]))) return { ok: false, error: `${at}: write the date as year-month-day, like 2026-11-10` };
    if (observedOn && parts[1] > observedOn) return { ok: false, error: `${at}: it is dated after the day it was seen` };
    const answer = parts[2].toLowerCase();
    if (!YES.has(answer) && !NO.has(answer)) return { ok: false, error: `${at}: end the line with yes if the business replied, no if not` };
    reviews.push({ rating, posted_on: parts[1], replied: YES.has(answer) });
  }
  return { ok: true, reviews };
}

/** What the typed reviews add up to, for a line under the box. */
export function reviewTally(text: string, observedOn: string): { count: number; replied: number; low: number } | null {
  const parsed = parseReviews(text, observedOn);
  if (!parsed.ok) return null;
  return {
    count: parsed.reviews.length,
    replied: parsed.reviews.filter((r) => r.replied).length,
    low: parsed.reviews.filter((r) => r.rating <= 3).length,
  };
}

// ── from the form to the body the API stores ─────────────

export type Body = {
  observed_on: string; where: string;
  listing: Record<string, unknown> | null; website: Record<string, unknown> | null;
  reviews: ReviewRow[] | null; social: Record<string, { url: string; linked_from_site?: boolean }> | null;
};
export type BodyResult = { ok: true; body: Body } | { ok: false; error: string };

const yes = (t: Tri) => t === "yes";

function hoursBody(h: HoursForm, label: string): { ok: true; value: Record<string, unknown> | undefined } | { ok: false; error: string } {
  if (h.mode === "unchecked") return { ok: true, value: undefined };
  if (h.mode === "none") return { ok: true, value: {} };
  const week: Record<string, [string, string] | null> = {};
  for (const d of DAYS) {
    const day = h.days[d];
    if (day.closed) { week[d] = null; continue; }
    if (!TIME.test(day.open) || !TIME.test(day.close)) return { ok: false, error: `${label} ${d}: write the times as 07:00 and 22:00` };
    if (day.open >= day.close) return { ok: false, error: `${label} ${d}: it opens before it closes` };
    week[d] = [day.open, day.close];
  }
  return { ok: true, value: week };
}

function whole(value: string): number | undefined | "bad" {
  const v = value.trim();
  if (v === "") return undefined;
  return /^\d{1,7}$/.test(v) ? Number(v) : "bad";
}

export function bodyOf(form: ObservationForm): BodyResult {
  if (!DAY.test(form.observedOn)) return { ok: false, error: "Say which day this was seen." };
  let listing: Record<string, unknown> | null = null;
  const l = form.listing;
  if (l.state === "missing") listing = { found: false };
  if (l.state === "found") {
    listing = { found: true };
    if (l.claimed !== "") listing.claimed = yes(l.claimed);
    for (const [key, value] of [["name", l.name], ["phone", l.phone], ["address", l.address], ["url", l.url]] as const) {
      if (value.trim()) listing[key] = value.trim();
    }
    const hours = hoursBody(l.hours, "Listing hours");
    if (!hours.ok) return hours;
    if (hours.value !== undefined) listing.hours = hours.value;
    if (l.categoriesMode === "none") listing.categories = [];
    if (l.categoriesMode === "set") {
      const cats = l.categories.split(/[,;\n]/).map((c) => c.trim()).filter(Boolean);
      if (cats.length === 0) return { ok: false, error: "Listing categories: type them, or choose None set." };
      listing.categories = cats;
    }
    for (const [key, value, label] of [["photo_count", l.photos, "photos"], ["review_count", l.reviewCount, "review count"]] as const) {
      const n = whole(value);
      if (n === "bad") return { ok: false, error: `Listing ${label}: a whole number.` };
      if (n !== undefined) listing[key] = n;
    }
    if (l.rating.trim()) {
      const r = Number(l.rating.trim());
      if (Number.isNaN(r) || r < 1 || r > 5) return { ok: false, error: "Listing rating: a number from 1 to 5." };
      listing.rating = r;
    }
  }

  let website: Record<string, unknown> | null = null;
  const w = form.website;
  if (w.checked) {
    website = {};
    if (w.url.trim()) website.url = w.url.trim();
    if (w.reachable !== "") website.reachable = yes(w.reachable);
    if (w.lists !== "") website.lists_location = yes(w.lists);
    if (w.page !== "") website.has_location_page = yes(w.page);
    if (w.phone.trim()) website.phone = w.phone.trim();
    if (w.whatsappMode === "none") website.whatsapp_link = "";
    if (w.whatsappMode === "set") {
      if (!w.whatsapp.trim()) return { ok: false, error: "Website WhatsApp link: type it, or choose None on the page." };
      website.whatsapp_link = w.whatsapp.trim();
    }
    const hours = hoursBody(w.hours, "Website hours");
    if (!hours.ok) return hours;
    if (hours.value !== undefined) website.hours = hours.value;
    if (Object.keys(website).length === 0) return { ok: false, error: "Website: fill in what you looked at, or untick it." };
  }

  let reviews: ReviewRow[] | null = null;
  if (form.reviews.checked) {
    const parsed = parseReviews(form.reviews.text, form.observedOn);
    if (!parsed.ok) return parsed;
    reviews = parsed.reviews;
  }

  const social: Record<string, { url: string; linked_from_site?: boolean }> = {};
  for (const p of PLATFORMS) {
    const s = form.social[p];
    if (!s.link.trim()) continue;
    social[p] = s.linked === "" ? { url: s.link.trim() } : { url: s.link.trim(), linked_from_site: yes(s.linked) };
  }

  const body: Body = {
    observed_on: form.observedOn, where: form.where.trim(), listing, website, reviews,
    social: Object.keys(social).length ? social : null,
  };
  if (!listing && !website && !reviews && !body.social) return { ok: false, error: "Record at least one thing that was seen." };
  return { ok: true, body };
}

/** How many days ago a day was, from `today`, both as year-month-day; used to say an observation is old. */
export function daysBetween(day: string, today: string): number {
  return Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000);
}

export const isOld = (day: string, today: string, after: number) => daysBetween(day, today) > after;

/** A day, written plainly: "20 Nov 2026". */
export function dayText(day: string): string {
  const parsed = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? day : parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
