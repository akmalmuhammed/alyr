"use client";

// Every change ALYR staff made in the console, newest first (D-033). It cannot be edited.
// `?client=<id>` shows one client's history.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

type Entry = {
  id: number; at: string; staff_email: string; staff_name: string; action: string;
  subject_type: string; subject_id: string; client_id: string | null;
  business_id: string | null; detail: Record<string, unknown>;
};

const ACTION: Record<string, string> = {
  "business.created": "Created a business", "business.moved": "Moved a business to another client",
  "request.done": "Marked a request done", "price_item.saved": "Changed the price list",
  "business_type.saved": "Changed sign-up for a business type", "promise.saved": "Changed the promise",
  "client.saved": "Edited a client", "quote.created": "Made a new quote", "quote.saved": "Edited a quote",
  "quote.publish": "Published a quote to the owner", "quote.unpublish": "Took a quote back to draft",
  "quote.withdraw": "Withdrew a quote", "today.snoozed": "Set a Today item aside",
  "today.unsnoozed": "Brought a Today item back", "staff.added": "Added staff", "staff.removed": "Removed staff",
  "staff.sign_in": "Signed in to the back office",
  "staff.locked": "Paused sign-in after wrong codes",
};

function summary(entry: Entry) {
  const d = entry.detail ?? {};
  if (entry.action === "quote.saved" && d.totals) {
    const totals = d.totals as { monthly_total_text?: string };
    return `${totals.monthly_total_text ?? ""} a month, every ${d.period_months} month(s), ${d.discount_pct}% off`;
  }
  if (entry.action === "price_item.saved") {
    const before = d.before as { price?: number } | null;
    const after = d.after as { price?: number };
    return `${entry.subject_id}: ${before ? `QAR ${(before.price ?? 0) / 100} → ` : "new, "}QAR ${(after?.price ?? 0) / 100}`;
  }
  if (entry.action === "business_type.saved") {
    const after = d.after as { availability?: string; price_mode?: string };
    return `${entry.subject_id}: ${after?.availability}, price ${after?.price_mode}`;
  }
  if (entry.action === "business.created") return `${d.name} (${d.slug}), owner ${d.owner}`;
  if (entry.action === "today.snoozed") return `${entry.subject_id} for ${d.days} day(s)`;
  if (entry.action === "promise.saved") return (d.after as { en?: string } | undefined)?.en ?? "";
  if (entry.action === "client.saved") return `${d.name}${d.price_mode ? `, price ${d.price_mode}` : ""}`;
  if (entry.action === "staff.sign_in") {
    const where = [d.device, d.address].filter(Boolean).join(" · ");
    const fresh = [d.new_device && "new device", d.new_address && "new address"].filter(Boolean).join(", ");
    return `${entry.subject_id}: ${where}${fresh ? ` (${fresh})` : ""}`;
  }
  if (entry.action === "staff.locked") return `${entry.subject_id}: ${d.wrong_codes} wrong codes in ${d.window_hours} hours`;
  if (entry.subject_type === "staff") return entry.subject_id;
  return Object.keys(d).length ? JSON.stringify(d).slice(0, 140) : "";
}

export default function AuditPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [client, setClient] = useState("");

  const load = useCallback(async (clientId: string) => {
    const answer = await api<{ entries: Entry[] }>(`/api/admin/audit${clientId ? `?client_id=${clientId}` : ""}`);
    if (answer.ok) setEntries(answer.data.entries);
  }, []);
  useEffect(() => {
    const first = setTimeout(() => {
      const id = new URLSearchParams(window.location.search).get("client") ?? "";
      setClient(id);
      load(id);
    }, 0);
    return () => clearTimeout(first);
  }, [load]);

  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">Settings · audit log</span>
        <h1>Audit log</h1>
        <p>{client ? "Everything ALYR staff changed for this client." : "Every change ALYR staff made, newest first. Nobody can edit or remove an entry."}</p>
      </header>
      {client && <Link className="btn small ghost ops-back" href="/ops/audit" onClick={() => { setClient(""); load(""); }}>← All changes</Link>}
      {entries.length === 0 ? <p className="sh-note">No changes yet.</p> : (
        <div className="tablewrap"><table>
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="norow">
                <td className="num">{new Date(e.at).toLocaleString("en-GB")}</td>
                <td>{e.staff_name || e.staff_email}<br /><small>{e.staff_email}</small></td>
                <td>
                  {ACTION[e.action] ?? e.action}
                  {e.client_id && !client && <><br /><Link href={`/ops/clients?client=${e.client_id}`} className="ops-link">Open client</Link></>}
                </td>
                <td className="ops-detail-cell" dir="auto">{summary(e)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}
