// The sales demo's logic, kept apart from React so it can be tested with `node --test`
// (logic.test.mjs): the scenes and their beats, stepping through them, the owner's estimate,
// the order of scene 4 from the pains they tapped, and the money format. A later sector
// (sweets, home kitchens, salons) changes the words and the data, not this file.

export type Lang = "en" | "ar";

export const PAINS = [
  "midnight", "twenty", "eid", "transfer", "ready", "pistachio", "delivery", "cafe", "best", "google",
] as const;
export type Pain = (typeof PAINS)[number];

/** What scene 4 shows when nothing was tapped: the four with a live moment of their own. */
export const DEFAULT_PAINS: Pain[] = ["ready", "pistachio", "cafe", "delivery"];

/** Pains whose answer is shown in another scene: scene 4 points there and offers the jump. */
export const POINTS_TO: Partial<Record<Pain, number>> = { midnight: 3, twenty: 3, eid: 3, best: 7, google: 6 };

/** 0 is the setup panel; 1 to 9 are the script's scenes. */
export const SCENES = ["setup", "bakery", "money", "order", "pains", "system", "found", "sunday", "how", "next"] as const;
export type Scene = (typeof SCENES)[number];
export const LAST = SCENES.length - 1;

/** Where each scene starts in the script, in seconds from scene 1 (docs/sales/demo-bakery.md). */
export const TARGET = [0, 0, 60, 180, 480, 600, 660, 750, 810, 870];
/** The whole run, for the notes' clock. */
export const RUN = 900;

/** The pains scene 4 walks through, in the order they were tapped. */
export function painOrder(tapped: readonly Pain[]): Pain[] {
  const seen = tapped.filter((p, i) => PAINS.includes(p) && tapped.indexOf(p) === i);
  return seen.length ? seen : DEFAULT_PAINS;
}

/** Beats per scene. Scene 4 has two a pain (before, after) and two for the invoice. */
export function beats(scene: number, tapped: readonly Pain[]): number {
  switch (SCENES[scene]) {
    case "setup": return 1;
    case "bakery": return 2;
    case "money": return 3;
    case "order": return 7;
    case "pains": return painOrder(tapped).length * 2 + 2;
    case "system": return 10;
    case "found": return 4;
    case "sunday": return 2;
    case "how": return 2;
    case "next": return 2;
    default: return 1;
  }
}

export type Pos = { scene: number; beat: number };

/** One step forward or back through the beats; it stops at both ends. */
export function step(pos: Pos, dir: 1 | -1, tapped: readonly Pain[]): Pos {
  const count = beats(pos.scene, tapped);
  if (dir === 1) {
    if (pos.beat < count - 1) return { scene: pos.scene, beat: pos.beat + 1 };
    if (pos.scene < LAST) return { scene: pos.scene + 1, beat: 0 };
    return pos;
  }
  if (pos.beat > 0) return { scene: pos.scene, beat: pos.beat - 1 };
  if (pos.scene > 1) return { scene: pos.scene - 1, beat: beats(pos.scene - 1, tapped) - 1 };
  return pos;
}

/** The progress line: how far through the nine scenes, from 0 to 1. */
export function progress(pos: Pos, tapped: readonly Pain[]): number {
  if (pos.scene < 1) return 0;
  const within = (pos.beat + 1) / beats(pos.scene, tapped);
  return Math.min(1, (pos.scene - 1 + within) / (LAST));
}

export type Numbers = { daily: number; after: number; average: number; share: number };

export const START: Numbers = { daily: 40, after: 8, average: 120, share: 10 };
/** The share that would have ordered stays low on purpose; the founder can change it. */
export const SHARE = { min: 5, max: 25, step: 5 };
export const DAYS = 30;

export const LIMITS = {
  daily: { min: 5, max: 300, step: 5 },
  after: { min: 1, max: 120, step: 1 },
  average: { min: 20, max: 1000, step: 10 },
};

/** After-hours messages a day × 30 days × the share that would have ordered × the average
 * order, rounded to the nearest 10. */
export function estimate(n: Numbers): number {
  const after = Math.min(n.after, n.daily);
  const raw = after * DAYS * (n.share / 100) * n.average;
  return Math.round(raw / 10) * 10;
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** "QAR 2,880" in English, "2,880 ر.ق" in Arabic, Western digits in both. */
export function qar(amount: number, lang: Lang): string {
  const figure = Math.round(amount).toLocaleString("en-US");
  return lang === "ar" ? `${figure} ر.ق` : `QAR ${figure}`;
}

export const SHOP_COLOURS = ["cocoa", "terracotta", "rose", "saffron", "teal", "plum"] as const;
export type ShopColour = (typeof SHOP_COLOURS)[number];

export type Setup = { name: string; nameAr: string; colour: ShopColour; line: string };
export const SETUP: Setup = { name: "", nameAr: "", colour: "cocoa", line: "" };

/** The shop's name in the language shown; the Arabic name falls back to the English one. */
export function shopName(setup: Setup, lang: Lang, fallback: { en: string; ar: string }): string {
  const en = setup.name.trim();
  const ar = setup.nameAr.trim();
  if (lang === "ar") return ar || en || fallback.ar;
  return en || ar || fallback.en;
}

/** A test line link is drawn as a QR only when it is a web address. */
export function testLine(link: string): string | null {
  const value = link.trim();
  if (!value) return null;
  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes(".") ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** The pickup day the order page offers, and the next with room, for scene 3. */
export const CAKE = { limit: 12, before: 10 };
