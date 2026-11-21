// The kit's pure logic: class builders and small rules, with no React and no DOM, so
// `node --test` can run them (variants.test.mjs). Erasable TypeScript only: no enums, no
// parameter properties, no path aliases, because the tests import this file directly.

export type Falsy = false | null | undefined | "" | 0;

/** Joins class names, dropping anything falsy. */
export function cx(...parts: Array<string | Falsy>): string {
  return parts.filter(Boolean).join(" ");
}

// ── buttons ─────────────────────────────────────────────

export type ButtonKind = "volt" | "dark" | "line" | "quiet" | "bad";
/** Heights: xs 28, sm 32, md 36, touch 44. */
export type ButtonSize = "xs" | "sm" | "md" | "touch";

export const BUTTON_KINDS: readonly ButtonKind[] = ["volt", "dark", "line", "quiet", "bad"];
export const BUTTON_SIZES: readonly ButtonSize[] = ["xs", "sm", "md", "touch"];

export type ButtonClassOptions = {
  kind?: ButtonKind;
  size?: ButtonSize;
  /** A button that is only an icon (see IconButton). */
  iconOnly?: boolean;
  /** An action is in flight: drawn as a quiet grey button with a Volt dot. */
  busy?: boolean;
  disabled?: boolean;
  block?: boolean;
  className?: string;
};

/**
 * The classes of a button. A Volt button that cannot be pressed is drawn as an outline, never
 * as a dimmed Volt (alyr-design, principle 2), so `volt` + `disabled` becomes `line`.
 */
export function buttonClass(o: ButtonClassOptions = {}): string {
  const asked: ButtonKind = o.kind ?? "line";
  const kind: ButtonKind = asked === "volt" && o.disabled ? "line" : asked;
  return cx(
    "u-btn",
    `u-btn--${kind}`,
    `u-btn--${o.size ?? "md"}`,
    o.iconOnly && "u-btn--icon",
    o.busy && "u-btn--busy",
    o.block && "u-btn--block",
    o.className,
  );
}

// ── tones ───────────────────────────────────────────────

/** Tag tones. `volt` exists for completeness; the drawings never use it. */
export type TagTone = "ok" | "warn" | "bad" | "n" | "volt" | "ink";
/** Status tones. `off` is a hollow ring, for something switched off. */
export type StatusTone = "ok" | "warn" | "bad" | "n" | "volt" | "off";
export type BannerTone = "ok" | "warn" | "bad" | "n";
export type DotTone = "ok" | "warn" | "bad" | "n" | "volt" | "ink" | "off" | "pending";
export type MeterTone = "ink" | "ok" | "warn" | "bad" | "volt";

export function tagClass(tone: TagTone = "n", className?: string): string {
  return cx("u-tag", `u-tag--${tone}`, className);
}

export function statusClass(tone: StatusTone = "n", className?: string): string {
  return cx("u-status", `u-status--${tone}`, className);
}

export function bannerClass(tone: BannerTone = "n", className?: string): string {
  return cx("u-banner", `u-banner--${tone}`, className);
}

/** A bad banner interrupts (alert); the others are read in turn (status). */
export function bannerRole(tone: BannerTone): "alert" | "status" {
  return tone === "bad" ? "alert" : "status";
}

// ── tabs ────────────────────────────────────────────────

/**
 * Where a key moves a row of tabs, or null when the key is not for tabs. In a right-to-left
 * row the arrow that points forward is the left one.
 */
export function nextTabIndex(current: number, key: string, count: number, rtl: boolean): number | null {
  if (count <= 0) return null;
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const back = rtl ? "ArrowRight" : "ArrowLeft";
  if (key === forward) return (current + 1) % count;
  if (key === back) return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

// ── forms ───────────────────────────────────────────────

/** The ids a field gives its hint and its error, so the control can name them in aria-describedby. */
export function fieldIds(base: string, has: { hint?: boolean; error?: boolean }): {
  hint: string | undefined;
  error: string | undefined;
  describedBy: string | undefined;
} {
  const hint = has.hint ? `${base}-hint` : undefined;
  const error = has.error ? `${base}-error` : undefined;
  const joined = [hint, error].filter(Boolean).join(" ");
  return { hint, error, describedBy: joined || undefined };
}

/** Joins ids for aria-describedby, dropping the missing ones. */
export function joinIds(...ids: Array<string | Falsy>): string | undefined {
  const joined = ids.filter(Boolean).join(" ");
  return joined || undefined;
}

// ── numbers and names ───────────────────────────────────

/** A value as a whole percentage of a maximum, kept between 0 and 100. */
export function meterPercent(value: number, max = 100): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

export type StepState = "done" | "current" | "todo";

export function stepState(index: number, current: number): StepState {
  return index < current ? "done" : index === current ? "current" : "todo";
}

const HAS_LETTER = /[\p{L}\p{N}]/u;

/**
 * Up to two initials: the first letter of the first two words, so "Gulf Courier W.L.L." is GC
 * and "Hana" is H. A word is never split into letters (Arabic joins), only its first letter
 * is taken. Words with no letter or digit ("&", "-") are skipped.
 */
export function initials(name: string): string {
  const words = String(name ?? "")
    .normalize("NFC")
    .trim()
    .split(/\s+/)
    .filter((word) => HAS_LETTER.test(word));
  const letters = words.slice(0, 2).map((word) => {
    const first = Array.from(word).find((ch) => HAS_LETTER.test(ch)) ?? "";
    return first.toLocaleUpperCase("en");
  });
  return letters.join("");
}

/** How many shop colours there are (the `--shop-*` tokens). */
export const SHOP_COLOURS = 6;

/** A stable colour index, 0 to 5, from a number or any text (an item's id or name). */
export function shopColour(seed: number | string): number {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return ((Math.trunc(seed) % SHOP_COLOURS) + SHOP_COLOURS) % SHOP_COLOURS;
  }
  let hash = 0;
  for (const ch of String(seed)) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return hash % SHOP_COLOURS;
}

/** Pixels to rem, so a component sized by a number still scales with the user's text size. */
export function rem(px: number): string {
  return `${Math.round((px / 16) * 10000) / 10000}rem`;
}
