"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Payment = { shop: string; customer: string; amount_text: string; status: "pending" | "paid" };

export default function PayPage() {
  const { tenant, payment } = useParams<{ tenant: string; payment: string }>();
  const [data, setData] = useState<Payment | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/pay/${tenant}/${payment}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setMissing(true));
  }, [tenant, payment]);

  async function pay() {
    setBusy(true);
    const response = await fetch(`/api/pay/${tenant}/${payment}/complete`, { method: "POST" });
    if (response.ok) setData((d) => (d ? { ...d, status: "paid" } : d));
    setBusy(false);
  }

  return (
    <div className="pay">
      <div className="paycard">
        <span className="standin">
          Stand-in payment page. No money moves. A real gateway (SADAD, SkipCash or Dibsy) replaces this in Phase 2.
        </span>
        {missing && <p>This payment link is not valid.</p>}
        {data && (
          <>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 14 }}>Pay {data.shop}</div>
              <div className="amount num">{data.amount_text}</div>
            </div>
            <div className="row"><span>Customer</span><b>{data.customer}</b></div>
            <div className="row"><span>Method</span><b>Debit card (NAPS) · test</b></div>
            {data.status === "paid" ? (
              <p className="paid">Paid. You can return to the chat.</p>
            ) : (
              <button className="btn primary" onClick={pay} disabled={busy}>
                Pay {data.amount_text}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
