import type { ReactNode } from "react";
import { Icon, Symbol } from "./brand";

// The frames the homepage draws product screens in. No words of their own and no import
// of `copy.ts`, so the hero's client component can use them without shipping the copy.

/** A flat phone with the brand's 45° cut on its top inline-end corner. A picture unless
 * `live`, when what is on its screen can be used (the hero's order page). */
export function Phone({ children, className, live = false }: { children: ReactNode; className?: string; live?: boolean }) {
  return (
    <div className={`d-phone${className ? ` ${className}` : ""}`} aria-hidden={live ? undefined : true}>
      <div className="d-screen">{children}</div>
    </div>
  );
}

/** The small "Sample" mark a drawing carries in its own chrome (its window's title bar, its
 * phone's header, its tab row), once per drawing, in place of a FIG caption (site audit,
 * 24 Oct 2026). It travels with the drawing when someone screenshots it. Screen readers and
 * crawlers hear the figure's own first line instead, so the mark itself is hidden from them. */
export function SampleMark({ label, className }: { label: string; className?: string }) {
  return <span className={`mark-sample${className ? ` ${className}` : ""}`} aria-hidden="true">{label}</span>;
}

/** The top of a customer page: the shop's monogram with its Volt corner, its name, which
 * page this is, and the language switch. */
export function CxTop({ shop, monogram, context, other, lang }: {
  shop: string; monogram: string; context: string; other?: string; lang?: string;
}) {
  return (
    <div className="d-top">
      <span className="d-mono">{monogram}</span>
      <span className="d-shop"><b>{shop}</b><small>{context}</small></span>
      {other && <span className="d-lang" lang={lang}>{other}</span>}
    </div>
  );
}

/** "Powered by ALYR", the quiet sign-off at the foot of every customer page. */
export function CxFoot({ powered }: { powered: string }) {
  return (
    <div className="d-foot">
      <Symbol className="d-foot-mark" />
      <span>{powered}</span>
      <b>ALYR</b>
    </div>
  );
}

/** The tick used across the drawings, as the product draws it. */
export function TickPath() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** A file in a WhatsApp chat, as a document message: a page glyph from ALYR's icon grid,
 * the file's name and "1 page · PDF", above its caption. No WhatsApp logo. */
export function WaDoc({ name, meta }: { name: string; meta: string }) {
  return (
    <span className="wa-doc">
      <span className="wa-doc-ico"><Icon name="document" /></span>
      <span className="wa-doc-t"><b dir="ltr">{name}</b><small dir="auto">{meta}</small></span>
    </span>
  );
}
