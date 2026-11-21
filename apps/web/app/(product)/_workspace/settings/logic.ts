// Pure logic for Settings (Your account, Data and privacy). No React, no DOM, no network, and
// erasable TypeScript with relative imports only, so `node --test` runs it (logic.test.mjs).

export type Lang = "en" | "ar";
export type Role = "owner" | "admin" | "agent";
export type ThemeChoice = "light" | "dark" | "auto";

/** One business the person works for, as `GET /api/account` lists it (core/account.py). */
export interface Business {
  id: string;
  name: string;
  nameAr: string;
  role: Role;
  /** The one open now. */
  current: boolean;
}

/** What `GET /api/account` answers (routes/account.py). Nothing else about the person is known. */
export interface AccountData {
  me: { name: string; email: string; role: Role };
  businesses: Business[];
  canChangeEmail: boolean;
  canExport: boolean;
}

// ── the two rules a closed account runs on ────────────────

/** Days of notice before a cancellation takes effect (core/subscription.py NOTICE_DAYS, D-082). */
export const NOTICE_DAYS = 7;
/** Days after that before the business's data is erased (core/erase.py, D-116, spec 042). */
export const ERASE_AFTER_DAYS = 60;

/** The days a cancellation asked for on `todayIso` (a date, "2026-11-12") runs on. */
export function closeSchedule(
  todayIso: string,
  noticeDays: number = NOTICE_DAYS,
  eraseAfterDays: number = ERASE_AFTER_DAYS,
): { noticeEnds: string; eraseOn: string } {
  const start = Date.parse(`${todayIso.slice(0, 10)}T00:00:00Z`);
  const day = 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const noticeEnds = start + noticeDays * day;
  return { noticeEnds: iso(noticeEnds), eraseOn: iso(noticeEnds + eraseAfterDays * day) };
}

// ── who may do what (the server enforces it; the screen only hides what it would refuse) ─────

/** The whole business's data as one ZIP: owners only (routes/account.py). */
export function mayDownload(role: Role, canExport: boolean): boolean {
  return role === "owner" && canExport;
}

/** Closing the account is an owner's act. */
export function mayClose(role: Role): boolean {
  return role === "owner";
}

// ── the email and its code ────────────────────────────────

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 200) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** The same address, ignoring case and spaces: changing to it is refused by the server. */
export function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const EASTERN = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED = "۰۱۲۳۴۵۶۷۸۹";

/** Digits only, Western, at most six: what is typed or pasted into a code box, Eastern digits included. */
export function normalizeCode(text: string): string {
  let out = "";
  for (const ch of String(text ?? "")) {
    const east = EASTERN.indexOf(ch);
    const ext = EXTENDED.indexOf(ch);
    if (east >= 0) out += String(east);
    else if (ext >= 0) out += String(ext);
    else if (ch >= "0" && ch <= "9") out += ch;
  }
  return out.slice(0, 6);
}

export function isValidVerificationCode(code: string): boolean {
  if (!code || typeof code !== "string") return false;
  return /^\d{6}$/.test(code.replace(/\s+/g, ""));
}

/** Six cells for the code boxes: a digit, or a space where nothing is typed yet. */
export function formatCodeDigits(code: string): string[] {
  const digits = code.replace(/\D/g, "").slice(0, 6).split("");
  while (digits.length < 6) digits.push(" ");
  return digits;
}

/** The refusals the account routes give (routes/account.py `_refused`), by their `code`. */
export type Refusal = "demo" | "invalid" | "same" | "staff" | "too_many" | "code" | "taken";
export const REFUSALS: readonly Refusal[] = ["demo", "invalid", "same", "staff", "too_many", "code", "taken"];

/** Which words an error gets: the refusal's own, "offline" when nothing answered, else "failed". */
export function refusalKey(error: unknown): Refusal | "offline" | "failed" {
  const e = error as { status?: unknown; code?: unknown } | null;
  if (!e || typeof e !== "object") return "failed";
  if (e.status === 0 || e.code === "offline") return "offline";
  return typeof e.code === "string" && (REFUSALS as readonly string[]).includes(e.code) ? (e.code as Refusal) : "failed";
}

// ── how the workspace looks, kept on this device ──────────

/** localStorage key the layout's head script reads (the site's switch uses it too). */
export const THEME_KEY = "alyr-theme";

export function resolveEffectiveTheme(choice: ThemeChoice, systemPrefersDark: boolean): "light" | "dark" {
  if (choice === "light") return "light";
  if (choice === "dark") return "dark";
  return systemPrefersDark ? "dark" : "light";
}

/** What `data-theme` on <html> becomes: "light", "dark", or null to follow the device. */
export function themeAttribute(choice: ThemeChoice): "light" | "dark" | null {
  return choice === "auto" ? null : choice;
}

/** The choice the stored value stands for: nothing stored is "as the device". */
export function themeFromStored(value: string | null | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "auto";
}
