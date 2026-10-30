// The back office works on Qatar's clock (ALY-274, CJ-27): the date a payment is recorded on
// defaults to the day it is in Doha, not the UTC day, which at 02:40 in Doha is still yesterday.
// Plain TypeScript with no React, so `qatarDay.test.mjs` runs it under Node.

/** The date in Doha (YYYY-MM-DD) at an instant; now when none is given. */
export function qatarDay(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
