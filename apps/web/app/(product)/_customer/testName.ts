// The owner's own test customer (the private test line while setting up, ALY-168) is named
// "<name> (test)" by the API. A customer page in Arabic says «(تجريبي)» for it, so the owner's
// try-out never shows English on an Arabic page. Any other name is shown as it is.

export function customerName(name: string, lang: "en" | "ar"): string {
  return lang === "ar" ? name.replace(/\s*\(test\)\s*$/, " (تجريبي)") : name;
}
