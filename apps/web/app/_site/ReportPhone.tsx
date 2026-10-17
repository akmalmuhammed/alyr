import type { ReactNode } from "react";
import type { CardImage } from "./report";
import type { ReportSample } from "./samples";

// The Sunday report as the owner gets it: one WhatsApp message on a phone, from the
// business's own line, with the card as its image and the engine's text under it
// (`_agent/samples/report/`, D-038). It is drawn with the site's WhatsApp chat (`.wa`,
// site.css), so it follows WhatsApp's light and dark colours with the page, and the card
// follows too: Carbon on dark, Paper on light. Only the visible card is fetched: both are
// lazy, and the hidden one is `display: none`. No words are bundled here: they arrive as
// props, from copy.ts and the samples. Styles are in drawings.css under `.rp`.

export type ReportWords = {
  meta: string;
  day: string;
  time: string;
  /** The card in words, for this sample. */
  alt: string;
  monogram: string;
};

const RLM = "‏";

/** WhatsApp's own marks, as it draws them: `*bold*` and `_italics_`.
 *
 * An Arabic line opens with a right-to-left mark. When a marked run there ends in Latin
 * ("‏*ALYR Chat* · 68 طلباً"), the bidi algorithm ties the number after it to the Latin
 * and draws "68 · ALYR Chat" from the right. A second mark after each run keeps the
 * line in order. The engine's text does not have it yet (reported to the product lane,
 * ALY-99), so the site adds it here. */
function marks(line: string): ReactNode[] {
  const rtl = line.startsWith(RLM);
  return line.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, index) => {
    const after = rtl ? RLM : "";
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <b key={index}>{part.slice(1, -1)}{after}</b>;
    if (part.length > 2 && part.startsWith("_") && part.endsWith("_")) return <i key={index}>{part.slice(1, -1)}{after}</i>;
    return part;
  });
}

function Card({ image, alt, theme }: { image: CardImage; alt: string; theme: "carbon" | "paper" }) {
  return (
    <picture className={`rp-card rp-${theme}`}>
      <source type="image/avif" srcSet={image.avif} />
      <source type="image/webp" srcSet={image.webp} />
      <img src={image.png} width={image.width} height={image.height} alt={alt} loading="lazy" decoding="async" />
    </picture>
  );
}

export function ReportPhone({ sample, words }: { sample: ReportSample; words: ReportWords }) {
  return (
    <div className="wa rp">
      <div className="wa-top" aria-hidden="true">
        <svg className="wa-back ico-flip" viewBox="0 0 24 24"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" /></svg>
        <span className="wa-avatar">{words.monogram}</span>
        <span className="wa-who">
          <b>{sample.shop}</b>
          <small>{words.meta}</small>
        </span>
        <svg className="wa-act" viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></svg>
        <svg className="wa-act" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
      </div>
      <div className="wa-thread rp-thread">
        <span className="wa-day" aria-hidden="true"><span>{words.day}</span></span>
        <div className="wa-msg wa-in wa-tail rp-msg">
          <div className="wa-bubble rp-bubble">
            <span className="rp-img">
              <Card image={sample.carbon} alt={words.alt} theme="carbon" />
              <Card image={sample.paper} alt={words.alt} theme="paper" />
            </span>
            <p className="rp-text">
              {sample.lines.map((line, index) =>
                line ? (
                  <span key={index} className="rp-line" dir="auto">{marks(line)}</span>
                ) : (
                  <span key={index} className="rp-gap" aria-hidden="true" />
                ),
              )}
            </p>
            <span className="wa-meta rp-meta" aria-hidden="true"><span dir="ltr">{words.time}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
