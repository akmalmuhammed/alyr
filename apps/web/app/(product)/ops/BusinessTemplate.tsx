"use client";

// Move one business to another template (ALY-148, D-039; specs/012-feature-engine). The back
// office reads exactly what it would add, then adds it. It only adds: nothing the owner has
// switched on is switched off, and nothing they made is changed. The preview carries a hash and
// the apply must carry it, so only what was read is done. "Also change the type" moves the
// business's type (onboarding and prices) to the template's, which an owner cannot do.

import { useEffect, useState } from "react";
import { api } from "./api";

type Row = { key: string; name: string };
type Choice = { key: string; name: string; builtin: boolean; note: string; type: string };
type Plan = {
  hash: string; nothing: boolean; to: Row; turn_on: Row[]; stays_on: Row[]; stay_off: Row[];
  categories: { name: string }[]; fields: { label: string }[]; fields_skipped: { label: string }[];
  wording: { section?: { from: { en: string }; to: { en: string } }; layout?: { from: string; to: string } };
};

export function BusinessTemplate({ businessId, businessName, onDone, onClose }: { businessId: string; businessName: string; onDone: () => void; onClose: () => void }) {
  const [info, setInfo] = useState<{ current: { key: string; name: string }; business_type: string; choices: Choice[] } | null>(null);
  const [picked, setPicked] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [alsoType, setAlsoType] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (info) return;
    const first = setTimeout(async () => {
      const answer = await api<NonNullable<typeof info>>(`/api/admin/businesses/${businessId}/template`);
      if (answer.ok) setInfo(answer.data); else setError(answer.error);
    }, 0);
    return () => clearTimeout(first);
  }, [info, businessId]);

  async function look(key: string) {
    setPicked(key); setPlan(null); setError(""); setDone("");
    if (!key) return;
    const answer = await api<Plan>(`/api/admin/businesses/${businessId}/template/preview?to=${encodeURIComponent(key)}`);
    if (answer.ok) setPlan(answer.data); else setError(answer.error);
  }

  async function apply() {
    if (!plan) return;
    setBusy(true); setError("");
    const answer = await api(`/api/admin/businesses/${businessId}/template`, "POST", { to: plan.to.key, preview: plan.hash, set_business_type: alsoType });
    setBusy(false);
    if (!answer.ok) return setError(answer.error);
    setDone(`${businessName} now uses ${plan.to.name}.`);
    setPlan(null); setPicked(""); setInfo(null);
    onDone();
  }

  const current = info?.choices.find((c) => c.key === picked);
  const typeDiffers = Boolean(current && current.type && current.type !== info?.business_type);

  return (
    <div className="ops-tpl">
      <b>Template · {info?.current.name ?? "…"}</b>
      <label className="ops-field">
        <span>Move {businessName} to</span>
        <select value={picked} onChange={(e) => void look(e.target.value)}>
          <option value="">Choose a template</option>
          {info?.choices.map((c) => <option key={c.key} value={c.key} disabled={c.key === info.current.key}>{c.name}{c.builtin ? "" : " (made here)"}</option>)}
        </select>
      </label>
      {plan && (
        <div className="ops-tpl-plan" aria-live="polite">
          {plan.nothing ? <p>Nothing to add: this business already has all of it.</p> : (
            <ul>
              {plan.turn_on.length > 0 && <li>Switches on: {plan.turn_on.map((x) => x.name).join(", ")}.</li>}
              {plan.categories.length > 0 && <li>Adds categories: {plan.categories.map((x) => x.name).join(", ")}.</li>}
              {plan.fields.length > 0 && <li>Adds fields: {plan.fields.map((x) => x.label).join(", ")}.</li>}
              {plan.wording.section && <li>Section name: {plan.wording.section.from.en} to {plan.wording.section.to.en}.</li>}
              {plan.wording.layout && <li>Order page layout: {plan.wording.layout.from} to {plan.wording.layout.to}.</li>}
            </ul>
          )}
          {plan.stays_on.length > 0 && <p><small>The owner has these on, and they stay on: {plan.stays_on.map((x) => x.name).join(", ")}.</small></p>}
          {typeDiffers && (
            <label className="ops-check"><input type="checkbox" checked={alsoType} onChange={(e) => setAlsoType(e.target.checked)} />Also change the business type to {current?.type} (its onboarding and prices)</label>
          )}
          <p><small>Only adds. Nothing is switched off or removed, and nothing the owner made changes.</small></p>
        </div>
      )}
      {error && <p className="ops-error" role="alert">{error}</p>}
      {done && <p className="ops-ok" role="status">{done}</p>}
      <div className="ops-actions">
        <button type="button" className="btn small primary" disabled={!plan || busy || (plan.nothing && !alsoType)} onClick={() => void apply()}>Add these</button>
        <button type="button" className="btn small" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
