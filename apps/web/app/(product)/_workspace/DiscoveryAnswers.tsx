"use client";

// Discovery's Answers view (ALY-326, spec 068, D-168): is the business named when people ask answer
// tools for its trade in its city. It shows what the API counted, by rule, and nothing else: the
// headline, one line per question (named or not, where in the answer's list, who else was named),
// who else the answers name, the check-ups one after another, and the answer itself as quoted text.
// An answer is somebody else's words: it is drawn as text, never as markup, in its own language and
// direction. The page's one Volt button is "Run check-up" (or "Switch on" while it is off). Nothing
// here says it asks a model, and a sample is marked as one. It reads the address's `?view=answers`
// through `Discovery.tsx`.

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Fold, Icon } from "./CatalogUi";
import { discovery, DiscoveryError } from "./discoveryApi";
import { answers as api, type AnswerItem, type AnswersView } from "./discoveryAnswersApi";
import { A } from "./discoveryAnswersCopy";
import {
  alsoNamedLine, answerKind, answersState, barWidth, canSave, draftOf, placeText, recent, settingsBody, type Draft,
} from "./discoveryAnswersLogic";
import { T, type Lang } from "./discoveryCopy";
import { POLL_MS, isFinished, minutesFrom, pollDecision, sayError, viewHref } from "./discoveryLogic";
import { Loading, Problem, When, useLoad } from "./discoveryUi";
import { usePolling } from "./poll";
import "./discoveryAnswers.css";

type Push = (text: string, options?: { tone?: "ok" | "bad" | "warn"; undo?: () => void }) => number;

export function DiscoveryAnswers({ lang, canManage, push }: { lang: Lang; canManage: boolean; push: Push }) {
  const t = T[lang];
  const a = A[lang];
  const [loaded, reload] = useLoad<AnswersView>(() => api.get(lang), lang);
  const view = loaded.data;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [followed, setFollowed] = useState("");
  const [slow, setSlow] = useState(false);
  const [tooSoon, setTooSoon] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const polls = useRef(0);

  // A check-up that was started here is asked about every 1.5 s, and never again once it is over.
  const following = followed !== "" && !slow;
  const askRun = useCallback(async () => {
    if (!followed) return;
    try {
      const run = await discovery.run(lang, followed);
      polls.current += 1;
      if (isFinished(run)) {
        setFollowed("");
        await reload(true);
        setAnnounce(T[lang].runFinished(run.score));
      } else if (pollDecision(run, polls.current) === "slow") setSlow(true);
    } catch {
      // A look that fails is asked again at the next beat.
    }
  }, [followed, lang, reload]);
  usePolling(askRun, POLL_MS, following);

  async function runNow() {
    setBusy(true);
    setTooSoon(null);
    setSlow(false);
    try {
      const run = await discovery.startRun(lang);
      polls.current = 0;
      if (isFinished(run)) {
        await reload(true);
        setAnnounce(T[lang].runFinished(run.score));
      } else setFollowed(run.id);
    } catch (error) {
      if (error instanceof DiscoveryError && (error.code === "run_too_soon" || error.status === 429)) setTooSoon(minutesFrom(error.retryAfter));
      else push(sayError(error, lang), { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  async function change(body: Parameters<typeof api.set>[1], done: string) {
    setBusy(true);
    try {
      await api.set(lang, body);
      setDraft(null);
      await reload(true);
      push(done);
    } catch (error) {
      push(sayError(error, lang), { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  if (loaded.error && !view) return <Problem lang={lang} error={loaded.error} onRetry={() => void reload()} />;
  if (!view) return <Loading lang={lang} />;

  const state = answersState(view);
  const d = draft ?? draftOf(view);
  const running = followed !== "";
  const form = (
    <SettingsForm lang={lang} view={view} draft={d} busy={busy} onDraft={setDraft}
      onSave={() => void change(settingsBody(d), a.saved)} />
  );

  return (
    <div className="dv-answers">
      <p className="ct-sr" role="status" aria-live="polite">{announce}</p>
      <p className="dv-intro">{a.intro}</p>

      {state === "off" && (
        <section className="sh-tile raised folded ct-empty dv-empty" aria-labelledby="dv-ans-off-h">
          <span className="sh-glyph"><Icon name="search" /></span>
          <h2 id="dv-ans-off-h">{a.offTitle}</h2>
          <p>{a.offText}</p>
          {canManage ? (
            <>
              {form}
              <button type="button" className="btn volt ct-btn" disabled={busy} onClick={() => void change(settingsBody(d, true), a.switchedOn)}>{a.switchOn}</button>
            </>
          ) : <p className="ct-quiet">{a.offAgent}</p>}
        </section>
      )}

      {state !== "off" && (
        <>
          <section className="dv-score dv-ans-score" aria-labelledby="dv-ans-h">
            <div className="dv-score-main">
              <h2 id="dv-ans-h" className="dv-ans-headline"><bdi dir="auto">{view.headline}</bdi></h2>
              {view.last?.sample && (
                <p className="dv-ans-sample">{view.sample_note}</p>
              )}
              {view.change && (
                <p className={`dv-change ${view.change.share_change > 0 ? "up" : view.change.share_change < 0 ? "down" : "same"}`}>
                  <span aria-hidden="true">{view.change.share_change > 0 ? "▲" : view.change.share_change < 0 ? "▼" : "–"}</span>{" "}
                  {view.change.share_change > 0 ? t.changeUp(view.change.share_change) : view.change.share_change < 0 ? t.changeDown(-view.change.share_change) : t.changeSame}
                </p>
              )}
              {view.last?.asked_at && <p className="dv-meta ct-quiet">{a.asked} <When iso={view.last.asked_at} lang={lang} /></p>}
            </div>
            <div className="dv-score-act">
              {running ? null : tooSoon !== null
                ? <p className="dv-toosoon" role="status">{t.tooSoon(tooSoon)}</p>
                : <button type="button" className="btn volt ct-btn" disabled={busy} onClick={() => void runNow()}>{t.runCheckup}</button>}
            </div>
          </section>

          {running && (
            <section className="sh-tile raised dv-running" role="status" aria-live="polite">
              <h2>{a.running}</h2>
              <p>{a.runningText}</p>
              {slow && (
                <div className="dv-slow">
                  <p>{a.slow}</p>
                  <button type="button" className="btn ct-btn" onClick={() => { setSlow(false); polls.current = 0; }}>{a.checkNow}</button>
                </div>
              )}
            </section>
          )}

          {state === "notAsked" && <p className="dv-slot dv-slot-wide"><span className="dv-pending" aria-hidden="true" />{a.notAskedYet}</p>}
        </>
      )}

      {view.last && (
        <>
          {state === "off" && view.last.sample && (
            <p className="dv-ans-sample">{view.sample_note}</p>
          )}
          <section className="dv-block" aria-labelledby="dv-ans-list-h">
              <h2 id="dv-ans-list-h">{a.answersTitle}</h2>
              <ul className="dv-list dv-ans-list">
                {view.last.answers.map((item) => <AnswerRow key={item.id} item={item} lang={lang} />)}
              </ul>
            </section>

          <section className="dv-block" aria-labelledby="dv-ans-comp-h">
              <h2 id="dv-ans-comp-h">{a.competitorsTitle}</h2>
              <p className="ct-quiet dv-ans-note">{a.competitorsNote}</p>
              {view.last.competitors.length === 0 ? <p className="dv-empty-line">{a.competitorsNone}</p> : (
                <ul className="dv-plain dv-ans-comp">
                  {view.last.competitors.map((c) => (
                    <li key={c.name}><span><bdi dir="auto">{c.name}</bdi></span><small className="ct-quiet">{a.inAnswers(c.answers)}</small></li>
                  ))}
                </ul>
              )}
            </section>

          {view.history.length > 0 && (
            <section className="dv-block" aria-labelledby="dv-ans-hist-h">
              <h2 id="dv-ans-hist-h">{a.historyTitle}</h2>
              <ul className="dv-parts dv-ans-hist">
                {recent(view.history).map((h) => {
                  const width = barWidth(h.share);
                  return (
                    <li key={h.run_id}>
                      <div className="dv-part-head">
                        <b><When iso={h.asked_at} lang={lang} /></b>
                        <span className="num">{h.measured ? a.namedOf(h.named, h.counted) : a.tooFew}</span>
                      </div>
                      {width === null
                        ? <span className="dv-track empty" aria-hidden="true" />
                        : <span className="dv-track" aria-hidden="true"><span style={{ inlineSize: `${width}%` }} /></span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {state !== "off" && (
        <>
          <section className="dv-block" aria-labelledby="dv-ans-q-h">
            <h2 id="dv-ans-q-h">{a.questionsTitle}</h2>
            <p className="ct-quiet dv-ans-note">{a.questionsNote}</p>
            {view.questions.length > 0 && (
              <ul className="dv-plain dv-ans-questions">
                {view.questions.map((q) => (
                  <li key={`${q.key}-${q.lang}`}>
                    <span lang={q.lang} dir="auto">{q.text}</span>
                    <small className="ct-quiet">{q.lang === "ar" ? a.inArabic : a.inEnglish}</small>
                  </li>
                ))}
              </ul>
            )}
            {canManage ? (
              <>
                {form}
                {view.enabled && (
                  <div className="dv-actions">
                    <button type="button" className="btn small" disabled={busy} onClick={() => void change({ enabled: false }, a.switchedOff)}>{a.switchOff}</button>
                  </div>
                )}
              </>
            ) : view.settings.trade && view.settings.city
              ? <p className="ct-quiet">{a.readOnlyLine(view.settings.trade_label, view.settings.city_label)}</p>
              : null}
          </section>

          <Fold title={a.howTitle}>
            <div className="dv-ans-how">
              <p className="dv-rule">{view.rule}</p>
              <p>{view.limits}</p>
              <p>{view.caution}</p>
            </div>
          </Fold>
        </>
      )}
    </div>
  );
}

// ── one answer ──────────────────────────────────────────

function AnswerRow({ item, lang }: { item: AnswerItem; lang: Lang }) {
  const a = A[lang];
  const kind = answerKind(item);
  const where = placeText(item, lang);
  return (
    <li className="dv-ans">
      <div className="dv-ans-top">
        <span className={`sh-pill dv-pill ${kind === "named" ? "active" : kind === "notNamed" ? "quiet" : "wait"}`}>
          {kind === "named" ? a.named : kind === "notNamed" ? a.notNamed : a.notCounted}
        </span>
        {where && <span className="dv-ans-where">{where}</span>}
      </div>
      <p className="dv-ans-q" lang={item.lang} dir="auto">{item.question}</p>
      {kind === "notCounted" && item.error && <p className="dv-ans-err">{item.error}</p>}
      {item.competitors.length > 0 && (
        <p className="dv-ans-also"><span className="ct-quiet">{a.alsoNamed}:</span> <bdi dir="auto">{alsoNamedLine(item)}</bdi></p>
      )}
      {item.text && (
        <Fold title={a.whatItSaid} summary={item.engine_label || undefined}>
          {/* Somebody else's words: text only, in the language and direction they came in. */}
          <blockquote className="dv-quote" lang={item.lang} dir="auto"><p>{item.text}</p></blockquote>
          {item.matched && <p className="ct-quiet dv-ans-matched">{a.matchedOn(item.matched)}</p>}
        </Fold>
      )}
    </li>
  );
}

// ── the settings, for an owner or an admin ──────────────

function SettingsForm({ lang, view, draft, busy, onDraft, onSave }: {
  lang: Lang; view: AnswersView; draft: Draft; busy: boolean; onDraft: (d: Draft) => void; onSave: () => void;
}) {
  const a = A[lang];
  const { trades, cities } = view.options;
  return (
    <form className="dv-ans-form" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
      <label className="ct-field">
        <span className="ct-label">{a.tradeLabel}</span>
        <select className="ct-select" value={draft.trade} onChange={(e) => onDraft({ ...draft, trade: e.target.value })}>
          {!draft.trade && <option value="">{a.chooseOne}</option>}
          {trades.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </label>
      <label className="ct-field">
        <span className="ct-label">{a.cityLabel}</span>
        <select className="ct-select" value={draft.city} onChange={(e) => onDraft({ ...draft, city: e.target.value })}>
          {!draft.city && <option value="">{a.chooseOne}</option>}
          {cities.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </label>
      {view.enabled && <button type="submit" className="btn ct-btn" disabled={busy || !canSave(view, draft)}>{a.save}</button>}
    </form>
  );
}

// ── Home: one quiet line, only when the answers were measured ────

/** "Named in 4 of 6 answers" under Home's score, with a link to the view. Nothing while it was not measured. */
export function AnswersLine({ lang }: { lang: Lang }) {
  const [loaded] = useLoad<AnswersView | null>(() => api.get(lang).catch(() => null), lang);
  const view = loaded.data;
  if (!view || !view.enabled || !view.last?.measured) return null;
  return (
    <p className="dv-ans-line">
      <bdi dir="auto">{view.headline}</bdi>{" "}
      <Link className="dv-link" href={viewHref("answers")}>{A[lang].homeLink}</Link>
    </p>
  );
}
