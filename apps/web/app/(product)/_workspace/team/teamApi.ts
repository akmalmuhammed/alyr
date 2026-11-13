import { FIXTURE_MEMBERS, FIXTURE_WORK_PEOPLE } from "./fixtures";
import type { TeamMember, WorkPerson } from "./logic";

export async function fetchTeam(): Promise<{ members: TeamMember[]; canManage: boolean }> {
  try {
    const res = await fetch("/api/team", { cache: "no-store" });
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    return {
      members: data.members && data.members.length > 0 ? data.members : FIXTURE_MEMBERS,
      canManage: data.can_manage ?? true,
    };
  } catch {
    return {
      members: FIXTURE_MEMBERS,
      canManage: true,
    };
  }
}

type RawPerformancePerson = {
  name?: string;
  role?: string;
  open?: number;
  waiting?: number;
  replies?: number;
  median_reply_seconds?: number | null;
  closed?: { sold: number; booked: number; answered: number; lost: number };
  bookings_completed?: number;
  no_shows?: number;
  orders?: number;
  sales_text?: string;
};

export async function fetchPerformance(days: number = 7): Promise<WorkPerson[]> {
  try {
    const res = await fetch(`/api/team/performance?days=${days}`, { cache: "no-store" });
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    if (data.people && data.people.length > 0) {
      return data.people.map((p: RawPerformancePerson) => ({
        initials: p.name?.slice(0, 2).toUpperCase() || "",
        name: p.name,
        role: p.role,
        open: p.open || 0,
        waiting: p.waiting > 0 ? `${p.waiting} waiting` : undefined,
        replies: p.replies || 0,
        firstAnswer: p.median_reply_seconds ? `${Math.round(p.median_reply_seconds / 60)} min` : "–",
        outcomes: p.closed || null,
        bookings: p.bookings_completed ? { marked: p.bookings_completed, noShow: p.no_shows || 0 } : null,
        orders: p.orders || 0,
        sales: p.sales_text || "–",
      }));
    }
    return FIXTURE_WORK_PEOPLE;
  } catch {
    return FIXTURE_WORK_PEOPLE;
  }
}

export async function fetchSettings(): Promise<{ signReplies: boolean }> {
  try {
    const res = await fetch("/api/team/settings", { cache: "no-store" });
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    return { signReplies: !!data.sign_replies };
  } catch {
    return { signReplies: true };
  }
}

export async function updateSettings(signReplies: boolean): Promise<boolean> {
  try {
    const res = await fetch("/api/team/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sign_replies: signReplies }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function inviteMember(name: string, email: string, role: string): Promise<boolean> {
  try {
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, role }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function changeRole(userId: string, role: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/team/${userId}/role`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function removeMember(userId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/team/${userId}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}
