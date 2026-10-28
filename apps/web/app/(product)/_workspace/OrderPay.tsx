"use client";

// Marking an order paid by cash, transfer, cheque or the card machine, and choosing how the
// shop's customers pay (ALY-170, specs/024-pay-on-collection). The shop writes down what it was
// paid; ALYR never touches the money.

import { useEffect, useState } from "react";
import type { Lang } from "./catalogCopy";
import { ORDER_PAY } from "./orderPayCopy";

const METHODS = ["cash", "bank_transfer", "card_terminal", "cheque"] as const;
const WAYS = ["cash", "bank_transfer", "card_terminal"] as const;

async function send(url: string, method: string, body: unknown, key?: string) {
  const response = await fetch(url, {
    method, cache: "no-store",
    headers: { "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

/** The button on an unpaid order, and the little form it opens. */
export function MarkPaid({ orderId, lang, onDone }: { orderId: string; lang: Lang; onDone: () => void }) {
  const t = ORDER_PAY[lang];
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One key per opening of the form, so a double tap records one payment.
  const [key, setKey] = useState(() => crypto.randomUUID());

  async function save() {
    setBusy(true);
    setError("");
    const answer = await send(`/api/orders/${orderId}/paid`, "POST", { method, reference: reference.trim() }, key);
    setBusy(false);
    if (answer.ok) { setOpen(false); onDone(); return; }
    setError(answer.status === 409 ? t.already : t.failed);
    if (answer.status === 409) onDone();
  }

  if (!open) {
    return <button type="button" className="btn small" onClick={() => { setKey(crypto.randomUUID()); setOpen(true); }}>{t.markPaid}</button>;
  }
  return (
    <div className="markpaid">
      <select value={method} onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])} aria-label={t.how}>
        {METHODS.map((m) => <option key={m} value={m}>{t[m]}</option>)}
      </select>
      <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} placeholder={t.reference} aria-label={t.reference} dir="auto" />
      <button type="button" className="btn small" disabled={busy} onClick={save}>{t.save}</button>
      <button type="button" className="btn small ghost" disabled={busy} onClick={() => setOpen(false)}>{t.cancel}</button>
      {error && <small role="alert" className="err">{error}</small>}
    </div>
  );
}

type Ways = { online: boolean; ways: string[] };

/** For owners: online link, or cash, transfer and card machine on collection. */
export function PayWays({ lang }: { lang: Lang }) {
  const t = ORDER_PAY[lang];
  const [now, setNow] = useState<Ways | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/orders-payment-ways", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Ways | null) => { if (live && d) setNow(d); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  async function change(body: Partial<Ways>) {
    const answer = await send("/api/orders-payment-ways", "PUT", body);
    if (answer.ok) { setNow(answer.data as Ways); setMessage(t.waysSaved); }
    else setMessage(typeof answer.data?.detail === "string" ? answer.data.detail : t.waysNeed);
  }

  if (!now) return null;
  return (
    <fieldset className="payways">
      <legend>{t.waysTitle}</legend>
      <label><input type="radio" name="pay-online" checked={now.online} onChange={() => change({ online: true })} /> {t.waysOnline}</label>
      <label><input type="radio" name="pay-online" checked={!now.online} onChange={() => change({ online: false })} /> {t.waysLater}</label>
      {!now.online && (
        <div role="group" aria-label={t.waysPick}>
          {WAYS.map((w) => (
            <label key={w}>
              <input type="checkbox" checked={now.ways.includes(w)}
                onChange={(e) => change({ ways: e.target.checked ? [...now.ways, w] : now.ways.filter((x) => x !== w) })} /> {t[w]}
            </label>
          ))}
        </div>
      )}
      {message && <small role="status">{message}</small>}
    </fieldset>
  );
}
