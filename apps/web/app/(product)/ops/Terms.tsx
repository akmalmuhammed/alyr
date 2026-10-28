"use client";

// The customer agreement and the privacy notice ALYR asks owners to accept (ALY-167, spec 031).
// Publishing a version makes it the current one of its kind and asks every owner once. A
// published version is never edited: a correction is a new version. The console is English only.

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type Version = {
  id: string; kind: "agreement" | "privacy"; version: string; title: string; title_ar: string;
  url: string; url_ar: string; changes: string; changes_ar: string; published_at: string;
  published_by: string; is_current: boolean;
};

const BLANK = {
  kind: "agreement" as Version["kind"], version: "", title: "", title_ar: "", url: "", url_ar: "",
  changes: "", changes_ar: "",
};
const KIND = { agreement: "Customer agreement", privacy: "Privacy notice" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function Terms() {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [draft, setDraft] = useState(BLANK);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const answer = await api<{ versions: Version[] }>("/api/admin/terms");
    if (answer.ok) setVersions(answer.data.versions);
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function publish() {
    setMessage(""); setError(""); setBusy(true);
    const answer = await api<Version>("/api/admin/terms", "POST", draft);
    setBusy(false);
    if (!answer.ok) return setError(answer.error);
    setMessage(`${KIND[draft.kind]} ${draft.version} is published. Every owner is asked to accept it once, and a new sign-up needs it.`);
    setDraft(BLANK);
    await load();
  }

  const set = (patch: Partial<typeof BLANK>) => setDraft({ ...draft, ...patch });
  const ready = draft.version.trim() && draft.title.trim() && draft.title_ar.trim() && draft.url.trim() && draft.url_ar.trim();

  return (
    <section>
      <h2>Terms and privacy <span className="sh-count">{versions?.filter((v) => v.is_current).length ?? 0}</span></h2>
      <p className="sh-note ops-lead">
        What an owner accepts when they create a business, and again when a new version is published.
        The newest version of each kind is the current one. A published version never changes: a
        correction is a new version. Each business&apos;s acceptances show on its client.
      </p>
      {message && <p className="ops-ok" role="status">{message}</p>}
      {error && <p className="ops-error" role="alert">{error}</p>}
      {versions === null ? <p className="sh-note">Loading…</p> : (
        <div className="tablewrap"><table className="ops-lines">
          <thead><tr><th>Document</th><th>Version</th><th>Published</th><th>Read it</th><th>What changed</th><th>Now</th></tr></thead>
          <tbody>
            {versions.length === 0 && <tr className="norow"><td colSpan={6}>Nothing published yet: owners are asked for nothing.</td></tr>}
            {versions.map((v) => (
              <tr key={v.id} className="norow">
                <td><b>{KIND[v.kind]}</b><br /><small>{v.title}</small></td>
                <td><code>{v.version}</code></td>
                <td>{day(v.published_at)}<br /><small>{v.published_by}</small></td>
                <td><a href={v.url} target="_blank" rel="noopener">English</a> · <a href={v.url_ar} target="_blank" rel="noopener">Arabic</a></td>
                <td>{v.changes || "—"}</td>
                <td>{v.is_current ? <span className="pill p0">Current</span> : <span className="pill none">Replaced</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      <h2>Publish a version</h2>
      <p className="sh-note ops-lead">
        Put the text on a page first (a path on alyr.qa such as /privacy, or an https address), in
        both languages. Publishing asks every owner once; it cannot be undone, so read the pages first.
      </p>
      <form className="ops-form" onSubmit={(e) => { e.preventDefault(); if (ready) publish(); }}>
        <label className="ops-field"><span>Document</span>
          <select value={draft.kind} onChange={(e) => set({ kind: e.target.value as Version["kind"] })}>
            <option value="agreement">Customer agreement</option>
            <option value="privacy">Privacy notice</option>
          </select>
        </label>
        <label className="ops-field"><span>Version (for example 2026-11-01)</span><input value={draft.version} onChange={(e) => set({ version: e.target.value })} dir="ltr" maxLength={40} /></label>
        <label className="ops-field"><span>Title in English</span><input value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={160} /></label>
        <label className="ops-field"><span>Title in Arabic</span><input value={draft.title_ar} onChange={(e) => set({ title_ar: e.target.value })} dir="rtl" lang="ar" maxLength={160} /></label>
        <label className="ops-field"><span>Page in English</span><input value={draft.url} onChange={(e) => set({ url: e.target.value })} dir="ltr" placeholder="/agreement" maxLength={300} /></label>
        <label className="ops-field"><span>Page in Arabic</span><input value={draft.url_ar} onChange={(e) => set({ url_ar: e.target.value })} dir="ltr" placeholder="/ar/agreement" maxLength={300} /></label>
        <label className="ops-field ops-wide"><span>What changed, in English (one sentence, optional)</span><input value={draft.changes} onChange={(e) => set({ changes: e.target.value })} maxLength={400} /></label>
        <label className="ops-field ops-wide"><span>What changed, in Arabic (optional)</span><input value={draft.changes_ar} onChange={(e) => set({ changes_ar: e.target.value })} dir="rtl" lang="ar" maxLength={400} /></label>
        <button className="btn primary" type="submit" disabled={busy || !ready}>Publish and ask every owner</button>
      </form>
    </section>
  );
}
