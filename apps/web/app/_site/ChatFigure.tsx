import { Icon, Symbol } from "./brand";
import type { Figure } from "./copy";

/** One conversation on a customer's phone and the records it becomes in the business's
 * workspace: what ALYR Chat does, drawn. */
export function ChatFigure({ figure }: { figure: Figure }) {
  return (
    <figure className="flow" aria-label={figure.label}>
      <span className="tick tick-a" aria-hidden="true" />
      <span className="tick tick-b" aria-hidden="true" />
      <span className="tick tick-c" aria-hidden="true" />
      <span className="tick tick-d" aria-hidden="true" />

      <div className="wa wa-mini">
        <div className="wa-top">
          <span className="wa-avatar" aria-hidden="true">{figure.business.slice(0, 1)}</span>
          <span className="wa-who"><b>{figure.business}</b></span>
        </div>
        <ol className="wa-thread">
          {figure.chat.map((line, index) => (
            <li
              key={line.text}
              className={`wa-msg wa-tail ${line.from === "customer" ? "wa-out" : "wa-in"}`}
              style={{ "--n": index } as React.CSSProperties}
            >
              <div className="wa-bubble">
                <span className="wa-text" dir="auto">{line.text}</span>
                <span className="wa-meta">
                  <span dir="ltr">{line.time}</span>
                  {line.from === "customer" && (
                    <svg className="wa-ticks" viewBox="0 0 18 12" aria-hidden="true">
                      <path d="M1 6.5 4.2 9.7 10.6 2.3" />
                      <path d="M7.2 9.7 13.6 2.3" transform="translate(3.4 0)" />
                    </svg>
                  )}
                </span>
              </div>
              {line.action && (
                <div className="wa-cta">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="ico-flip"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
                  {line.action}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="flow-via">
        <span className="flow-line" aria-hidden="true" />
        <span className="flow-mark" aria-hidden="true"><Symbol className="flow-symbol" /></span>
        <span className="eyebrow">{figure.via}</span>
        <span className="flow-line" aria-hidden="true" />
      </div>

      <ul className="flow-rows">
        {figure.rows.map((row, index) => (
          <li key={row.title} className={row.done ? "is-done" : undefined} style={{ "--n": index } as React.CSSProperties}>
            <Icon name={row.icon} className="flow-ico" />
            <span className="flow-what">
              <b>{row.title}</b>
              <small dir="auto">{row.detail}</small>
            </span>
            <span className="flow-status">{row.status}</span>
          </li>
        ))}
      </ul>
      <figcaption>{figure.note}</figcaption>
    </figure>
  );
}
