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
type LineRow = {
  business_id: string; name: string; slug: string; number_id: string; waba_id: string;
  display_phone: string; attached_at: string | null; attached_by: string; state: State;
  checked_at: string | null; checks: Check[]; test: Test | null; last_inbound_at: string | null;
  staff_numbers: number;
};
type Tester = { id: string; label: string; phone: string; window_open: boolean };
type Event = { at: string; kind: string; ok: boolean | null; actor: string; detail: Record<string, unknown> };
type Detail = { line: LineRow | null; testers: Tester[]; events: Event[] };
type Lines = { lines: LineRow[]; counts: Record<State, number> };

const PILL: Record<State, string> = { working: "active", problem: "bad", waiting: "wait", unchecked: "idle" };
const KEY = "alyr-ops-lang";

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
    setSaid(""); setWho("");
    if (open === id) { setOpen(""); setDetail(null); return; }
    setOpen(id); setDetail(null); read(id);
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
          <thead><tr><th>{w.business}</th><th>{w.line}</th><th>{w.state}</th><th>{w.lastCheck}</th><th>{w.lastMessage}</th><th /></tr></thead>
          <tbody>
            {rows.map((l) => (
              <Fragment key={l.business_id}>
                <tr className="norow">
                  <td><b>{l.name}</b><br /><small>{l.slug}</small></td>
                  <td data-label={w.line}><span dir="ltr">{l.display_phone || l.number_id}</span><br /><small dir="ltr">{l.number_id}</small></td>
                  <td data-label={w.state}><span className={`sh-pill ${PILL[l.state]}`}>{w.states[l.state]}</span></td>
                  <td data-label={w.lastCheck}>{when(l.checked_at, lang, w.never)}</td>
                  <td data-label={w.lastMessage}>{l.last_inbound_at ? when(l.last_inbound_at, lang, w.never) : w.notYet}</td>
                  <td className="r">
                    <button className="btn small" type="button" disabled={busy !== ""} onClick={() => { toggle(l.business_id); }} aria-expanded={open === l.business_id}>
                      {open === l.business_id ? w.close : w.details}
                    </button>
                  </td>
                </tr>
                {open === l.business_id && (
                  <tr className="norow">
                    <td colSpan={6}>
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
                        <h3>{w.trail}</h3>
                        {detail?.line?.business_id === l.business_id && (
                          detail.events.length === 0 ? <p className="sh-note">{w.noTrail}</p> : (
                            <ol className="wl-trail">
                              {detail.events.map((e, n) => (
                                <li key={n}>
                                  <b>{w.events[e.kind] ?? e.kind}</b>
                                  {e.ok !== null && <> · {e.ok ? w.okWord.true : w.okWord.false}</>}
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
