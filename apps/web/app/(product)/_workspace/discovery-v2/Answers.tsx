"use client";

// Answers, Discovery v2, on the Answers check's v2 API (workstream G, PR #362): "Named in N of M
// answers", one card of dots per language and one row per answer tool with a dot meter per
// language (never added into one score). "How sure is this?" gives each tool in each language its
// own likely range (Wilson, 95%) on a 0 to 100% scale; a share and a change are named only from 30
// answers, so below that the screen says so plainly (`not_enough`: the sample never reaches 30)
// and shows the API's own reason for each. Then the pages the answers cited, with whether each
// matches what the owner confirmed, one answer quoted word for word as third-party text, and how
// it is measured (the API's method, rule, range note and limits).

import type { ReactNode } from "react";
import type { AnswerGroup, AnswersAnswer, CitedHost } from "./api2";
import { T2 } from "./copy2";
import type { D2Lang } from "./copy";
import { ScreenFrame, SourceTile, StatePill } from "./frame";
import { Ltr, dayTime } from "./parts";
import { answerParas, percentRuns, type AnswersView, type LangTally } from "./screens";

/** The API's sentence with each percent held left to right in its own <bdi> (Arabic keeps «79%» in order). */
const withPercents = (text: string) => percentRuns(text).map((part, i) => (part.pct ? <Ltr key={i}>{part.text}</Ltr> : <span key={i}>{part.text}</span>));

export function Answers({ lang, view, api, tabs, foot }: { lang: D2Lang; view: AnswersView; api: AnswersAnswer; tabs: ReactNode; foot?: ReactNode }) {
  const t = T2[lang];
  const langName = (code: string) => (code === "ar" ? t.langAr : t.langEn);

  if (view.state !== "content") {
    const [title, body] = view.state === "off" ? [t.answersOff, t.answersOffBody] : view.state === "notAsked" ? [t.answersNotAsked, t.answersNotAskedBody] : [t.answersTooFew, api.caution];
    return (
      <ScreenFrame lang={lang} foot={foot}>
        {tabs}
        <section className="d2-brief"><h1 className="d2-display">{title}</h1><p className="d2-sub">{body}</p></section>
        {api.rule ? <Method lang={lang} api={api} /> : null}
      </ScreenFrame>
    );
  }

  const topic = t.topic(api.trade, api.city);
  const q = view.quote;
  return (
    <ScreenFrame lang={lang} foot={foot}>
      {tabs}
      <section className="d2-brief">
        <h1 className="d2-display">{t.answersTitle(view.named, view.counted)}</h1>
        <p className="d2-sub">{t.answersSub(topic, view.named, view.counted, view.en.named, view.en.counted, view.ar.named, view.ar.counted)}</p>
        <div className="d2s-dotcards">
          <DotCard lang={lang} name={t.langEn} tally={view.en} />
          <DotCard lang={lang} name={t.langAr} tally={view.ar} />
        </div>
        {view.askedAt ? <p className="d2-small d2-muted d2s-gap">{t.dotsNote(dayTime(view.askedAt, lang))}</p> : null}
        {view.sample && api.sampleNote ? <p className="d2-small d2-muted">{api.sampleNote}</p> : null}
      </section>

      {view.groups.length ? (
        <section className="d2s-sec" aria-labelledby="d2s-sure-title">
          <div className="d2s-sure d2s-sure-one">
            <div className="d2s-sure-c1">
              <h2 id="d2s-sure-title">{t.sureTitle}</h2>
              {view.notEnough ? (
                <div className="d2s-enough" role="note">
                  <b>{t.notEnoughTitle}</b>
                  <p>{t.notEnoughBody(view.most)}</p>
                </div>
              ) : null}
              <ul className="d2s-rg">
                {view.groups.map((g) => <RangeRow key={`${g.engine}-${g.lang}`} lang={lang} g={g} name={t.groupName(g.engine_label, g.lang_label || langName(g.lang))} />)}
              </ul>
              {api.rangeNote ? <p className="d2-small d2-muted">{api.rangeNote}</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="d2s-sec">
        <h2 className="d2-section">{t.toolsTitle}</h2>
        <ul className="d2s-card d2s-tools">
          {view.tools.map((tool, i) => (
            <li key={tool.engine}>
              <span className="d2s-tmark">{(i + 1).toLocaleString("en")}</span>
              <b className="d2s-tname">{tool.label}</b>
              <Meter lang={lang} name={t.langEn} tally={tool.en} />
              <Meter lang={lang} name={t.langAr} tally={tool.ar} />
            </li>
          ))}
        </ul>
        <p className="d2-small d2-muted d2s-gap">{t.toolsNote}</p>
      </section>

      <Cited lang={lang} api={api} hosts={view.cited} total={view.counted} />

      {q ? (
        <section className="d2s-sec">
          <h2 className="d2-section">{t.quoteTitle}</h2>
          <blockquote className="d2s-quote" lang={q.lang === "ar" ? "ar" : "en"} dir={q.lang === "ar" ? "rtl" : "ltr"}>
            <div className="d2s-q-head" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
              <span>{t.quoteHead(q.said_by || q.engine_label, langName(q.lang), dayTime(view.askedAt, lang))}</span>
              <span className="d2s-q-tag">{t.thirdParty}</span>
            </div>
            <p className="d2s-q-asked" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>{t.questionAsked} <bdi>{q.question}</bdi></p>
            <div className="d2s-q-text">
              {answerParas(q.text, q.matched).map((para, i) => (
                <p key={i}>{para.map((part, j) => {
                  const inner = part.mark ? <mark>{part.text}</mark> : part.text;
                  return part.strong ? <strong key={j}>{inner}</strong> : <span key={j}>{inner}</span>;
                })}</p>
              ))}
            </div>
            <div className="d2s-q-foot" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}><span>{api.quoteNote || t.quoteFoot}</span></div>
          </blockquote>
        </section>
      ) : null}

      <Method lang={lang} api={api} />
    </ScreenFrame>
  );
}

function DotCard({ lang, name, tally }: { lang: D2Lang; name: string; tally: LangTally }) {
  const t = T2[lang];
  return (
    <div className="d2s-dotcard" role="img" aria-label={t.dotsAria(name, tally.named, tally.counted)}>
      <header><b>{name}</b><span className="d2-tnum">{t.namedOf(tally.named, tally.counted)}</span></header>
      <div className="d2s-dd">{tally.dots.map((d, i) => <i key={i} className={d.named ? "d2s-y" : undefined} data-tip={t.dotTip(d.tool, d.named)} />)}</div>
      {tally.counted > 0 && tally.named === 0 ? <p className="d2s-note">{t.noneInLang(name)}</p> : null}
    </div>
  );
}

function Meter({ lang, name, tally }: { lang: D2Lang; name: string; tally: LangTally }) {
  const t = T2[lang];
  if (!tally.counted) return <span />;
  return (
    <span className="d2s-dmeter" role="img" aria-label={t.dotsAria(name, tally.named, tally.counted)}>
      <span className="d2s-ml">{name}</span>
      <span className="d2s-dm">{tally.dots.map((d, i) => <i key={i} className={d.named ? "d2s-y" : undefined} />)}</span>
      <b className="d2-tnum">{t.meterOf(tally.named, tally.counted)}</b>
    </span>
  );
}

/** One tool in one language: its count, its likely range on a 0 to 100% scale with the count's
 * own share as a point, the share only from 30 answers, and the API's reason for the change state. */
function RangeRow({ lang, g, name }: { lang: D2Lang; g: AnswerGroup; name: string }) {
  const t = T2[lang];
  const now = g.counted > 0 ? Math.round((g.named / g.counted) * 1000) / 10 : 0;
  return (
    <li>
      <div className="d2s-rg-h">
        <b>{name}</b>
        <span className="d2-tnum">{t.meterOf(g.named, g.counted)}</span>
      </div>
      {g.range ? (
        <>
          <div className="d2s-rg-bar" role="img" aria-label={t.sureAria(name, g.named, g.counted, g.range.low, g.range.high)} data-tip={t.rangeScale}>
            <span className="d2s-rg-band" style={{ insetInlineStart: `${g.range.low}%`, inlineSize: `${Math.max(0, g.range.high - g.range.low)}%` }} />
            <span className="d2s-rg-pt" style={{ insetInlineStart: `${now}%` }} />
          </div>
          <p className="d2s-rg-t">
            <span className="d2-tnum">{(() => { const r = t.sureRange(g.range.low, g.range.high); return <>{r.pre}<Ltr>{r.a}</Ltr>{r.mid}<Ltr>{r.b}</Ltr>{r.post}</>; })()}</span>
            {g.share !== null ? <> · <span className="d2-tnum">{(() => { const s = t.sureShare(g.share); return <>{s.pre}<Ltr>{s.a}</Ltr>{s.post}</>; })()}</span></> : null}
          </p>
        </>
      ) : null}
      {g.change.reason ? <p className="d2s-rg-r">{withPercents(g.change.reason)}</p> : null}
    </li>
  );
}

function Cited({ lang, api, hosts, total }: { lang: D2Lang; api: AnswersAnswer; hosts: CitedHost[]; total: number }) {
  const t = T2[lang];
  return (
    <section className="d2s-sec">
      <h2 className="d2-section">{api.sourcesTitle || t.citedTitle}</h2>
      {api.sourcesNote ? <p className="d2-small d2-muted d2s-gap">{api.sourcesNote}</p> : null}
      {hosts.length ? (
        <ul className="d2s-card d2s-srcs">
          {hosts.map((h) => {
            const title = h.titles[0] || h.host;
            const without = t.citedNoYou(h.answersWithoutYou);
            return (
              <li key={h.host}>
                <SourceTile where={title} />
                <div>
                  <b>{title}</b>
                  <small><Ltr>{h.host}</Ltr>{h.engineLabels.length ? <> · {t.citedTools(h.engineLabels.join(lang === "ar" ? "، " : ", "))}</> : null}</small>
                </div>
                <div className="d2s-cites">
                  <span className="d2s-meter"><i style={{ inlineSize: `${total ? Math.min(100, (h.answers / total) * 100) : 0}%` }} /></span>
                  <span className="d2-tnum">{t.citedOf(h.answers, total)}</span>
                  {without ? <small>{without}</small> : null}
                </div>
                <StatePill tone={h.check === "matches" ? "ok" : h.check === "differs" ? "warn" : "nm"}>{h.check_label || t.citedState[h.check]}</StatePill>
              </li>
            );
          })}
        </ul>
      ) : <p className="d2-small d2-muted">{t.citedEmpty}</p>}
    </section>
  );
}

function Method({ lang, api }: { lang: D2Lang; api: AnswersAnswer }) {
  const t = T2[lang];
  return (
    <div className="d2s-method">
      <b>{t.methodTitle}</b> {api.method} {api.rule} {api.limits} {t.notPartOfChecks}
    </div>
  );
}
