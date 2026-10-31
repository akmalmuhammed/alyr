"use client";

// The "test business" switch for one business (specs/063, D-150). Only a business ALYR staff have
// marked here can be filled with made-up demo data by the command `python -m alyr.seed_into_business`.
// Off by default. Switching it off is always allowed and deletes nothing. English first, Arabic
// beneath, from the copy object.

import { useState } from "react";
import { api, type Business } from "./api";
import { T } from "./BusinessDemoData.copy";

export function BusinessDemoData({ business }: { business: Business }) {
  const [allowed, setAllowed] = useState(business.demo_data_allowed);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  async function change(next: boolean) {
    setBusy(true); setFailed(false); setSaved(null);
    const answer = await api<{ demo_data_allowed: boolean }>(`/api/admin/businesses/${business.id}/demo-data`, "POST", { allowed: next });
    setBusy(false);
    if (!answer.ok) return setFailed(true);
    setAllowed(next); setSaved(next);
  }

  const id = `demo-${business.id}`;
  return (
    <div className="ops-demo">
      <b>{business.name}</b>
      <label className="ops-demo-switch" htmlFor={id}>
        <input id={id} type="checkbox" role="switch" checked={allowed} disabled={busy} aria-describedby={`${id}-help`} onChange={(e) => change(e.target.checked)} />
        <span>
          <span lang="en" dir="ltr">{T.en.label}</span>
          <span lang="ar" dir="rtl">{T.ar.label}</span>
        </span>
      </label>
      <p id={`${id}-help`} className="ops-demo-help">
        <span lang="en" dir="ltr">{T.en.help}</span>
        <span lang="ar" dir="rtl">{T.ar.help}</span>
      </p>
      {business.demo_data_loaded && (
        <p className="ops-demo-loaded">
          <span lang="en" dir="ltr">{T.en.loaded}</span>
          <span lang="ar" dir="rtl">{T.ar.loaded}</span>
        </p>
      )}
      <div role="status" className="ops-demo-status">
        {busy && <small><span lang="en" dir="ltr">{T.en.saving}</span> <span lang="ar" dir="rtl">{T.ar.saving}</span></small>}
        {saved !== null && !busy && (
          <small>
            <span lang="en" dir="ltr">{saved ? T.en.savedOn : T.en.savedOff}</span>
            <span lang="ar" dir="rtl">{saved ? T.ar.savedOn : T.ar.savedOff}</span>
          </small>
        )}
      </div>
      {failed && (
        <p className="ops-error" role="alert">
          <span lang="en" dir="ltr">{T.en.failed}</span>{" "}
          <span lang="ar" dir="rtl">{T.ar.failed}</span>
        </p>
      )}
    </div>
  );
}
