import test from "node:test";
import assert from "node:assert/strict";
import { fixtureSource } from "./fixtureSource.ts";
import { explain, isOffline } from "./explain.ts";
import { ApiError } from "../../../_ui/api.ts";
import { FIXTURE_AGENT, FIXTURE_OWNER } from "./fixtures.ts";

// The preview must send nothing anywhere: any network call fails the test.
const realFetch = globalThis.fetch;
test.before(() => {
  globalThis.fetch = () => { throw new Error("the preview sent a network request"); };
});
test.after(() => {
  globalThis.fetch = realFetch;
});

const refusalOf = async (promise) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
};

test("invite and remove change the in-memory list only, and touch no network", async () => {
  const { source, list } = fixtureSource({ me: FIXTURE_OWNER });
  await source.invite({ name: "Faisal", email: "Faisal@nuqta.qa", role: "agent" });
  assert.equal(list().length, 8);
  assert.equal(list().at(-1).email, "faisal@nuqta.qa");
  await source.remove("yusuf");
  assert.equal(list().length, 7);
  assert.ok(!list().some((m) => m.id === "yusuf"));
});

test("the sample refuses what the server refuses", async () => {
  const owner = fixtureSource({ me: FIXTURE_OWNER }).source;
  assert.match((await refusalOf(owner.invite({ name: "Maha", email: "maha@nuqta.qa", role: "agent" }))).message, /already on the team/);
  assert.match((await refusalOf(owner.changeRole("hana", "admin"))).message, /at least one owner/);
  assert.match((await refusalOf(owner.remove("hana"))).message, /yourself/);

  const admin = fixtureSource({ me: { id: "omar", role: "admin" } }).source;
  assert.match((await refusalOf(admin.invite({ name: "Faisal", email: "f@nuqta.qa", role: "owner" }))).message, /only an owner/);
  assert.match((await refusalOf(admin.changeRole("bilal", "owner"))).message, /only an owner/);

  const agent = fixtureSource({ me: FIXTURE_AGENT }).source;
  assert.match((await refusalOf(agent.remove("yusuf"))).message, /only an owner or admin/);
  assert.match((await refusalOf(agent.setSigning(false))).message, /only an owner or admin/);
});

test("a role change moves the person in the list", async () => {
  const { source } = fixtureSource({ me: FIXTURE_OWNER });
  await source.changeRole("bilal", "admin");
  assert.equal((await source.members()).find((m) => m.id === "bilal").role, "admin");
});

test("an agent's report holds only their row; offline reads fail the way the network fails", async () => {
  const agent = fixtureSource({ me: FIXTURE_AGENT }).source;
  assert.deepEqual((await agent.report(7)).people.map((p) => p.id), ["salma"]);
  const offline = fixtureSource({ me: FIXTURE_OWNER, offline: true }).source;
  const error = await refusalOf(offline.members());
  assert.equal(isOffline(error), true);
});

test("refusals are said in the shop's words, in both languages", () => {
  const last = new ApiError(422, "", "a shop must keep at least one owner");
  assert.match(explain(last, "en"), /at least one owner/);
  assert.match(explain(last, "ar"), /مالك واحد على الأقل/);
  assert.match(explain(new ApiError(403, "", "only an owner can change an owner"), "ar"), /المالك وحده/);
  assert.match(explain(new ApiError(422, "", "that person is already on the team"), "en"), /already on the team/);
  assert.match(explain(new ApiError(0, "offline", "offline"), "en"), /No connection/);
  assert.match(explain(new ApiError(0, "offline", "offline"), "ar"), /اتصال/);
});
