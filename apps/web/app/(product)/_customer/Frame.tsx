import type { ReactNode } from "react";
import "./customer.css";

// Shared pieces of the customer pages (order, book, pay, track). Server-safe: no state.

export type Lang = "en" | "ar";

const PATHS: Record<string, string> = {
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  card: "M3 6h18v12H3z M3 10h18",
  wa: "M5 19l1.2-3.4A7.5 7.5 0 1 1 9 18.3L5 19z",
};

export function Glyph({ name, className }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {(PATHS[name] ?? "").split(" M").map((d, i) => <path key={i} d={i ? `M${d}` : d} />)}
    </svg>
  );
}

export function initials(name: string) {
  // Arabic names: one letter, skipping the article, so النور gives ن rather than ال.
  if (/[؀-ۿ]/.test(name)) return name.trim().split(/\s+/)[0].replace(/^ال/, "").charAt(0) || "·";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "·";
}

function AlyrMark() {
  return (
    <svg viewBox="0 0 190 160" aria-hidden="true">
      <polygon fill="currentColor" points="50,0 180,0 130,62 0,62" />
      <polygon fill="currentColor" points="0,72 126,72 39,160" />
      <polygon fill="#B7F34A" points="134,72 190,72 142,160 46,160" />
    </svg>
  );
}

type FrameProps = {
  lang: Lang;
  onLang?: () => void;
  shop: string;
  /** Under the shop's name in the top bar: "Order", "Booking", "Payment"… */
  context: string;
  /** No fixed bar at the bottom, so less room is kept for it. */
  short?: boolean;
  children: ReactNode;
};

/** The shop's own header, the page, and ALYR's quiet sign-off. */
export function Frame({ lang, onLang, shop, context, short, children }: FrameProps) {
  return (
    <div className="cx" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <header className="cx-top">
        <div className="cx-top-in">
          <span className="cx-mono" aria-hidden="true">{initials(shop)}</span>
          <span className="cx-shop"><b>{shop}</b><small>{context}</small></span>
          {onLang && (
            <button className="cx-lang" onClick={onLang} lang={lang === "ar" ? "en" : "ar"}>
              {lang === "ar" ? "English" : "العربية"}
            </button>
          )}
        </div>
      </header>
      <main className={`cx-main cx-enter ${short ? "short" : ""}`}>
        {children}
        <footer className="cx-foot" style={{ "--i": 9 } as React.CSSProperties}>
          <AlyrMark /><span>{lang === "ar" ? "مدعوم من" : "Powered by"}</span><b>ALYR</b>
        </footer>
      </main>
    </div>
  );
}

/** "Ordering as Ahmed", with the WhatsApp mark: this page knows who they are because
 *  they came from their own chat. */
export function Who({ label }: { label: ReactNode }) {
  return (
    <span className="cx-who">
      <span className="cx-wa"><Glyph name="wa" /></span>
      <span>{label}</span>
    </span>
  );
}

export function Done({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="cx-done" role="status">
      <span className="cx-tick"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
      <h1>{title}</h1>
      {children}
    </section>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="cx"><div className="cx-empty"><p>{text}</p></div></div>;
}

export const qar = (dirhams: number) =>
  (dirhams / 100).toLocaleString("en", { maximumFractionDigits: 2 });
