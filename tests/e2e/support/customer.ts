import { expect, type Page } from "@playwright/test";
// The order page's own words, so a rewording does not break a journey. Plain data, no imports
// that run (the one it has is a type).
import { T as ORDER } from "../../../apps/web/app/(product)/_customer/order/copy.ts";

// What a customer does on the two pages a shop's WhatsApp reply opens. One place, because the
// sign-up's test line, the order journey and the booking journey all do exactly this.

/**
 * The booking page's words, as app/(product)/b/[slug]/page.tsx writes them (it keeps them inline,
 * so they cannot be imported). The page is in the language the customer wrote to the shop in.
 */
export const BOOKING = {
  en: { service: "Choose a service", day: "Choose a day", time: "Choose a time", confirm: "Confirm booking", confirmed: /^Booking \d+ confirmed$/ },
  ar: { service: "اختر الخدمة", day: "اختر اليوم", time: "اختر الوقت", confirm: "تأكيد الحجز", confirmed: /^تم تأكيد الحجز رقم \d+$/ },
} as const;

/** Opens the order page from its link, puts `item` in the basket and places the order. Returns the order's number. */
export async function placeOrder(page: Page, path: string, item: string): Promise<number> {
  const t = ORDER.en;
  await page.goto(path);
  await page.getByRole("button", { name: t.addNamed(item), exact: true }).click();
  await page.getByRole("button", { name: t.review }).click();
  await page.getByRole("button", { name: t.placeOrder }).click();
  const received = page.getByRole("heading", { name: /^Order #\d+ received$/ });
  await expect(received, "the order page confirms the order").toBeVisible();
  return Number((await received.innerText()).match(/#(\d+)/)![1]);
}

/**
 * Opens the booking page from its link and books the first service, on the second day offered
 * (tomorrow, so there is always a free slot whatever the time), at the first time offered.
 * Returns what the page says it booked.
 */
export async function placeBooking(page: Page, path: string, lang: "en" | "ar" = "en"): Promise<{ number: number; service: string }> {
  const t = BOOKING[lang];
  await page.goto(path);
  const services = page.getByRole("radiogroup", { name: t.service }).getByRole("radio");
  const service = (await services.first().innerText()).split("\n")[0].trim();
  await services.first().click();
  await page.getByRole("radiogroup", { name: t.day }).getByRole("radio").nth(1).click();
  await page.getByRole("radiogroup", { name: t.time }).getByRole("radio").first().click();
  await page.getByRole("button", { name: t.confirm }).click();
  const confirmed = page.getByRole("heading", { name: t.confirmed });
  await expect(confirmed, "the booking page confirms the booking").toBeVisible();
  return { number: Number((await confirmed.innerText()).match(/\d+/)![0]), service };
}
