import type { CSSProperties } from "react";
import { Rich } from "../_agent/AgentDashboard";
import type { AgentView } from "../_agent/types";
import { AgentFigure } from "./AgentFigure";
import { copy, type Locale } from "./copy";
import { reportWords } from "./Drawings";
import { SampleMark } from "./Frames";
import { InsideBlock, ProductBar, ProductHero, QuestionsBlock, WhoBlock, WorksBlock } from "./ProductKit";
import { ReportSwitch } from "./ReportSwitch";
import { REPORTS, SAMPLE_ORDER, SAMPLES } from "./samples";
import { Shell } from "./Shell";
import { rich } from "./Text";

const n = (index: number) => ({ "--n": index }) as CSSProperties;

/** One suggestion as the screen shows it, opened: the bakery's money card, word for word
 * from the sample (the engine's own text), drawn with the dashboard's own styles, in the
 * workspace window with its "Sample" mark. */
function OpenedCard({ view, label, shop, monogram, path, sample }: {
  view: AgentView; label: string; shop: string; monogram: string; path: string; sample: string;
}) {
  const card = view.suggestions.find((s) => s.key === "overdue") ?? view.suggestions[0];
  return (
    <div className="aw pk-card" role="img" aria-label={label}>
      <div className="aw-bar" aria-hidden="true">
        <span className="aw-mono">{monogram}</span>
        <b>{shop}</b>
        <SampleMark label={sample} />
        <span className="aw-path">{path}</span>
      </div>
      <div className="ag" dir={view.dir} lang={view.lang} aria-hidden="true">
        <article className="ag-card">
          <div className="ag-card-head">
            <p className="ag-card-title"><Rich parts={card.title} /></p>
          </div>
          <div className="ag-card-body">
            <p className="ag-card-line"><Rich parts={card.line} /></p>
            <p className="ag-rule">{card.rule}</p>
            {card.action && (
              <div className="ag-card-foot">
                <span className={`ag-btn${card.primary ? " is-volt" : ""}`}>{card.action.label}</span>
              </div>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}

/** ALYR Agent: the workspace's home screen and the Sunday report, with every product
 * (06-messaging.md §3.2). Its demo is the dashboard itself, with the three samples. */
export function AgentPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const p = t.pages.agent;
  const bakery = SAMPLES[locale].bakery;
  return (
    <Shell locale={locale} page="agent" cta={p.cta}>
      <ProductBar bar={p.bar} />
      <ProductHero hero={p.hero}>
        <AgentFigure
          variant="agent"
          views={SAMPLES[locale]}
          order={SAMPLE_ORDER}
          text={t.agent}
          label={p.figure.label}
          more={p.figure.more}
          switcher
          feed
          headingLevel={2}
          sync="agent"
        />
      </ProductHero>

      <section className="sec pk-how" id="how" aria-labelledby="how-title">
        <div className="wrap">
          <div className="built-head" data-reveal>
            {p.how.eyebrow && <p className="eyebrow">{p.how.eyebrow}</p>}
            <h2 className="h1" id="how-title">{rich(p.how.title)}</h2>
          </div>
          <ol className="pk-steps">
            {p.how.steps.map((step, index) => (
              <li key={step.title} data-reveal style={n(index)}>
                <span className="pk-step-n" aria-hidden="true"><bdi>{index + 1}</bdi></span>
                <h3>{rich(step.title)}</h3>
                <p>{rich(step.body)}</p>
              </li>
            ))}
          </ol>
          <figure className="pk-card-fig" data-reveal>
            <figcaption className="sr-only">{t.agent.samples.bakery.fictional}</figcaption>
            <div data-nosnippet>
              <OpenedCard
                view={bakery}
                label={p.how.card}
                shop={t.agent.samples.bakery.shop}
                monogram={t.agent.samples.bakery.monogram}
                path={t.agent.path}
                sample={t.fig.sample}
              />
            </div>
            <p className="pk-card-under">{rich(p.how.under)}</p>
          </figure>
        </div>
      </section>

      <section className="sec pk-report" id="report" aria-labelledby="report-title">
        <div className="wrap pk-report-grid">
          <div className="built-head" data-reveal>
            {p.report.eyebrow && <p className="eyebrow">{p.report.eyebrow}</p>}
            <h2 className="h1" id="report-title">{rich(p.report.title)}</h2>
            <p className="lead">{rich(p.report.body)}</p>
          </div>
          <figure className="pk-report-fig" data-reveal>
            <ReportSwitch
              sync="agent"
              start={SAMPLE_ORDER[0]}
              samples={REPORTS[locale]}
              words={reportWords(locale)}
              fictional={{
                bakery: t.agent.samples.bakery.fictional,
                salon: t.agent.samples.salon.fictional,
                homeservices: t.agent.samples.homeservices.fictional,
              }}
            />
          </figure>
        </div>
      </section>

      <section className="sec pk-rules" id="rules" aria-labelledby="rules-title">
        <div className="wrap">
          <div className="built-head" data-reveal>
            {p.rules.eyebrow && <p className="eyebrow">{p.rules.eyebrow}</p>}
            <h2 className="h1" id="rules-title">{rich(p.rules.title)}</h2>
            <p className="lead">{rich(p.rules.body)}</p>
          </div>
          <table className="rules-table" data-reveal>
            <thead>
              <tr>
                <th scope="col">{p.rules.heads[0]}</th>
                <th scope="col">{p.rules.heads[1]}</th>
              </tr>
            </thead>
            <tbody>
              {p.rules.rows.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{rich(row.name)}</th>
                  <td>
                    <span className="rules-line">{row.rule}</span>
                    {row.note && (
                      <span className="status-line rules-note">
                        <span className="dot-pending" aria-hidden="true" />
                        <span>{rich(row.note)}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="rules-notes" data-reveal>
            {p.rules.notes.map((note) => <li key={note}>{rich(note)}</li>)}
          </ul>
        </div>
      </section>

      <InsideBlock inside={p.inside} locale={locale} />
      <WhoBlock who={p.who} />
      <WorksBlock locale={locale} works={p.works} self="agent" />
      <QuestionsBlock faq={p.faq} />
    </Shell>
  );
}
