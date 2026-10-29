// The language a person reads the workspace in, kept on this device. Sign-in (/login) and the
// workspace (/app) share it, so a person who signs in in Arabic lands in Arabic. A choice made
// at sign-up (/start keeps its own key) counts until the workspace has one of its own.

export type Lang = "en" | "ar";

export const WORKSPACE_LANG = "alyr-workspace-lang";
const SIGNUP_LANG = "alyr-lang";

/** The language chosen before on this device, or null when none was (or storage is blocked). */
export function savedLang(): Lang | null {
  try {
    for (const key of [WORKSPACE_LANG, SIGNUP_LANG]) {
      const value = localStorage.getItem(key);
      if (value === "ar" || value === "en") return value;
    }
  } catch {
    // A browser that refuses storage remembers nothing.
  }
  return null;
}

/** Keeps a choice for the next visit; a browser that refuses storage simply forgets it. */
export function keepLang(lang: Lang): void {
  try { localStorage.setItem(WORKSPACE_LANG, lang); } catch { /* not remembered */ }
}
