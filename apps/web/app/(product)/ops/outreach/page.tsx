"use client";

// Review (specs/065, ALY-311): the outreach area's landing screen, built for the founder's phone.
// Drafts waiting for approval, oldest first. One card is open at a time, so the screen has one
// main action: Approve, which sends the draft's body hash; the API refuses a hash that is no
// longer the draft's, and the card reloads with a sentence saying why.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { ACCEPT_ALL_WARNING, BASIS, LANE, LEVEL, VERIFIER, W } from "./copy";
import { useOverview } from "./Frame";
import { age, isStaleHash, laneTone, verifierTone } from "./outreachLogic";
import { Checks, DraftView, Empty, Failed, Pill } from "./parts";
import type { ApproveResult, Draft, Review, ReviewItem } from "./types";

const R = W.review;

export default function ReviewPage() {
  const { refresh } = useOverview();
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState("");
  const [openFor, setOpenFor] = useState(""); // a prospect id: a reload keeps its card open
  const [said, setSaid] = useState("");

  const load = useCallback(async () => {
    const answer = await api<Review>("/api/admin/outreach/review");
    if (answer.ok) { setItems(answer.data.items); setError(""); } else setError(answer.error || W.loadError);
    return answer.ok ? answer.data.items : null;
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const open = items?.find((i) => i.prospect.id === openFor) ?? items?.[0];

  function replace(next: ReviewItem) {
    setItems((now) => (now ?? []).map((i) => (i.prospect.id === next.prospect.id ? next : i)));
  }

  function done(item: ReviewItem, message: string) {
    setSaid(message);
    const rest = (items ?? []).filter((i) => i.prospect.id !== item.prospect.id);
    setItems(rest);
    setOpenFor(rest[0]?.prospect.id ?? "");
    refresh();
  }

  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">{R.eyebrow}</span>
        <h1>{R.title}</h1>
        <p>{!items ? (error ? "" : W.loading) : items.length === 0 ? R.none : R.count(items.length)} {R.lead}</p>
      </header>
      {said && <p className="ops-ok or-said" role="status">{said}</p>}
      {error && !items && <Failed message={error} retry={load} />}
      {items && items.length === 0 && (
        <Empty title={R.emptyTitle} text={R.emptyText} slots={3} action={{ href: "/ops/outreach/prospects", label: R.emptyAction }} />
      )}
      {items && items.length > 0 && open && (
        <div className="or-review">
          <Card key={open.prospect.id} item={open} reload={load} done={done} replace={replace} />
          {items.length > 1 && (
            <ul className="or-queue" aria-label="Also waiting">
              {items.filter((i) => i !== open).map((i) => (
                <li key={i.draft.id}>
                  <div>
                    <b>{i.prospect.company}</b>
                    <small>{i.prospect.country} · {i.prospect.contact_first_name || "—"}{i.prospect.contact_role ? `, ${i.prospect.contact_role}` : ""} · {age(i.waiting_since)} {R.waiting}</small>
                    {(i.prospect.email_verifier === "accept_all" || !i.draft.lint.ok) && (
                      <span className="or-pills">
                        {i.prospect.email_verifier === "accept_all" && <Pill tone="wait">{VERIFIER.accept_all}</Pill>}
                        {!i.draft.lint.ok && <Pill tone="bad">{R.lint} {R.failed.toLowerCase()}</Pill>}
                      </span>
                    )}
                  </div>
                  <button type="button" className="btn small" onClick={() => { setSaid(""); setOpenFor(i.prospect.id); window.scrollTo({ top: 0 }); }}>{R.open}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

type Mode = { kind: "view" } | { kind: "edit"; draft: Draft; subject: string; body: string } | { kind: "reject"; reason: string };

function Card({ item: current, reload, done, replace }: {
  item: ReviewItem; reload: () => Promise<ReviewItem[] | null>;
  done: (item: ReviewItem, message: string) => void; replace: (item: ReviewItem) => void;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [withFollowUps, setWithFollowUps] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const { draft, follow_ups: followUps, prospect: p, claims } = current;
  const followUpsPass = followUps.every((f) => f.lint.ok);

  async function approve() {
    setBusy("approve"); setError(""); setNote("");
    const answer = await api<ApproveResult>(`/api/admin/outreach/drafts/${draft.id}/approve`, "POST", {
      body_hash: draft.body_hash, with_follow_ups: withFollowUps && followUpsPass,
    });
    setBusy("");
    if (answer.ok) return done(current, R.approved(p.company));
    if (isStaleHash(answer.status, answer.data)) {
      await reload(); // the same card, now with the draft as it stands
      setMode({ kind: "view" });
      return setError(R.stale);
    }
    setError(answer.error);
  }

  async function saveEdit() {
    if (mode.kind !== "edit") return;
    setBusy("edit"); setError(""); setNote("");
    const answer = await api<Draft>(`/api/admin/outreach/drafts/${mode.draft.id}/edit`, "POST", { subject: mode.subject, body: mode.body });
    setBusy("");
    if (!answer.ok) return setError(answer.error);
    const fresh = answer.data;
    replace(current.draft.id === mode.draft.id
      ? { ...current, draft: fresh }
      : { ...current, follow_ups: current.follow_ups.map((f) => (f.id === mode.draft.id ? fresh : f)) });
    setMode({ kind: "view" });
    setNote(R.saved);
  }

  async function reject() {
    if (mode.kind !== "reject") return;
    if (!mode.reason.trim()) return setError(R.reasonNeeded);
    setBusy("reject"); setError("");
    const answer = await api(`/api/admin/outreach/drafts/${draft.id}/reject`, "POST", { reason: mode.reason.trim() });
    setBusy("");
    if (!answer.ok) return setError(answer.error);
    done(current, R.rejected);
  }

  const edit = (d: Draft) => { setNote(""); setError(""); setMode({ kind: "edit", draft: d, subject: d.subject, body: d.body }); };

  return (
    <article className="or-card" aria-labelledby={`card-${draft.id}`}>
      <header className="or-card-head">
        <div>
          <h2 id={`card-${draft.id}`}>{p.company}</h2>
          <p className="or-card-sub">
            <a href={p.website} target="_blank" rel="noopener noreferrer nofollow">{p.domain}</a>
            {p.business_type && <> · {p.business_type}</>}
            {" · "}{age(current.waiting_since)} {R.waiting}
          </p>
        </div>
        <div className="or-pills">
          <Pill tone={laneTone(p.lane)}>{p.country} · {LANE[p.lane]}</Pill>
          <Pill tone="idle">{LEVEL[p.level] ?? `L${p.level}`}</Pill>
        </div>
      </header>

      <dl className="or-facts">
        <div>
          <dt>{R.contact}</dt>
          <dd>
            {p.contact_first_name || "—"}{p.contact_role && <span className="or-dim">, {p.contact_role}</span>}
            {" "}<Pill tone={verifierTone(p.email_verifier)}>{VERIFIER[p.email_verifier ?? "none"]}</Pill>
          </dd>
        </div>
        <div>
          <dt>{R.basis}</dt>
          <dd>{p.basis ? BASIS[p.basis] : "—"}{p.basis_note && <span className="or-dim"> · {p.basis_note}</span>}</dd>
        </div>
        <div className="or-wide">
          <dt>{R.fit}</dt>
          <dd>{p.fit_reason || "—"}{p.fit_score !== null && <span className="or-dim"> · {p.fit_score}/100</span>}</dd>
        </div>
      </dl>
      {p.email_verifier === "accept_all" && <p className="or-warn" role="note">{ACCEPT_ALL_WARNING}</p>}
      {p.level === 0 && <p className="or-warn" role="note">{R.level0}</p>}

      <section className="or-block">
        <h3>{draft.kind === "booking_reply" ? R.bookingReply : R.message} <span className="or-dim">v{draft.version}</span></h3>
        {mode.kind === "edit" && mode.draft.id === draft.id
          ? <Editor mode={mode} setMode={setMode} save={saveEdit} busy={busy === "edit"} />
          : <DraftView draft={draft} claims={claims} />}
        {current.dropped_claims > 0 && <p className="sh-note">{R.dropped(current.dropped_claims)}</p>}
        <div className="or-check-row">
          <Checks title={R.critic} result={draft.critic} />
          <Checks title={R.lint} result={draft.lint} />
        </div>
      </section>

      {draft.kind === "sequence" && (
        <section className="or-block">
          <h3>{R.followUps}</h3>
          {followUps.length === 0 ? <p className="sh-note">{R.noFollowUps}</p> : (
            <ol className="or-followups">
              {followUps.map((f) => (
                <li key={f.id}>
                  <div className="or-followup-head">
                    <span className="or-step">{R.followUpWhen(f.step, f.wait_working_days)}</span>
                    <Pill tone={f.lint.ok ? "active" : "bad"}>{R.lint} {f.lint.ok ? R.passed.toLowerCase() : R.failed.toLowerCase()}</Pill>
                    {!(mode.kind === "edit" && mode.draft.id === f.id) && (
                      <button type="button" className="btn small ghost" onClick={() => edit(f)} disabled={busy !== ""}>{R.edit}</button>
                    )}
                  </div>
                  {mode.kind === "edit" && mode.draft.id === f.id
                    ? <Editor mode={mode} setMode={setMode} save={saveEdit} busy={busy === "edit"} />
                    : <DraftView draft={f} claims={claims} sources={false} />}
                  {!f.lint.ok && <Checks title={R.lint} result={f.lint} />}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {note && <p className="ops-ok" role="status">{note}</p>}
      {error && <p className="ops-error" role="alert">{error}</p>}

      {mode.kind === "reject" ? (
        <div className="or-confirm">
          <h3>{R.rejectTitle}</h3>
          <label className="ops-field">
            <span>{R.rejectReason}</span>
            <textarea rows={3} value={mode.reason} onChange={(e) => setMode({ kind: "reject", reason: e.target.value })} />
          </label>
          <div className="or-actions">
            <button type="button" className="btn danger" onClick={reject} disabled={busy !== ""}>{R.rejectConfirm}</button>
            <button type="button" className="btn ghost" onClick={() => { setMode({ kind: "view" }); setError(""); }}>{R.cancel}</button>
          </div>
        </div>
      ) : (
        <footer className="or-card-foot">
          {draft.kind === "sequence" && followUps.length > 0 && (
            <label className="or-tick">
              <input type="checkbox" checked={withFollowUps && followUpsPass} disabled={!followUpsPass} onChange={(e) => setWithFollowUps(e.target.checked)} />
              <span>{R.withFollowUps}{!followUpsPass && <small>{R.followUpsBlocked}</small>}</span>
            </label>
          )}
          {!draft.lint.ok && <p className="sh-note">{R.lintBlocks}</p>}
          <div className="or-actions">
            <button type="button" className="btn volt or-approve" onClick={approve} disabled={busy !== "" || !draft.lint.ok || mode.kind === "edit"}>
              {busy === "approve" ? R.approving : R.approve}
            </button>
            <button type="button" className="btn" onClick={() => edit(draft)} disabled={busy !== "" || mode.kind === "edit"}>{R.edit}</button>
            <button type="button" className="btn ghost" onClick={() => { setNote(""); setError(""); setMode({ kind: "reject", reason: "" }); }} disabled={busy !== ""}>{R.reject}</button>
            <span className="spacer" />
            <Link className="ops-link" href={`/ops/outreach/prospects?id=${p.id}`}>{R.openProspect}</Link>
          </div>
        </footer>
      )}
    </article>
  );
}

function Editor({ mode, setMode, save, busy }: {
  mode: Extract<Mode, { kind: "edit" }>; setMode: (m: Mode) => void; save: () => void; busy: boolean;
}) {
  return (
    <div className="or-editor">
      <p className="sh-note">{R.editHelp}</p>
      <label className="ops-field">
        <span>{R.subject}</span>
        <input value={mode.subject} onChange={(e) => setMode({ ...mode, subject: e.target.value })} dir="auto" />
      </label>
      <label className="ops-field">
        <span>{R.editTitle}</span>
        <textarea rows={10} value={mode.body} onChange={(e) => setMode({ ...mode, body: e.target.value })} dir="auto" />
      </label>
      <div className="or-actions">
        <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? R.saving : R.save}</button>
        <button type="button" className="btn ghost" onClick={() => setMode({ kind: "view" })} disabled={busy}>{R.cancel}</button>
      </div>
    </div>
  );
}
