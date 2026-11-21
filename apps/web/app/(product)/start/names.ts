// A service or a person has a name in English and one in Arabic, and a customer reads the one for
// their language (T9, D-196). These say which field a screen edits and what a blur saves.

import type { Lang } from "./copy";

export type Named = { id: string; name: string; name_ar: string };
export type NameKey = "name" | "name_ar";

/** The name field in the language the screen is in. */
export const mainKey = (lang: Lang): NameKey => (lang === "ar" ? "name_ar" : "name");

/** The name field in the other language, shown under it. */
export const otherKey = (lang: Lang): NameKey => (lang === "ar" ? "name" : "name_ar");

/** What to save when the owner leaves a name field with `typed` in it: nothing when it did not
 *  change, nothing when the English name was emptied (it is required), and otherwise only that
 *  one field. An Arabic name may be cleared: the booking page then shows the English one. */
export function nameChange(key: NameKey, row: Named, typed: string): Partial<Named> | null {
  const value = typed.trim();
  if (value === row[key] || (key === "name" && !value)) return null;
  return { [key]: value };
}
