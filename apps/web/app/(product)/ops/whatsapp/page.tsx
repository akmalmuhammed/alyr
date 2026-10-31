"use client";

// WhatsApp lines (ALY-166, specs/060-whatsapp-line): every business with a Meta number attached,
// where its line stands, and what staff can do about it: check it against Meta, send one test
// message to the shop's own staff, read the line's trail. English and Arabic (RTL), switchable
// here; the rest of the console is English. Nothing here shows a customer's words or number.

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../api";
import { T, type Lang, type Words } from "./copy";

type State = "unchecked" | "problem" | "waiting" | "working";
type Check = { key: string; ok: boolean | null; value: string; error?: string };
type Test = { status: string; error: string; at: string; by: string; ok: boolean };
type Tpl = {
  name: string; language: string; category: string; status: string; meta_status: string;
  reason: string; advice: string; held: string; in_catalogue: boolean;
};
type TplPlan = { name: string; language: string; action: string; reason: string };
type TplView = {
  rows: Tpl[]; plan: TplPlan[]; submit_on: boolean;
  counts: { wanted: number; by_status: Record<string, number>; held: number; extra: number };
  results?: { name: string; language: string; result: string; note: string }[];
};
type Health = {
  severity: "unknown" | "ok" | "attention" | "critical";
  reasons: { code: string; level: string; scope: string; value: string }[];
  quality_rating: string; number_status: string; messaging_limit: string; health: string;
  name_decision: string; name_reason: string; review: string;
  restrictions: { type: string; expires: string | null }[];
  alerts: { type: string; severity: string; description: string }[];
  polled_at: string | null; event_at: string | null;
};
type LineRow = {
  business_id: string; name: string; slug: string; number_id: string; waba_id: string;
  display_phone: string; attached_at: string | null; attached_by: string; state: State;
  checked_at: string | null; checks: Check[]; test: Test | null; last_inbound_at: string | null;
  staff_numbers: number;
  templates?: { wanted: number; by_status: Record<string, number>; problems: number };
  health: Health;
};
type Tester = { id: string; label: string; phone: string; window_open: boolean };
type Event = { at: string; kind: string; ok: boolean | null; actor: string; detail: Record<string, unknown> };
type Detail = { line: LineRow | null; testers: Tester[]; events: Event[] };
type Lines = { lines: LineRow[]; counts: Record<State, number> };

const PILL: Record<State, string> = { working: "active", problem: "bad", waiting: "wait", unchecked: "idle" };
const KEY = "alyr-ops-lang";
const TPL_PILL: Record<string, string> = {
  approved: "active", submitted: "wait", draft: "idle", deleted: "idle",
  rejected: "bad", paused: "bad", flagged: "bad", disabled: "bad",
};
const PROBLEM = ["rejected", "paused", "flagged", "disabled"];
const SEVERITY_PILL: Record<string, string> = { ok: "active", attention: "wait", critical: "bad", unknown: "idle" };

// The detail of a template event on the trail: which template, and where it now stands.
function eventNote(e: { kind: string; detail: Record<string, unknown> }): string {
  const d = e.detail;
  if (e.kind === "template") {
    const where = (d.status ?? d.category ?? "") as string;
    return `${d.name ?? ""} · ${String(d.language ?? "").toUpperCase()} · ${where}${d.reason ? ` (${d.reason})` : ""}`;
  }
  if (e.kind === "quality" || e.kind === "limit") return `${d.from ?? ""} → ${d.to ?? ""}`;
  if (e.kind === "health") return `${d.from ?? ""} → ${d.to ?? ""}`;
  if (e.kind === "account") return `${d.event ?? ""}${d.type ? ` ${d.type}` : ""}`;
  if (e.kind === "name") return `${d.decision ?? ""}`;
  if (e.kind === "templates_synced") return `${d.approved ?? 0}/${d.wanted ?? 0}`;
  if (e.kind === "templates_submitted") return `${d.submitted ?? 0}`;
  return "";
}

function when(iso: string | null, lang: Lang, never: string): string {
  if (!iso) return never;
  // Western digits in both languages (alyr-design: Arabic.7); the month in the page's language.
  return new Date(iso).toLocaleString(lang === "ar" ? "ar-QA-u-nu-latn" : "en-GB", {
    timeZone: "Asia/Qatar", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function seen(c: Check, w: Words, lang: Lang): string {
  if (c.error) return c.error;
  if (c.key === "inbound") return c.ok ? when(c.value, lang, w.never) : w.notYet;
  if (c.key === "outbound") return c.ok ? w.outboundCount(c.value) : w.notYet;
  return w.checkValues[c.value] ?? c.value;
}

export default function WhatsappLines() {
  const [lang, setLang] = useState<Lang>("en");
  const [data, setData] = useState<Lines | null>(null);
  const [show, setShow] = useState<State | "all">("all");
  const [open, setOpen] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tpl, setTpl] = useState<TplView | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState("");
  const [who, setWho] = useState("");
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");
  const w: Words = T[lang];

  const load = useCallback(async () => {
    const answer = await api<Lines>("/api/admin/whatsapp/lines");
    if (answer.ok) setData(answer.data);
    else setError(answer.error || T.en.errors.load);
  }, []);
  const read = useCallback(async (id: string) => {
    const answer = await api<Detail>(`/api/admin/businesses/${id}/whatsapp/line`);
    if (answer.ok) { setDetail(answer.data); setWho((now) => now || answer.data.testers.find((t) => t.window_open)?.id || ""); }
    const templates = await api<TplView>(`/api/admin/businesses/${id}/whatsapp/templates`);
    if (templates.ok) setTpl((now) => (now?.results ? { ...templates.data, results: now.results } : templates.data));
  }, []);

  useEffect(() => {
    const first = setTimeout(() => {
      try { if (localStorage.getItem(KEY) === "ar") setLang("ar"); } catch { /* no storage: English */ }
      const id = new URLSearchParams(window.location.search).get("business") ?? "";
      if (id) { setOpen(id); read(id); }
      load();
    }, 0);
    return () => clearTimeout(first);
  }, [load, read]);

  function switchLang() {
    const next: Lang = lang === "en" ? "ar" : "en";
    setLang(next);
    try { localStorage.setItem(KEY, next); } catch { /* the choice is only remembered when storage works */ }
  }
  function toggle(id: string) {
    setSaid(""); setWho(""); setTpl(null); setShowAll(false);
    if (open === id) { setOpen(""); setDetail(null); return; }
    setOpen(id); setDetail(null); read(id);
  }
  async function templates(id: string, what: "sync" | "submit") {
    setBusy(what); setError(""); setSaid("");
    const answer = await api<TplView>(`/api/admin/businesses/${id}/whatsapp/templates/${what}`, "POST", what === "submit" ? { names: [] } : undefined);
    setBusy("");
    if (!answer.ok) return setError(answer.error);
    setTpl(answer.data);
    if (what === "submit") {
      const results = answer.data.results ?? [];
      setSaid(w.tpl.submitted(results.filter((r) => r.result !== "refused").length, results.filter((r) => r.result === "refused").length));
    }
    await load();
  }
  async function run(id: string, what: "check" | "test") {
    setBusy(what); setError(""); setSaid("");
    const answer = what === "check"
      ? await api(`/api/admin/businesses/${id}/whatsapp/line/check`, "POST")
      : await api<{ blocked: string | null }>(`/api/admin/businesses/${id}/whatsapp/line/test`, "POST", { contact_id: who });
    setBusy("");
    if (!answer.ok) return setError(answer.error);
    if (what === "test") {
      const blocked = (answer.data as { blocked: string | null }).blocked;
      setSaid(blocked ? w.sentBlocked(blocked.replaceAll("_", " ")) : w.sentOk);
    }
    await Promise.all([load(), read(id)]);
  }

  const lines = data?.lines ?? [];
  const rows = lines.filter((l) => show === "all" || l.state === show);
  const count = (s: State | "all") => (s === "all" ? lines.length : data?.counts[s] ?? 0);

  return (
    <div className="wl" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <header className="sh-head">
        <div className="wl-top">
          <span className="sh-eyebrow">{w.eyebrow}</span>
          <button type="button" className="btn small ghost" onClick={switchLang} aria-label={w.languageLabel} lang={lang === "en" ? "ar" : "en"}>{w.language}</button>
        </div>
        <h1>{w.title}</h1>
        <p>{w.lead}</p>
      </header>
      <nav className="tm-seg ops-tabs" role="tablist" aria-label={w.state}>
        {(["all", "problem", "waiting", "working", "unchecked"] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={show === s} onClick={() => setShow(s)}>
            {w[s]} <span className="num">{count(s)}</span>
          </button>
        ))}
      </nav>
      {error && <p className="sh-note" role="alert">{error}</p>}
      {data && lines.length === 0 ? <p className="sh-note">{w.none}</p> : rows.length === 0 ? <p className="sh-note">{data ? w.nothingHere : ""}</p> : (
        <div className="tablewrap ops-list wl-table"><table>
          <thead><tr><th>{w.business}</th><th>{w.line}</th><th>{w.state}</th><th>{w.lastCheck}</th><th>{w.lastMessage}</th><th>{w.templatesColumn}</th><th /></tr></thead>
          <tbody>
            {rows.map((l) => (
              <Fragment key={l.business_id}>
                <tr className="norow">
                  <td><b>{l.name}</b><br /><small>{l.slug}</small></td>
                  <td data-label={w.line}><span dir="ltr">{l.display_phone || l.number_id}</span><br /><small dir="ltr">{l.number_id}</small></td>
                  <td data-label={w.state}>
                    <span className={`sh-pill ${PILL[l.state]}`}>{w.states[l.state]}</span>
                    {l.health.reasons[0] && <><br /><small>{w.health.reasons[l.health.reasons[0].code] ?? l.health.reasons[0].code}{l.health.reasons.length > 1 ? ` (+${l.health.reasons.length - 1})` : ""}</small></>}
                  </td>
                  <td data-label={w.lastCheck}>{when(l.checked_at, lang, w.never)}</td>
                  <td data-label={w.lastMessage}>{l.last_inbound_at ? when(l.last_inbound_at, lang, w.never) : w.notYet}</td>
                  <td data-label={w.templatesColumn}>
                    {l.templates ? <>
                      <span dir="ltr">{l.templates.by_status.approved ?? 0}/{l.templates.wanted}</span>
                      {l.templates.problems > 0 && <> <span className="sh-pill bad">{w.tpl.problems(l.templates.problems)}</span></>}
                    </> : null}
                  </td>
                  <td className="r">
                    <button className="btn small" type="button" disabled={busy !== ""} onClick={() => { toggle(l.business_id); }} aria-expanded={open === l.business_id}>
                      {open === l.business_id ? w.close : w.details}
                    </button>
                  </td>
                </tr>
                {open === l.business_id && (
                  <tr className="norow">
                    <td colSpan={7}>
                      <div className="wl-detail">
                        <div className="wl-actions">
                          <button className="btn small" type="button" disabled={busy !== ""} onClick={() => run(l.business_id, "check")}>
                            {busy === "check" ? w.checking : w.check}
                          </button>
                          <Link className="ops-link" href="/ops/onboarding">{w.openOnboarding}</Link>
                        </div>
                        <h3>{w.checksTitle}</h3>
                        {l.checks.length === 0 ? <p className="sh-note">{w.unchecked}</p> : (
                          <ul className="wl-checks">
                            {l.checks.map((c) => (
                              <li key={c.key} className={c.ok === false ? "bad" : c.ok ? "ok" : ""}>
                                <span aria-hidden className="wl-mark">{c.ok === false ? "✕" : c.ok ? "✓" : "○"}</span>
                                <b>{w.checkNames[c.key as keyof Words["checkNames"]] ?? c.key}</b>
                                <span>{seen(c, w, lang)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <h3>{w.health.title}</h3>
                        <p className="sh-note">{w.health.help}</p>
                        <div className="wl-health">
                          <p>
                            <span className={`sh-pill ${SEVERITY_PILL[l.health.severity]}`}>{w.health.severity[l.health.severity]}</span>
                          </p>
                          {l.health.reasons.length > 0 && (
                            <ul className="wl-reasons">
                              {l.health.reasons.map((r) => (
                                <li key={`${r.code}:${r.value}`} className={r.level === "critical" ? "bad" : ""}>
                                  {w.health.reasons[r.code] ?? r.code}{r.value && <> (<bdi dir="ltr">{r.value}</bdi>)</>}
                                </li>
                              ))}
                            </ul>
                          )}
                          {l.health.reasons.some((r) => r.scope === "account") && <small>{w.health.shared}</small>}
                          <dl className="wl-facts">
                            <div><dt>{w.health.facts.quality}</dt><dd>{l.health.quality_rating ? w.health.quality[l.health.quality_rating] ?? l.health.quality_rating : w.health.unknown}</dd></div>
                            <div><dt>{w.health.facts.status}</dt><dd dir="ltr">{l.health.number_status || w.health.unknown}</dd></div>
                            <div><dt>{w.health.facts.limit}</dt><dd>{l.health.messaging_limit ? w.health.limit[l.health.messaging_limit] ?? l.health.messaging_limit : w.health.unknown}</dd></div>
                            <div><dt>{w.health.facts.sending}</dt><dd>{l.health.health ? w.health.sending[l.health.health] ?? l.health.health : w.health.unknown}</dd></div>
                            <div><dt>{w.health.facts.name}</dt><dd>{l.health.name_decision ? w.health.decision[l.health.name_decision] ?? l.health.name_decision : w.health.unknown}</dd></div>
                            <div><dt>{w.health.facts.review}</dt><dd>{l.health.review ? w.health.decision[l.health.review] ?? l.health.review : w.health.unknown}</dd></div>
                          </dl>
                          {l.health.restrictions.length > 0 && (
                            <p><b>{w.health.restrictions}:</b> {l.health.restrictions.map((x) => (
                              <span key={x.type}><bdi dir="ltr">{x.type}</bdi>{x.expires ? ` ${w.health.until} ${when(x.expires, lang, w.never)}` : ""} </span>
                            ))}</p>
                          )}
                          {l.health.alerts.length > 0 && (
                            <p><b>{w.health.alerts}:</b> {l.health.alerts.map((x) => <span key={x.type}><bdi dir="ltr">{x.type}</bdi> </span>)}</p>
                          )}
                          <small>
                            {w.health.read}: {when(l.health.polled_at, lang, w.never)} · {w.health.notice}: {when(l.health.event_at, lang, w.never)}
                          </small>
                        </div>
                        <h3>{w.testTitle}</h3>
                        <p className="sh-note">{w.testHelp}</p>
                        {detail?.line?.business_id === l.business_id && (
                          detail.testers.length === 0 ? <p className="sh-note">{w.noTesters}</p> : (
                            <div className="ops-step">
                              <label className="wl-pick">
                                <span>{w.staffWho}</span>
                                <select value={who} onChange={(e) => setWho(e.target.value)}>
                                  {detail.testers.map((t) => (
                                    <option key={t.id} value={t.id} disabled={!t.window_open}>
                                      {t.label} · {t.phone}{t.window_open ? "" : ` · ${w.windowShut}`}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button className="btn small" type="button" disabled={busy !== "" || !who} onClick={() => run(l.business_id, "test")}>
                                {busy === "test" ? w.sending : w.send}
                              </button>
                            </div>
                          )
                        )}
                        {said && <p className="sh-note" role="status">{said}</p>}
                        {l.test && (
                          <p className="wl-test">
                            <b>{w.testLast}:</b> {w.testStatus[l.test.status] ?? l.test.status} · {when(l.test.at, lang, w.never)} · {w.by} {l.test.by}
                            {l.test.error && <> · {w.failedPrefix} {l.test.error}</>}
                          </p>
                        )}
                        <h3>{w.tpl.title}</h3>
                        <p className="sh-note">{w.tpl.help}</p>
                        {tpl && (
                          <div className="wl-tpl">
                            <p className="wl-tpl-counts">
                              <b>{w.tpl.approved(tpl.counts.by_status.approved ?? 0, tpl.counts.wanted)}</b>
                              {(tpl.counts.by_status.submitted ?? 0) > 0 && <> · {w.tpl.review(tpl.counts.by_status.submitted)}</>}
                              {(tpl.counts.by_status.draft ?? 0) - tpl.counts.held > 0 && <> · {w.tpl.draft((tpl.counts.by_status.draft ?? 0) - tpl.counts.held)}</>}
                              {tpl.counts.held > 0 && <> · {w.tpl.held(tpl.counts.held)}</>}
                              {tpl.counts.extra > 0 && <> · {w.tpl.extra(tpl.counts.extra)}</>}
                            </p>
                            <div className="wl-actions">
                              <button className="btn small" type="button" disabled={busy !== ""} onClick={() => templates(l.business_id, "sync")}>
                                {busy === "sync" ? w.tpl.reading : w.tpl.read}
                              </button>
                              {tpl.submit_on && (
                                <button className="btn small ghost" type="button" disabled={busy !== "" || tpl.plan.every((p) => p.action !== "create" && p.action !== "edit")}
                                  onClick={() => templates(l.business_id, "submit")}>
                                  {busy === "submit" ? w.tpl.submitting : w.tpl.submit}
                                </button>
                              )}
                            </div>
                            {!tpl.submit_on && <p className="sh-note">{w.tpl.submitOff}</p>}
                            {tpl.rows.some((r) => PROBLEM.includes(r.status)) && <>
                              <h4>{w.tpl.need}</h4>
                              <ul className="wl-tpl-problems">
                                {tpl.rows.filter((r) => PROBLEM.includes(r.status)).map((r) => (
                                  <li key={`${r.name}:${r.language}`}>
                                    <span dir="ltr"><b>{r.name}</b> · {r.language.toUpperCase()}</span>
                                    <span className="sh-pill bad">{w.tpl.statuses[r.status]}</span>
                                    <small>{r.reason && <>{w.tpl.why}: <bdi>{r.reason}</bdi></>}{r.advice && <> · {w.tpl.advice}: <bdi>{r.advice}</bdi></>}</small>
                                  </li>
                                ))}
                              </ul>
                            </>}
                            <h4>{w.tpl.plan}</h4>
                            {tpl.plan.length === 0 ? <p className="sh-note">{w.tpl.planNone}</p> : (
                              <ul className="wl-tpl-plan">
                                {tpl.plan.map((p) => (
                                  <li key={`${p.name}:${p.language}`}>
                                    <span dir="ltr">{p.name} · {p.language.toUpperCase()}</span>
                                    <small>{w.tpl.actions[p.action] ?? p.action}</small>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <button className="btn small ghost" type="button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{w.tpl.all} ({tpl.rows.length})</button>
                            {showAll && (
                              <div className="tablewrap wl-tpl-all"><table>
                                <thead><tr><th>{w.tpl.columns.name}</th><th>{w.tpl.columns.language}</th><th>{w.tpl.columns.category}</th><th>{w.tpl.columns.status}</th></tr></thead>
                                <tbody>
                                  {tpl.rows.map((r) => (
                                    <tr key={`${r.name}:${r.language}`} className="norow">
                                      <td dir="ltr">{r.name}{r.in_catalogue ? "" : ` · ${w.tpl.extraRow}`}</td>
                                      <td dir="ltr">{r.language.toUpperCase()}</td>
                                      <td dir="ltr">{r.category}</td>
                                      <td><span className={`sh-pill ${TPL_PILL[r.status] ?? ""}`}>{w.tpl.statuses[r.status] ?? r.status}</span></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table></div>
                            )}
                          </div>
                        )}
                        <h3>{w.trail}</h3>
                        {detail?.line?.business_id === l.business_id && (
                          detail.events.length === 0 ? <p className="sh-note">{w.noTrail}</p> : (
                            <ol className="wl-trail">
                              {detail.events.map((e, n) => (
                                <li key={n}>
                                  <b>{w.events[e.kind] ?? e.kind}</b>
                                  {e.ok !== null && <> · {e.ok ? w.okWord.true : w.okWord.false}</>}
                                  {eventNote(e) && <span dir="ltr"> · {eventNote(e)}</span>}
                                  <small> · {when(e.at, lang, w.never)}{e.actor ? ` · ${w.by} ${e.actor}` : ""}</small>
                                </li>
                              ))}
                            </ol>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
