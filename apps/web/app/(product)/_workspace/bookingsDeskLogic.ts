// The desk's types and small functions (ALY-259, D-142, spec 043): what the day view reads of a
// booking, the end of a visit, and the sentence that says what became of the message to the
// customer when staff move or cancel a booking or write one down. No React, so
// `bookingsDesk.test.mjs` runs it under Node. Words come from `bookingsCopy.ts`.

import type { BookingsCopy, Lang } from "./bookingsCopy";
import { parseQar } from "./bookingsServiceForm.ts";

export type Period = { weekday: number; opens: string; closes: string };
export type Person = { id: string; name: string; name_ar: string };
export type Resource = Person & {
  kind: "person" | "place"; active: boolean; services: string[]; hours: Period[]; today: Period[];
  off: boolean; leave: { reason: string; reason_ar: string } | null;
};
export type Service = { id: string; name: string; name_ar: string; duration_minutes: number };
export type DayBooking = {
  id: string; number: number; service: string; service_ar: string; starts_at: string;
  starts_local: string; ends_local: string; day: string; status: string; note: string;
  customer: string; walk_in: boolean; resource: Person | null;
  deposit: number; deposit_state: string; hold_until: string | null; price: number;
  /** How a paid deposit came: "link" (a pay link) or "transfer" (staff wrote it down, D-191). */
  deposit_method: string;
  paid: number; left_to_pay: number;
  /** The customer's phone and where their consent to be messaged stands. */
  phone: string | null; consent: string;
};
/** What the API says of the message to the customer: taken by the outbound layer or not, and why. */
export type Told = { sent: boolean; reason: string | null; phone: string | null };

export function resourceName(r: { name: string; name_ar: string } | null, lang: Lang): string {
  if (!r) return "";
  return lang === "ar" && r.name_ar ? r.name_ar : r.name;
}

/** The amount staff typed for a deposit received by transfer, as dirhams: at least QAR 1 and, for
 * a service with a price, no more than the price. The API checks it again (D-191). */
export function checkReceived(text: string, price: number): { error: "bad_received" } | { amount: number } {
  const amount = parseQar(text);
  if (amount === null || amount < 100 || (price > 0 && amount > price)) return { error: "bad_received" };
  return { amount };
}

/** Whether staff may write a deposit down on this booking: it is still to come and no deposit has
 * been dealt with yet (none, or a link still waiting). */
export function canWriteDeposit(b: { status: string; deposit_state: string }): boolean {
  return b.status === "booked" && (b.deposit_state === "none" || b.deposit_state === "due");
}

/** The time on the shop's clock, 24-hour: "14:30". */
export function clock(iso: string, zone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(iso));
}

/** A clock time and some minutes later, on the same clock: "16:15" and 45 is "17:00". */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Why a customer cannot be messaged, from where their consent stands: the same reasons the
 * outbound layer gives (`no_consent`, `opted_out`). */
export function reasonFor(consent: string): string {
  return consent === "revoked" ? "opted_out" : "no_consent";
}

/** What staff read after an action that messages the customer: the action's own sentence, then
 * whether the customer is told. Nothing about it for a walk-in (`told` is null). */
export function answerFor(done: string, told: Told | null | undefined, t: BookingsCopy): string {
  if (!told) return done;
  if (told.sent) return `${done} ${t.toldSent}`;
  return `${done} ${t.notTold(t.whyNot[told.reason ?? ""] ?? t.whyNot.other, told.phone ?? "")}`;
}

/** The warning before the action, for a customer who cannot be messaged: nothing, or the sentence. */
export function warningFor(consent: string, phone: string | null, t: BookingsCopy): string {
  if (consent === "granted") return "";
  return t.willNotTell(t.whyNot[reasonFor(consent)], phone ?? "");
}
