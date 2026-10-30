"use client";

// A shop the founder has visited that has no business yet (ALY-216, spec 041): a client with a
// plan. It is the smallest thing the sales link needs; the pipeline around leads is ALY-84. The
// owner's email is required because the sales link's code goes there. The console is English only.

import { useState } from "react";
import { api, type Pricing } from "./api";

const BLANK = { name: "", contact_name: "", contact_email: "", contact_phone: "", type: "", name_ar: "", area: "" };

export function NewLead({ types, onCreated, onCancel }: {
  types: Pricing["types"]; onCreated: (clientId: string) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const offered = types.filter((x) => x.availability !== "hidden");
  const set = (patch: Partial<typeof BLANK>) => setForm({ ...form, ...patch });

  async function submit() {
    setBusy(true); setError("");
    const answer = await api<{ id: string }>("/api/admin/leads", "POST", { ...form, type: form.type || offered[0]?.key });
    setBusy(false);
    if (!answer.ok) return setError(answer.error);
    onCreated(answer.data.id);
  }

  return (
    <form className="ops-form ops-newlead" onSubmit={(e) => { e.preventDefault(); submit(); }} aria-label="New lead">
      <p className="sh-note ops-wide">
        A shop you visited that has no business on ALYR yet. Its owner&apos;s email is where the
        sales link sends the code, so it is needed now.
      </p>
      <label className="ops-field"><span>Business name</span><input required value={form.name} onChange={(e) => set({ name: e.target.value })} dir="auto" /></label>
      <label className="ops-field"><span>Name in Arabic (optional)</span><input value={form.name_ar} onChange={(e) => set({ name_ar: e.target.value })} dir="rtl" lang="ar" /></label>
      <label className="ops-field"><span>Owner&apos;s name</span><input required value={form.contact_name} onChange={(e) => set({ contact_name: e.target.value })} dir="auto" /></label>
      <label className="ops-field"><span>Owner&apos;s email</span><input required type="email" dir="ltr" autoComplete="off" value={form.contact_email} onChange={(e) => set({ contact_email: e.target.value })} /></label>
      <label className="ops-field"><span>Phone (optional)</span><input dir="ltr" inputMode="tel" value={form.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} /></label>
      <label className="ops-field"><span>Type of business</span>
        <select value={form.type || offered[0]?.key || ""} onChange={(e) => set({ type: e.target.value })}>
          {offered.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
        </select>
      </label>
      <label className="ops-field"><span>Area (optional)</span><input value={form.area} onChange={(e) => set({ area: e.target.value })} dir="auto" /></label>
      {error && <p className="ops-error ops-wide" role="alert">{error}</p>}
      <div className="ops-actions ops-wide">
        <button className="btn primary" type="submit" disabled={busy || !form.name.trim() || !form.contact_name.trim() || !form.contact_email.trim()}>Make the lead</button>
        <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
