// Small pure helpers for the onboarding screens, so what an Arabic screen says can be tested
// without a browser: an area's name and the test booking as a sentence reads it.

import type { Lang } from "./copy";

/** An area as the screen shows it. What is stored (and sent) is always the English name. */
export function areaName(names: Record<string, string>, area: string, lang: Lang): string {
  return lang === "ar" ? names[area] ?? area : area;
}

type BookingText = { service: string; service_ar?: string; when_text: string; starts_at?: string };

/** The test booking in the screen's language: "Haircut, Sat 31 Oct, 10:00 AM" or its Arabic. Digits
 * stay 0 to 9 in Arabic, as everywhere in the product; the time is the shop's own (Qatar). */
export function bookingWhat(booking: BookingText, lang: Lang): string {
  if (lang !== "ar") return `${booking.service}, ${booking.when_text}`;
  const service = booking.service_ar || booking.service;
  const at = booking.starts_at ? new Date(booking.starts_at) : null;
  if (!at || Number.isNaN(at.getTime())) return `${service}، ${booking.when_text}`;
  const when = new Intl.DateTimeFormat("ar-QA-u-nu-latn", {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Qatar",
  }).format(at);
  return `${service}، ${when}`;
}
