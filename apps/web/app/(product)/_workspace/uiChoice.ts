// Which look a section opens in: the classic one (ui 1) or the redesigned one (ui 2). Nothing here
// draws or reads the browser, so `node --test` runs it (uiChoice.test.mjs).
//
// The rule, in order: the address says (`?ui=2` or `?ui=1`, and the choice is then remembered for
// that section on this device); else what this device remembered; else the section's own default
// in the registry. Every section's default is the classic look until the founder flips it, so a
// visitor who never wrote `?ui=2` sees what they have always seen.

export type Ui = 1 | 2;

/** localStorage key: a JSON object of section key to 1 or 2. */
export const UI_STORE = "alyr-ui-choice";

export type Remembered = Record<string, Ui>;

/** What the address asks for, or null when it asks nothing (or anything but 1 or 2). */
export function uiFromQuery(value: string | null | undefined): Ui | null {
  return value === "2" ? 2 : value === "1" ? 1 : null;
}

/** The remembered choices, tolerant of anything a person or another version left in storage. */
export function parseRemembered(text: string | null | undefined): Remembered {
  if (!text) return {};
  try {
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Remembered = {};
    for (const [key, value] of Object.entries(raw)) {
      if (/^[a-z-]{1,32}$/.test(key) && (value === 1 || value === 2)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** The look a section opens in. `fallback` is the registry's default for it (2 only once flipped). */
export function resolveUi(section: string, query: Ui | null, remembered: Remembered, fallback: Ui): Ui {
  return query ?? remembered[section] ?? fallback;
}

/** The remembered choices after this section's choice is written. */
export function remember(remembered: Remembered, section: string, ui: Ui): Remembered {
  return { ...remembered, [section]: ui };
}
