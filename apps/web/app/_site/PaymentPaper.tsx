import type { CSSProperties } from "react";
import { copy, type Locale } from "./copy";
import { RC0042 } from "./paperData";
import { SampleMark, TickPath, WaDoc } from "./Frames";
import { LoopToggle } from "./LoopToggle";
import { words } from "./pace";
import { PaperA4, PaperRoll } from "./Paper";
import { lines, rich } from "./Text";
import "./drawings.css";
import "./moment.css";

// ALYR Docs' signature figure (03-visuals.md §3.1): a cash payment recorded in the workspace
// becomes receipt RC-0042. The paper draws itself along the fold's diagonal, its contents
// arrive in reading order (each Arabic line before its English twin), and the PDF lands in
// the chat Aisha wrote in a few minutes before, so WhatsApp's 24-hour window is visibly
// open. One Volt tick when it is sent. CSS only (moment.css), keyed on loops.ts's `.is-in`;
// the HTML is the finished state. It ends before 3 s, holds while its new words are read,
// fades and plays again (founder, 26 Oct 2026: motion always on), until its Pause control
// stops it; off screen and in a hidden tab it stops too.

const at = (index: number) => ({ "--p": index }) as CSSProperties;

export function PaymentPaperFigure({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const m = t.pages.docs.moment;
  const f = m.form;
  const c = m.chat;
  // what the moment comes to, read while it holds: recorded, the PDF, sent (the bubble's
  // caption is there for a visitor who stops; each cycle shows it again)
  const said = words(f.done, c.file, c.sent);
  return (
    <section className="sec sig-sec" id="moment" aria-labelledby="moment-title">
      <div className="wrap">
        <div className="built-head" data-reveal>
          {m.eyebrow && <p className="eyebrow">{m.eyebrow}</p>}
          <h2 className="h1" id="moment-title">{lines(m.title)}</h2>
          <p className="lead">{rich(m.body)}</p>
        </div>
        <figure className="sig pf" data-sig data-loop data-loop-play style={{ "--words": said } as CSSProperties}>
          <p className="sr-only">{t.agent.samples.bakery.fictional} {m.label}</p>
          <LoopToggle words={t.loop} name={t.loop.names.figure} className="sig-toggle" />
          <div className="sig-stage" inert aria-hidden="true" data-nosnippet>
            <span className="sig-rule"><i /><i /></span>

            <div data-loop-part className="sig-part pf-a" style={at(0)}>
              <span className="sig-k">{m.parts.sheet}</span>
              <div className="aw pf-win">
                <div className="aw-bar">
                  <span className="aw-mono">{f.monogram}</span>
                  <b>{f.shop}</b>
                  <SampleMark label={copy[locale].fig.sample} />
                  <span className="aw-path">{f.path}</span>
                </div>
                <div className="pf-body">
                  <b className="pf-title">{f.title}</b>
                  <p className="pf-sub">{f.sub}</p>
                  <span className="pf-k">{f.amountLabel}</span>
                  <span className="pf-field"><bdi>{f.amount}</bdi></span>
                  <span className="pf-k">{f.methodLabel}</span>
                  <span className="pf-methods">
                    {f.methods.map((method, index) => (
                      <span key={method} className={index === 0 ? "on" : undefined}>{method}</span>
                    ))}
                  </span>
                  <span className="pf-check">
                    <span className="pf-box"><TickPath /></span>
                    <span><b>{f.receipt}</b><small>{f.receiptHint}</small></span>
                  </span>
                  <span className="ws-btn is-primary pf-press">{f.button}</span>
                  <p className="pf-done"><span className="pf-done-tick"><TickPath /></span><span>{rich(f.done)}</span></p>
                </div>
              </div>
            </div>

            <div data-loop-part className="sig-part pf-paper" style={at(2)}>
              <span className="sig-k">{m.parts.paper}</span>
              <div className="pf-sheet">
                <PaperA4 doc={RC0042} crop className="pf-a4" />
                <PaperRoll doc={RC0042} className="pf-roll" />
              </div>
            </div>

            <div data-loop-part className="sig-part pf-c" style={at(1)}>
              <span className="sig-k">{m.parts.chat}</span>
              <div className="wa pf-wa">
                <header className="wa-top">
                  <svg className="wa-back ico-flip" viewBox="0 0 24 24"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" /></svg>
                  <span className="wa-avatar">{c.avatar}</span>
                  <span className="wa-who"><b>{c.business}</b><small>{c.meta}</small></span>
                </header>
                <ol className="wa-thread">
                  <li className="wa-day"><span>{c.today}</span></li>
                  <li className="wa-msg wa-out wa-tail">
                    <div className="wa-bubble">
                      <span className="wa-text" dir="auto">{c.earlier.text}</span>
                      <span className="wa-meta">
                        <span dir="ltr">{c.earlier.at}</span>
                        <svg className="wa-ticks" viewBox="0 0 18 12"><path d="M1 6.5 4.2 9.7 10.6 2.3" /><path d="M7.2 9.7 13.6 2.3" transform="translate(3.4 0)" /></svg>
                      </span>
                    </div>
                  </li>
                  <li className="wa-msg wa-in wa-tail pf-doc">
                    <div className="wa-bubble has-doc">
                      <WaDoc name={c.file} meta={c.fileMeta} />
                      <span className="wa-text" dir="auto">{c.caption}</span>
                      <span className="wa-meta"><span dir="ltr">{c.at}</span></span>
                    </div>
                  </li>
                </ol>
              </div>
              <p className="pf-sent"><span className="pf-sent-tick"><TickPath /></span><span>{c.sent}</span></p>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}
