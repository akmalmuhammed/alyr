"use client";

// Pay before access (ALY-212, D-051). A client's products open once ALYR has their payment
// for the setup fee and the first period of the price they accepted. Until online payment
// exists, staff record each payment here (a bank transfer, cash, a cheque or a link) with
// what the statement shows. Recording enough opens the products; staff can also open them
// without a payment, saying why. Both are on the audit log.

import { useState } from "react";
import { api, toDirhams } from "./api";

export type Access = {
  open: boolean; status: "open" | "no_price" | "unpaid"; opened_at?: string | null;
  due: number; due_text: string; paid: number; paid_text: string; left: number; left_text: string;
  reference: string;
  payments: { id: string; amount_text: string; method: string; reference: string; received_on: string; note: string }[];
};

const METHODS: Record<string, string> = { bank_transfer: "Bank transfer", cash: "Cash", cheque: "Cheque", link: "Payment link" };

export function ClientAccess({ clientId, access, onDone }: { clientId: string; access: Access; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ amount: "", method: "bank_transfer", reference: "", received_on: today, note: "" });
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const amount = toDirhams(form.amount);

  async function send(url: string, body: unknown) {
    setBusy(true); setError("");
    try {
      const answer = await api(url, "POST", body);
      if (!answer.ok) return setError(answer.error);
      setForm({ ...form, amount: "", reference: "", note: "" });
      setReason("");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-access">
      <p>
        <span className={`sh-pill ${access.open ? "active" : "wait"}`}>
          {access.open ? "Products open" : access.status === "no_price" ? "Locked: no accepted price" : "Locked: waiting for payment"}
        </span>{" "}
        {access.status === "unpaid" && <>Due <b className="num">{access.due_text}</b> · paid {access.paid_text} · left <b className="num">{access.left_text}</b> · reference <code>{access.reference}</code></>}
        {access.open && access.opened_at && <small>since {new Date(access.opened_at).toLocaleDateString("en-GB")}</small>}
      </p>
      {access.payments.length > 0 && (
        <div className="tablewrap"><table>
          <thead><tr><th>Received</th><th>Amount</th><th>How</th><th>Reference</th><th>Note</th></tr></thead>
          <tbody>
            {access.payments.map((p) => (
              <tr key={p.id} className="norow">
                <td>{p.received_on}</td><td className="num">{p.amount_text}</td><td>{METHODS[p.method] ?? p.method}</td>
                <td>{p.reference || "—"}</td><td>{p.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {access.status !== "no_price" && (
        <form className="ops-step" onSubmit={(e) => {
          e.preventDefault();
          send(`/api/admin/clients/${clientId}/payments`, { ...form, amount });
        }}>
          <input aria-label="Amount in QAR" placeholder="Amount (QAR)" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select aria-label="How it was paid" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input aria-label="Reference on the statement" placeholder="Reference on the statement" maxLength={120} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          <input aria-label="Received on" type="date" max={today} value={form.received_on} onChange={(e) => setForm({ ...form, received_on: e.target.value })} />
          <button className="btn small" type="submit" disabled={busy || !(amount > 0)}>Record payment</button>
        </form>
      )}
      {!access.open && (
        <div className="ops-step">
          <input aria-label="Why it opens without a payment" placeholder="Open without a payment: why (a pilot, a demo)" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn small ghost" type="button" disabled={busy || !reason.trim()} onClick={() => send(`/api/admin/clients/${clientId}/open`, { reason })}>Open without payment</button>
        </div>
      )}
      {error && <p className="ops-error" role="alert">{error}</p>}
    </div>
  );
}
