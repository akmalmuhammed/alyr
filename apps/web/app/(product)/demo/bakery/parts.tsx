// The drawn pieces every scene of the demo uses: honesty labels, the shop's monogram, a
// drawn phone with a WhatsApp chat, the workspace window, a QR code. No words here: each
// takes its text from copy.ts through its props.

import type { CSSProperties, ReactNode } from "react";
import { Icon, Symbol, type IconName } from "../../../_site/brand";
import { encode, QUIET } from "../../_workspace/qr";
import type { ShopColour } from "./logic";

export { Icon, type IconName };

export type LabelKind = "built" | "setup" | "sample" | "week" | "estimate" | "notBuilt";

/** A small, honest mark: Built, Set up by ALYR, Sample, Sample week, Your estimate. */
export function Label({ kind, children }: { kind: LabelKind; children: ReactNode }) {
  return (
    <span className={`dm-label is-${kind}`}>
      <span className="dm-label-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

/** A row of labels with a condition line beside them. */
export function Labels({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="dm-labels">
      {children}
      {note ? <span className="dm-labels-note">{note}</span> : null}
    </div>
  );
}

export const shopVar = (colour: ShopColour) => ({ "--shop": `var(--shop-${colour})` }) as CSSProperties;

/** The trade words a shop's name often starts with: the monogram takes the name after them,
 * so «مخبز قرفة» gives «ق», not the «م» every bakery would share. */
const TRADE = /^(مخبز|مخابز|حلويات|مقهى|كافيه|محل|مطبخ|فرن|bakery|cafe|café)$/i;

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (/[؀-ۿ]/.test(name)) {
    const word = words.find((w) => !TRADE.test(w)) ?? words[0] ?? "";
    return word.replace(/^ال/, "").charAt(0) || "·";
  }
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "·";
}

/** The shop's monogram, in its own colour, cut at 45° like ALYR's marks. */
export function Monogram({ name, big }: { name: string; big?: boolean }) {
  return <span className={`dm-mono ${big ? "is-big" : ""}`} aria-hidden="true">{initials(name)}</span>;
}

/** A drawn phone. Its parts never shrink: it crops like a real one. */
export function Phone({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div className={`dm-phone ${className}`} role={label ? "group" : undefined} aria-label={label}>
      <div className="dm-phone-screen">{children}</div>
    </div>
  );
}

/** The top of a drawn WhatsApp chat: the shop's name and monogram, as the customer sees them. */
export function WaHead({ name, sub, alyr }: { name: string; sub: string; alyr?: boolean }) {
  return (
    <div className="dm-wa-head">
      {alyr ? <span className="dm-mono is-alyr" aria-hidden="true"><Symbol /></span> : <Monogram name={name} />}
      <span className="dm-wa-who">
        <b dir="auto">{name}</b>
        <small>{sub}</small>
      </span>
    </div>
  );
}

export function Bubble({ me, time, children, tick }: { me?: boolean; time: string; children: ReactNode; tick?: boolean }) {
  return (
    <div className={`dm-bub ${me ? "is-me" : ""}`}>
      <span className="dm-bub-text" dir="auto">{children}</span>
      <span className="dm-bub-time">
        <bdi>{time}</bdi>
        {tick ? (
          <svg className="dm-bub-tick" viewBox="0 0 18 12" aria-hidden="true"><path d="m1 6.5 3.2 3.2L10 3.5M7.5 9.2 8.8 10.5 16.5 2.5" /></svg>
        ) : null}
      </span>
    </div>
  );
}

/** The drawn workspace window: the shop's monogram and name in its bar, labels at the end. */
export function Window({ title, name, children, labels, className = "" }: {
  title: string; name: string; children: ReactNode; labels?: ReactNode; className?: string;
}) {
  return (
    <div className={`dm-win ${className}`}>
      <div className="dm-win-bar">
        <Monogram name={name} />
        <b dir="auto">{title}</b>
        <span className="dm-win-end">{labels}</span>
      </div>
      <div className="dm-win-body">{children}</div>
    </div>
  );
}

/** A QR code for a link, ink on paper whatever the theme (alyr-print), drawn as one path. */
export function Qr({ link, label }: { link: string; label: string }) {
  const m = encode(link);
  const size = m.size + QUIET * 2;
  let d = "";
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) if (m.dark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
  }
  return (
    <svg className="dm-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} className="dm-qr-ground" />
      <path d={d} className="dm-qr-ink" />
    </svg>
  );
}

/** A word that carries money or a number: kept whole and in its own direction. */
export const M = ({ children }: { children: ReactNode }) => <bdi className="dm-money">{children}</bdi>;

/** A stage line: the one idea of the screen. */
export function Line({ children, size = "title", className = "" }: { children: ReactNode; size?: "hero" | "title"; className?: string }) {
  return <h2 className={`dm-line is-${size} ${className}`}>{children}</h2>;
}
