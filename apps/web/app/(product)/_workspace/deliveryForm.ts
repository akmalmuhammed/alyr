// The Delivery sheet's small pure helpers (ALY-150 part 2): days of the week and a cut-off time in
// plain words, and a day turned on or off. No screen and no imports, so each can be tested
// (`delivery.test.mjs`). Days run 0 (Sunday) to 6, as the API keeps them.

/** Picks a day in or out of the list, keeping it sorted. */
export function toggleDay(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
}

/** "Sun, Wed", or `every` when none or all seven are chosen (an empty list means every day). */
export function daysLine(days: number[], names: readonly string[], separator: string, every: string): string {
  const set = Array.from(new Set(days)).filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (set.length === 0 || set.length === 7) return every;
  return set.map((d) => names[d]).join(separator);
}

/** "14:00" as the shop's clock reads it in 12 hours: "2:00 PM" or "2:00 م". Anything else is returned as it came. */
export function clock12(hhmm: string, am: string, pm: string): string {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm.trim());
  if (!match) return hhmm;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return hhmm;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? am : pm}`;
}

/** What a time input holds ("14:00", maybe with seconds) as the API takes it, or null for empty. */
export function cutoffValue(text: string): string | null {
  const clean = text.trim();
  if (!clean) return null;
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(clean) ? clean.slice(0, 5) : null;
}
