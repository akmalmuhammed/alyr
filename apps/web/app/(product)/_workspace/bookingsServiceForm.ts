// The Bookings services form, as plain functions (ALY-259, D-140, spec 043): a price typed the
// way an owner types it ("150", "12.5", "١٢٫٥") becomes dirhams (100 is QAR 1) and back, a form
// is checked in the page's language before it is sent, and a form becomes the API's request.
// No React, so `bookingsServiceForm.test.mjs` runs it under Node. The API checks everything again.

export type DepositKind = "none" | "fixed" | "percent";

/** What the screen needs of a service from `GET /api/services`. */
export type ServiceRow = {
  id: string; name: string; name_ar: string; duration_minutes: number; price: number;
  active: boolean; deposit_kind: DepositKind; deposit_value: number; deposit: number;
  resource_ids: string[]; upcoming: number;
};

export type ServiceForm = {
  name: string; nameAr: string; minutes: string; price: string;
  depositKind: DepositKind; deposit: string; everyone: boolean; chosen: string[];
};

export type FormError =
  | "bad_name" | "bad_duration" | "bad_price" | "bad_deposit" | "deposit_needs_price" | "bad_who";

export const MIN_MINUTES = 5;
export const MAX_MINUTES = 600;

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED = "۰۱۲۳۴۵۶۷۸۹";

/** Western digits and a plain dot, whatever keyboard typed it. */
export function plain(text: string): string {
  return text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXTENDED.indexOf(d)))
    .replace(/[٫,،]/g, ".");
}

/** An amount in QAR typed by a person, as dirhams; null when it is not an amount. Read from the
 * text, never through a float: "12.55" is 1255. Up to two decimals. */
export function parseQar(text: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(plain(text));
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || 0);
}

/** Dirhams as the owner would type them: 15000 is "150", 1250 is "12.5". */
export function qarText(dirhams: number): string {
  const whole = Math.floor(dirhams / 100);
  const part = dirhams % 100;
  if (part === 0) return String(whole);
  return `${whole}.${String(part).padStart(2, "0").replace(/0$/, "")}`;
}

/** A whole number typed by a person; null when it is not one. */
export function parseWhole(text: string): number | null {
  const match = /^\d{1,6}$/.exec(plain(text));
  return match ? Number(match[0]) : null;
}

export function blankForm(): ServiceForm {
  return {
    name: "", nameAr: "", minutes: "30", price: "", depositKind: "none", deposit: "",
    everyone: true, chosen: [],
  };
}

/** The form for a service as it is now. Only the people and chairs that take bookings can be
 * chosen, so a person who was switched off since is dropped from the choice. */
export function formFromService(s: ServiceRow, activeIds: string[]): ServiceForm {
  const chosen = s.resource_ids.filter((id) => activeIds.includes(id));
  return {
    name: s.name, nameAr: s.name_ar, minutes: String(s.duration_minutes),
    price: s.price ? qarText(s.price) : "",
    depositKind: s.deposit_kind,
    deposit: s.deposit_kind === "fixed" ? qarText(s.deposit_value)
      : s.deposit_kind === "percent" ? String(s.deposit_value) : "",
    everyone: s.resource_ids.length === 0, chosen,
  };
}

export type Checked = { error: FormError } | { error: null; body: Record<string, unknown> };

/** Check a form and build the request. `hasPeople` says whether the shop lists people or
 * chairs; if not, "who does it" is not asked and not sent. */
export function checkForm(form: ServiceForm, hasPeople: boolean): Checked {
  if (!form.name.trim()) return { error: "bad_name" };
  const minutes = parseWhole(form.minutes);
  if (minutes === null || minutes < MIN_MINUTES || minutes > MAX_MINUTES) return { error: "bad_duration" };
  const price = form.price.trim() === "" ? 0 : parseQar(form.price);
  if (price === null) return { error: "bad_price" };
  let depositValue = 0;
  if (form.depositKind === "fixed") {
    const amount = parseQar(form.deposit);
    if (amount === null || amount < 100 || (price > 0 && amount > price)) return { error: "bad_deposit" };
    depositValue = amount;
  } else if (form.depositKind === "percent") {
    const share = parseWhole(form.deposit);
    if (share === null || share < 1 || share > 100) return { error: "bad_deposit" };
    if (price === 0) return { error: "deposit_needs_price" };
    depositValue = share;
  }
  if (hasPeople && !form.everyone && form.chosen.length === 0) return { error: "bad_who" };
  const body: Record<string, unknown> = {
    name: form.name.trim(), name_ar: form.nameAr.trim(), duration_minutes: minutes, price,
    deposit_kind: form.depositKind, deposit_value: depositValue,
  };
  if (hasPeople) body.resource_ids = form.everyone ? [] : form.chosen;
  return { error: null, body };
}
