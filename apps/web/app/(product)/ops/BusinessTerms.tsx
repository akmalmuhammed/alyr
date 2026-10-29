"use client";

// What one business accepted of the customer agreement and the privacy notice, by whom and when,
// and what it has not accepted yet (ALY-167). Read from the append-only record; never edited.

import { useEffect, useState } from "react";
import { api, type Business } from "./api";

type Accepted = { kind: string; version: string; title: string; accepted_by: string; accepted_at: string };
type Open = { kind: string; version: string; title: string };
type Record = { accepted: Accepted[]; pending: Open[] };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function BusinessTerms({ business }: { business: Business }) {
  const [record, setRecord] = useState<Record | null>(null);
  useEffect(() => {
    let alive = true;
    const first = setTimeout(async () => {
      const answer = await api<Record>(`/api/admin/businesses/${business.id}/terms`);
      if (alive && answer.ok) setRecord(answer.data);
    }, 0);
    return () => { alive = false; clearTimeout(first); };
  }, [business.id]);

  return (
    <div className="ops-terms">
      <b>{business.name}</b>
      {record === null ? <small>Loading…</small> : (
        <ul>
          {record.accepted.map((a) => (
            <li key={`${a.kind}-${a.version}`}>{a.title} <code>{a.version}</code> accepted by {a.accepted_by || "the owner"}, {when(a.accepted_at)}</li>
          ))}
          {record.pending.map((p) => (
            <li key={`open-${p.kind}-${p.version}`} className="ops-terms-open">{p.title} <code>{p.version}</code>: not accepted yet</li>
          ))}
          {record.accepted.length === 0 && record.pending.length === 0 && <li>Nothing to accept yet.</li>}
        </ul>
      )}
    </div>
  );
}
