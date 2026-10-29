"use client";

// Shown at the top of the workspace to the owner (and an admin) while the current customer
// agreement or privacy notice has not been accepted: a business made before ALYR asked, or one
// that has a new version since (ALY-167, spec 031). Nobody else sees it, because only the owner
// accepts for the business. One tap records the acceptance for every version listed.

import { useCallback, useEffect, useState } from "react";
import { COPY, type Lang } from "./termsCopy";
import "./terms.css";

type Version = {
  id: string; kind: "agreement" | "privacy"; title: string; title_ar: string;
  url: string; url_ar: string; changes: string; changes_ar: string;
};

async function call<T>(url: string, method = "GET", body?: unknown): Promise<{ ok: boolean; data: T }> {
  const response = await fetch(url, {
    method, cache: "no-store",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: response.ok, data: (await response.json().catch(() => ({}))) as T };
}

export function TermsBanner({ lang, canAccept }: { lang: Lang; canAccept: boolean }) {
  const t = COPY[lang];
  const [pending, setPending] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const answer = await call<{ pending: Version[] }>("/api/onboarding/terms");
    if (answer.ok) setPending(answer.data.pending ?? []);
  }, []);
  useEffect(() => {
    if (!canAccept) return;
    const first = setTimeout(() => { load().catch(() => undefined); }, 0);
    return () => clearTimeout(first);
  }, [canAccept, load]);

  if (!canAccept || pending.length === 0) return null;

  const accept = async () => {
    setBusy(true); setError("");
    try {
      const answer = await call<{ pending: Version[] }>("/api/onboarding/terms/accept", "POST", { version_ids: pending.map((v) => v.id) });
      if (answer.ok) setPending(answer.data.pending ?? []);
      else { setError(t.failed); await load(); }
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tm-banner" role="region" aria-label={t.region}>
      <div className="tm-text">
        <h2>{t.title}</h2>
        <p>{t.sub}</p>
        <ul>
          {pending.map((v) => {
            const title = lang === "ar" ? v.title_ar : v.title;
            const what = lang === "ar" ? v.changes_ar : v.changes;
            return (
              <li key={v.id}>
                <span>{t[v.kind](title)}{what && <small>{t.changed(what)}</small>}</span>
                <a href={lang === "ar" ? v.url_ar : v.url} target="_blank" rel="noopener">{t.read}</a>
              </li>
            );
          })}
        </ul>
        {error && <p className="tm-error" role="alert">{error}</p>}
      </div>
      <button type="button" className="tm-accept" disabled={busy} onClick={accept}>{t.accept}</button>
    </section>
  );
}
