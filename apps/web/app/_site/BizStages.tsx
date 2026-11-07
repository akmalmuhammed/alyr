import type { CSSProperties } from "react";
import { BusinessTabs } from "./BusinessTabs";
import { ContactButton } from "./Contact";
import { copy, type Locale } from "./copy";
import { bizStagesCopy, type BizStageRow } from "./copyBizStages";
import { DaySplit } from "./DaySplit";
import { contactHref } from "./Shell";
import type { ProductKey } from "./site";
import { lines, rich } from "./Text";
import "./home.css";
import "./bizstages.css";

/**
 * "Tell us your business. See your four stages." (ALY-330, the homepage's touchable part.)
 * One tab per kind of business, as BusinessTabs draws them: the panels are server HTML, so
 * without scripts they show one under the other, and with scripts they share one cell, so the
 * page below never moves. Each panel reads left to right as the funnel: Discover, Convert,
 * Manage, Scale, each with one line in that business's own words and what it runs on. A stage
 * the team does by hand says "Our team"; a stage that runs in the product names the built
 * products it uses (never ALYR Docs, which is off for every shop). Under the four lines the
 * business's afternoon is split by the fold, as it is on its sector page. Anchors are the
 * same as before (#bakery, #wholesale ...), so every link into the old tabs still opens one.
 *
 * It draws its own section, rule and heading, so the host page only mounts it:
 * `<BizStages locale={locale} />`.
 */
export function BizStages({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const b = t.home.business;
  const w = bizStagesCopy[locale];
  const products = (keys: ProductKey[]) =>
    keys.map((key) => (
      <span key={key} className="tag bs-tag"><bdi>{t.products.items[key].name}</bdi></span>
    ));

  return (
    <section className="hs bs bizs" id="business" aria-labelledby="business-title">
      <div className="wrap">
        <div className="rule" aria-hidden="true" />
        <div className="open-full">
          <div className="head">
            <p className="eyebrow"><span>{rich(w.eyebrow)}</span></p>
            <h2 className="h2" id="business-title" data-split>{lines(w.title)}</h2>
          </div>
        </div>
        <BusinessTabs label={w.tabsLabel} tabs={[...b.rows, b.other].map((row) => ({ id: row.id, name: row.tab }))}>
          {b.rows.map((row, index) => {
            const lineSet: BizStageRow | undefined = w.rows[row.id];
            if (!lineSet) return null;
            // the four stages in order: the words, who does it, and what it runs on
            const stages = [
              { line: lineSet.discover, team: true, on: [] as ProductKey[] },
              { line: lineSet.convert, team: false, on: lineSet.convertOn },
              { line: lineSet.manage, team: false, on: lineSet.manageOn },
              { line: w.scale.line, team: true, on: w.scale.on },
            ];
            return (
              <div
                key={row.id}
                id={row.id}
                className={`biz-panel bs-panel${index === 0 ? " is-on" : ""}`}
                role="tabpanel"
                aria-labelledby={`biz-tab-${row.id}`}
              >
                <h3 className="biz-name">{rich(row.name)}</h3>
                <ol className="bs-stages" aria-label={`${w.listLabel} ${row.name}`}>
                  {stages.map((stage, i) => (
                    <li key={w.stages[i].id} className={`bs-stage bs-${w.stages[i].id}`} style={{ "--i": i } as CSSProperties}>
                      <p className="mono-k bs-k"><span className="bs-n" aria-hidden="true">{`0${i + 1}`}</span><span>{w.stages[i].name}</span></p>
                      <p className="bs-say">{w.stages[i].tagline}</p>
                      <p className="bs-line">{rich(stage.line)}</p>
                      <p className="bs-who">
                        {stage.team && <span className="tag tag-plus bs-tag">{w.team}</span>}
                        {stage.on.length > 0 && (
                          <>
                            <span className="biz-k bs-on">{w.runsOn}</span>
                            {products(stage.on)}
                          </>
                        )}
                      </p>
                    </li>
                  ))}
                </ol>
                <p className="mono-k bs-fold-k">{w.foldNote}</p>
                <DaySplit row={row} words={b.split} sample={t.fig.sample} />
                {row.note && (
                  <p className="biz-note status-line">
                    <span className="dot-pending" aria-hidden="true" />
                    <span>{rich(row.note)}</span>
                  </p>
                )}
                <div className="biz-foot bs-foot">
                  <span className="biz-acts">
                    <ContactButton locale={locale} variant="line" className="biz-ask" message={row} label={row.ask} />
                  </span>
                </div>
              </div>
            );
          })}
          <div id={b.other.id} className="biz-panel biz-else" role="tabpanel" aria-labelledby={`biz-tab-${b.other.id}`}>
            <h3 className="biz-name">{rich(b.other.title)}</h3>
            <p className="biz-else-body">{rich(b.other.body)}</p>
            <a className="link" href={contactHref()}>{b.other.link}</a>
          </div>
        </BusinessTabs>
      </div>
    </section>
  );
}
