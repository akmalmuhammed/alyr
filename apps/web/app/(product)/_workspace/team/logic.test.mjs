import test from "node:test";
import assert from "node:assert/strict";
import {
  getInitials,
  formatDuration,
  filterMembers,
  computeTeamStats,
  calculateOutcomeParts,
} from "./logic.ts";

test("getInitials formats name properly", () => {
  assert.equal(getInitials("Salma"), "SA");
  assert.equal(getInitials("Fatima Al-Noor"), "FA");
  assert.equal(getInitials("Omar"), "OM");
  assert.equal(getInitials(""), "");
});

test("formatDuration formats seconds in English and Arabic", () => {
  assert.equal(formatDuration(45, "en"), "under a minute");
  assert.equal(formatDuration(120, "en"), "2 min");
  assert.equal(formatDuration(3600, "en"), "1 h");
  assert.equal(formatDuration(3900, "en"), "1 h 5 min");

  assert.equal(formatDuration(45, "ar"), "أقل من دقيقة");
  assert.equal(formatDuration(120, "ar"), "2 د");
  assert.equal(formatDuration(3600, "ar"), "1 س");
  assert.equal(formatDuration(3900, "ar"), "1 س 5 د");
});

test("filterMembers handles search and chips with alphabetical sorting", () => {
  const members = [
    {
      id: "1",
      name: "Salma",
      email: "salma@nuqta.qa",
      role: "agent",
      phone: { lastDigits: "0131", since: "7 Nov" },
      lastSeen: { label: "Active now", sub: "Chrome", tone: "volt" },
    },
    {
      id: "2",
      name: "Bilal",
      email: "bilal@nuqta.qa",
      role: "agent",
      phone: { lastDigits: "0124", since: "3 Mar" },
      lastSeen: { label: "Active now", sub: "Chrome", tone: "volt" },
    },
    {
      id: "3",
      name: "Hana",
      email: "hana@nuqta.qa",
      role: "owner",
      isYou: true,
      phone: { lastDigits: "0101", since: "2 Mar" },
      lastSeen: { label: "Active now", sub: "This device", tone: "volt" },
    },
    {
      id: "4",
      name: "Maha",
      email: "maha@nuqta.qa",
      role: "agent",
      notSignedInYet: true,
      phone: null,
      lastSeen: { label: "Not signed in yet", sub: "Invited Tue", tone: "warn" },
    },
  ];

  // All sorted A-Z
  const all = filterMembers(members, "", "all");
  assert.deepEqual(
    all.map((m) => m.name),
    ["Bilal", "Hana", "Maha", "Salma"]
  );

  // Search by query
  const searched = filterMembers(members, "nuqta", "all");
  assert.equal(searched.length, 4);

  const searchedMaha = filterMembers(members, "maha", "all");
  assert.equal(searchedMaha.length, 1);
  assert.equal(searchedMaha[0].name, "Maha");

  // Owners and admins chip
  const ownersAdmins = filterMembers(members, "", "owners_admins");
  assert.equal(ownersAdmins.length, 1);
  assert.equal(ownersAdmins[0].name, "Hana");

  // Phone not linked
  const noPhone = filterMembers(members, "", "phone_not_linked");
  assert.equal(noPhone.length, 1);
  assert.equal(noPhone[0].name, "Maha");

  // Not signed in
  const notSigned = filterMembers(members, "", "not_signed_in");
  assert.equal(notSigned.length, 1);
  assert.equal(notSigned[0].name, "Maha");
});

test("computeTeamStats counts accurately", () => {
  const members = [
    {
      id: "1",
      name: "A",
      email: "a@test.com",
      role: "agent",
      lastSeen: { label: "Active", sub: "", tone: "volt" },
      phone: { lastDigits: "1", since: "" },
    },
    {
      id: "2",
      name: "B",
      email: "b@test.com",
      role: "agent",
      notSignedInYet: true,
      lastSeen: { label: "Invited", sub: "", tone: "warn" },
      phone: null,
    },
  ];

  const stats = computeTeamStats(members);
  assert.equal(stats.total, 2);
  assert.equal(stats.signedIn, 1);
  assert.equal(stats.invited, 1);
  assert.equal(stats.activeNow, 1);
  assert.equal(stats.phoneLinked, 1);
});

test("calculateOutcomeParts computes relative proportions", () => {
  const outcomes = { sold: 6, booked: 9, answered: 5, lost: 1 };
  const parts = calculateOutcomeParts(outcomes);
  assert.equal(parts.length, 4);
  const sum = parts.reduce((acc, p) => acc + p.flex, 0);
  assert.ok(Math.abs(sum - 1.0) < 0.001);
});
