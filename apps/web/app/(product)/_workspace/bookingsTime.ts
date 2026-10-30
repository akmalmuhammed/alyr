// Times for the Bookings day view (ALY-27, D-084): a time typed on the shop's clock as an
// instant, the shop's own today and now, and the day before or after. Plain TypeScript with no
// React, so `bookingsTime.test.mjs` runs it under Node.

/** A wall-clock time on a day in the shop's zone, as an instant. */
export function zonedIso(day: string, time: string, zone: string): string {
  const guess = new Date(`${day}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(guess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess.getTime() - (shown - guess.getTime())).toISOString();
}

/** Today's date and the time now in the shop's zone, the time rounded up to 5 minutes. */
export function nowIn(zone: string): { day: string; time: string } {
  // One reading of the clock: two could fall either side of a five-minute mark (xx:39, not xx:40).
  const now = Date.now();
  const at = new Date(now + 5 * 60_000 - (now % (5 * 60_000)));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function shift(day: string, days: number): string {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
