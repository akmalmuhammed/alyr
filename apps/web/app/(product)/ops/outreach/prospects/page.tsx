"use client";

// Prospects (specs/065, ALY-311): every business in outreach, filtered by stage, country and a
// search; add one by hand (the basis is required, from the bases its country allows), import a
// CSV, or queue a discovery. `?id=` opens one prospect; `?stage=` is what the overview's counts
// link to. A list on a laptop, one card per prospect on a phone.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { BASIS, LANE, STAGE, STAGE_ORDER, W } from "../copy";
import { useOverview } from "../Frame";
import {
  basesFor, checkCsv, countriesOffered, countStages, CSV_COLUMNS, CSV_REQUIRED, EMPTY_PROSPECT, filterProspects,
  laneTone, policyFor, prospectErrors, stageTone, when, type Filters, type ProspectForm,
} from "../outreachLogic";
import { Empty, Failed, Pill } from "../parts";
import type { CountryPolicy, DiscoverResult, ImportResult, ProspectRow, Settings } from "../types";
import { ProspectView } from "./ProspectView";

const P = W.prospects;

export default function ProspectsPage() {
  return <Suspense fallback={<p className="sh-note">{W.loading}</p>}><Prospects /></Suspense>;
}

type Panel = "" | "add" | "import" | "discover";

function Prospects() {
  const query = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const openId = query.get("id") ?? "";
  const stageParam = (query.get("stage") ?? "") as Filters["stage"];

  const [rows, setRows] = useState<ProspectRow[] | null>(null);
  const [error, setError] = useState("");
  const [country, setCountry] = useState("");
  const [q, setQ] = useState("");
  const [panel, setPanel] = useState<Panel>("");
  const [policy, setPolicy] = useState<CountryPolicy[] | undefined>(undefined);
  const filters: Filters = useMemo(() => ({ stage: stageParam, country, q }), [stageParam, country, q]);

  // The whole list once; the filters run here, so the stage counts stay whole and typing answers
  // at once. GET /prospects also takes stage, country and q for when the list grows long.
  const load = useCallback(async () => {
    const answer = await api<{ prospects: ProspectRow[] }>("/api/admin/outreach/prospects");
    if (answer.ok) { setRows(answer.data.prospects); setError(""); } else setError(answer.error || W.loadError);
  }, []);

  useEffect(() => {
    const first = setTimeout(async () => {
      load();
      const settings = await api<Settings>("/api/admin/outreach/settings");
      if (settings.ok && settings.data.policy?.length) setPolicy(settings.data.policy);
    }, 0);
    return () => clearTimeout(first);
  }, [load]);

  const go = (params: Record<string, string>) => {
    const next = new URLSearchParams(query.toString());
    for (const [k, v] of Object.entries(params)) { if (v) next.set(k, v); else next.delete(k); }
    const s = next.toString();
    router.push(s ? `${path}?${s}` : path, { scroll: false });
  };

  if (openId) {
    return <ProspectView id={openId} back={() => { go({ id: "" }); load(); }} />;
  }

  const shown = rows ? filterProspects(rows, filters) : [];
  const counts = rows ? countStages(rows) : {};
  const countries = [...new Set((rows ?? []).map((r) => r.country))].sort();
  const filtered = Boolean(filters.stage || filters.country || filters.q.trim());

  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">{P.eyebrow}</span>
        <h1>{P.title}</h1>
        <p>{P.lead}</p>
      </header>

      <div className="or-actions">
        {(["add", "import", "discover"] as const).map((k) => (
          <button key={k} type="button" className={`btn ${panel === k ? "primary" : ""}`} aria-expanded={panel === k} onClick={() => setPanel(panel === k ? "" : k)}>
            {P[k]}
          </button>
        ))}
      </div>
      {panel === "add" && <AddForm policy={policy} close={() => setPanel("")} added={(id) => { setPanel(""); load(); go({ id }); }} />}
      {panel === "import" && <ImportForm policy={policy} done={load} />}
      {panel === "discover" && <DiscoverForm policy={policy} />}

      {error && !rows && <Failed message={error} retry={load} />}
      {!rows && !error && <p className="sh-note">{W.loading}</p>}
      {rows && rows.length === 0 && (
        <Empty title={P.emptyTitle} text={P.emptyText} slots={3} />
      )}
      {rows && rows.length > 0 && (
        <section>
          <div className="ops-toolbar or-filters">
            <label className="ops-field"><span>{P.stage}</span>
              <select value={filters.stage} onChange={(e) => go({ stage: e.target.value })}>
                <option value="">{P.anyStage} ({rows.length})</option>
                <option value="attention">{P.attention} ({(counts.in_review ?? 0) + (counts.needs_human ?? 0)})</option>
                {STAGE_ORDER.filter((s) => counts[s] || s === filters.stage).map((s) => (
                  <option key={s} value={s}>{STAGE[s]} ({counts[s] ?? 0})</option>
                ))}
              </select>
            </label>
            <label className="ops-field"><span>{P.country}</span>
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">{P.anyCountry}</option>
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="ops-field or-search"><span>{P.search}</span>
              <input type="search" value={q} placeholder={P.searchHint} onChange={(e) => setQ(e.target.value)} />
            </label>
            {filtered && <button type="button" className="btn small ghost" onClick={() => { setCountry(""); setQ(""); go({ stage: "" }); }}>{P.clear}</button>}
          </div>
          {shown.length === 0 ? <p className="sh-note or-none">{P.none}</p> : (
            <div className="tablewrap ops-list or-prospects"><table>
              <caption className="ops-sr">{P.title}</caption>
              <thead><tr>
                <th scope="col">{P.columns.company}</th><th scope="col">{P.columns.country}</th><th scope="col">{P.columns.contact}</th>
                <th scope="col">{P.columns.stage}</th><th scope="col" className="r">{P.columns.fit}</th><th scope="col">{P.columns.updated}</th>
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="ops-row" tabIndex={0} onClick={() => go({ id: r.id })}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go({ id: r.id }); } }}>
                    <td>
                      <a href={`${path}?id=${r.id}`} onClick={(e) => { e.preventDefault(); go({ id: r.id }); }} className="or-row-name"><b>{r.company}</b></a>
                      <br /><small>{r.domain}{r.business_type ? ` · ${r.business_type}` : ""}</small>
                    </td>
                    <td data-label={P.columns.country}><Pill tone={laneTone(r.lane)}>{r.country} · {LANE[r.lane]}</Pill></td>
                    <td data-label={P.columns.contact}>{r.contact_first_name || "—"}{r.contact_role && <small> · {r.contact_role}</small>}</td>
                    <td data-label={P.columns.stage}>
                      <Pill tone={stageTone(r.stage)}>{STAGE[r.stage]}</Pill>
                      {r.paused && <> <Pill tone="wait">{P.paused}</Pill></>}
                    </td>
                    <td className="r num" data-label={P.columns.fit}>{r.fit_score ?? "—"}</td>
                    <td data-label={P.columns.updated}><small>{when(r.updated_at)}</small></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
      )}
    </>
  );
}

// ── add by hand ─────────────────────────────────────────────────────────────────────────────

function AddForm({ policy, close, added }: { policy?: CountryPolicy[]; close: () => void; added: (id: string) => void }) {
  const A = W.add;
  const { refresh } = useOverview();
  const [form, setForm] = useState<ProspectForm>(EMPTY_PROSPECT);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errors = prospectErrors(form, policy);
  const row = policyFor(form.country, policy);
  const bases = basesFor(form.country, policy);
  const set = (k: keyof ProspectForm, v: string) => setForm((f) => {
    const next = { ...f, [k]: v };
    // A basis the new country does not allow is cleared, never carried over.
    if (k === "country" && f.basis && !basesFor(v, policy).includes(f.basis)) next.basis = "";
    return next;
  });
  const shown = (k: keyof ProspectForm) => (tried && errors[k] ? <small className="or-field-error" id={`e-${k}`}>{errors[k]}</small> : null);
  const field = (k: keyof ProspectForm, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="ops-field">
      <span>{label}</span>
      <input value={form[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={tried && !!errors[k]} aria-describedby={tried && errors[k] ? `e-${k}` : undefined} {...extra} />
      {shown(k)}
    </label>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true); setError("");
    if (Object.keys(errors).length) return;
    setBusy(true);
    const answer = await api<{ id: string }>("/api/admin/outreach/prospects", "POST", { ...form, country: form.country.toUpperCase() });
    setBusy(false);
    if (!answer.ok) return setError(answer.error);
    refresh();
    added(answer.data.id);
  }

  return (
    <form className="ops-form or-form" onSubmit={submit} noValidate>
      <div className="ops-wide or-form-head">
        <h2>{A.title}</h2>
        <button type="button" className="btn small ghost" onClick={close}>{P.close}</button>
      </div>
      <p className="ops-wide sh-note">{A.help}</p>
      {field("company", A.company, { autoComplete: "organization" })}
      {field("website", A.website, { type: "url", inputMode: "url", placeholder: "https://" })}
      <label className="ops-field">
        <span>{A.country}</span>
        <select value={form.country} onChange={(e) => set("country", e.target.value)}>
          {countriesOffered(policy).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <small className="or-field-help">{row.lane === "blocked" ? A.blocked : A.lane(LANE[row.lane], row.cap)}</small>
      </label>
      <label className="ops-field">
        <span>{A.basis}</span>
        <select value={form.basis} onChange={(e) => set("basis", e.target.value)} aria-invalid={tried && !!errors.basis} aria-describedby={tried && errors.basis ? "e-basis" : undefined}>
          <option value="">{A.basisPick}</option>
          {bases.map((b) => <option key={b} value={b}>{BASIS[b]}</option>)}
        </select>
        {shown("basis")}
      </label>
      {field("basis_note", A.basisNote)}
      {field("contact_first_name", A.firstName, { autoComplete: "off" })}
      {field("contact_last_name", A.lastName, { autoComplete: "off" })}
      {field("contact_role", A.role)}
      {field("contact_email", A.email, { type: "email", inputMode: "email", autoComplete: "off" })}
      <label className="ops-field">
        <span>{A.language}</span>
        <select value={form.language} onChange={(e) => set("language", e.target.value)}>
          <option value="en">{A.english}</option>
          <option value="ar">{A.arabic}</option>
        </select>
      </label>
      <label className="ops-field ops-wide">
        <span>{A.notes}</span>
        <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </label>
      {error && <p className="ops-error ops-wide" role="alert">{error}</p>}
      <div className="ops-wide or-actions">
        <button type="submit" className="btn primary" disabled={busy}>{busy ? A.adding : A.submit}</button>
      </div>
    </form>
  );
}

// ── import a CSV ────────────────────────────────────────────────────────────────────────────

function ImportForm({ policy, done }: { policy?: CountryPolicy[]; done: () => void }) {
  const I = W.importCsv;
  const { refresh } = useOverview();
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const check = text ? checkCsv(text, policy) : null;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setResult(null); setError("");
    if (!file) { setText(""); setName(""); return; }
    setName(file.name);
    setText(await file.text());
  }

  async function send() {
    setBusy(true); setError("");
    const answer = await api<ImportResult>("/api/admin/outreach/prospects/import", "POST", { csv: text });
    setBusy(false);
    if (!answer.ok) return setError(answer.error);
    setResult(answer.data);
    refresh(); done();
  }

  return (
    <section className="ops-form or-form">
      <h2 className="ops-wide">{I.title}</h2>
      <p className="ops-wide sh-note">
        {I.help} <code>{CSV_COLUMNS.join(", ")}</code>. {I.required} <code>{CSV_REQUIRED.join(", ")}</code>.
      </p>
      <label className="ops-field ops-wide">
        <span>{I.file}</span>
        <input type="file" accept=".csv,text/csv" onChange={pick} />
      </label>
      {check && (
        <div className="ops-wide or-csv">
          <p><b>{name}</b> · {I.rows(check.rows)}</p>
          {check.missing.length > 0 && <p className="ops-error">{I.missing(check.missing)}</p>}
          {check.unknown.length > 0 && <p className="sh-note">{I.unknown(check.unknown)}</p>}
          {check.problems.length > 0 && <>
            <h3>{I.problems}</h3>
            <ul className="or-csv-problems">{check.problems.map((p) => <li key={p.row}>{I.row} {p.row}: {p.reason}</li>)}</ul>
          </>}
        </div>
      )}
      {result && (
        <div className="ops-wide or-csv" role="status">
          <p className="ops-ok">{I.done(result.added, result.skipped.length)}</p>
          {result.skipped.length > 0 && <ul className="or-csv-problems">{result.skipped.map((s) => <li key={s.row}>{I.row} {s.row}: {s.reason}</li>)}</ul>}
        </div>
      )}
      {error && <p className="ops-error ops-wide" role="alert">{error}</p>}
      <div className="ops-wide or-actions">
        <button type="button" className="btn primary" disabled={busy || !check || check.missing.length > 0 || check.rows === 0} onClick={send}>
          {busy ? I.importing : I.submit}
        </button>
      </div>
    </section>
  );
}

// ── discovery ───────────────────────────────────────────────────────────────────────────────

function DiscoverForm({ policy }: { policy?: CountryPolicy[] }) {
  const D = W.discover;
  const [form, setForm] = useState({ query: "", country: "QA", limit: "10" });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");
  const limit = Number(form.limit);
  const errors = {
    query: form.query.trim() ? "" : D.queryError,
    limit: /^\d+$/.test(form.limit) && limit >= 1 && limit <= 25 ? "" : D.limitError,
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true); setError(""); setSaid("");
    if (errors.query || errors.limit) return;
    setBusy(true);
    const answer = await api<DiscoverResult>("/api/admin/outreach/discover", "POST", { query: form.query.trim(), country: form.country, limit });
    setBusy(false);
    if (!answer.ok) return setError(answer.error);
    setSaid(D.queued);
  }

  return (
    <form className="ops-form or-form" onSubmit={submit} noValidate>
      <h2 className="ops-wide">{D.title}</h2>
      <p className="ops-wide sh-note">{D.help}</p>
      <label className="ops-field ops-wide">
        <span>{D.query}</span>
        <input value={form.query} placeholder={D.queryHint} onChange={(e) => setForm({ ...form, query: e.target.value })} aria-invalid={tried && !!errors.query} />
        {tried && errors.query && <small className="or-field-error">{errors.query}</small>}
      </label>
      <label className="ops-field">
        <span>{D.country}</span>
        <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
          {countriesOffered(policy).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="ops-field">
        <span>{D.limit}</span>
        <input inputMode="numeric" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} aria-invalid={tried && !!errors.limit} />
        {tried && errors.limit && <small className="or-field-error">{errors.limit}</small>}
      </label>
      {said && <p className="ops-ok" role="status">{said}</p>}
      {error && <p className="ops-error ops-wide" role="alert">{error}</p>}
      <div className="ops-wide or-actions">
        <button type="submit" className="btn primary" disabled={busy}>{busy ? D.queuing : D.submit}</button>
      </div>
    </form>
  );
}

