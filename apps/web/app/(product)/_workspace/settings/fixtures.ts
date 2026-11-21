// Sample data for the preview route only: the made-up business Nuqta Car Care and its owner. Every
// field here is one `GET /api/account` really returns (core/account.py); the close dialog's
// `impact` stands for counts the host reads from Bookings and Credit when it wires the section.
// Nothing here is shown as real: the preview route 404s in production.

import type { AccountData } from "./logic";

export const FIXTURE_ACCOUNT: AccountData = {
  me: { name: "Hana Saeed", email: "hana@nuqta.qa", role: "owner" },
  businesses: [
    { id: "biz-nuqta", name: "Nuqta Car Care", nameAr: "نقطة للعناية بالسيارات", role: "owner", current: true },
    { id: "biz-qirfa", name: "Qirfa Bakery", nameAr: "مخبز قرفة", role: "admin", current: false },
  ],
  canChangeEmail: true,
  canExport: true,
};

/** The same person with the agent role, for the no-permission view. */
export const FIXTURE_AGENT: AccountData = {
  ...FIXTURE_ACCOUNT,
  me: { ...FIXTURE_ACCOUNT.me, role: "agent" },
  businesses: [{ ...FIXTURE_ACCOUNT.businesses[0], role: "agent" }],
  canExport: false,
};

/** The sample clock of the drawings: Thu 12 Nov 2026, 09:40 in Doha. */
export const FIXTURE_NOW = "2026-11-12T09:40:00+03:00";
export const FIXTURE_TODAY = "2026-11-12";

/** What closing would interrupt (31 bookings after the notice ends, 11 customers owing QAR 9,840). */
export const FIXTURE_IMPACT = { bookingsAfter: 31, customersOwing: 11, owed: 9840 };

/** The address typed in step 1 and the code emailed to it, for the preview's second step. */
export const FIXTURE_NEW_EMAIL = "hana.saeed@nuqta.qa";
export const FIXTURE_CODE = "730518";
