"use client";

// One finding in a side sheet (ALY-322, spec 065 "Screens"; ALY-324, spec 066 "The finding sheet"):
// what was found, why it matters, what happens and what is needed, the change ALYR has prepared for
// it (when there is one), the evidence it stands on, and the steps of the check-up that found it.
// Without a change, the two things an owner can do with a finding are "I did this" and "Skip" (and to
// put either back), as in Phase 1. With a change waiting, the main action is "Review and approve",
// which opens the approval sheet: the Approve tap itself is never here, only beside the exact before
// and after. A person who may not approve sees the change and who does. Where a fact is missing, a
// form asks for it (the real hours, phone, category, name, WhatsApp number). Everything shown is
// text: evidence comes from the business's own public pages, and is drawn as text, never as markup.

import { useEffect, useState } from "react";
import { Sheet } from "./CatalogUi";
import { ApprovalSheet } from "./DiscoveryApproval";
import { FactForm } from "./DiscoveryFacts";
import { discovery, DiscoveryError, type Finding, type FindingStatus, type Proposal } from "./discoveryApi";
import { T, type Lang } from "./discoveryCopy";
import { formatDayLong, inOrder, liveProposals, mayApprove, sayError, stepText, waitingProposals } from "./discoveryLogic";
import { BeforeAfter, EvidenceList, FindingMeta, When, announceChange } from "./discoveryUi";

export type Change = { finding: Finding; from: FindingStatus };

export function FindingSheet({ lang, id, initial, canMark, onClose, onChanged, onReview, onLoaded }: {
  lang: Lang; id: string; initial: Finding | null; canMark: boolean; onClose: () => void; onChanged: (change: Change) => void;
  /** Opens the approval sheet for one change. */
  onReview: (proposal: Proposal) => void; onLoaded?: (finding: Finding) => void;
}) {
  const t = T[lang];
  const [finding, setFinding] = useState<Finding | null>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // The list has what the sheet needs to open at once; the steps and the newest proposals come from the finding itself.
  useEffect(() => {
    let alive = true;
    discovery.finding(lang, id).then((f) => { if (alive) { setFinding(f); onLoaded?.(f); } }, (e) => { if (alive) setError(sayError(e, lang)); });
    return () => { alive = false; };
    // `onLoaded` only keeps the parent's copy fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, id]);

  async function mark(status: "open" | "skipped" | "owner_done") {
    if (!finding) return;
    setBusy(true);
    setError("");
    try {
      const updated = await discovery.setStatus(lang, finding.id, status);
      onChanged({ finding: { ...finding, ...updated, steps: finding.steps }, from: finding.status });
    } catch (e) {
      setError(sayError(e, lang));
      setBusy(false);
    }
  }

  async function reloadFinding() {
    try {
      const f = await discovery.finding(lang, id);
      setFinding(f);
      onLoaded?.(f);
    } catch (e) {
      setError(sayError(e, lang));
    }
  }

  async function prepare() {
    if (!finding) return;
    setBusy(true);
    setError("");
    try {
      await discovery.prepare(lang, finding.id);
      announceChange();
      await reloadFinding();
    } catch (e) {
      if (e instanceof DiscoveryError && e.code === "needs_fact") {
        // The API says which fact it wants: the sheet turns into the form for it.
        const key = String(e.extra.key ?? "");
        const where = String(e.extra.location_id ?? finding.location?.id ?? "");
        if (key === "hours" || key === "phone" || key === "category" || key === "name" || key === "whatsapp") {
          setFinding({ ...finding, needs_fact: { key, location_id: where } });
          setBusy(false);
          return;
        }
      }
      setError(sayError(e, lang));
    } finally {
      setBusy(false);
    }
  }

  async function factSaved() {
    announceChange();
    await reloadFinding();
  }

  const status = finding?.status;
  const live = finding ? liveProposals(finding) : [];
  const waiting = finding ? waitingProposals(finding) : [];
  const approvable = waiting.find(mayApprove) ?? null;
  const open = status === "open";
  const markable = canMark && (open || status === "skipped" || status === "owner_done");

  const footer = finding && (markable || approvable) ? (
    <div className="dv-foot">
      {markable && open && waiting.length > 0 && <p className="ct-quiet dv-foot-note">{t.closesChange}</p>}
      {open && approvable && <button type="button" className="btn volt ct-btn" disabled={busy} onClick={() => onReview(approvable)}>{t.reviewAndApprove}</button>}
      {markable && open && (
        <>
          <button type="button" className={`btn ${approvable ? "" : "primary"} ct-btn`} disabled={busy} onClick={() => void mark("owner_done")}>{t.didThis}</button>
          <button type="button" className="btn ct-btn" disabled={busy} onClick={() => void mark("skipped")}>{t.skip}</button>
        </>
      )}
      {markable && status === "skipped" && <button type="button" className="btn ct-btn" disabled={busy} onClick={() => void mark("open")}>{t.putBack}</button>}
      {markable && status === "owner_done" && <button type="button" className="btn ct-btn" disabled={busy} onClick={() => void mark("open")}>{t.notDoneYet}</button>}
    </div>
  ) : undefined;

  const needs = finding?.needs_fact && finding.can_propose ? finding.needs_fact : null;
  const canPrepare = !!finding && open && finding.can_propose && finding.kind === "agent" && live.length === 0 && !needs;

  return (
    <Sheet title={finding?.title ?? t.loading} onClose={onClose} closeLabel={t.close} footer={footer}>
      {finding && (
        <div className="dv-sheet" lang={lang} tabIndex={0} role="group" aria-label={finding.title}>
          <p className="dv-sheet-meta"><FindingMeta f={finding} lang={lang} /></p>
          <dl className="dv-facts">
            {finding.why && <div><dt>{t.why}</dt><dd><bdi dir="auto">{finding.why}</bdi></dd></div>}
            {finding.what_happens && <div><dt>{t.whatHappens}</dt><dd><bdi dir="auto">{finding.what_happens}</bdi></dd></div>}
            {finding.what_is_needed && <div><dt>{t.whatNeeded}</dt><dd><bdi dir="auto">{finding.what_is_needed}</bdi></dd></div>}
          </dl>

          {live.length > 0 && (
            <section className="dv-sec dv-change" aria-labelledby="dv-pc-h">
              <h3 id="dv-pc-h">{live.length > 1 ? t.proposedChanges : t.proposedChange}</h3>
              {live.map((p) => (
                <div key={p.id} className="dv-pc">
                  <p className="dv-pc-head"><bdi dir="auto">{t.fieldAt(p.field_label, p.where)}</bdi></p>
                  <BeforeAfter p={p} lang={lang} />
                  <p className="dv-expiry">
                    {p.status === "proposed" ? t.rowWhen("proposed", formatDayLong(p.expires_at, lang)) : t.proposalStatus[p.status]}
                  </p>
                  {(live.length > 1 || p.status === "approved") && (
                    <button type="button" className="btn ct-btn" onClick={() => onReview(p)}>{t.reviewChange}</button>
                  )}
                </div>
              ))}
              <p className="dv-guarantee">{t.guarantee}</p>
              {waiting.length > 0 && !approvable && <p className="ct-quiet">{t.ownerApproves}</p>}
            </section>
          )}

          {needs && (
            <section className="dv-sec" aria-label={t.confirmTitles[needs.key]}>
              <FactForm lang={lang} factKey={needs.key} locationId={needs.location_id} initial={null} title={t.confirmTitles[needs.key]}
                volt={!approvable} submitLabel={t.saveFact} onSaved={() => void factSaved()} />
            </section>
          )}

          {canPrepare && (
            <div className="dv-actions">
              <button type="button" className="btn ct-btn" disabled={busy} onClick={() => void prepare()}>{t.prepare}</button>
            </div>
          )}

          <section className="dv-sec" aria-labelledby="dv-ev-h">
            <h3 id="dv-ev-h">{t.evidence}</h3>
            {finding.evidence.length === 0 ? <p className="ct-quiet">{t.evidenceNone}</p> : <EvidenceList items={finding.evidence} lang={lang} />}
          </section>

          {finding.steps.length > 0 && (
            <section className="dv-sec" aria-labelledby="dv-st-h">
              <h3 id="dv-st-h">{t.foundBy}</h3>
              <ol className="dv-log">
                {inOrder(finding.steps).map((step) => {
                  const said = stepText(step, lang);
                  return (
                    <li key={step.seq}>
                      <span dir={said.foreign ? "ltr" : undefined} lang={said.foreign ? "en" : undefined}>{said.text}</span>
                      {step.ended_at && <small className="ct-quiet"><When iso={step.ended_at} lang={lang} /></small>}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <p className="dv-seen ct-quiet">
            {finding.first_seen_at && <span>{t.firstSeen("")}<When iso={finding.first_seen_at} lang={lang} /></span>}
            {finding.last_seen_at && <span>{t.lastSeen("")}<When iso={finding.last_seen_at} lang={lang} /></span>}
          </p>
          {t.statusLine[finding.status] && <p className="dv-statusline" role="note">{t.statusLine[finding.status]}</p>}
          {!canMark && (status === "open" || status === "skipped" || status === "owner_done") && <p className="ct-quiet">{t.ownerMarks}</p>}
        </div>
      )}
      {!finding && !error && <p className="ct-quiet" role="status">{t.loading}</p>}
      {error && <p className="ct-alert" role="alert">{error}</p>}
    </Sheet>
  );
}

/**
 * A finding's sheet and, in its place, the approval sheet of one of its changes. The approval sheet
 * takes the place of the finding's (two sheets at once would answer one Escape twice); closing it
 * brings the finding back, as it stands now.
 */
export function FindingFlow({ lang, id, initial, canMark, onClose, onChanged, onProposalChanged }: {
  lang: Lang; id: string; initial: Finding | null; canMark: boolean; onClose: () => void; onChanged: (change: Change) => void;
  onProposalChanged: (proposal: Proposal) => void;
}) {
  const [review, setReview] = useState<Proposal | null>(null);
  const [known, setKnown] = useState<Finding | null>(initial);

  if (review) {
    return (
      <ApprovalSheet lang={lang} id={review.id} initial={review} onClose={() => setReview(null)}
        onChanged={(p) => {
          // The finding comes back with the change as it now stands, never as it was.
          setKnown((k) => (k ? { ...k, proposals: k.proposals.map((x) => (x.id === p.id ? p : x)) } : k));
          onProposalChanged(p);
        }} />
    );
  }
  return <FindingSheet lang={lang} id={id} initial={known} canMark={canMark} onClose={onClose} onChanged={onChanged} onReview={setReview} onLoaded={setKnown} />;
}
