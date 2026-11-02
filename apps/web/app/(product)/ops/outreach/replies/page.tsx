"use client";

// Replies (specs/065, ALY-311): the replies the rules could not settle, for the founder to read
// and answer from his own mail. Opt-outs, bounces and auto-replies never come here; any reply has
// already stopped its sequence. Marking one handled takes an optional note for the timeline.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { REPLY_LABEL, W, WAITING_BECAUSE } from "../copy";
import { useOverview } from "../Frame";
import { age, percent, when } from "../outreachLogic";
import { Empty, Failed, Pill } from "../parts";
import type { Replies, Reply } from "../types";

const R = W.replies;

export default function RepliesPage() {
  const [handled, setHandled] = useState(false);
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const answer = await api<Replies>(`/api/admin/outreach/replies?handled=${handled}`);
    if (answer.ok) { setReplies(answer.data.replies); setError(""); } else setError(answer.error || W.loadError);
  }, [handled]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">{R.eyebrow}</span>
        <h1>{R.title}</h1>
        <p>{R.lead}</p>
      </header>
      <nav className="tm-seg ops-tabs" role="tablist" aria-label={R.title}>
        {[false, true].map((h) => (
          <button key={String(h)} type="button" role="tab" aria-selected={handled === h} onClick={() => { setReplies(null); setHandled(h); }}>
            {h ? R.handled : R.waiting}
          </button>
        ))}
      </nav>
      {error && !replies && <Failed message={error} retry={load} />}
      {!replies && !error && <p className="sh-note">{W.loading}</p>}
      {replies && replies.length === 0 && (handled
        ? <p className="sh-note">{R.noneHandled}</p>
        : <Empty title={R.emptyTitle} text={R.emptyText} slots={2} />)}
      {replies && replies.length > 0 && (
        <ul className="or-replies">
          {replies.map((r) => <ReplyCard key={r.id} reply={r} gone={() => setReplies((now) => (now ?? []).filter((x) => x.id !== r.id))} />)}
        </ul>
      )}
    </>
  );
}

function ReplyCard({ reply: r, gone }: { reply: Reply; gone: () => void }) {
  const { refresh } = useOverview();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function mark() {
    setBusy(true); setError("");
    const answer = await api(`/api/admin/outreach/replies/${r.id}/handled`, "POST", note.trim() ? { note: note.trim() } : {});
    setBusy(false);
    if (!answer.ok) return setError(answer.error);
    refresh();
    gone();
  }

  const unsure = r.confidence !== null && r.confidence < 0.8;
  return (
    <li className="or-card">
      <header className="or-card-head">
        <div>
          <h2><Link href={`/ops/outreach/prospects?id=${r.prospect_id}`}>{r.company}</Link></h2>
          <p className="or-card-sub">{r.contact_first_name || "—"} · {R.toStep(r.step)} · {when(r.received_at)} ({age(r.received_at)})</p>
        </div>
        <div className="or-pills">
          <Pill tone={r.label === "interested" ? "active" : r.label ? "idle" : "wait"}>{r.label ? REPLY_LABEL[r.label] : R.unlabelled}</Pill>
          {r.confidence !== null && <Pill tone={unsure ? "wait" : "idle"}>{percent(r.confidence)}</Pill>}
          {r.other_labels.length > 0 && <span className="or-dim">{R.also} {r.other_labels.map((l) => REPLY_LABEL[l]).join(", ")}</span>}
        </div>
      </header>
      {r.waiting_because && <p className="or-why"><span>{R.why}</span> {WAITING_BECAUSE[r.waiting_because] ?? r.waiting_because}</p>}
      <details className="or-reply-body" open={!r.handled_at}>
        <summary><b dir="auto">{r.subject}</b> <span className="or-dim">· {R.showReply}</span></summary>
        <p dir="auto">{r.body}</p>
      </details>
      {r.booking_draft_id && <Link className="btn small" href="/ops/outreach">{R.openBooking}</Link>}
      {r.handled_at ? (
        <p className="sh-note">{R.handledBy(r.handled_by, when(r.handled_at))}{r.note && ` · ${r.note}`}</p>
      ) : (
        <div className="or-handle">
          <label className="ops-field">
            <span>{R.note}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="button" className="btn primary" onClick={mark} disabled={busy}>{busy ? R.marking : R.mark}</button>
        </div>
      )}
      {error && <p className="ops-error" role="alert">{error}</p>}
    </li>
  );
}
