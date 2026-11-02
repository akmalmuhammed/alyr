"use client";

// One prospect (specs/065, ALY-311): who and why, the brief (kept and dropped claims), every draft
// version, what the gateway sent or holds, the replies and the timeline. Staff may pause, resume,
// research again or disqualify; the engine itself can only pause.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { BASIS, GATEWAY_CHECK, LANE, LEVEL, REPLY_LABEL, STAGE, VERIFIER, W } from "../copy";
import { useOverview } from "../Frame";
import { laneTone, percent, shortUrl, stageTone, verifierTone, when } from "../outreachLogic";
import { Checks, DraftView, Failed, Pill } from "../parts";
import type { ProspectDetail } from "../types";

const D = W.detail;

function eventText(kind: string, detail: Record<string, unknown>): string {
  const d = detail ?? {};
  if (kind === "stage" && typeof d.to === "string") return `${STAGE[d.from as keyof typeof STAGE] ?? d.from ?? ""} → ${STAGE[d.to as keyof typeof STAGE] ?? d.to}`;
  if (kind === "refusal" && typeof d.check === "number") return `${W.activity.check(d.check)} · ${GATEWAY_CHECK[d.check] ?? ""}${d.outcome ? ` · ${d.outcome}` : ""}`;
  if (typeof d.note === "string") return d.note;
  if (typeof d.reason === "string") return d.reason;
  return "";
}

export function ProspectView({ id, back }: { id: string; back: () => void }) {
  const { refresh } = useOverview();
  const [p, setP] = useState<ProspectDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [said, setSaid] = useState("");
  const [actionError, setActionError] = useState("");
  const [disqualify, setDisqualify] = useState<string | null>(null);

  const load = useCallback(async () => {
    const answer = await api<ProspectDetail>(`/api/admin/outreach/prospects/${id}`);
    if (answer.ok) { setP(answer.data); setError(""); } else setError(answer.error || W.loadError);
  }, [id]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function act(what: "research" | "pause" | "resume" | "disqualify") {
    setBusy(what); setSaid(""); setActionError("");
    const answer = what === "disqualify"
      ? await api(`/api/admin/outreach/prospects/${id}`, "PATCH", { disqualify: true, reason: (disqualify ?? "").trim() })
      : await api(`/api/admin/outreach/prospects/${id}/${what}`, "POST");
    setBusy("");
    if (!answer.ok) return setActionError(answer.error);
    if (what === "disqualify") setDisqualify(null);
    setSaid(what === "research" ? D.researchQueued : D.done);
    refresh();
    load();
  }

  const backButton = <button type="button" className="btn ghost small ops-back" onClick={back}>← {D.back}</button>;
  if (!p) {
    return <>{backButton}{error ? <Failed message={error} retry={load} /> : <p className="sh-note">{D.loading}</p>}</>;
  }

  const kept = p.claims.filter((c) => c.kept);
  const dropped = p.claims.filter((c) => !c.kept);
  const finished = ["disqualified", "opted_out", "bounced", "done", "rejected", "replied"].includes(p.stage);
  const waiting = p.intents.filter((i) => i.status !== "sent");

  return (
    <>
      {backButton}
      <header className="sh-head">
        <span className="sh-eyebrow">{W.prospects.eyebrow}</span>
        <h1>{p.company}</h1>
        <p className="or-pills">
          <Pill tone={stageTone(p.stage)}>{STAGE[p.stage]}</Pill>
          {p.paused && <Pill tone="wait">{W.prospects.paused}</Pill>}
          <Pill tone={laneTone(p.lane)}>{p.country} · {LANE[p.lane]}</Pill>
          <Pill tone="idle">{LEVEL[p.level] ?? `L${p.level}`}</Pill>
        </p>
      </header>

      {p.paused && <p className="or-warn">{D.pausedNote(p.paused_reason)}</p>}
      {said && <p className="ops-ok or-said" role="status">{said}</p>}
      {actionError && <p className="ops-error" role="alert">{actionError}</p>}

      {disqualify === null ? (
        <div className="or-actions">
          {!finished && (p.paused
            ? <button type="button" className="btn primary" onClick={() => act("resume")} disabled={busy !== ""}>{D.resume}</button>
            : <button type="button" className="btn" onClick={() => act("pause")} disabled={busy !== ""}>{D.pause}</button>)}
          {(p.stage === "new" || p.stage === "needs_human" || p.stage === "researched") && (
            <button type="button" className="btn" onClick={() => act("research")} disabled={busy !== ""}>{busy === "research" ? D.researching : D.research}</button>
          )}
          {p.stage !== "disqualified" && <button type="button" className="btn ghost" onClick={() => setDisqualify("")} disabled={busy !== ""}>{D.disqualify}</button>}
        </div>
      ) : (
        <div className="or-confirm">
          <h2>{D.disqualifyTitle}</h2>
          <p className="sh-note">{D.disqualifyHelp}</p>
          <label className="ops-field">
            <span>{D.reason}</span>
            <textarea rows={2} value={disqualify} onChange={(e) => setDisqualify(e.target.value)} />
          </label>
          <div className="or-actions">
            <button type="button" className="btn danger" disabled={busy !== "" || !disqualify.trim()} onClick={() => act("disqualify")}>{D.confirm}</button>
            <button type="button" className="btn ghost" onClick={() => setDisqualify(null)}>{W.review.cancel}</button>
          </div>
        </div>
      )}

      <section className="or-card">
        <dl className="or-facts">
          <div>
            <dt>{D.contact}</dt>
            <dd>{[p.contact_first_name, p.contact_last_name].filter(Boolean).join(" ") || "—"}{p.contact_role && <span className="or-dim">, {p.contact_role}</span>}</dd>
          </div>
          <div>
            <dt>{D.email}</dt>
            <dd>
              {p.contact_email ? <span className="or-mono">{p.contact_email}</span> : D.noEmail}
              {p.email_source && <span className="or-dim"> · {D.emailSource[p.email_source] ?? p.email_source}</span>}
              {" "}<Pill tone={verifierTone(p.email_verifier)}>{VERIFIER[p.email_verifier ?? "none"]}</Pill>
            </dd>
          </div>
          <div>
            <dt>{D.basis}</dt>
            <dd>{p.basis ? BASIS[p.basis] : <span className="or-bad">{D.noBasis}</span>}{p.basis_note && <span className="or-dim"> · {p.basis_note}</span>}</dd>
          </div>
          <div>
            <dt>{D.source}</dt>
            <dd>
              {D.sources[p.source] ?? p.source}
              {p.source_url && <> · <a href={p.source_url} target="_blank" rel="noopener noreferrer nofollow">{shortUrl(p.source_url)}</a></>}
            </dd>
          </div>
          <div>
            <dt>{D.language}</dt>
            <dd>{p.language === "ar" ? W.add.arabic : W.add.english}</dd>
          </div>
          <div>
            <dt>{D.fit}</dt>
            <dd>{p.fit_score !== null ? `${p.fit_score}/100` : "—"}{p.fit_reason && <span className="or-dim"> · {p.fit_reason}</span>}</dd>
          </div>
          {p.notes && <div className="or-wide"><dt>{D.notes}</dt><dd dir="auto">{p.notes}</dd></div>}
        </dl>
      </section>

      <section>
        <h2>{D.brief} <span className="sh-count">{kept.length}</span></h2>
        {p.claims.length === 0 ? <p className="sh-note">{D.noBrief}</p> : (
          <ul className="or-claims">
            {[...kept, ...dropped].map((c) => (
              <li key={c.id} className={c.kept ? "" : "dropped"}>
                <div className="or-claim-head">
                  <Pill tone={c.kept ? "active" : "bad"}>{c.kept ? D.kept : D.dropped}</Pill>
                  <span className="or-mono or-dim">{c.id}</span>
                </div>
                <p dir="auto">{c.text}</p>
                <blockquote dir="auto">“{c.quote}”</blockquote>
                <a className="or-src-url" href={c.url} target="_blank" rel="noopener noreferrer nofollow">{shortUrl(c.url)}</a>
                {!c.kept && c.dropped_reason && <p className="or-bad">{c.dropped_reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>{D.drafts} <span className="sh-count">{p.drafts.length}</span></h2>
        {p.drafts.length === 0 ? <p className="sh-note">{D.noDrafts}</p> : (
          <div className="or-drafts">
            {p.drafts.map((d) => (
              <details key={d.id} className="or-draft-row" open={d.status === "in_review" && d.step === 1}>
                <summary>
                  <span>{W.review.followUpWhen(d.step, null)} · {D.version(d.version)}</span>
                  <Pill tone={d.status === "approved" || d.status === "sent" ? "active" : d.status === "in_review" ? "wait" : d.status === "rejected" ? "bad" : "idle"}>{D.draftStatus[d.status] ?? d.status}</Pill>
                  <small>{D.by} {d.created_by} · {when(d.created_at)}</small>
                </summary>
                <DraftView draft={d} claims={p.claims} />
                <div className="or-check-row">
                  <Checks title={W.review.critic} result={d.critic} />
                  <Checks title={W.review.lint} result={d.lint} />
                </div>
                {p.approvals.filter((a) => a.draft_id === d.id).map((a) => (
                  <p key={a.id} className="sh-note">{D.approvedBy(a.by, when(a.at))}</p>
                ))}
              </details>
            ))}
          </div>
        )}
        {p.stage === "in_review" && <Link className="btn small" href="/ops/outreach">{W.review.title}</Link>}
      </section>

      <section>
        <h2>{D.sends} <span className="sh-count">{p.sends.length}</span></h2>
        {p.sends.length === 0 && waiting.length === 0 ? <p className="sh-note">{D.noSends}</p> : (
          <ul className="or-lines">
            {p.sends.map((s) => (
              <li key={s.id}>
                <Pill tone={s.status === "bounced" ? "bad" : "active"}>{s.status === "bounced" ? D.bounced : D.sent}</Pill>
                <span>{W.review.followUpWhen(s.step, null)}</span>
                <small>{when(s.sent_at)}</small>
              </li>
            ))}
            {waiting.map((i) => (
              <li key={i.id}>
                <Pill tone={i.status === "blocked" || i.status === "dropped" ? "bad" : "wait"}>{D.intentStatus[i.status] ?? i.status}</Pill>
                <span>{W.review.followUpWhen(i.step, null)} · {D.queued}</span>
                <small>
                  {when(i.run_at)}
                  {i.last_check !== null && <> · {W.activity.check(i.last_check)}: {GATEWAY_CHECK[i.last_check]}{i.last_result && ` (${i.last_result})`}</>}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>{D.replies} <span className="sh-count">{p.replies.length}</span></h2>
        {p.replies.length === 0 ? <p className="sh-note">{D.noReplies}</p> : (
          <ul className="or-lines">
            {p.replies.map((r) => (
              <li key={r.id}>
                <Pill tone={r.handled_at ? "idle" : "wait"}>{r.label ? REPLY_LABEL[r.label] : W.replies.unlabelled}</Pill>
                <span dir="auto">{r.subject}</span>
                <small>{when(r.received_at)}{r.confidence !== null && ` · ${percent(r.confidence)}`}</small>
              </li>
            ))}
          </ul>
        )}
        {p.replies.some((r) => !r.handled_at) && <Link className="btn small" href="/ops/outreach/replies">{W.replies.title}</Link>}
      </section>

      <section>
        <h2>{D.timeline}</h2>
        {p.events.length === 0 ? <p className="sh-note">{D.noTimeline}</p> : (
          <ol className="or-timeline">
            {p.events.map((e, n) => (
              <li key={n}>
                <b>{e.kind.replace("_", " ")}</b>
                {eventText(e.kind, e.detail) && <span> · {eventText(e.kind, e.detail)}</span>}
                <small> · {when(e.at)}{e.actor ? ` · ${e.actor}` : ""}</small>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
