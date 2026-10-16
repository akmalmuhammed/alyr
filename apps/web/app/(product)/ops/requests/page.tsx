"use client";

// Help shops asked for: "Ask ALYR" in the workspace and requests made at sign-up.

import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

type Request = {
  id: string; tenant_id: string; business: string; product_key: string; step_key: string;
  note: string; requested_by: string; status: string; created_at: string;
};

export default function RequestsPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [status, setStatus] = useState<"open" | "done" | "all">("open");

  const load = useCallback(async () => {
    const answer = await api<{ requests: Request[] }>(`/api/admin/setup-requests?status=${status}`);
    if (answer.ok) setRequests(answer.data.requests);
  }, [status]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function done(id: string) {
    await api(`/api/admin/setup-requests/${id}/done`, "POST");
    load();
  }

  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">Requests</span>
        <h1>Asked for help</h1>
        <p>What shops asked ALYR to do for them.</p>
      </header>
      <nav className="tm-seg ops-tabs" role="tablist" aria-label="Status">
        {(["open", "done", "all"] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={status === s} onClick={() => setStatus(s)}>
            {s === "open" ? "Open" : s === "done" ? "Done" : "All"}
          </button>
        ))}
      </nav>
      {requests.length === 0 ? <p className="sh-note">{status === "open" ? "Nothing waiting. Every ask is answered." : "None."}</p> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Shop</th><th>Product · step</th><th>Note</th><th>Asked by</th><th /></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="norow">
                <td><b>{r.business}</b><br /><small>{new Date(r.created_at).toLocaleString("en-GB")}</small></td>
                <td>{r.product_key} · {r.step_key || "general"}</td>
                <td dir="auto">{r.note}</td>
                <td>{r.requested_by}</td>
                <td className="r">{r.status === "open" ? <button className="btn small" onClick={() => done(r.id)}>Mark done</button> : <span className="sh-pill active">Done</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}
