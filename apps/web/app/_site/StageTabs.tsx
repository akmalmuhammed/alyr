import type { CSSProperties } from "react";
import { AgentFigure } from "./AgentFigure";
import { Icon } from "./brand";
import { copy, type Locale } from "./copy";
import type { StageTabsCopy } from "./copyStageTabs";
import { ChannelScene, ScoreScene } from "./StageScenes";
import { SampleMark, TickPath } from "./Frames";
import { SAMPLE_ORDER, SAMPLES } from "./samples";
import { StageTabsClient } from "./StageTabsClient";
import { lines, rich } from "./Text";
import "./home.css";
import "./stagetabs.css";

// The four stages as a segmented switch (ALY-330, section 3; it replaces `Stages.tsx`). A soft
// grey track with a white raised pill that slides between Discover, Convert, Manage and Scale,
// and one large soft panel under it: the stage's words on one side, its drawn visual on the
// other. The panels are all in the HTML (a client component only shows one at a time), so without
// scripts they stand one under the other, each with its heading. The stages' own words are
// `home.stages` in copyHome.ts; this file's extra strings come in as `words`
// (`copy[locale].home.stageTabs`). No word is written here.

const n = (index: number) => ({ "--i": index }) as CSSProperties;

/** A row of a drawn list: a Volt tick when it is done, the hollow pending dot when it is next. */
function Row({ label, state, done, index }: { label: string; state: string; done: boolean; index: number }) {
  return (
    <li className="stt-row" style={n(index)}>
      {done ? (
        <span className="stt-box-done"><TickPath /></span>
      ) : (
        <span className="dot-pending" aria-hidden="true" />
      )}
      <span className="stt-row-label">{rich(label)}</span>
      <span className="stt-row-state">{state}</span>
    </li>
  );
}

/** A drawn window on a Carbon plate: the title, the "Sample" mark, then its rows. */
function Plate({ title, shop, kicker, rows, foot, sample }: {
  title: string; shop: string; kicker?: string; rows: { label: string; state: string; done: boolean }[]; foot?: string; sample: string;
}) {
  return (
    <div className="stt-plate">
      <div className="stt-win">
        <div className="stt-bar">
          <b>{rich(shop)}</b>
          <SampleMark label={sample} />
        </div>
        <h4 className="stt-win-title">{title}</h4>
        {kicker && <p className="stt-kicker">{kicker}</p>}
        <ul className="stt-rows">
          {rows.map((row, index) => <Row key={row.label} {...row} index={index} />)}
        </ul>
        {foot && <p className="stt-foot">{foot}</p>}
      </div>
    </div>
  );
}

export function StageTabs({ locale, words }: { locale: Locale; words: StageTabsCopy }) {
  const t = copy[locale];
  const s = t.home.stages;
  const visual = (key: string) => {
    if (key === "discover") return <ScoreScene words={words.scenes.score} sample={t.fig.sample} />;
    if (key === "scale") return <Plate title={s.scale.title} shop={t.home.funnel.shop} kicker={s.scale.kicker} rows={s.scale.rows} foot={s.scale.foot} sample={t.fig.sample} />;
    if (key === "convert") return <ChannelScene words={words.scenes.chat} sample={t.fig.sample} shop={t.home.funnel.shop} />;
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
  const last = s.panels.length - 1;
  return (
    <section className="hs stt" id="stages" aria-labelledby="stages-title">
      <div className="wrap">
        <div className="stt-head">
          <h2 className="h2" id="stages-title" data-split>{lines(words.title)}</h2>
          <p className="lead">{words.lead}</p>
        </div>
        <StageTabsClient label={words.tabsLabel} tabs={s.panels.map((p) => ({ id: p.key, n: p.n, name: p.name }))}>
          {s.panels.map((p, index) => {
            const to = s.panels[index === last ? 0 : index + 1];
            return (
              <div
                key={p.key}
                id={p.key}
                className={`stt-panel${index === 0 ? " is-on" : ""}`}
                data-stage={p.key}
                role="tabpanel"
                aria-labelledby={`stt-tab-${p.key}`}
              >
                <div className="stt-text">
                  <p className="stt-chip"><span className="stt-chip-n">{p.n}</span><span>{p.name}</span></p>
                  <h3 className="stt-title stt-r" style={n(0)}>
                    <span className="line">{rich(p.title[0])}</span>
                    <span className="line"><span className="stt-hl">{rich(p.title[1])}</span></span>
                  </h3>
                  <p className="stt-body stt-r" style={n(1)}>{rich(p.body)}</p>
                  {p.runs.length > 0 && (
                    <div className="stt-list is-runs stt-r" style={n(2)}>
                      <h4 className="stt-k">{s.runsLabel}</h4>
                      <ul>{p.runs.map((item) => <li key={item}>{rich(item)}</li>)}</ul>
                    </div>
                  )}
                  <div className="stt-list is-team stt-r" style={n(3)}>
                    <h4 className="stt-k">{s.teamLabel}</h4>
                    <ul>{p.team.map((item) => <li key={item}>{rich(item)}</li>)}</ul>
                  </div>
                  <a className="link stt-next stt-r" style={n(4)} href={`#${to.key}`} data-stt-to={to.key}>
                    <span>{(index === last ? words.back : words.next).replace("{stage}", to.name)}</span>
                    <Icon name="arrow-right" className="ico ico-flip" />
                  </a>
                </div>
                <div className="stt-vis stt-r" style={n(2)}>{visual(p.key)}</div>
              </div>
            );
          })}
        </StageTabsClient>
      </div>
    </section>
  );
}
