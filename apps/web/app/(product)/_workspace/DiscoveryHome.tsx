"use client";

// Discovery's Home (ALY-322, spec 065 "Screens"): one calm line (the score, what changed since
// the last check-up, one sentence by rule), ONE "Do this next" card, "Up next" and "Done". The
// page's one Volt button is "Run check-up"; while a check-up runs it is replaced by the run
// itself, steps appearing as they are logged (asked about every 1.5 s, and never again once it
// is done or failed). Before a connection or a first run the screen is drawn as dashed slots
// that say what will be here.
//
// Phase 2 (ALY-324, spec 066 "Home"): while a change waits for this person, the page's one Volt
// button is "Review N changes" (it opens the Proposals area) and "Run check-up" becomes its outlined
// twin; the one card, when its finding has a waiting change, shows the exact change in one line and
// its action is "Review the change" (it opens the approval sheet: the card never approves); a short
// strip of up to three waiting changes sits under "Up next"; and a finding whose change was applied
// says in Done whether a check-up has confirmed it. For a person who may not list changes nothing
// about them is drawn.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Fold, Icon } from "./CatalogUi";
import { ApprovalSheet } from "./DiscoveryApproval";
import { FindingFlow, type Change } from "./DiscoverySheet";
import { discovery, DiscoveryError, type Finding, type Overview, type Proposal, type Run } from "./discoveryApi";
import { T, type Lang } from "./discoveryCopy";
import {
  POLL_MS, homeState, inOrder, isFinished, isRunning, minutesFrom, pollDecision, sayError, stepText, viewHref, waitingProposals,
} from "./discoveryLogic";
import { ChangeLine, FindingMeta, FindingRow, Loading, Problem, ProposalRow, When, announceChange, useLoad } from "./discoveryUi";
import { usePolling } from "./poll";

type Push = (text: string, options?: { tone?: "ok" | "bad" | "warn"; undo?: () => void }) => number;

export function DiscoveryHome({ lang, canManage, push, onConnection }: {
  lang: Lang; canManage: boolean; push: Push; onConnection: () => void;
}) {
  const t = T[lang];
  const [overview, reload] = useLoad(() => discovery.overview(lang), lang);
  const o = overview.data;
  // The waiting changes, for the strip. A person who may not list them gets nothing, and nothing is drawn.
  const [live, reloadLive] = useLoad(() => discovery.proposals(lang, { status: "live" }).catch(() => null), lang);

  // The run being followed: started here, or already running when the screen opened.
  const [followed, setFollowed] = useState<Run | null>(null);
  const [slow, setSlow] = useState(false);
  const [tooSoon, setTooSoon] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [sheet, setSheet] = useState<Finding | null>(null);
  const [approval, setApproval] = useState<Proposal | null>(null);
  const polls = useRef(0);
  const focusCard = useRef(false);
  const cardHeading = useRef<HTMLHeadingElement>(null);

  // A check-up that was already going when the screen opened is followed from where it is.
  const lastRun = o?.last_run ?? null;
  const lastRunId = lastRun?.id ?? "";
  const lastRunning = isRunning(lastRun);
  useEffect(() => {
    if (!lastRunning || !lastRun) return;
    const start = setTimeout(() => setFollowed((cur) => cur ?? lastRun), 0);
    return () => clearTimeout(start);
    // Only a different run is a new one to follow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRunId, lastRunning]);

  // A check-up that is over: say so, take its results, and stop following it.
  const finish = useCallback(async (run: Run) => {
    if (run.status === "done") setAnnounce(T[lang].runFinished(run.score));
    await reload(true);
    setFollowed(null);
  }, [lang, reload]);

  const followedId = followed?.id ?? "";
  const following = !!followed && !isFinished(followed) && !slow;
  const askRun = useCallback(async () => {
    if (!followedId) return;
    try {
      const run = await discovery.run(lang, followedId);
      polls.current += 1;
      setFollowed(run);
      if (isFinished(run)) await finish(run);
      else if (pollDecision(run, polls.current) === "slow") setSlow(true);
    } catch {
      // A look that fails is asked again at the next beat; the page says nothing meanwhile.
    }
  }, [followedId, finish, lang]);
  usePolling(askRun, POLL_MS, following);

  async function runNow() {
    setBusy(true);
    setTooSoon(null);
    setSlow(false);
    try {
      const run = await discovery.startRun(lang);
      polls.current = 0;
      // The engine may be done before it answers: then there is nothing to follow, only results to take.
      if (isFinished(run)) await finish(run);
      else setFollowed(run);
    } catch (error) {
      if (error instanceof DiscoveryError && (error.code === "run_too_soon" || error.status === 429)) setTooSoon(minutesFrom(error.retryAfter));
      else push(sayError(error, lang), { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  // The "too soon" line is a minute count, not a clock: it clears itself when the time is up.
  useEffect(() => {
    if (tooSoon === null) return;
    const clear = setTimeout(() => setTooSoon(null), tooSoon * 60_000);
    return () => clearTimeout(clear);
  }, [tooSoon]);

  async function turnOn() {
    setBusy(true);
    try {
      await discovery.setConnection("sample", true);
      await reload(true);
      onConnection();
    } catch (error) {
      push(sayError(error, lang), { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  async function putBack(id: string) {
    try {
      await discovery.setStatus(lang, id, "open");
      await reload(true);
    } catch (error) {
      push(sayError(error, lang), { tone: "bad" });
    }
  }
  async function mark(f: Finding, status: "owner_done" | "skipped") {
    setBusy(true);
    focusCard.current = true;
    try {
      await discovery.setStatus(lang, f.id, status);
      push(status === "owner_done" ? t.toastDone : t.toastSkipped, { undo: () => void putBack(f.id) });
      await reload(true);
    } catch (error) {
      push(sayError(error, lang), { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }
  function changed(change: Change) {
    const status = change.finding.status;
    setSheet(null);
    if (status === "owner_done" || status === "skipped") {
      push(status === "owner_done" ? t.toastDone : t.toastSkipped, { undo: () => void putBack(change.finding.id) });
    } else {
      push(t.toastBack);
    }
    focusCard.current = true;
    void reload(true);
  }

  // A change moved (approved, declined, undone, prepared): the overview and the strip are asked again, once.
  function proposalMoved() {
    announceChange();
    void reload(true);
    void reloadLive(true);
  }

  // After the card is acted on, the next one takes the focus, so a keyboard or a screen reader
  // lands on what is new and not on the page's top.
  const nextId = o?.next?.id ?? "";
  useEffect(() => {
    if (!focusCard.current) return;
    focusCard.current = false;
    cardHeading.current?.focus({ preventScroll: true });
  }, [nextId, o]);

  if (overview.error && !o) return <Problem lang={lang} error={overview.error} onRetry={() => void reload()} />;
  if (!o) return <Loading lang={lang} />;

  const state = homeState(o);
  const running = (!!followed && !isFinished(followed)) || (!followed && isRunning(o.last_run));
  const shown = followed ?? o.last_run;
  const failed = !running && o.last_run?.status === "failed" ? o.last_run : null;
  const open = (f: Finding) => setSheet(f);
  // While a change waits for this person, the one Volt button is the one that reviews it.
  const waitingN = o.proposals?.waiting ?? 0;
  const runMain = waitingN === 0;
  const runButton = tooSoon !== null
    ? <p className="dv-toosoon" role="status">{t.tooSoon(tooSoon)}</p>
    : <button type="button" className={`btn ${runMain ? "volt" : ""} ct-btn`} disabled={busy} onClick={() => void runNow()}>{failed ? t.runAgain : t.runCheckup}</button>;
  const scoreAction = running ? null : waitingN > 0
    ? (
      <>
        <Link className="btn volt ct-btn" href={viewHref("proposals")}>{t.reviewChanges(waitingN)}</Link>
        {runButton}
      </>
    )
    : runButton;
  const strip = (live.data?.items ?? []).filter((p) => p.status === "proposed").slice(0, 3);

  return (
    <div className="dv-home">
      <p className="ct-sr" role="status" aria-live="polite">{announce}</p>

      {state === "noConnection" && (
        <>
          <Empty title={t.noConnectionTitle} text={t.noConnectionText}
            action={canManage
              ? <button type="button" className="btn volt ct-btn" disabled={busy} onClick={() => void turnOn()}>{t.turnOn}</button>
              : <p className="ct-quiet">{t.noConnectionAgent}</p>} />
          <Slots lang={lang} />
        </>
      )}

      {state !== "noConnection" && (
        <>
          {state !== "noRun" && <ScoreLine lang={lang} o={o} action={scoreAction} />}

          {running && shown && <RunPanel lang={lang} run={shown} slow={slow} onCheck={() => { setSlow(false); polls.current = 0; }} />}

          {failed && <FailedPanel lang={lang} run={failed} />}

          {state === "noRun" && !running && (
            <>
              <Empty title={t.noRunTitle} text={t.noRunText} action={runButton} />
              <Slots lang={lang} />
            </>
          )}

          {state === "caughtUp" && !running && (
            <section className="sh-tile raised dv-caught" aria-labelledby="dv-caught-h">
              <h2 id="dv-caught-h">{t.caughtUpTitle}</h2>
              <p>{t.caughtUpText}</p>
            </section>
          )}

          {state === "content" && o.next && !running && (
            <NextCard lang={lang} f={o.next} busy={busy} canMark={canManage} headingRef={cardHeading}
              onDone={() => void mark(o.next!, "owner_done")} onSkip={() => void mark(o.next!, "skipped")} onOpen={() => open(o.next!)}
              onReview={setApproval} />
          )}

          {state === "content" && o.up_next.length > 0 && (
            <section className="dv-block" aria-labelledby="dv-up-h">
              <h2 id="dv-up-h">{t.upNext}</h2>
              <ul className="dv-list">{o.up_next.map((f) => <FindingRow key={f.id} f={f} lang={lang} onOpen={() => open(f)} />)}</ul>
              {o.counts.open > 1 + o.up_next.length && <Link className="dv-link" href={viewHref("todo")}>{t.allToDo}</Link>}
            </section>
          )}

          {state === "content" && strip.length > 0 && (
            <section className="dv-block" aria-labelledby="dv-prop-h">
              <h2 id="dv-prop-h">{t.proposalsTitle}</h2>
              <ul className="dv-list">{strip.map((p) => <ProposalRow key={p.id} p={p} lang={lang} onOpen={() => setApproval(p)} />)}</ul>
              <Link className="dv-link" href={viewHref("proposals")}>{t.allProposals}</Link>
            </section>
          )}

          {state !== "noRun" && o.done.length > 0 && (
            <section className="dv-block" aria-labelledby="dv-done-h">
              <h2 id="dv-done-h">{t.done}</h2>
              <ul className="dv-list">{o.done.map((f) => <FindingRow key={f.id} f={f} lang={lang} status onOpen={() => open(f)} />)}</ul>
            </section>
          )}
        </>
      )}

      {sheet && <FindingFlow lang={lang} id={sheet.id} initial={sheet} canMark={canManage} onClose={() => setSheet(null)} onChanged={changed} onProposalChanged={proposalMoved} />}
      {approval && <ApprovalSheet lang={lang} id={approval.id} initial={approval} onClose={() => setApproval(null)} onChanged={proposalMoved} />}
    </div>
  );
}

// ── the score line ──────────────────────────────────────

function ScoreLine({ lang, o, action }: { lang: Lang; o: Overview; action: React.ReactNode }) {
  const t = T[lang];
  const change = o.delta
    ? o.delta.score_change > 0 ? t.changeUp(o.delta.score_change)
      : o.delta.score_change < 0 ? t.changeDown(-o.delta.score_change) : t.changeSame
    : "";
  const dir = o.delta ? (o.delta.score_change > 0 ? "up" : o.delta.score_change < 0 ? "down" : "same") : "";
  return (
    <section className="dv-score" aria-label={t.scoreLabel}>
      <div className="dv-score-main">
        {o.score === null ? (
          <p className="dv-nomeasure">{t.notMeasured}</p>
        ) : (
          <p className="dv-figure num">
            <span className="ct-sr">{t.scoreSr(o.score)}</span>
            <b aria-hidden="true">{o.score}</b>
            <span className="dv-of" aria-hidden="true">{t.scoreOf}</span>
          </p>
        )}
        {change && (
          <p className={`dv-change ${dir}`}>
            <span aria-hidden="true">{dir === "up" ? "▲" : dir === "down" ? "▼" : "–"}</span> {change}
          </p>
        )}
        {o.headline && <p className="dv-rule"><span className="dv-rule-tag">{t.byRule}</span> <bdi dir="auto">{o.headline}</bdi></p>}
        <p className="dv-meta ct-quiet">
          {o.last_run?.finished_at && <>{t.lastCheck("")}<When iso={o.last_run.finished_at} lang={lang} /> · </>}
          <Link className="dv-link" href={viewHref("reports")}>{t.howScored}</Link>
        </p>
      </div>
      {action && <div className="dv-score-act">{action}</div>}
    </section>
  );
}

// ── the one card ────────────────────────────────────────

function NextCard({ lang, f, busy, canMark, headingRef, onDone, onSkip, onOpen, onReview }: {
  lang: Lang; f: Finding; busy: boolean; canMark: boolean; headingRef: React.RefObject<HTMLHeadingElement | null>;
  onDone: () => void; onSkip: () => void; onOpen: () => void; onReview: (proposal: Proposal) => void;
}) {
  const t = T[lang];
  // The change waiting for this finding, if there is one: the card shows it exactly, and only opens it.
  const change = waitingProposals(f)[0] ?? null;
  return (
    <section key={f.id} className="sh-tile raised folded dv-card" aria-labelledby="dv-next-h">
      <p className="dv-eyebrow">{t.doNext}</p>
      <h2 id="dv-next-h" ref={headingRef} tabIndex={-1}><bdi dir="auto">{f.title}</bdi></h2>
      <p className="dv-card-meta"><FindingMeta f={f} lang={lang} /></p>
      <dl className="dv-facts">
        {f.why && <div><dt>{t.why}</dt><dd><bdi dir="auto">{f.why}</bdi></dd></div>}
        {f.what_happens && <div><dt>{t.whatHappens}</dt><dd><bdi dir="auto">{f.what_happens}</bdi></dd></div>}
        {f.what_is_needed && <div><dt>{t.whatNeeded}</dt><dd><bdi dir="auto">{f.what_is_needed}</bdi></dd></div>}
      </dl>
      {change && (
        <div className="dv-cardchange">
          <p className="dv-cardchange-label">{t.theChange}</p>
          <ChangeLine p={change} lang={lang} />
        </div>
      )}
      <div className="dv-actions">
        {change && <button type="button" className="btn primary ct-btn" onClick={() => onReview(change)}>{t.reviewChange}</button>}
        {canMark && (
          <>
            <button type="button" className="btn ct-btn" disabled={busy} onClick={onDone}>{t.didThis}</button>
            <button type="button" className="btn ghost ct-btn" disabled={busy} onClick={onSkip}>{t.skip}</button>
          </>
        )}
        <button type="button" className="ct-linkbtn dv-evidence-link" onClick={onOpen}>{t.seeEvidence}</button>
      </div>
      {canMark && change && <p className="ct-quiet dv-owner-note">{t.closesChange}</p>}
      {!canMark && <p className="ct-quiet dv-owner-note">{t.ownerMarks}</p>}
    </section>
  );
}

// ── empty: a real screen, with its structure drawn as slots ─

function Empty({ title, text, action }: { title: string; text: string; action: React.ReactNode }) {
  return (
    <section className="sh-tile raised folded ct-empty dv-empty" aria-labelledby="dv-empty-h">
      <span className="sh-glyph"><Icon name="search" /></span>
      <h2 id="dv-empty-h">{title}</h2>
      <p>{text}</p>
      {action}
    </section>
  );
}

function Slots({ lang }: { lang: Lang }) {
  const t = T[lang];
  return (
    <ul className="dv-slots" aria-hidden="false">
      {[t.slotScore, t.slotNext, t.slotDone].map((text) => (
        <li key={text} className="dv-slot"><span className="dv-pending" aria-hidden="true" />{text}</li>
      ))}
    </ul>
  );
}

// ── a check-up in progress ──────────────────────────────

function RunPanel({ lang, run, slow, onCheck }: { lang: Lang; run: Run; slow: boolean; onCheck: () => void }) {
  const t = T[lang];
  // Steps already on the page when it opened are drawn in place; only the ones that arrive after it
  // come in, so a poll never moves what was there.
  const [first] = useState(() => new Set(run.steps.map((s) => s.seq)));
  const steps = inOrder(run.steps);
  return (
    <section className="sh-tile dv-running" aria-labelledby="dv-run-h">
      <h2 id="dv-run-h">{run.status === "queued" && steps.length === 0 ? t.queuedTitle : t.runningTitle}</h2>
      <p className="ct-quiet">{t.runningText}</p>
      <ol className="dv-steps" aria-live="polite" aria-relevant="additions" aria-label={t.runningTitle}>
        {steps.map((step) => {
          const said = stepText(step, lang);
          return (
            <li key={step.seq} className={`${first.has(step.seq) ? "" : "fresh"} ${step.ok ? "" : "bad"}`}>
              <span className="dv-tick" aria-hidden="true"><Icon name={step.ok ? "check" : "warn"} /></span>
              <span className="dv-step-text" dir={said.foreign ? "ltr" : undefined} lang={said.foreign ? "en" : undefined}>
                {said.text}{!step.ok && <> · {t.stepNotDone}</>}
              </span>
            </li>
          );
        })}
      </ol>
      {slow ? (
        <div className="dv-slow" role="status">
          <b>{t.slowTitle}</b>
          <span>{t.slowText}</span>
          <button type="button" className="btn ct-btn" onClick={onCheck}><Icon name="retry" />{t.checkAgain}</button>
        </div>
      ) : (
        <p className="dv-nextstep">{t.nextStep}</p>
      )}
    </section>
  );
}

function FailedPanel({ lang, run }: { lang: Lang; run: Run }) {
  const t = T[lang];
  const [detail] = useLoad(() => discovery.run(lang, run.id), run.id);
  const steps = inOrder(detail.data?.steps ?? run.steps);
  const reason = detail.data?.error ?? run.error;
  return (
    <section className="dv-failed" role="alert" aria-labelledby="dv-failed-h">
      <h2 id="dv-failed-h"><Icon name="warn" />{t.failedTitle}</h2>
      <p>{t.failedText}</p>
      {reason && <p className="dv-reason"><span className="ct-quiet">{t.reasonLabel}: </span><bdi dir="auto">{reason}</bdi></p>}
      {steps.length > 0 && (
        <Fold title={t.failedLog}>
          <ol className="dv-log">
            {steps.map((step) => {
              const said = stepText(step, lang);
              return <li key={step.seq}><span dir={said.foreign ? "ltr" : undefined} lang={said.foreign ? "en" : undefined}>{said.text}{!step.ok && <> · {t.stepNotDone}</>}</span></li>;
            })}
          </ol>
        </Fold>
      )}
    </section>
  );
}
