"use client";

// What a client pays ALYR (ALY-212, D-051; asked at go-live since ALY-242, D-053). The
// workspace is open from sign-up; the setup fee and the first period of the accepted price
// settle the client's go-live check. Until online payment exists, staff record each payment
// here (a bank transfer, cash, a cheque or a link) with what the statement shows. Staff can
// also waive the payment, saying why. Both are on the audit log. A client can also pay by card
// through Paddle (ALY-180, D-074): those payments arrive by themselves from Paddle's webhook and
// show here beside the others, with what Paddle took in US dollars. Staff choose per client
// whether the card is offered. After go-live (ALY-218, D-080) it shows where the plan stands:
// paid through a day, past due, paused (ALYR's automatic messages wait until a payment is
// recorded), or cancelled; staff record a client's cancellation here, with seven days' notice.

import { useState } from "react";
import { api, toDirhams } from "./api";

export type Access = {
  status: "paid" | "no_price" | "unpaid"; waived: boolean; waived_note: string;
  due: number; due_text: string; paid: number; paid_text: string; left: number; left_text: string;
  reference: string;
  payments: { id: string; amount_text: string; method: string; reference: string; received_on: string; note: string; paid_text?: string }[];
  // Null: the platform's setting (ALYR_CARD_BILLING). Offered: what the owner sees now.
  card_billing?: "off" | "paddle" | null;
  card?: { provider: string; amount_text: string } | null;
  subscription?: Plan | null;
  checkout?: { status: string; problem: string; amount_text: string; covers_text: string; subscription_status: string; created_at: string } | null;
};

export type Plan = {
  state: "no_price" | "awaiting_payment" | "active" | "past_due" | "suspended" | "cancelled";
  paid_through: string | null; overdue_days: number; owed: number; owed_text: string;
  pause_on: string | null; cancels_on: string | null; paused: "" | "overdue" | "cancelled";
  cancel_note?: string; paused_since?: string | null;
};

const PLAN: Record<Plan["state"], [string, string]> = {
  no_price: ["No plan yet", "wait"], awaiting_payment: ["Not live or not paid yet", "wait"],
  active: ["Plan paid up", "active"], past_due: ["Past due", "wait"],
  suspended: ["Paused: overdue", "danger"], cancelled: ["Cancelled", "danger"],
};

const CHECKOUT: Record<string, string> = {
  creating: "Preparing with Paddle", open: "Checkout open, not paid yet", paid: "Paid by card",
  failed: "Could not be made", mismatch: "Paddle took a different amount: not recorded, look at it in Paddle",
};

const METHODS: Record<string, string> = { bank_transfer: "Bank transfer", cash: "Cash", cheque: "Cheque", link: "Payment link" };
// Only Paddle's webhook records a card payment; staff never pick it.
const SHOWN: Record<string, string> = { ...METHODS, card: "Card (Paddle)" };

export function ClientAccess({ clientId, access, onDone }: { clientId: string; access: Access; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ amount: "", method: "bank_transfer", reference: "", received_on: today, note: "" });
  const [reason, setReason] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const amount = toDirhams(form.amount);

  async function send(url: string, body: unknown, method = "POST") {
    setBusy(true); setError("");
    try {
      const answer = await api(url, method, body);
      if (!answer.ok) return setError(answer.error);
      setForm({ ...form, amount: "", reference: "", note: "" });
      setReason("");
      setCancelNote("");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-access">
      <p>
        <span className={`sh-pill ${access.status === "paid" ? "active" : "wait"}`}>
          {access.status === "paid" ? (access.waived ? "Payment waived" : "Paid") : access.status === "no_price" ? "No accepted price yet" : "Owes the go-live payment"}
        </span>{" "}
        {access.status === "unpaid" && <>Due <b className="num">{access.due_text}</b> · paid {access.paid_text} · left <b className="num">{access.left_text}</b> · reference <code>{access.reference}</code></>}
        {access.waived && access.waived_note && <small>{access.waived_note}</small>}
      </p>
      {access.payments.length > 0 && (
        <div className="tablewrap"><table>
          <thead><tr><th>Received</th><th>Amount</th><th>How</th><th>Reference</th><th>Note</th></tr></thead>
          <tbody>
            {access.payments.map((p) => (
              <tr key={p.id} className="norow">
                <td>{p.received_on}</td><td className="num">{p.amount_text}</td><td>{SHOWN[p.method] ?? p.method}{p.paid_text ? ` · ${p.paid_text}` : ""}</td>
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
      {!access.waived && access.status !== "paid" && (
        <div className="ops-step">
          <input aria-label="Why the payment is waived" placeholder="Waive the payment: why (a pilot, a demo)" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn small ghost" type="button" disabled={busy || !reason.trim()} onClick={() => send(`/api/admin/clients/${clientId}/waive`, { reason })}>Waive payment</button>
        </div>
      )}
      <div className="ops-step">
        <label>
          Card payment{" "}
          <select aria-label="Card payment for this client" disabled={busy} value={access.card_billing ?? ""}
            onChange={(e) => send(`/api/admin/clients/${clientId}/card-billing`, { card_billing: e.target.value || null }, "PUT")}>
            <option value="">Platform setting</option>
            <option value="paddle">Paddle</option>
            <option value="off">Off: bank transfer only</option>
          </select>
        </label>
        <small>{access.card ? `Offered now: ${access.card.amount_text}` : "Not offered now"}</small>
      </div>
      {access.checkout && (
        <p>
          <small>
            Latest card checkout ({access.checkout.created_at.slice(0, 10)}): {CHECKOUT[access.checkout.status] ?? access.checkout.status}
            {access.checkout.amount_text && ` · ${access.checkout.amount_text} for ${access.checkout.covers_text}`}
            {access.checkout.subscription_status && ` · renewals ${access.checkout.subscription_status}`}
            {access.checkout.problem && ` · ${access.checkout.problem}`}
          </small>
        </p>
      )}
      {access.subscription && <PlanState clientId={clientId} plan={access.subscription} busy={busy}
        note={cancelNote} setNote={setCancelNote} send={send} />}
      {error && <p className="ops-error" role="alert">{error}</p>}
    </div>
  );
}

function PlanState({ clientId, plan, busy, note, setNote, send }: {
  clientId: string; plan: Plan; busy: boolean; note: string; setNote: (v: string) => void;
  send: (url: string, body: unknown, method?: string) => void;
}) {
  const [label, tone] = PLAN[plan.state];
  const url = `/api/admin/clients/${clientId}/cancel`;
  return (
    <div className="ops-plan">
      <p>
        <span className={`sh-pill ${tone}`}>{label}</span>{" "}
        {plan.paid_through && <>Paid through <b className="num">{plan.paid_through}</b>{" "}</>}
        {plan.owed > 0 && <>· owes <b className="num">{plan.owed_text}</b>{" "}</>}
        {plan.state === "past_due" && plan.pause_on && <>· sending pauses on {plan.pause_on}</>}
        {plan.paused && plan.paused_since && <small>Automatic messages paused since {plan.paused_since.slice(0, 10)}. Recording the payment starts them again.</small>}
      </p>
      {plan.cancels_on ? (
        <div className="ops-step">
          <small>
            {plan.state === "cancelled" ? "Cancelled on" : "Cancels on"} {plan.cancels_on}
            {plan.cancel_note && ` · ${plan.cancel_note}`}
          </small>
          <button className="btn small ghost" type="button" disabled={busy} onClick={() => send(url, undefined, "DELETE")}>Undo the cancellation</button>
        </div>
      ) : (
        <div className="ops-step">
          <input aria-label="How the client asked to cancel" placeholder="Cancel: how the client asked (an email, a call)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn small ghost" type="button" disabled={busy || !note.trim()} onClick={() => send(url, { note })}>Cancel in 7 days</button>
        </div>
      )}
    </div>
  );
}
