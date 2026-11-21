import type { CSSProperties } from "react";
import { ChannelIcon } from "./ChannelIcons";
import { SampleMark, TickPath } from "./Frames";
import type { StageScenesCopy } from "./copyScenes";
import { rich } from "./Text";
import "./scenes.css";

// Two animated scenes inside the stage switch (D-158, the founder's brief of 8 Nov 2026).
//
//   ScoreScene   Discover: a check-up score as a ring, four measured parts as bars, one
//                recommendation. A cursor presses "I did this", then "Run check-up"; the score
//                counts up, the two parts that changed fill, and the card turns to "Done".
//   ChannelScene Convert: five places customers come from (each a link or a card the owner has
//                set up) draw into one ALYR Chat inbox, the chats arriving one by one.
//
// The HTML is the finished scene (score 71, every chat in the inbox); the motion lives in
// scenes.css, starts when the panel is opened (`.stt-panel.is-on` under `data-seen`), plays once
// and is held back by reduced motion. Every word is in copyScenes.ts; the icons are drawn on the
// 24 px grid. One "Sample" mark each.

const i = (index: number) => ({ "--i": index }) as CSSProperties;

/** The mouse pointer that drives the demonstration; decoration only. */
function Cursor() {
  return (
    <svg viewBox="0 0 20 24" className="sc-cursor" aria-hidden="true" focusable="false">
      <path d="M2 1.5v18l4.6-4.4 3 7 3-1.3-3-6.8H16z" />
    </svg>
  );
}

export function ScoreScene({ words: w, sample }: { words: StageScenesCopy["score"]; sample: string }) {
  return (
    <figure className="sc sc-score" aria-label={w.label}>
      <div className="sc-win" aria-hidden="true">
        <header className="sc-bar">
          <b>{rich(w.shop)}</b>
          <span>{w.title}</span>
          <SampleMark label={sample} />
        </header>
        <div className="sc-top">
          <div className="sc-dial" style={{ "--to": w.total.to, "--from": w.total.from } as CSSProperties}>
            <svg viewBox="0 0 120 120" focusable="false">
              <circle className="sc-ring-bg" cx="60" cy="60" r="52" pathLength="100" />
              <circle className="sc-ring" cx="60" cy="60" r="52" pathLength="100" />
            </svg>
            <p className="sc-num"><i className="sc-count" /><small>{w.outOf}</small></p>
          </div>
          <ul className="sc-parts">
            {w.parts.map((p, index) => (
              <li key={p.name} className={`sc-part${p.to !== p.from ? " is-up" : ""}`} style={{ ...i(index), "--from": p.from, "--to": p.to } as CSSProperties}>
                <span className="sc-part-name">{p.name}</span>
                <span className="sc-bar-track"><span className="sc-bar-fill" /><span className="sc-bar-gain" /></span>
                <b className="sc-part-val"><i className="sc-count" /></b>
              </li>
            ))}
          </ul>
        </div>
        <div className="sc-find">
          <div className="sc-find-a">
            <p className="sc-kicker">{w.kicker}</p>
            <h4>{w.finding}</h4>
            <p className="sc-why">{w.why}</p>
            <div className="sc-acts">
              <span className="sc-btn is-did">{w.did}</span>
              <span className="sc-btn is-run">{w.run}</span>
              <Cursor />
            </div>
          </div>
          <div className="sc-find-b">
            <span className="sc-tick"><TickPath /></span>
            <div>
              <h4>{w.doneTitle}</h4>
              <p className="sc-why">{w.doneNote}</p>
            </div>
            <span className="sc-delta">{w.change}</span>
          </div>
        </div>
        <p className="sc-foot">{w.foot}</p>
      </div>
    </figure>
  );
}

export function ScaleScene({ words: w, review, sample }: {
  words: StageScenesCopy["scale"];
  review: { title: string; kicker: string; rows: { label: string; state: string; done: boolean }[]; foot: string };
  sample: string;
}) {
  const total = w.now.reduce((a, b) => a + b, 0);
  const peak = Math.max(...w.now);
  const top = Math.max(...w.now, ...w.before);
  return (
    <figure className="sc sc-scale" aria-label={w.label}>
      <div className="sc-win" aria-hidden="true">
        <header className="sc-bar">
          <b>{rich(w.shop)}</b>
          <span>{w.title}</span>
          <SampleMark label={sample} />
        </header>
        <div className="sc-sales">
          <div className="sc-big" style={{ "--to": total } as CSSProperties}>
            <p className="sc-big-k">{w.ordersLabel}</p>
            <p className="sc-big-n"><i className="sc-count" /></p>
            <p className="sc-big-s">{w.prev}</p>
            <span className="sc-delta">{w.change}</span>
          </div>
          <div className="sc-chart">
            <div className="sc-cols">
              {w.days.map((day, index) => (
                <div key={day} className="sc-col" style={i(index)}>
                  <div className="sc-pair">
                    <span className="sc-b is-prev" style={{ "--h": w.before[index] / top } as CSSProperties} />
                    <span className={`sc-b is-now${w.now[index] === peak ? " is-peak" : ""}`} style={{ "--h": w.now[index] / top } as CSSProperties} />
                  </div>
                  <small>{day}</small>
                </div>
              ))}
            </div>
            <p className="sc-legend"><span className="is-now">{w.legendNow}</span><span className="is-prev">{w.legendPrev}</span></p>
          </div>
        </div>
        <div className="sc-review">
          <p className="sc-kicker">{review.title} · {review.kicker}</p>
          <ul>
            {review.rows.map((row, index) => (
              <li key={row.label} className={row.done ? "is-done" : "is-next"} style={i(index)}>
                {row.done ? <span className="sc-tick"><TickPath /></span> : <span className="dot-pending" aria-hidden="true" />}
                <span>{rich(row.label)}</span>
                <b>{row.state}</b>
              </li>
            ))}
          </ul>
        </div>
        <p className="sc-foot">{review.foot}</p>
      </div>
    </figure>
  );
}

export function ChannelScene({ words: w, sample, shop }: { words: StageScenesCopy["chat"]; sample: string; shop: string }) {
  const count = w.rows.length;
  return (
    <figure className="sc sc-chat" aria-label={w.label}>
      <div className="sc-chat-grid" aria-hidden="true" style={{ "--n": count } as CSSProperties}>
        <ul className="sc-srcs">
          {w.sources.map((s, index) => (
            <li key={s.name} className="sc-src" style={i(index)}>
              <span className="sc-src-ico"><ChannelIcon id={s.id} /></span>
              <span className="sc-src-txt"><b>{s.name}</b><small>{s.how}</small></span>
            </li>
          ))}
        </ul>
        <svg className="sc-wires" viewBox="0 0 100 500" preserveAspectRatio="none" focusable="false">
          {w.sources.map((s, index) => {
            const y = ((index + 0.5) / count) * 500;
            const d = `M0 ${y} C 60 ${y}, 40 250, 100 250`;
            return (
              <g key={s.name} style={i(index)}>
                <path className="sc-wire" d={d} pathLength="1" />
                <path className="sc-pack" d={d} pathLength="1" />
              </g>
            );
          })}
        </svg>
        <div className="sc-win sc-inbox" style={{ "--n": count } as CSSProperties}>
          <header className="sc-bar">
            <b>{w.inbox}</b>
            <span>{shop}</span>
            <SampleMark label={sample} />
          </header>
          <div className="sc-inbox-head">
            <span>{w.inboxSub}</span>
            <b className="sc-badge"><i className="sc-count" /></b>
          </div>
          <ul className="sc-rows">
            {w.rows.map((r, index) => (
              <li key={r.who} className="sc-row" style={i(index)}>
                <span className="sc-av">{r.who.slice(0, 1)}</span>
                <span className="sc-row-txt"><b>{r.who}</b><span>{r.text}</span></span>
                <span className="sc-row-at"><small>{r.at}</small><i className="sc-unread" /></span>
              </li>
            ))}
          </ul>
          <p className="sc-foot">{w.foot}</p>
        </div>
      </div>
      <figcaption className="sr-only">{w.badge.replace("{n}", String(count))}</figcaption>
    </figure>
  );
}
