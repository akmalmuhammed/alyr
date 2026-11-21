"use client";

// The redesigned Inbox on the shop's real conversations. The workbench reads the clock, the shop
// and the person's role from the API itself; this host only says which language to draw, where
// its links go, and which list ALYR Agent's `?show=waiting` link asked for.

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { InboxWorkbench } from "../../inbox/InboxWorkbench";
import type { Role } from "../../inbox/types";
import type { SectionProps } from "../../sectionRegistry";

// The Credit section's address is /app/ledger (the API's nav key), not /app/credit.
const HREFS = { credit: "/app/ledger", bookings: "/app/bookings", orders: "/app/orders" };

export default function InboxV2Section({ ws }: SectionProps) {
  const search = useSearchParams();
  const [chip] = useState(() => (search.get("show") === "waiting" ? ("waiting" as const) : null));
  const { me } = ws.state;
  const role: Role | undefined = me.signed_in && (me.role === "owner" || me.role === "admin" || me.role === "agent") ? me.role : undefined;
  return (
    <InboxWorkbench live lang={ws.lang} role={role} hrefs={HREFS} initialSelectedId={null} initialFilters={{ chip }} />
  );
}
