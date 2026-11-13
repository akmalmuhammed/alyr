import type { Lang } from "./copy";

export type RoleKey = "owner" | "admin" | "agent";

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  isYou?: boolean;
  phone?: {
    lastDigits: string;
    since: string;
  } | null;
  lastSeen: {
    label: string;
    sub: string;
    tone?: "volt" | "warn" | "neutral";
  };
  notSignedInYet?: boolean;
  invitedDate?: string;
  invitedBy?: string;
  joinedDate?: string;
  bays?: string[];
  devices?: Array<{
    type: "store" | "phone";
    title: string;
    sub: string;
    activeNow?: boolean;
  }>;
  work?: {
    openConvs: number;
    waitingMinutes?: number;
    ordersHandled: string[];
  };
  history?: Array<{
    title: string;
    sub: string;
    tone?: "ok" | "neutral";
  }>;
};

export type FilterChip = "all" | "owners_admins" | "agents" | "not_signed_in" | "phone_not_linked";

export type OutcomKey = "sold" | "booked" | "answered" | "lost";

export type Outcomes = {
  sold: number;
  booked: number;
  answered: number;
  lost: number;
};

export type WorkPerson = {
  initials: string;
  name: string;
  role: string;
  open: number;
  waiting?: string;
  replies: number;
  firstAnswer: string;
  outcomes: Outcomes | null;
  bookings: {
    marked: number;
    noShow: number;
  } | null;
  orders: number;
  sales: string;
};

export function getInitials(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function formatDuration(seconds: number, lang: Lang): string {
  const minutes = Math.round(seconds / 60);
  if (lang === "ar") {
    if (seconds < 60) return "أقل من دقيقة";
    if (minutes < 60) return `${minutes} د`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} س` : `${h} س ${m} د`;
  }
  if (seconds < 60) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function filterMembers(
  members: TeamMember[],
  query: string,
  chip: FilterChip
): TeamMember[] {
  const cleanQuery = query.trim().toLowerCase();

  return members
    .filter((m) => {
      // Search query filter
      if (cleanQuery) {
        const matchesName = m.name.toLowerCase().includes(cleanQuery);
        const matchesEmail = m.email.toLowerCase().includes(cleanQuery);
        if (!matchesName && !matchesEmail) return false;
      }

      // Chip filter
      if (chip === "owners_admins") {
        return m.role === "owner" || m.role === "admin";
      }
      if (chip === "agents") {
        return m.role === "agent";
      }
      if (chip === "not_signed_in") {
        return !!m.notSignedInYet;
      }
      if (chip === "phone_not_linked") {
        return !m.phone;
      }

      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function computeTeamStats(members: TeamMember[]) {
  const total = members.length;
  const signedIn = members.filter((m) => !m.notSignedInYet).length;
  const invited = members.filter((m) => m.notSignedInYet).length;
  const activeNow = members.filter((m) => m.lastSeen?.tone === "volt").length;
  const phoneLinked = members.filter((m) => !!m.phone).length;

  return {
    total,
    signedIn,
    invited,
    activeNow,
    phoneLinked,
  };
}

export function calculateOutcomeParts(outcomes: Outcomes | null): Array<{ key: OutcomKey; flex: number }> {
  if (!outcomes) return [];
  const total = outcomes.sold + outcomes.booked + outcomes.answered + outcomes.lost;
  if (total === 0) return [];

  const parts: Array<{ key: OutcomKey; flex: number }> = [];
  if (outcomes.sold > 0) parts.push({ key: "sold", flex: outcomes.sold / total });
  if (outcomes.booked > 0) parts.push({ key: "booked", flex: outcomes.booked / total });
  if (outcomes.answered > 0) parts.push({ key: "answered", flex: outcomes.answered / total });
  if (outcomes.lost > 0) parts.push({ key: "lost", flex: outcomes.lost / total });

  return parts;
}
