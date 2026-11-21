import test from "node:test";
import assert from "node:assert/strict";
import {
  answerMinutes, byName, filterMembers, firstName, invitableRoles, isEmptyReport, isIdle, namesWithRole, normalise, outcomeParts,
  ownRow, removeImpact, removeRefusal, roleChangeRefusal, roleCounts, validInvite,
} from "./logic.ts";
import { FIXTURE_AGENT, FIXTURE_MEMBERS, FIXTURE_OWNER, agentReport, emptyReport, fixtureReport } from "./fixtures.ts";

const members = FIXTURE_MEMBERS;
const by = (id) => members.find((m) => m.id === id);

test("people are listed A to Z by name, never by a number", () => {
  assert.deepEqual(byName(members).map((m) => m.name), ["Bilal", "Hana", "Maha", "Omar", "Reem", "Salma", "Yusuf"]);
  const raw = fixtureReport(7);
  const shuffled = { ...raw, people: [...raw.people].reverse() };
  assert.deepEqual(normalise(shuffled).rows.map((r) => r.name), ["Bilal", "Hana", "Maha", "Omar", "Reem", "Salma", "Yusuf"]);
  // The sort does not look at sales or replies: the busiest person is not first.
  assert.notEqual(normalise(raw).rows[0].name, "Salma");
});

test("filters: search by name or email, chips by role, always A to Z", () => {
  assert.deepEqual(filterMembers(members, "", "managers").map((m) => m.name), ["Hana", "Omar"]);
  assert.deepEqual(filterMembers(members, "", "agents").map((m) => m.name), ["Bilal", "Maha", "Reem", "Salma", "Yusuf"]);
  assert.deepEqual(filterMembers(members, "  SAL ", "all").map((m) => m.name), ["Salma"]);
  assert.deepEqual(filterMembers(members, "nuqta.qa", "all").length, 7);
  assert.deepEqual(filterMembers(members, "nobody", "all"), []);
  assert.deepEqual(roleCounts(members), { all: 7, owner: 1, admin: 1, agent: 5, managers: 2 });
  assert.deepEqual(namesWithRole(members, "agent"), ["Bilal", "Maha", "Reem", "Salma", "Yusuf"]);
  assert.equal(firstName("Salma Al Noor"), "Salma");
});

test("role changes follow the server: only an owner touches an owner, a business keeps one", () => {
  const owner = FIXTURE_OWNER;
  const admin = { id: "omar", role: "admin" };
  assert.equal(roleChangeRefusal(owner, members, by("bilal"), "admin"), null);
  assert.equal(roleChangeRefusal(owner, members, by("bilal"), "owner"), null);
  assert.equal(roleChangeRefusal(admin, members, by("bilal"), "owner"), "owner_only");
  assert.equal(roleChangeRefusal(admin, members, by("hana"), "admin"), "owner_only");
  assert.equal(roleChangeRefusal(owner, members, by("hana"), "admin"), "last_owner");
  assert.equal(roleChangeRefusal(FIXTURE_AGENT, members, by("bilal"), "admin"), "not_manager");
  // Another owner makes the first one free to step down.
  const two = members.map((m) => (m.id === "omar" ? { ...m, role: "owner" } : m));
  assert.equal(roleChangeRefusal(owner, two, by("hana"), "admin"), null);
  // The same role is not a change.
  assert.equal(roleChangeRefusal(admin, members, by("hana"), "owner"), null);
});

test("removing: not yourself, not the last owner, not an owner unless you are one, not as an agent", () => {
  const admin = { id: "omar", role: "admin" };
  assert.equal(removeRefusal(FIXTURE_OWNER, members, by("yusuf")), null);
  assert.equal(removeRefusal(FIXTURE_OWNER, members, by("hana")), "yourself");
  assert.equal(removeRefusal(admin, members, by("hana")), "owner_only");
  assert.equal(removeRefusal({ id: "x", role: "owner" }, members, by("hana")), "last_owner");
  assert.equal(removeRefusal(FIXTURE_AGENT, members, by("yusuf")), "not_manager");
});

test("an admin cannot invite an owner, an agent cannot invite anyone", () => {
  assert.deepEqual(invitableRoles({ id: "a", role: "owner" }), ["agent", "admin", "owner"]);
  assert.deepEqual(invitableRoles({ id: "a", role: "admin" }), ["agent", "admin"]);
  assert.deepEqual(invitableRoles(FIXTURE_AGENT), []);
  assert.deepEqual(validInvite("  ", "maha@nuqta.qa"), { name: false, email: true });
  assert.deepEqual(validInvite("Maha", "maha@"), { name: true, email: false });
});

test("the report reads what the API sends: everyone and nobody-yet add up", () => {
  const report = normalise(fixtureReport(7));
  assert.equal(report.days, 7);
  assert.equal(report.everyone, true);
  assert.equal(report.all.closedTotal, 117);
  assert.deepEqual({ ...report.all.closed }, { sold: 36, booked: 47, answered: 29, lost: 5, unsaid: 0 });
  assert.equal(report.all.orders, 52);
  assert.equal(report.all.sales, 2148000);
  assert.equal(report.all.waiting, 3);
  assert.equal(report.all.oldestWait, 12);
  assert.equal(report.all.replies, 320);
  assert.equal(report.nobody.orders, 3);
  assert.equal(report.nobody.sales, 291200);
  assert.equal(report.rows.reduce((n, r) => n + r.orders, 0) + report.nobody.orders, report.all.orders);
  assert.equal(report.rows.reduce((n, r) => n + r.sales, 0) + report.nobody.sales, report.all.sales);
});

test("a person with nothing counted is idle, and a new shop has no numbers", () => {
  const report = normalise(fixtureReport(7));
  assert.equal(isIdle(report.rows.find((r) => r.name === "Maha")), true);
  assert.equal(isIdle(report.rows.find((r) => r.name === "Salma")), false);
  assert.equal(isEmptyReport(report), false);
  assert.equal(isEmptyReport(normalise(emptyReport(7))), true);
});

test("an agent's report holds their own row, and ownRow finds it", () => {
  const report = normalise(agentReport(7, FIXTURE_AGENT));
  assert.equal(report.everyone, false);
  assert.deepEqual(report.rows.map((r) => r.name), ["Salma"]);
  assert.equal(ownRow(report, FIXTURE_AGENT).orders, 14);
  assert.equal(ownRow(report, { id: "nobody-here", role: "agent" }), null);
});

test("first answer is read in whole minutes; the bar parts keep the four outcomes in order", () => {
  assert.equal(answerMinutes(null), null);
  assert.equal(answerMinutes(40), 1);
  assert.equal(answerMinutes(29), 0);
  assert.equal(answerMinutes(180), 3);
  assert.deepEqual(outcomeParts({ sold: 6, booked: 9, answered: 5, lost: 1, unsaid: 2 }), [
    { value: 6, tone: "ink" }, { value: 9, tone: "strong" }, { value: 5, tone: "ctl" }, { value: 1, tone: "bad" },
  ]);
});

test("what removing a person changes comes from their own row of the report", () => {
  const report = normalise(fixtureReport(7));
  assert.deepEqual(removeImpact(report, "yusuf"), { conversations: 2, orders: 7 });
  assert.equal(removeImpact(report, "unknown"), null);
  assert.equal(removeImpact(null, "yusuf"), null);
});

test("other periods are read from the same shape", () => {
  assert.equal(normalise(fixtureReport(1)).days, 1);
  assert.equal(normalise(fixtureReport(30)).days, 30);
  assert.ok(normalise(fixtureReport(30)).all.closedTotal > normalise(fixtureReport(7)).all.closedTotal);
});
