"use client";

// The entry to the connected-apps screen, on the workspace's Connections screen (ALY-292). It is
// drawn only when the API answers: a server where the connector is switched off answers 404, and an
// owner there sees no link at all (what is not available is hidden, D-039). Owners and admins only;
// the screen itself says so to anyone who opens its address anyway.

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "./catalogApi";
import { T, type Lang } from "./mcpCopy";
import "./mcp.css";

export function McpLink({ lang, canManage, icon, arrow }: { lang: Lang; canManage: boolean; icon: React.ReactNode; arrow: React.ReactNode }) {
  const c = T[lang];
  const [there, setThere] = useState(false);
  useEffect(() => {
    if (!canManage) return;
    let live = true;
    const first = setTimeout(() => {
      api("/api/mcp").then(() => { if (live) setThere(true); }, () => { if (live) setThere(false); });
    }, 0);
    return () => { live = false; clearTimeout(first); };
  }, [canManage]);
  if (!canManage || !there) return null;
  return (
    <Link className="mc-link" href="/app/connect-ai">
      <span className="sh-glyph">{icon}</span>
      <span className="mc-link-text"><b>{c.title}</b><small>{c.linkSub}</small></span>
      <span className="mc-link-arrow">{arrow}</span>
    </Link>
  );
}
