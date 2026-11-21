// Fixture data for the preview route: one fictional business, Nuqta Car Care, and nothing real.
// A screen takes this as props; live data would arrive the same way. Prices here are the shape of
// a quote ALYR publishes (449 for the first product, 150 for each one added, D-035), not an offer.

import type { QuoteLine, ServiceLine } from "./logic.ts";

export interface BusinessChoice {
  id: string;
  name: string;
  name_ar: string;
  role: "owner" | "admin";
  initial: string;
  usedLast?: boolean;
}

export interface ServiceItem extends ServiceLine {
  id: string;
}

export interface BusinessTypeItem {
  id: string;
  icon: "cal" | "star" | "truck" | "home" | "orders" | "box" | "layers" | "store" | "tag" | "wallet" | "globe" | "prod";
  withAlyr?: boolean;
}

export const FIXTURE_EMAIL = "hana@nuqta.qa";
export const FIXTURE_CODE = "730518";
export const FIXTURE_BUSINESS_NAME = "Nuqta Car Care";

export const FIXTURE_BUSINESSES: BusinessChoice[] = [
  { id: "nuqta", name: "Nuqta Car Care", name_ar: "نقطة للعناية بالسيارات", role: "owner", initial: "N", usedLast: true },
  { id: "qirfa", name: "Qirfa Bakery", name_ar: "مخبز قرفة", role: "admin", initial: "Q" }
];

/** The device line under the code card: what the browser reported, and when (Thu 12 Nov 2026, 09:40 in Doha). */
export const FIXTURE_SESSION = { browser: "Chrome", os: "Windows", place: "Doha", at: "2026-11-12T09:40:00+03:00" } as const;

/** The order the owner was working on when the sign-in ended (written with a hash in front). */
export const FIXTURE_ORDER = 1042;
export const FIXTURE_LAST_SAVED = "2026-11-12T09:40:00+03:00";

export const FIXTURE_SERVICES: ServiceItem[] = [
  { id: "s1", name: "Express wash", minutes: 20, price: "35", deposit: "" },
  { id: "s2", name: "Full wash", minutes: 40, price: "60", deposit: "" },
  { id: "s3", name: "Interior detail", minutes: 90, price: "150", deposit: "" },
  { id: "s4", name: "Engine bay clean", minutes: 30, price: "80", deposit: "" },
  { id: "s5", name: "Ceramic coating", minutes: 240, price: "1,200", deposit: "300" },
  { id: "s6", name: "Ceramic top-up", minutes: 60, price: "250", deposit: "" }
];

/** The lengths the price list offers, in minutes. */
export const LENGTH_CHOICES = [15, 20, 30, 40, 45, 60, 90, 120, 180, 240, 300, 480] as const;

export const FIXTURE_TYPES: BusinessTypeItem[] = [
  { id: "salon", icon: "cal" },
  { id: "spa", icon: "star" },
  { id: "carcare", icon: "truck" },
  { id: "home", icon: "home" },
  { id: "restaurant", icon: "orders" },
  { id: "bakery", icon: "box" },
  { id: "grocery", icon: "layers" },
  { id: "retail", icon: "store" },
  { id: "fashion", icon: "tag" },
  { id: "wholesale", icon: "wallet", withAlyr: true },
  { id: "travel", icon: "globe", withAlyr: true },
  { id: "other", icon: "prod" }
];

/** Only car care has a drawn list of what a business starts with. */
export const TYPES_WITH_START_LIST: readonly string[] = ["carcare"];

/** A published quote for the fictional business: amounts in dirhams (100 to the riyal). */
export const FIXTURE_QUOTE: { publishedAt: string; lines: (QuoteLine & { note: "first" | "further" | "included" })[] } = {
  publishedAt: "2026-11-11T10:00:00+03:00",
  lines: [
    { product: "bookings", dirhams: 44900, note: "first" },
    { product: "chat", dirhams: 15000, note: "further" },
    { product: "shelf", dirhams: null, note: "included" },
    { product: "agent", dirhams: null, note: "included" }
  ]
};

export const FIXTURE_HOURS = { open: "07:00", close: "22:00" } as const;

/** The clock on each drawn chat, so a bubble never carries a made-up time in a component. */
export const CHAT_TIMES = {
  status: "09:40",
  type: ["09:38", "09:38", "09:39", "09:39"],
  offer: ["09:40", "09:40"],
  plan: ["09:30", "09:31"]
} as const;
