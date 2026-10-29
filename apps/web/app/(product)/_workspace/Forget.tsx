"use client";

// A customer's data: a copy to give them, and forgetting them when they ask to be deleted
// (go-live checklist item 19, ALY-119, specs/038). Owners and admins only. The screen shows what goes and what stays before anything happens; an
// open order or a booking still to come must be finished first, and the API refuses it too.

import { useState } from "react";
import { formatPrice } from "../_customer/price";
import type { Lang } from "./catalogCopy";
import { FORGET } from "./forgetCopy";
import "./forget.css";

type Preview = {
  name: string; messages: number; notes: number; orders: number; open_orders: number;
  bookings: number; upcoming: number; documents: number; owes: number;
};

/** The two quiet buttons under a conversation, and the check that forgetting opens. */
export function ForgetCustomer({ contactId, lang, onDone }: { contactId: string; lang: Lang; onDone: () => void }) {
  const t = FORGET[lang];
  const [preview, setPreview] = useState<Preview | null>(null);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setOpening(true);
    setError("");
    const response = await fetch(`/api/inbox/conversations/${contactId}/forget`, { cache: "no-store" }).catch(() => null);
    setOpening(false);
    if (response?.ok) setPreview(await response.json());
    else setError(t.failed);
  }

  async function forget() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/inbox/conversations/${contactId}/forget`, { method: "POST", cache: "no-store" }).catch(() => null);
    setBusy(false);
    if (response?.ok) { onDone(); return; }
    setError(t.failed);
    // Refused because of open work: show what is in the way now.
    if (response?.status === 409) open();
  }

  if (!preview) {
    return (
      <div className="forget-open">
        <a className="btn small ghost" href={`/api/inbox/conversations/${contactId}/export`} download title={t.exportHint}>
          {t.export}
        </a>
        <button type="button" className="btn small ghost" disabled={opening} onClick={open}>
          {opening ? t.loading : t.open}
        </button>
        {error && <small role="alert" className="err">{error}</small>}
      </div>
    );
  }
  const blocked = preview.open_orders > 0 || preview.upcoming > 0;
  return (
    <section className="forget" aria-labelledby="forget-title" dir={lang === "ar" ? "rtl" : "ltr"}>
      <h3 id="forget-title">{t.title(preview.name)}</h3>
      <p>{t.intro}</p>
      <div className="forget-cols">
        <div>
          <h4>{t.deleted}</h4>
          <ul>
            <li>{t.identity}</li>
            <li><span>{t.messages}</span><b className="mono">{preview.messages}</b></li>
            <li><span>{t.notes}</span><b className="mono">{preview.notes}</b></li>
            <li>{t.consent}</li>
          </ul>
        </div>
        <div>
          <h4>{t.kept}</h4>
          <ul>
            <li><span>{t.orders}</span><b className="mono">{preview.orders}</b></li>
            <li><span>{t.bookings}</span><b className="mono">{preview.bookings}</b></li>
            <li>{t.account}</li>
            <li><span>{t.documents}</span><b className="mono">{preview.documents}</b></li>
          </ul>
        </div>
      </div>
      {preview.owes > 0 && <p className="forget-warn">{t.owes(formatPrice(preview.owes, lang))}</p>}
      {blocked && (
        <div className="forget-warn" role="status">
          <p>{t.blocked}</p>
          <ul>
            {preview.open_orders > 0 && <li><span>{t.openOrders}</span><b className="mono">{preview.open_orders}</b></li>}
            {preview.upcoming > 0 && <li><span>{t.upcoming}</span><b className="mono">{preview.upcoming}</b></li>}
          </ul>
        </div>
      )}
      <p className="forget-note">{t.again}</p>
      <div className="forget-bar">
        <button type="button" className="btn small danger" disabled={busy || blocked} onClick={forget}>{t.confirm}</button>
        <button type="button" className="btn small ghost" disabled={busy} onClick={() => { setPreview(null); setError(""); }}>{t.cancel}</button>
        {error && <small role="alert" className="err">{error}</small>}
      </div>
    </section>
  );
}
