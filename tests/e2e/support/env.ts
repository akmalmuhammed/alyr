// Where the stack under test is, and who is in it. The people are the fictional ones the demo
// seed makes (apps/api/src/alyr/seed.py): the .example domain can never receive real email.

/** The web app. It forwards /api and /sim to the API, so the tests only ever talk to this. */
export const WEB = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3100";

export const SEEDED = {
  /** ALYR staff (a member of `platform_admins`): may open the back office. */
  staff: "ops@alyr.example",
  /** The demo shop's owner. Not ALYR staff. */
  owner: "fatima@alnoor.example",
  /** The demo shop: Al Noor Electricals, with orders, bookings and credit accounts switched on. */
  shop: "al-noor",
  shopName: "Al Noor Electricals",
} as const;

/** Where global setup keeps the signed-in sessions it makes, for tests to start from. */
export const AUTH = {
  staff: ".auth/staff.json",
  owner: ".auth/owner.json",
} as const;
