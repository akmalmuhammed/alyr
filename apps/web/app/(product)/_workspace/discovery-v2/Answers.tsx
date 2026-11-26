"use client";

// Answers, Discovery v2 (workstream U2), on the Answers check's API (spec 068): "Named in N of M
// answers", one card of dots per language and one row per answer tool with a dot meter per
// language (never added into one score), the comparison with the check before, one answer quoted
// word for word as third-party text, and how it is measured (the API's own rule and limits).
// The likely range and the pages the answers cited are drawn only when the API sends them
// (workstream G); until then they are hidden, never estimated here.

import type { ReactNode } from "react";
import type { AnswerRange, AnswersAnswer, CitedPage } from "./api2";
import { T2 } from "./copy2";
import type { D2Lang } from "./copy";
import { ScreenFrame, SourceTile, StatePill } from "./frame";
import { Ltr, day, dayTime } from "./parts";
import { markName, type AnswersView, type LangTally } from "./screens";

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
  const prev = api.previous && api.previous.measured ? api.previous : null;
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

      {api.range || prev ? (
        <section className="d2s-sec">
          <div className={`d2s-sure${api.range && prev ? "" : " d2s-sure-one"}`}>
            {api.range ? <Sure lang={lang} range={api.range} now={view.named} total={view.counted} /> : null}
            {prev ? (
              <div className="d2s-sure-c2">
                <h2>{t.compareTitle(day(prev.asked_at, lang))}</h2>
                <p>{t.compareBody(prev.named, prev.counted, view.named, view.counted)}</p>
                <div className="d2s-tn" role="img" aria-label={t.compareAria(day(prev.asked_at, lang), prev.named, prev.counted, day(view.askedAt, lang), view.named, view.counted)}>
                  <Bar label={day(prev.asked_at, lang)} value={prev.named} of={prev.counted} />
                  <Bar label={day(view.askedAt, lang)} value={view.named} of={view.counted} now />
                </div>
                {api.caution ? <p className="d2-small">{api.caution}</p> : null}
              </div>
            ) : null}
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

      {api.cited && api.cited.length ? <Cited lang={lang} pages={api.cited} total={view.counted} /> : null}

      {q ? (
        <section className="d2s-sec">
          <h2 className="d2-section">{t.quoteTitle}</h2>
          <blockquote className="d2s-quote" lang={q.lang === "ar" ? "ar" : "en"} dir={q.lang === "ar" ? "rtl" : "ltr"}>
            <div className="d2s-q-head" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
              <span>{t.quoteHead(q.engine_label, langName(q.lang), dayTime(view.askedAt, lang))}</span>
              <span className="d2s-q-tag">{t.thirdParty}</span>
            </div>
            <p className="d2s-q-asked" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>{t.questionAsked} <span>{q.question}</span></p>
            <div className="d2s-q-text">
              {q.text.split(/\n+/).filter(Boolean).map((para, i) => (
                <p key={i}>{markName(para, q.matched).map((part, j) => (part.mark ? <mark key={j}>{part.text}</mark> : <span key={j}>{part.text}</span>))}</p>
              ))}
            </div>
            <div className="d2s-q-foot" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}><span>{t.quoteFoot}</span></div>
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

function Bar({ label, value, of, now = false }: { label: string; value: number; of: number; now?: boolean }) {
  const share = of > 0 ? Math.round((value / of) * 1000) / 10 : 0;
  return (
    <div className={`d2s-tn-r${now ? " d2s-now" : ""}`}>
      <span>{label}</span>
      <span className="d2s-tn-b"><i style={{ inlineSize: `${share}%` }} /></span>
      <b className="d2-tnum">{value.toLocaleString("en")}</b>
    </div>
  );
}

/** TODO(G): drawn only when the API sends the likely range. */
function Sure({ lang, range, now, total }: { lang: D2Lang; range: AnswerRange; now: number; total: number }) {
  const t = T2[lang];
  const at = (v: number) => `${total > 0 ? Math.round((v / total) * 1000) / 10 : 0}%`;
  return (
    <div className="d2s-sure-c1">
      <h2>{t.sureTitle}</h2>
      <p>{t.sureBody(range.low, range.high, total)}</p>
      <div className="d2s-range" aria-hidden="true">
        <span className="d2s-range-track" />
        <span className="d2s-range-band" style={{ insetInlineStart: at(range.low), inlineSize: `calc(${at(range.high)} - ${at(range.low)})` }} />
        <span className="d2s-range-pt" style={{ insetInlineStart: at(now) }} />
        {[0, range.low, now, range.high, total].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
          <span key={v} className={`d2s-range-ax${v === now ? " d2s-b" : ""}`} style={{ insetInlineStart: at(v) }}>{v.toLocaleString("en")}</span>
        ))}
      </div>
    </div>
  );
}

/** TODO(G): drawn only when the API sends the cited pages. */
function Cited({ lang, pages, total }: { lang: D2Lang; pages: CitedPage[]; total: number }) {
  const t = T2[lang];
  return (
    <section className="d2s-sec">
      <h2 className="d2-section">{t.citedTitle}</h2>
      <ul className="d2s-card d2s-srcs">
        {pages.map((page) => (
          <li key={`${page.title}-${page.host}`}>
            <SourceTile where={page.title} />
            <div><b>{page.title}</b>{page.host ? <small><Ltr>{page.host}</Ltr></small> : null}</div>
            <div className="d2s-cites"><span className="d2s-meter"><i style={{ inlineSize: `${total ? (page.cites / total) * 100 : 0}%` }} /></span><span className="d2-tnum">{t.citedOf(page.cites, total)}</span></div>
            {page.state ? <StatePill tone={page.state === "matches" ? "ok" : page.state === "differs" ? "warn" : "nm"}>{t.citedState[page.state]}</StatePill> : <span />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Method({ lang, api }: { lang: D2Lang; api: AnswersAnswer }) {
  const t = T2[lang];
  return (
    <div className="d2s-method">
      <b>{t.methodTitle}</b> {api.rule} {api.limits} {t.notPartOfChecks}
    </div>
  );
}
