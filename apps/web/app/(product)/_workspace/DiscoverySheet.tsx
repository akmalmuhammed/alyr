"use client";

// One finding in a side sheet (ALY-322, spec 065 "Screens"): what was found, why it matters,
// what happens and what is needed, the evidence it stands on, and the steps of the check-up that
// found it. In Phase 1 the two things an owner can do with it are "I did this" and "Skip" (and
// to put either back): nothing is applied outside ALYR, so there is no approval and the sheet
// never says there is. Everything shown is text: evidence comes from the business's own public
// pages and is drawn as text, never as markup.

import { useEffect, useState } from "react";
import { Sheet } from "./CatalogUi";
import { discovery, type Finding, type FindingStatus } from "./discoveryApi";
import { T, type Lang } from "./discoveryCopy";
import { inOrder, isNumeric, sayError, stepText } from "./discoveryLogic";
import { FindingMeta, When } from "./discoveryUi";

export type Change = { finding: Finding; from: FindingStatus };

export function FindingSheet({ lang, id, initial, canMark, onClose, onChanged }: {
  lang: Lang; id: string; initial: Finding | null; canMark: boolean; onClose: () => void; onChanged: (change: Change) => void;
}) {
  const t = T[lang];
  const [finding, setFinding] = useState<Finding | null>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // The list has what the sheet needs to open at once; the steps come from the finding itself.
  useEffect(() => {
    let alive = true;
    discovery.finding(lang, id).then((f) => { if (alive) setFinding(f); }, (e) => { if (alive) setError(sayError(e, lang)); });
    return () => { alive = false; };
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

  const status = finding?.status;
  const footer = finding && canMark && (status === "open" || status === "skipped" || status === "owner_done") ? (
    <div className="dv-foot">
      {status === "open" && (
        <>
          <button type="button" className="btn primary ct-btn" disabled={busy} onClick={() => void mark("owner_done")}>{t.didThis}</button>
          <button type="button" className="btn ct-btn" disabled={busy} onClick={() => void mark("skipped")}>{t.skip}</button>
        </>
      )}
      {status === "skipped" && <button type="button" className="btn ct-btn" disabled={busy} onClick={() => void mark("open")}>{t.putBack}</button>}
      {status === "owner_done" && <button type="button" className="btn ct-btn" disabled={busy} onClick={() => void mark("open")}>{t.notDoneYet}</button>}
    </div>
  ) : undefined;

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

          <section className="dv-sec" aria-labelledby="dv-ev-h">
            <h3 id="dv-ev-h">{t.evidence}</h3>
            {finding.evidence.length === 0 ? <p className="ct-quiet">{t.evidenceNone}</p> : (
              <ul className="dv-evidence">
                {finding.evidence.map((e, i) => (
                  <li key={i}>
                    <span className="dv-ev-label">{e.label}</span>
                    <span className="dv-ev-value"><bdi dir={isNumeric(e.value) ? "ltr" : "auto"}>{e.value}</bdi></span>
                    <span className="dv-ev-where">{e.where}{e.seen_at && <> · <When iso={e.seen_at} lang={lang} /></>}</span>
                  </li>
                ))}
              </ul>
            )}
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
