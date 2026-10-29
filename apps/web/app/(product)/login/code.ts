// A sign-in code as typed. A phone set to Arabic offers Arabic-Indic digits (٠١٢…) or, set to
// Persian or Urdu, the extended ones (۰۱۲…); the API compares ASCII digits, so they are turned
// into 0 to 9 here, and anything else (spaces, a dash pasted from the email) is dropped.

const EASTERN = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED = "۰۱۲۳۴۵۶۷۸۹";

export function codeDigits(typed: string): string {
  return typed
    .replace(/[٠-٩]/g, (d) => String(EASTERN.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXTENDED.indexOf(d)))
    .replace(/\D/g, "");
}
