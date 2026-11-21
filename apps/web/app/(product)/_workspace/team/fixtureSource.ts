// The preview's data source: the sample team held in memory, answering the way the server answers
// (same refusals, same rules), and sending nothing anywhere. An invite, a role change or a removal only
// changes this list. Erasable TypeScript only, so `node --test` runs it.

import { ApiError } from "../../../_ui/api.ts";
import { FIXTURE_MEMBERS, agentReport, emptyReport, fixtureReport } from "./fixtures.ts";
import { roleChangeRefusal, removeRefusal } from "./logic.ts";
import type { Me, Member, Period, RawPerformance } from "./logic.ts";
import type { Invite, TeamSource } from "./teamApi.ts";

export type FixtureOptions = {
  me: Me;
  /** A shop where nobody has replied, closed or sold yet. */
  empty?: boolean;
  /** Calls that never answer: the loading state. */
  hold?: boolean;
  /** Reads fail with "no connection" once `after` calls have been answered (the offline state). */
  offline?: boolean;
};

const REASONS = {
  not_manager: "only an owner or admin can manage the team",
  owner_only: "only an owner can change an owner",
  last_owner: "a shop must keep at least one owner",
  yourself: "you cannot remove yourself",
} as const;

export function fixtureSource(options: FixtureOptions): { source: TeamSource; list: () => Member[] } {
  let members: Member[] = options.empty ? FIXTURE_MEMBERS.slice(0, 1) : [...FIXTURE_MEMBERS];
  let signing = true;
  const refuse = (message: string, status = 403) => new ApiError(status, "", message);
  const gate = <T,>(value: () => T): Promise<T> => {
    if (options.hold) return new Promise<T>(() => {});
    if (options.offline) return Promise.reject(new ApiError(0, "offline", "offline"));
    return Promise.resolve(value());
  };
  const must = (id: string) => {
    const found = members.find((m) => m.id === id);
    if (!found) throw refuse("no such team member", 404);
    return found;
  };
  const source: TeamSource = {
    me: () => Promise.resolve(options.me),
    members: () => gate(() => [...members]),
    report: (days: Period): Promise<RawPerformance> =>
      gate(() => (options.empty ? emptyReport(days) : options.me.role === "agent" ? agentReport(days, options.me) : fixtureReport(days))),
    signing: () => gate(() => signing),
    setSigning: async (on) => {
      if (options.me.role === "agent") throw refuse("only an owner or admin can change this");
      signing = on;
    },
    invite: async (input: Invite) => {
      if (options.me.role === "agent") throw refuse(REASONS.not_manager);
      if (input.role === "owner" && options.me.role !== "owner") throw refuse("only an owner can make someone an owner");
      if (members.some((m) => m.email === input.email.trim().toLowerCase())) throw refuse("that person is already on the team", 422);
      members = [...members, { id: input.name.trim().toLowerCase(), name: input.name.trim(), email: input.email.trim().toLowerCase(), role: input.role }];
    },
    changeRole: async (id, role) => {
      const target = must(id);
      const why = roleChangeRefusal(options.me, members, target, role);
      if (why) throw refuse(REASONS[why], why === "last_owner" ? 422 : 403);
      members = members.map((m) => (m.id === id ? { ...m, role } : m));
    },
    remove: async (id) => {
      const target = must(id);
      const why = removeRefusal(options.me, members, target);
      if (why) throw refuse(REASONS[why], why === "last_owner" ? 422 : 403);
      members = members.filter((m) => m.id !== id);
    },
  };
  return { source, list: () => members };
}
