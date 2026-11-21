"use client";

// The approval sheet (ALY-324, spec 066 "The approval sheet"): one change to one place, drawn as the
// exact before and after, with the one tap that approves it. It is the only place an approval is
// made on a screen, and it is used from three doors: Home's card, the finding's sheet and the
// Proposals area (`?view=proposals&p=<id>` opens it: the link WhatsApp sends). What it shows depends
// on the change's status: waiting, being applied (asked about every 1.5 s until it is applied or has
// failed, and never again after), applied (with the undo window and whether a check-up has confirmed
// it), failed (with the reason, and a way to try again), declined, expired, undone.
//
// An approval is only ever a deliberate tap on the Approve button of the change shown: it carries the
// hash of that change, it is drawn only where the API says this person may (`can.approve`), and it is
// disabled while its request runs. Reviewer text is quoted data, escaped, never markup. Nothing here
// says what it does not do: "Applied" appears only once the API says it is.

import { useCallback, useEffect, useRef, useState } from "react";
import { Fold, Icon, Sheet } from "./CatalogUi";
import { discovery, DiscoveryError, type HistoryRow, type Proposal, type ProposalDetail } from "./discoveryApi";
import { T, type Lang } from "./discoveryCopy";
import {
  POLL_MS, eventAt, formatDay, formatDayLong, formatWhen, mayApprove, proposalPollDecision, sayError, verifiedAt,
} from "./discoveryLogic";
import { BeforeAfter, EvidenceList, Stars, When, announceChange } from "./discoveryUi";
import { usePolling } from "./poll";

type Busy = "" | "approve" | "decline" | "undo";

export function ApprovalSheet({ lang, id, initial, onClose, onChanged }: {
  lang: Lang; id: string; initial: Proposal | null; onClose: () => void; onChanged: (proposal: Proposal) => void;
}) {
  const t = T[lang];
  const [p, setP] = useState<Proposal | null>(initial);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Busy>("");
  const [announce, setAnnounce] = useState("");
  const [slow, setSlow] = useState(false);
  // True once the change moved on while the sheet was open: only then does the new state arrive with a motion.
  const [arrived, setArrived] = useState(false);
  const polls = useRef(0);
  const head = useRef<HTMLHeadingElement>(null);
  const changed = useRef(onChanged);
  useEffect(() => { changed.current = onChanged; });

  const take = useCallback((next: ProposalDetail) => { setP(next); setHistory(next.history); }, []);

  // The list has what the sheet needs to open at once; the history and the newest state come from the change itself.
  useEffect(() => {
    let alive = true;
    discovery.proposal(lang, id).then((d) => { if (alive) take(d); }, (e) => { if (alive) setError(sayError(e, lang)); });
    return () => { alive = false; };
  }, [lang, id, take]);

  async function reload() {
    try { take(await discovery.proposal(lang, id)); } catch { /* the state on screen stays; the next action says what is wrong */ }
  }

  function said(status: Proposal["status"]): string {
    return status === "approved" ? t.announce.approved : status === "applied" ? t.announce.applied : status === "failed" ? t.announce.failed
      : status === "declined" ? t.announce.declined : status === "undone" ? t.announce.undone : "";
  }

  // A change that was approved is asked about every 1.5 s until it is applied or has failed, then never again.
  const following = p?.status === "approved" && !slow;
  const askAgain = useCallback(async () => {
    try {
      const next = await discovery.proposal(lang, id);
      polls.current += 1;
      take(next);
      if (next.status !== "approved") {
        setArrived(true);
        setAnnounce(said(next.status));
        changed.current(next);
        announceChange();
        requestAnimationFrame(() => head.current?.focus({ preventScroll: true }));
      } else if (proposalPollDecision(next, polls.current) === "slow") {
        setSlow(true);
      }
    } catch {
      // A look that fails is asked again at the next beat.
    }
    // `said` only reads the words of the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, id, take]);
  usePolling(askAgain, POLL_MS, following);

  async function act(kind: Exclude<Busy, "">, call: () => Promise<Proposal>) {
    setBusy(kind);
    setError("");
    setNote("");
    try {
      const next = await call();
      setP(next);
      polls.current = 0;
      setSlow(false);
      setAnnounce(said(next.status));
      if (next.already) setNote(t.alreadyDone);
      changed.current(next);
      announceChange();
      void reload();
      requestAnimationFrame(() => head.current?.focus({ preventScroll: true }));
    } catch (e) {
      setError(sayError(e, lang));
      // Whatever the refusal, what is on screen is the change as it stands now, never a stale one.
      if (e instanceof DiscoveryError && e.status === 409) await reload();
    } finally {
      setBusy("");
    }
  }

  const approve = () => { if (p && mayApprove(p)) void act("approve", () => discovery.approve(lang, p.id, p.change_hash)); };
  const decline = () => { if (p) void act("decline", () => discovery.decline(lang, p.id)); };
  const undo = () => { if (p) void act("undo", () => discovery.undo(lang, p.id)); };

  const waiting = p?.status === "proposed" || p?.status === "failed";
  const footer = p && (mayApprove(p) || (p.can.decline && waiting) || (p.can.undo && p.status === "applied")) ? (
    <div className="dv-foot">
      {mayApprove(p) && (
        <button type="button" className="btn volt ct-btn" disabled={busy !== ""} onClick={approve}>{p.status === "failed" ? t.retry : t.approve}</button>
      )}
      {p.can.decline && waiting && <button type="button" className="btn ghost ct-btn" disabled={busy !== ""} onClick={decline}>{t.decline}</button>}
      {p.can.undo && p.status === "applied" && <button type="button" className="btn ct-btn" disabled={busy !== ""} onClick={undo}>{t.undo}</button>}
    </div>
  ) : undefined;

  return (
    <Sheet title={p?.title ?? t.loading} subtitle={p ? t.fieldAt(p.field_label, p.where) : undefined} onClose={onClose} closeLabel={t.close} footer={footer}>
      {p && (
        <div className="dv-sheet dv-approval" lang={lang} tabIndex={0} role="group" aria-label={p.title}>
          <p className="ct-sr" role="status" aria-live="polite">{announce}</p>
          {error && <p className="ct-alert" role="alert"><Icon name="warn" />{error}</p>}
          {note && <p className="dv-statusline" role="status">{note}</p>}

          <State p={p} lang={lang} history={history} arrived={arrived} slow={slow} headRef={head}
            onCheck={() => { setSlow(false); polls.current = 0; }} />

          {p.context && (
            <section className="dv-sec" aria-labelledby="dv-rv-h">
              <h3 id="dv-rv-h">{t.theReview}</h3>
              <div className="dv-review-top">
                <Stars rating={p.context.review.rating} lang={lang} />
                <span className="ct-quiet"><When iso={p.context.review.posted_at} lang={lang} day /></span>
              </div>
              {/* Somebody else's words from a public page: text only, in its own language and direction. */}
              <blockquote className="dv-quote" lang={p.context.review.language || undefined} dir="auto">
                <p>{p.context.review.body}</p>
                {p.context.review.author_name && <footer><cite dir="auto">{p.context.review.author_name}</cite></footer>}
              </blockquote>
            </section>
          )}

          <section className="dv-sec" aria-labelledby="dv-ch-h">
            <h3 id="dv-ch-h">{t.theChange}</h3>
            <BeforeAfter p={p} lang={lang} />
          </section>

          {p.rule && <p className="dv-rule"><span className="dv-rule-tag">{t.ruleLine}</span> <bdi dir="auto">{p.rule}</bdi></p>}

          {p.evidence.length > 0 && (
            <section className="dv-sec" aria-labelledby="dv-ev-h">
              <h3 id="dv-ev-h">{t.evidence}</h3>
              <EvidenceList items={p.evidence} lang={lang} />
            </section>
          )}

          {p.sample && <p className="dv-statusline" role="note">{t.sampleChange}</p>}
          <p className="dv-guarantee">{t.guarantee}</p>

          {history.length > 0 && (
            <Fold title={t.history}>
              <ol className="dv-log">
                {history.map((h, i) => (
                  <li key={i}>
                    <span dir="auto">{h.text}</span>
                    {h.at && <small className="ct-quiet"><When iso={h.at} lang={lang} /></small>}
                  </li>
                ))}
              </ol>
            </Fold>
          )}
        </div>
      )}
      {!p && !error && <p className="ct-quiet" role="status">{t.loading}</p>}
      {!p && error && <p className="ct-alert" role="alert">{error}</p>}
    </Sheet>
  );
}

// ── what the change's state says ────────────────────────

function State({ p, lang, history, arrived, slow, headRef, onCheck }: {
  p: Proposal; lang: Lang; history: readonly HistoryRow[]; arrived: boolean; slow: boolean;
  headRef: React.RefObject<HTMLHeadingElement | null>; onCheck: () => void;
}) {
  const t = T[lang];
  const decided = p.decided;
  const heading = (cls = "") => <h3 ref={headRef} tabIndex={-1} className={`dv-state-h ${cls}`}>{t.proposalStatus[p.status]}</h3>;
  const fresh = arrived ? "fresh" : "";

  if (p.status === "proposed") {
    return (
      <section className="dv-state">
        {heading()}
        {p.expires_at && <p className="dv-expiry">{t.expiresOn(formatDayLong(p.expires_at, lang))}</p>}
        {!p.can.approve && <p className="ct-quiet">{t.ownerApproves}</p>}
      </section>
    );
  }

  if (p.status === "approved") {
    return (
      <section className="dv-state">
        <h3 ref={headRef} tabIndex={-1} className="dv-state-h">{t.beingApplied}</h3>
        <p>{t.beingAppliedText}</p>
        <ol className="dv-steps" aria-label={t.beingApplied}>
          <li>
            <span className="dv-tick" aria-hidden="true"><Icon name="check" /></span>
            <span className="dv-step-text">{t.stepApproved(decided?.by ?? "", decided?.channel ?? "")}</span>
          </li>
          <li>
            <span className="dv-pending" aria-hidden="true" />
            <span className="dv-step-text">{t.stepMaking}</span>
          </li>
        </ol>
        {slow && (
          <div className="dv-slow" role="status">
            <b>{t.slowTitle}</b>
            <span>{t.slowText}</span>
            <button type="button" className="btn ct-btn" onClick={onCheck}><Icon name="retry" />{t.checkAgain}</button>
          </div>
        )}
      </section>
    );
  }

  if (p.status === "applied") {
    const when = verifiedAt(history);
    const day = when ? formatDay(when, lang) : "";
    return (
      <section className={`dv-state ${fresh}`}>
        {heading("ok")}
        <p>{t.appliedLine(formatWhen(p.applied_at, lang), decided?.by ?? "", decided?.channel ?? "")}</p>
        {p.can.undo && p.undo_until && <p>{t.undoUntil(formatDay(p.undo_until, lang))}</p>}
        {p.verification === "pending" && <p className="ct-quiet">{t.verifyPending}</p>}
        {p.verification === "confirmed" && <p>{day ? t.verifyConfirmedOn(day) : t.verifyConfirmed}</p>}
        {p.verification === "not_confirmed" && <p className="dv-warnline">{day ? t.verifyNotOn(day) : t.verifyNot}</p>}
      </section>
    );
  }

  if (p.status === "failed") {
    return (
      <section className={`dv-state bad ${fresh}`}>
        {heading("bad")}
        {p.failure?.message && <p><bdi dir="auto">{p.failure.message}</bdi></p>}
        {!p.can.approve && <p className="ct-quiet">{t.ownerApproves}</p>}
      </section>
    );
  }

  if (p.status === "declined") {
    return (
      <section className="dv-state">
        {heading()}
        <p>{t.declinedLine(formatWhen(decided?.at ?? null, lang), decided?.by ?? "", decided?.channel ?? "")}</p>
        <p className="ct-quiet">{t.coolOff}</p>
      </section>
    );
  }

  if (p.status === "expired") {
    return (
      <section className="dv-state">
        {heading()}
        <p>{t.expiredLine(formatDay(p.expires_at, lang))}</p>
      </section>
    );
  }

  // undone
  return (
    <section className="dv-state">
      {heading()}
      <p>{t.undoneLine(formatWhen(p.undone?.at ?? eventAt(history, /undo/i), lang))}</p>
      <p className="ct-quiet">{t.undoneNote(p.where)}</p>
    </section>
  );
}
