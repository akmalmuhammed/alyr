import { copy, type Bubble, type BubbleLine, type Caption, type Locale, type ShopRow } from "./copy";
import { CxTop, TickPath } from "./Frames";
import { rich } from "./Text";

// Drawings of real ALYR screens for the homepage, at true proportions and in the
// product's own wording (03-product-truth.md §2), for one fictional business. Each is a
// picture, not a working screen: nothing in here is focusable, and each figure says what
// it shows in its caption. Styles are in home.css under `.d-*`.

type Home = (typeof copy)["en"]["home"];
type Sample = Home["sample"];

/** "FIG 01 · what it shows · SAMPLE, FICTIONAL BAKERY", on a hairline ending in a tick. */
export function FigCaption({ locale, caption, className }: { locale: Locale; caption: Caption; className?: string }) {
  const f = copy[locale].fig;
  return (
    <figcaption className={`cap${className ? ` ${className}` : ""}`}>
      <span className="cap-n">{f.label} <bdi>{caption.n}</bdi></span>
      <span className="cap-sep" aria-hidden="true">·</span>
      <span>{rich(caption.text)}</span>
      <span className="cap-sep" aria-hidden="true">·</span>
      <span>{f.fictional}</span>
    </figcaption>
  );
}

function Line({ line }: { line: BubbleLine }) {
  if (typeof line === "string") return <span className="d-line">{rich(line)}</span>;
  return (
    <span className="d-line">
      {rich(line.text)}
      <span className="d-link" dir="ltr">{line.link}</span>
    </span>
  );
}

/** One drawn chat message. Business and assistant messages sit on the start side, the
 * customer's own on the end side, as on the customer's phone. A message without a time
 * is drawn without one, as the workspace inbox shows them. */
export function ChatBubble({ bubble, label, signal = false }: { bubble: Bubble; label?: string; signal?: boolean }) {
  const side = bubble.from === "customer" ? "out" : "in";
  return (
    <li className={`d-msg d-${side} d-${bubble.from}${signal ? " d-signal" : ""}`}>
      {label && <span className="d-said">{label}</span>}
      <p className="d-bubble" dir="auto">
        {bubble.lines.map((line, index) => <Line key={index} line={line} />)}
        {bubble.time && <span className="d-time" dir="ltr">{bubble.time}</span>}
      </p>
    </li>
  );
}

/** The customer's chat with the shop, drawn without any messaging app's logo or colours. */
export function ChatScreen({ sample, bubbles, signalLast = false }: {
  sample: Sample; bubbles: Bubble[]; signalLast?: boolean;
}) {
  return (
    <div className="d-chat">
      <div className="d-chat-top">
        <span className="d-avatar">{sample.monogram}</span>
        <span className="d-who"><b>{sample.shop}</b><small>{sample.business}</small></span>
      </div>
      <ol className="d-thread">
        {bubbles.map((bubble, index) => (
          <ChatBubble key={index} bubble={bubble} signal={signalLast && index === bubbles.length - 1} />
        ))}
      </ol>
      <div className="d-input"><span>{sample.typeHere}</span></div>
    </div>
  );
}

/** One row of the shop's workspace: what the team sees as the customer acts. */
export function ShopStrip({ shop, row, initial, signal = false, className }: {
  shop: string; row: ShopRow; initial: string; signal?: boolean; className?: string;
}) {
  return (
    <div className={`d-strip${signal ? " is-signal" : ""}${className ? ` ${className}` : ""}`} aria-hidden="true">
      <span className="d-strip-path">{shop} <span aria-hidden="true">/</span> {row.screen}</span>
      <span className="d-strip-row">
        <span className="d-strip-ref"><bdi>{row.ref}</bdi></span>
        <span className="d-strip-name">{row.name}</span>
        <span className="d-chip"><span className="d-chip-dot" />{row.status}</span>
        <span className="d-avatar-sm" title={row.by}>{initial}</span>
      </span>
    </div>
  );
}

/** The order tracking page (`/t/`). */
export function TrackScreen({ sample, lang }: { sample: Sample; lang: Locale }) {
  const t = sample.track;
  return (
    <div className="d-cx" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <CxTop shop={sample.shop} monogram={sample.monogram} context={t.context} />
      <div className="d-main">
        <div className="d-hero">
          <span className="d-eyebrow">{t.eyebrow}</span>
          <b className="d-h1">{rich(t.title)}</b>
          <span className="d-status">{t.status}</span>
        </div>
        <ol className="d-card d-track">
          {t.steps.map((step) => (
            <li key={step.label} className={`${step.reached ? "reached" : ""}${step.now ? " now" : ""}`}>
              <span className="d-node">{step.reached && <TickPath />}</span>
              <span className="d-track-text"><b>{step.label}</b><span>{step.at}</span></span>
            </li>
          ))}
        </ol>
        <div className="d-card d-person">
          <span className="d-avatar-lg">{t.person.name.slice(0, 1)}</span>
          <p><b>{t.person.name}</b>{t.person.rest}</p>
        </div>
        <p className="d-note">{t.updates}</p>
      </div>
    </div>
  );
}

/** The booking page (`/b/`) with a service, a day and a time chosen. */
export function BookingScreen({ sample }: { sample: Sample }) {
  const b = sample.booking;
  return (
    <div className="d-cx">
      <CxTop shop={sample.shop} monogram={sample.monogram} context={b.context} />
      <div className="d-main">
        <div className="d-hero">
          <span className="d-eyebrow">{b.eyebrow}</span>
          <b className="d-h1">{b.title}</b>
          <span className="d-who-chip">{b.as} <b>{b.customer}</b></span>
        </div>
        <div className="d-section">
          <b className="d-h2"><span className="d-step done">1</span>{b.steps[0]}</b>
          <div className="d-card">
            {b.services.map((s) => (
              <div key={s.name} className={`d-choice${s.on ? " on" : ""}`}>
                <span className="d-row-text"><b>{s.name}</b><span>{rich(s.meta)}</span></span>
                <span className="d-radio">{s.on && <TickPath />}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="d-section">
          <b className="d-h2"><span className="d-step done">2</span>{b.steps[1]}</b>
          <div className="d-days">
            {b.days.map((d) => (
              <span key={d.day} className={`d-day${d.on ? " on" : ""}`}>
                <small>{d.top}</small><b>{d.day}</b><span>{d.month}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="d-section">
          <b className="d-h2"><span className="d-step done">3</span>{b.steps[2]}</b>
          <div className="d-times">
            {b.times.map((time) => (
              <span key={time} className={`d-time-slot${time === b.time ? " on" : ""}`} dir="ltr">{time}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="d-bar">
        <div className="d-sum"><span>{b.summary[0]}</span><b dir="auto">{b.summary[1]}</b></div>
        <span className="d-btn"><TickPath />{b.confirm}</span>
      </div>
    </div>
  );
}

/** One conversation in the workspace inbox, with its activity record between messages. */
export function InboxSheet({ sample }: { sample: Sample }) {
  const i = sample.inbox;
  return (
    <div className="d-sheet" aria-hidden="true">
      <div className="d-sheet-top">
        <span className="d-sheet-path">{sample.shop} <span>/</span> {i.screen}</span>
      </div>
      <div className="d-sheet-head">
        <span className="d-avatar">{i.customer.slice(0, 1)}</span>
        <b>{i.customer}</b>
        <span className="d-select"><small>{i.handled}</small> {i.handler}</span>
        <span className="d-ghost">{i.close}</span>
      </div>
      <ol className="d-thread d-thread-ws">
        {i.thread.map((item, index) =>
          "activity" in item ? (
            <li key={index} className="d-activity">
              <span>{item.activity}</span>
              <span dir="ltr">{item.time}</span>
            </li>
          ) : (
            <ChatBubble
              key={index}
              bubble={item}
              label={item.from === "customer" ? i.labels.customer : item.from === "assistant" ? i.labels.assistant : item.who}
            />
          ),
        )}
      </ol>
      <div className="d-paused">
        <b>{i.paused.title}</b>
        <span>{i.paused.hint}</span>
      </div>
    </div>
  );
}

/** The weekly report as the owner reads it: one WhatsApp message in the product's words.
 * Lines arrive one by one under `.motion` (home.css), once. */
export function ReportBubble({ report }: { report: Home["how"]["report"] }) {
  let line = 0;
  return (
    <div className="d-report" aria-hidden="true">
      <p className="d-report-text" dir="auto">
        <span className="d-rl d-report-head" style={{ "--i": line++ } as React.CSSProperties}>{rich(report.heading)}</span>
        <span className="d-rl" style={{ "--i": line++ } as React.CSSProperties}>{report.week}</span>
        {report.sections.map((section) => (
          <span key={section.title} className="d-report-sec">
            <span className="d-rl d-report-title" style={{ "--i": line++ } as React.CSSProperties}>{section.title}</span>
            {section.lines.map((text) => (
              <span key={text} className="d-rl" style={{ "--i": line++ } as React.CSSProperties}>{rich(text)}</span>
            ))}
          </span>
        ))}
        <span className="d-time" dir="ltr">{report.time}</span>
      </p>
    </div>
  );
}

/** The setup checklist with "Ask ALYR", joined at 45° to the request in ALYR's back office. */
export function AskFigure({ fig }: { fig: Home["included"]["figure"] }) {
  return (
    <div className="d-ask" aria-hidden="true">
      <div className="d-sheet d-setup">
        <span className="d-kicker">{fig.workspace}</span>
        <b className="d-setup-title">{rich(fig.setup)}</b>
        <span className="d-setup-sub">{fig.progress}</span>
        <span className="d-progress"><span /></span>
        <ul className="d-steps">
          {fig.steps.map((step) => (
            <li key={step.text} className={step.done ? "done" : "todo"}>
              <span className="d-check">{step.done && <TickPath />}</span>
              <span className="d-step-text">{step.text}</span>
              {!step.done && (
                <span className="d-ask-btn"><span>{rich(fig.ask)}</span></span>
              )}
            </li>
          ))}
        </ul>
        <span className="d-asked"><span className="d-chip-dot" /><span>{rich(fig.asked)}</span></span>
      </div>
      <svg className="d-joint" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M0 0 L100 100" vectorEffect="non-scaling-stroke" />
        <circle cx="0" cy="0" r="3" vectorEffect="non-scaling-stroke" />
        <circle cx="100" cy="100" r="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="d-sheet d-office">
        <span className="d-kicker"><span>{rich(fig.office)}</span></span>
        <b className="d-office-title">{fig.queue} <span className="d-count">1</span></b>
        <div className="d-office-row">
          <span className="d-office-cell"><small>{fig.heads.shop}</small><b>{fig.row.shop}</b><span dir="ltr" className="d-office-when">{fig.row.when}</span></span>
          <span className="d-office-cell"><small>{fig.heads.step}</small><span>{rich(fig.row.step)}</span></span>
          <span className="d-office-cell"><small>{fig.heads.note}</small><span>{fig.row.note}</span></span>
          <span className="d-office-cell"><small>{fig.heads.by}</small><span>{fig.row.by}</span></span>
          <span className="d-mark">{fig.row.done}</span>
        </div>
      </div>
    </div>
  );
}
