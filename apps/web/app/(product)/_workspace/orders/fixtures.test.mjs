import test from "node:test";
import assert from "node:assert/strict";
import { FIXTURE_NOW, FIXTURE_ORDERS, FIXTURE_TEAM, countsOf, detailOf, filterOrders, lateNewOf, listOf } from "./fixtures.ts";
import { ApiError, createFixtureApi } from "./ordersApi.ts";

const byNumber = (n) => FIXTURE_ORDERS.find((o) => o.number === n);
const open = FIXTURE_ORDERS.filter((o) => o.number >= 1029);

test("the 14 open orders are the drawing's table, with totals that add up", () => {
  assert.equal(open.length, 14);
  assert.deepEqual(
    open.map((o) => [o.number, o.total]),
    [[1042, 11000], [1041, 7200], [1040, 273000], [1039, 18500], [1038, 25000], [1037, 9000], [1036, 9000], [1035, 23200], [1034, 6000], [1033, 26500], [1032, 11000], [1031, 36000], [1030, 17500], [1029, 12000]],
  );
  for (const o of FIXTURE_ORDERS) {
    const lines = o.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    assert.equal(o.total, lines - (o.discount_total ?? 0) + (o.fulfilment?.fee ?? 0), `#${o.number}: lines, discount and fee make the total`);
  }
});

test("the sample is the fictional Nuqta Car Care: no retired family name, no other business", () => {
  const text = JSON.stringify(FIXTURE_ORDERS) + JSON.stringify(FIXTURE_TEAM);
  assert.ok(!/Kuwari|Pearl|Switch|Socket|Cable|Auto Fast|Clinic/i.test(text));
  assert.deepEqual(FIXTURE_TEAM.map((m) => m.name), [...FIXTURE_TEAM.map((m) => m.name)].sort(), "the team is alphabetical");
});

test("counts: open 14, new 3, confirmed 6, ready 5, done 212, cancelled 4, all 230, pickup 9, delivery 5", () => {
  assert.deepEqual(countsOf(FIXTURE_ORDERS), { all: 230, open: 14, new: 3, confirmed: 6, ready: 5, done: 212, cancelled: 4, pickup: 9, delivery: 5 });
  assert.deepEqual(countsOf([{ ...byNumber(1042), test: true }, byNumber(1041)]).all, 1, "a test order is listed but not counted");
});

test("late orders: new for more than 15 minutes, oldest first, with their real minutes", () => {
  assert.deepEqual(lateNewOf(FIXTURE_ORDERS, FIXTURE_NOW), { count: 2, items: [{ number: 1040, minutes: 22 }, { number: 1041, minutes: 18 }] });
});

test("filters: tabs, payment, hand-over, person, search by name, phone, number with a hash, item, Arabic name", () => {
  const nums = (filters) => filterOrders(FIXTURE_ORDERS, filters).map((o) => o.number);
  assert.equal(nums({}).length, 14);
  assert.deepEqual(nums({ status: "new" }), [1042, 1041, 1040]);
  assert.equal(nums({ status: "done" }).length, 212);
  assert.equal(nums({ status: "cancelled" }).length, 4);
  assert.equal(nums({ status: "all" }).length, 230);
  assert.deepEqual(nums({ show: "unpaid" }), [1042, 1041, 1037, 1032]);
  assert.deepEqual(nums({ show: "unconfirmed" }), [1042, 1041, 1040]);
  assert.equal(nums({ show: "ready" }).length, 5);
  assert.deepEqual(nums({ mode: "delivery", payment: "paid", assigned: "u-yusuf" }), [], "the empty-state sentence's filters match nothing");
  assert.deepEqual(nums({ assigned: "none" }), [1042, 1041, 1040]);
  assert.deepEqual(nums({ q: "#1039" }), [1039]);
  assert.deepEqual(nums({ q: "yousef" }), [1039]);
  assert.deepEqual(nums({ q: "55550123" }), [1041]);
  assert.deepEqual(nums({ q: "fleet" }), [1040]);
  assert.deepEqual(nums({ q: "شمع" }), [1042, 1039, 1036, 1032, 1030].filter((n) => nums({ status: "open" }).includes(n)));
  assert.deepEqual(nums({ sort: "oldest" }).slice(0, 2), [1029, 1030]);
});

test("the list: a page is 50, the total is the match, an agent never receives the open total", () => {
  const owner = listOf(FIXTURE_ORDERS, { status: "done" }, "owner");
  assert.equal(owner.orders.length, 50);
  assert.equal(owner.total, 212);
  assert.equal(listOf(FIXTURE_ORDERS, { status: "done", offset: 200 }, "owner").orders.length, 12);
  assert.equal(owner.open_total, 484900);
  const agent = listOf(FIXTURE_ORDERS, {}, "agent");
  assert.ok(!("open_total" in agent) && !JSON.stringify(agent).includes("open_total"));
  assert.equal(agent.access.can_cancel, false);
  assert.equal(agent.now, new Date(FIXTURE_NOW).toISOString());
});

test("one order in full: timeline oldest first, the receipt for managers only, the window from when the customer wrote", () => {
  const d = detailOf(byNumber(1039), "owner");
  assert.deepEqual(d.activity.map((a) => a.action), ["placed", "took", "confirmed", "paid"]);
  assert.equal(d.document.number, "RC-0004");
  assert.equal(d.customer.window_until, "2026-11-13T09:10:00+03:00");
  assert.equal(d.payment.reference, "PL-2026-110391");
  assert.equal(d.lines[0].code, "WAX-500");
  assert.ok(d.track_url.length > 0);
  const agent = detailOf(byNumber(1039), "agent");
  assert.equal(agent.document, undefined);
  assert.equal(agent.order.document, undefined);
  assert.equal(agent.access.can_cancel, false);
});

test("the sample API takes the server's rules: one step at a time, never backwards, no payment twice, a cancelled order stays cancelled", async () => {
  const api = createFixtureApi();
  const refused = async (promise) => { try { await promise; } catch (e) { return e; } return null; };

  assert.deepEqual(await api.setStatus("ord-1042", "confirmed"), { status: "confirmed" });
  const back = await refused(api.setStatus("ord-1042", "new"));
  assert.ok(back instanceof ApiError && back.status === 422 && back.code === "backwards");
  assert.equal((await api.detail("ord-1042", "owner")).order.status, "confirmed", "a refused step changes nothing");

  const first = await api.markPaid("ord-1032", { method: "cash", reference: "" }, "key-1");
  assert.equal(first.payment.amount_minor, 11000);
  assert.equal(first.replayed, false);
  assert.equal((await api.markPaid("ord-1032", { method: "cash", reference: "" }, "key-1")).replayed, true, "the same key records one payment");
  const twice = await refused(api.markPaid("ord-1032", { method: "cash", reference: "" }, "key-2"));
  assert.ok(twice instanceof ApiError && twice.status === 409 && twice.code === "already_paid");
  const account = await refused(api.markPaid("ord-1040", { method: "cash", reference: "" }, "key-3"));
  assert.equal(account.code, "order_on_account");

  const cancelled = await api.setStatus("ord-1039", "cancelled", true);
  assert.deepEqual(cancelled, { status: "cancelled", stock_returned: 4, refund_due: true });
  const onAccount = await api.setStatus("ord-1040", "cancelled");
  assert.equal(onAccount.refund_due, false);
  assert.ok(onAccount.credit_reversed_text);
  const moved = await refused(api.setStatus("ord-1039", "ready"));
  assert.equal(moved.code, "cancelled");
  const gone = await refused(api.markPaid("ord-1039", { method: "cash", reference: "" }, "key-4"));
  assert.equal(gone.code, "order_cancelled");

  assert.equal(await api.detail("ord-9999", "owner"), null);
  await api.assign("ord-1041", "u-reem");
  assert.equal((await api.detail("ord-1041", "owner")).order.assigned.name, "Reem");
  await api.assign("ord-1041", null);
  assert.equal((await api.detail("ord-1041", "owner")).order.assigned, null);
  assert.deepEqual(await api.margins("agent"), {}, "an agent is never given a margin");
  assert.ok((await api.margins("owner"))["ord-1039"].amount > 0);
});
