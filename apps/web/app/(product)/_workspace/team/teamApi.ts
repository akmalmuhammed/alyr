// The team's data and actions behind one small interface, so the screens never know whether they are
// talking to the API or to the preview's in-memory sample. `liveSource` calls the real endpoints and
// lets every failure through (an `ApiError`): a screen that cannot load says so, it never shows
// sample data in its place. `fixtureSource` (fixtureSource.ts) touches no network at all.

import { api } from "@/app/_ui/api";
import type { Me, Member, Period, RawPerformance, Role } from "./logic";

export type Invite = { name: string; email: string; role: Role };

export type TeamSource = {
  me: () => Promise<Me>;
  members: () => Promise<Member[]>;
  report: (days: Period) => Promise<RawPerformance>;
  signing: () => Promise<boolean>;
  setSigning: (on: boolean) => Promise<void>;
  invite: (input: Invite) => Promise<void>;
  changeRole: (id: string, role: Role) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const liveSource: TeamSource = {
  me: async () => {
    const data = await api<{ id: string | null; role: Role }>("/api/auth/me");
    return { id: data.id ?? "", role: data.role };
  },
  members: async () => (await api<{ members: Member[] }>("/api/team")).members,
  report: (days) => api<RawPerformance>(`/api/team/performance?days=${days}`),
  signing: async () => (await api<{ sign_replies: boolean }>("/api/team/settings")).sign_replies,
  setSigning: async (on) => {
    await api("/api/team/settings", { method: "PUT", body: { sign_replies: on } });
  },
  invite: async (input) => {
    await api("/api/team", { method: "POST", body: input });
  },
  changeRole: async (id, role) => {
    await api(`/api/team/${id}/role`, { method: "POST", body: { role } });
  },
  remove: async (id) => {
    await api(`/api/team/${id}`, { method: "DELETE" });
  },
};
