import type { CSSProperties } from "react";
import { AgentFigure } from "./AgentFigure";
import { copy, type Locale } from "./copy";
import { FlowDiagram } from "./FlowDiagram";
import { SampleMark, TickPath } from "./Frames";
import { SAMPLE_ORDER, SAMPLES } from "./samples";
import { StageIndex } from "./StageIndex";
import { lines, rich } from "./Text";
// stages.css comes with home.css

// The four stages (ALY-330, D-156): Discover, Convert, Manage, Scale, one full-bleed band each
// (light and Carbon in turn), with a chapter bar that sticks under the header. A panel is its chip, a two-line
// headline (the second line on a Volt-wash block), one sentence, what runs today (a solid rule, the product
// named) and what our team does (a dashed rule), and one visual: the check-up's channel map,
// the order's flow, the Agent's real screen, the monthly review. Where nothing is built yet
// (Discover) only the team's list stands. Every word is in `copy.ts` (copyHome.ts).

const n = (index: number) => ({ "--i": index }) as CSSProperties;

/** A row of a drawn list: a Volt tick when it is done, the hollow pending dot when it is next. */
function Row({ label, state, done, index }: { label: string; state: string; done: boolean; index: number }) {
  return (
    <li className="sp-row" style={n(index)}>
      {done ? (
        <span className="sp-box"><TickPath /></span>
      ) : (
        <span className="dot-pending" aria-hidden="true" />
      )}
      <span className="sp-label">{rich(label)}</span>
      <span className="sp-state">{state}</span>
    </li>
  );
}

/** A drawn window on a Carbon plate: the title, the "Sample" mark, then its rows. */
function Plate({ title, shop, kicker, rows, foot, sample }: {
  title: string; shop: string; kicker?: string; rows: { label: string; state: string; done: boolean }[]; foot?: string; sample: string;
}) {
  return (
    <div className="st-plate" data-m>
      <div className="sp-win">
        <div className="sp-bar">
          <b>{rich(shop)}</b>
          <SampleMark label={sample} />
        </div>
        <h4 className="sp-title">{title}</h4>
        {kicker && <p className="sp-kicker">{kicker}</p>}
        <ul className="sp-rows">
          {rows.map((row, index) => <Row key={row.label} {...row} index={index} />)}
        </ul>
        {foot && <p className="sp-foot">{foot}</p>}
      </div>
    </div>
  );
}

export function Stages({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const s = t.home.stages;
  const visual = (key: string) => {
    if (key === "discover") return <Plate title={s.discover.title} shop={t.home.funnel.shop} rows={s.discover.rows} sample={t.fig.sample} />;
    if (key === "scale") return <Plate title={s.scale.title} shop={t.home.funnel.shop} kicker={s.scale.kicker} rows={s.scale.rows} foot={s.scale.foot} sample={t.fig.sample} />;
    if (key === "convert") {
      return (
        <div className="how-panel see-panel st-flow">
          <FlowDiagram flow={t.home.see} sample={t.fig.sample} note={t.agent.samples.bakery.fictional} />
        </div>
      );
    }
    return (
      <AgentFigure
        variant="spot"
        views={SAMPLES[locale]}
        order={SAMPLE_ORDER}
        start="bakery"
        text={t.agent}
        sample={t.fig.sample}
        label={s.agentLabel}
        headingLevel={3}
        more={s.agentMore}
      />
    );
  };
  return (
    <section className="stages" id="stages" aria-labelledby="stages-title">
      <div className="wrap st-intro">
        <div className="head">
          <h2 className="h2" id="stages-title" data-split>{lines(s.title)}</h2>
          <p className="lead">{s.body}</p>
        </div>
      </div>
      <StageIndex label={s.indexLabel} items={s.panels.map((p) => ({ id: p.key, n: p.n, name: p.name }))} />
      {s.panels.map((p, index) => (
        <article key={p.key} id={p.key} className={`st${index % 2 === 1 ? " is-dark" : ""}${p.key === "convert" ? " is-wide" : ""}`} aria-labelledby={`st-${p.key}`}>
          <div className="wrap st-in">
            <header className="st-head">
              <p className="st-chip"><span className="st-chip-n">{p.n}</span><span>{p.name}</span></p>
              <h3 className="st-title" id={`st-${p.key}`}>
                <span className="line">{rich(p.title[0])}</span>
                <span className="line"><span className="st-hl">{rich(p.title[1])}</span></span>
              </h3>
            </header>
            <div className="st-text">
              <p className="st-body">{rich(p.body)}</p>
              {p.runs.length > 0 && (
                <div className="st-list-block is-runs">
                  <h4 className="st-k">{s.runsLabel}</h4>
                  <ul>{p.runs.map((item) => <li key={item}>{rich(item)}</li>)}</ul>
                </div>
              )}
              <div className="st-list-block is-team">
                <h4 className="st-k">{s.teamLabel}</h4>
                <ul>{p.team.map((item) => <li key={item}>{rich(item)}</li>)}</ul>
              </div>
            </div>
            <div className="st-vis">{visual(p.key)}</div>
          </div>
        </article>
      ))}
    </section>
  );
}
