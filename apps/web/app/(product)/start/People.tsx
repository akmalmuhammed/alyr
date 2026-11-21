"use client";

// The people who serve customers at the same time, on the hours step (T9, D-196). A salon with
// three stylists takes three bookings in one hour, so the owner names them here instead of
// finding "People" in the workspace later. Each has a name in the language the screen is in and
// one in the other, because a customer reads the booking page in their own.

import { useState } from "react";
import { call } from "./api";
import type { Copy, Lang } from "./copy";
import { mainKey, nameChange, otherKey, type Named as Person } from "./names";

/** The name in the language the screen is not in: what customers read when they use that one.
 *  An Arabic name may be left empty (the booking page then shows the English one); an English
 *  name may not. */
export function OtherName({ row, lang, label, save }: {
  row: Person; lang: Lang; label: string; save: (change: Partial<Person>) => void;
}) {
  const key = otherKey(lang);
  const value = row[key];
  const arabic = key === "name_ar";
  return (
    <label className="ob-alt">
      <span>{label}</span>
      <input
        key={`${row.id}:${key}:${value}`} defaultValue={value} dir={arabic ? "rtl" : "ltr"} lang={arabic ? "ar" : "en"}
        onBlur={(e) => { const change = nameChange(key, row, e.target.value); if (change) save(change); }}
      />
    </label>
  );
}

export function People({ people, lang, t, onChange }: {
  people: Person[]; lang: Lang; t: Copy; onChange: () => Promise<unknown>;
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const p = t.people;
  const main = mainKey(lang);

  async function run(work: () => Promise<{ ok: boolean; status: number }>, refused?: Record<number, string>) {
    setBusy(true);
    setError("");
    try {
      const answer = await work();
      if (!answer.ok) setError(refused?.[answer.status] ?? t.offline);
      else await onChange();
    } catch {
      setError(t.offline);
    } finally {
      setBusy(false);
    }
  }
  const save = (id: string, change: Partial<Person>) => run(() => call(`/api/resources/${id}`, "PATCH", change));
  const remove = (id: string) => run(() => call(`/api/resources/${id}/active`, "POST", { active: false }), { 409: p.last });
  const add = () => run(async () => {
    const answer = await call("/api/resources", "POST", { name: newName.trim(), kind: "person" });
    if (answer.ok) setNewName("");
    return answer;
  });

  return (
    <section className="ob-card ob-people" aria-labelledby="ob-people-title">
      <h2 id="ob-people-title">{p.title}</h2>
      <p className="ob-muted">{p.sub}</p>
      <div className="ob-table" role="table" aria-label={p.title}>
        {people.map((row) => (
          <div className="ob-tr" role="row" key={row.id}>
            <input
              key={`${row.id}:${lang}:${row[main]}`} aria-label={p.name} defaultValue={row[main]} placeholder={lang === "ar" ? row.name : ""} dir="auto"
              onBlur={(e) => { const change = nameChange(main, row, e.target.value); if (change) save(row.id, change); }}
            />
            <OtherName row={row} lang={lang} label={p.other} save={(change) => save(row.id, change)} />
            <button type="button" className="ob-x" disabled={busy || people.length < 2} aria-label={`${p.remove}: ${row[main] || row.name}`} onClick={() => remove(row.id)}>×</button>
          </div>
        ))}
        <form className="ob-tr ob-add" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) add(); }}>
          <input value={newName} placeholder={p.newName} onChange={(e) => setNewName(e.target.value)} dir="auto" aria-label={p.newName} />
          <button type="submit" className="ob-btn small" disabled={!newName.trim() || busy}>{p.addIt}</button>
        </form>
      </div>
      <p className="ob-note">{p.note}</p>
      {error && <p className="ob-error" role="alert">{error}</p>}
    </section>
  );
}
