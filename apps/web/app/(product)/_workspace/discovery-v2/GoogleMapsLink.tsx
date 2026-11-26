"use client";

// Set up, the Google Maps link of each place (Discovery 2.0, workstream F). The owner pastes the
// link to the place on Google Maps (or its place ID); the API keeps only the place ID and the
// check-up reads the public listing live (`GET/PUT /api/discovery/google-place`). Shown only to the
// owner and an admin, and only when the live read is switched on (`on`); otherwise nothing renders.
// The save is an outlined button: the screen's one Volt button stays "Check now". An empty field
// saved removes the place ID.

import { useEffect, useState } from "react";
import { sayError } from "../discoveryLogic";
import { discovery2, type GooglePlace } from "./api2";
import { T2 } from "./copy2";
import type { D2Lang } from "./copy";
import { Val } from "./frame";

type Row = { draft: string; state: "idle" | "saving" | "saved" | "cleared"; error: string };
const EMPTY: Row = { draft: "", state: "idle", error: "" };

export function GoogleMapsLink({ lang, canManage }: { lang: D2Lang; canManage: boolean }) {
  const t = T2[lang];
  const [places, setPlaces] = useState<GooglePlace[] | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>({});

  useEffect(() => {
    if (!canManage) return;
    let alive = true;
    discovery2.googlePlace().then((v) => { if (alive && v.on) setPlaces(v.places); }).catch(() => undefined);
    return () => { alive = false; };
  }, [canManage]);

  if (!canManage || !places || !places.length) return null;

  const set = (id: string, change: Partial<Row>) => setRows((all) => ({ ...all, [id]: { ...(all[id] ?? EMPTY), ...change } }));

  const save = async (id: string, draft: string) => {
    const link = draft.trim();
    set(id, { state: "saving", error: "" });
    try {
      const next = await discovery2.setGooglePlace(id, link);
      setPlaces(next.places);
      set(id, { state: link ? "saved" : "cleared", draft: "" });
    } catch (e) {
      set(id, { state: "idle", error: sayError(e, lang) || t.saveFailed });
    }
  };

  return (
    <section className="d2s-gm d2s-card" aria-labelledby="d2s-gm-title">
      <header>
        <h2 id="d2s-gm-title">{t.gmTitle}</h2>
        <p>{t.gmSub}</p>
      </header>
      <ul className="d2s-gm-list">
        {places.map((p) => {
          const r = rows[p.id] ?? EMPTY;
          const name = (lang === "ar" && p.nameAr) || p.name;
          const field = `d2s-gm-${p.id}`;
          const done = r.state === "saved" ? t.gmSaved : r.state === "cleared" ? t.gmCleared : "";
          return (
            <li key={p.id} className="d2s-gm-row">
              <div className="d2s-gm-head">
                <label htmlFor={field} className="d2s-gm-lab">{t.gmLabel(p.area ? `${name} · ${p.area}` : name)}</label>
                <span className="d2s-gm-now">{p.placeId ? <Val text={t.gmHave(p.placeId)} /> : t.gmNone}</span>
              </div>
              <form className="d2s-gm-form" onSubmit={(e) => { e.preventDefault(); void save(p.id, r.draft); }}>
                <input id={field} className="d2s-gm-in" type="text" inputMode="url" dir="ltr" autoComplete="off" spellCheck={false}
                  maxLength={2000} placeholder={t.gmPlaceholder} value={r.draft}
                  aria-invalid={r.error ? true : undefined} aria-describedby={r.error ? `${field}-err` : undefined}
                  onChange={(e) => set(p.id, { draft: e.target.value, state: "idle", error: "" })} />
                <button className="d2-btn d2-btn-line" type="submit" disabled={r.state === "saving" || (!r.draft.trim() && !p.placeId)}>
                  {r.state === "saving" ? t.gmSaving : t.gmSave}
                </button>
              </form>
              {r.error ? <p id={`${field}-err`} className="d2s-gm-err" role="alert">{r.error}</p> : null}
              <p className="d2-small d2-muted" role="status">{done}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
