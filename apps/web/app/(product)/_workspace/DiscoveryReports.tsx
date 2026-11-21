"use client";

// Discovery's Reports (ALY-322, spec 065 "Screens"): a month picker (only months that have a
// check-up in them), then the month's report: the headline the API built by rule, the score at
// the start and the end, what was fixed, what is still open, what is new, and the score by part
// with "Not measured yet" wherever a part was not measured. It prints on its own, without the
// workspace around it. There is no export.

import { useState } from "react";
import { discovery, DiscoveryError, PARTS_SHOWN, type Finding, type Report } from "./discoveryApi";
import { T, type Lang } from "./discoveryCopy";
import { lastMonths, monthName } from "./discoveryLogic";
import { Loading, Problem, When, useLoad } from "./discoveryUi";

/** How many calendar months back the picker looks for a check-up. */
const LOOK_BACK = 6;

export function DiscoveryReports({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [month, setMonth] = useState("");
  // There is no list of months in the API, so each of the last few is asked for and the ones with a
  // check-up in them are kept. A month that answers with an error is a month without a report.
  const [list, reload] = useLoad<Report[]>(async () => {
    const months = lastMonths(new Date(), LOOK_BACK);
    const found = await Promise.all(months.map((m) => discovery.report(lang, m).catch((error) => {
      // Only a month with no report is quietly left out; a switched-off module or a broken connection is the screen's to say.
      if (error instanceof DiscoveryError && (error.code === "module_off" || error.status === 0 || error.status === 403 || error.status >= 500)) throw error;
      return null;
    })));
    return found.filter((r): r is Report => r !== null && r.runs > 0);
  }, lang);

  if (list.error && !list.data) return <Problem lang={lang} error={list.error} onRetry={() => void reload()} />;
  if (!list.data) return <Loading lang={lang} />;
  const reports = list.data;
  if (reports.length === 0) {
    return <p className="dv-slot dv-slot-wide"><span className="dv-pending" aria-hidden="true" />{t.reportsEmpty}</p>;
  }
  const report = reports.find((r) => r.month === month) ?? reports[0];

  return (
    <div className="dv-reports">
      <label className="ct-field dv-month dv-noprint">
        <span className="ct-label">{t.monthLabel}</span>
        <select className="ct-select" value={report.month} onChange={(e) => setMonth(e.target.value)}>
          {reports.map((r) => <option key={r.month} value={r.month}>{monthName(r.month, lang)}</option>)}
        </select>
      </label>
      <ReportPaper lang={lang} report={report} />
    </div>
  );
}

function ReportPaper({ lang, report }: { lang: Lang; report: Report }) {
  const t = T[lang];
  const change = report.change;
  const changeText = change === null ? "" : change > 0 ? t.changeUpMonth(change) : change < 0 ? t.changeDownMonth(-change) : t.changeSameMonth;
  return (
    <article className="dv-report" lang={lang} aria-labelledby="dv-report-h">
      <header>
        <h2 id="dv-report-h">{monthName(report.month, lang)}</h2>
        {report.headline && <p className="dv-headline"><bdi dir="auto">{report.headline}</bdi></p>}
        <p className="ct-quiet dv-report-meta">
          {t.checkups(report.runs)}
          {report.generated_at && <> · {t.preparedOn("")}<When iso={report.generated_at} lang={lang} /></>}
        </p>
      </header>

      <section className="dv-report-sec" aria-labelledby="dv-r-score">
        <h3 id="dv-r-score">{t.reportScore}</h3>
        <dl className={`dv-startend ${report.runs > 1 ? "" : "one"}`}>
          {report.runs > 1 && (
            <div><dt>{t.scoreStart}</dt><dd className="num">{report.score_start === null ? <span className="dv-none">{t.notMeasured}</span> : <><bdi>{report.score_start}</bdi> <small>{t.scoreOf}</small></>}</dd></div>
          )}
          <div>
            <dt>{report.runs > 1 ? t.scoreEnd : t.scoreLabel}</dt>
            <dd className="num">{report.score_end === null ? <span className="dv-none">{t.notMeasured}</span> : <><bdi>{report.score_end}</bdi> <small>{t.scoreOf}</small></>}</dd>
          </div>
        </dl>
        {changeText && <p className="dv-change">{changeText}</p>}
      </section>

      <section className="dv-report-sec" aria-labelledby="dv-r-parts">
        <h3 id="dv-r-parts">{t.byPart}</h3>
        <ul className="dv-parts">
          {PARTS_SHOWN.map((key) => {
            const part = report.by_part[key];
            const value = part?.measured && part.value !== null ? part.value : null;
            return (
              <li key={key}>
                <div className="dv-part-head">
                  <b>{t.partNames[key]}</b>
                  {value === null ? <span className="dv-none">{t.notMeasured}</span> : <span className="num">{t.measuredOf(value)}</span>}
                </div>
                <small className="ct-quiet">{t.partHints[key]}</small>
                {value === null
                  ? <span className="dv-track empty" aria-hidden="true" />
                  : <span className="dv-track" aria-hidden="true"><span style={{ inlineSize: `${Math.min(100, Math.max(0, value))}%` }} /></span>}
              </li>
            );
          })}
        </ul>
      </section>

      <FindingsBlock lang={lang} id="fixed" title={t.fixedTitle} items={report.fixed} />
      <FindingsBlock lang={lang} id="open" title={t.stillOpenTitle} items={report.still_open} />
      <FindingsBlock lang={lang} id="new" title={t.newTitle} items={report.new} />
    </article>
  );
}

function FindingsBlock({ lang, id, title, items }: { lang: Lang; id: string; title: string; items: Finding[] }) {
  const t = T[lang];
  return (
    <section className="dv-report-sec" aria-labelledby={`dv-r-${id}`}>
      <h3 id={`dv-r-${id}`}>{title} <span className="num dv-n">{items.length}</span></h3>
      {items.length === 0 ? <p className="ct-quiet">{t.none}</p> : (
        <ul className="dv-plain">
          {items.map((f) => (
            <li key={f.id}>
              <span><bdi dir="auto">{f.title}</bdi></span>
              <small className="ct-quiet">{f.location?.name ?? t.wholeBusiness}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
