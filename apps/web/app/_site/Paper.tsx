import type { CSSProperties, ReactNode } from "react";
import { PAPER_LABELS as L, type Pair, type PaperDoc } from "./paperData";
import "./paper.css";

// A receipt as ALYR Docs prints it, drawn in HTML (03-visuals.md §3.2): live text, so the
// browser shapes the Arabic, it stays sharp, it follows the theme (the --doc-* tokens) and
// it weighs a few kilobytes. The layout is the engine's own (documents/render, A4 and the
// 80 mm roll), element by element: Arabic first, English beside it, every amount one run.
// The paper never mirrors: it is Arabic first on the English page too, because that is the
// document. Each piece carries its place in reading order (`--k`), Arabic before its English
// twin, for the signature figure's draw (moment.css). Pictures only: nothing is focusable.

const k = (index: number) => ({ "--k": index }) as CSSProperties;

/** "الرقم · No.": the paper's label pair, Arabic first. */
function Label({ pair }: { pair: Pair }) {
  return (
    <span className="pp-l">
      {pair.ar} <span className="pp-dot">·</span> <span lang="en">{pair.en}</span>
    </span>
  );
}

function Money({ value, strong, currency }: { value: string; strong?: boolean; currency?: boolean }) {
  return (
    <bdi className={`pp-amt${strong ? " is-strong" : ""}`}>
      {value}
      {currency && <> {L.currency}</>}
    </bdi>
  );
}

function Head({ doc }: { doc: PaperDoc }) {
  return (
    <header className="pp-head">
      <div className="pp-shop">
        <b className="pp-in" style={k(0)}>{doc.shop.name.ar}</b>
        <span className="pp-en pp-in" lang="en" style={k(1)}>{doc.shop.name.en}</span>
        <span className="pp-addr pp-in" style={k(2)}>
          {doc.shop.address.ar} <span className="pp-dot">·</span> <span lang="en">{doc.shop.address.en}</span>
        </span>
      </div>
      <div className="pp-kind">
        <b className="pp-in" style={k(1)}>{doc.kind.ar}</b>
        <span className="pp-en pp-in" lang="en" style={k(2)}>{doc.kind.en}</span>
      </div>
    </header>
  );
}

/** The receipt on A4 (210 × 297). `crop` keeps only its top (head, number, customer, two
 * lines), as a phone shows it. */
export function PaperA4({ doc, crop = false, className }: { doc: PaperDoc; crop?: boolean; className?: string }) {
  return (
    <div className={`pp pp-a4${crop ? " is-crop" : ""}${className ? ` ${className}` : ""}`} dir="rtl" lang="ar">
      <div className="pp-sheet">
        <Head doc={doc} />
        <span className="pp-rule2 pp-in" style={k(3)} />
        <div className="pp-meta">
          <div className="pp-f pp-in" style={k(3)}>
            <Label pair={L.no} />
            <b className="pp-num"><bdi>{doc.number}</bdi></b>
          </div>
          <div className="pp-f pp-in" style={k(4)}>
            <Label pair={L.date} />
            <b>{doc.date.ar}</b>
            <span className="pp-en" lang="en">{doc.date.en}</span>
          </div>
        </div>
        <div className="pp-party">
          <div className="pp-f pp-in" style={k(5)}>
            <Label pair={L.customer} />
            <b>{doc.customer.ar}</b>
            <span className="pp-en" lang="en">{doc.customer.en}</span>
          </div>
          <div className="pp-f pp-in" style={k(6)}>
            <Label pair={L.payment} />
            <b>{doc.payment.ar} <span className="pp-dot">·</span> <span lang="en">{doc.payment.en}</span></b>
          </div>
          <div className="pp-f pp-f-end pp-in" style={k(6)}>
            <Money value={doc.paid} />
          </div>
        </div>
        <div className="pp-table">
          <div className="pp-tr pp-th pp-in" style={k(7)}>
            {[L.index, L.description, L.qty, L.unit, L.total].map((h) => (
              <span key={h.en}><b>{h.ar}</b><small lang="en">{h.en}</small></span>
            ))}
          </div>
          {doc.lines.map((line, index) => (
            <div key={line.name.en} className="pp-tr pp-in" style={k(8 + index)}>
              <span className="pp-i"><bdi>{index + 1}</bdi></span>
              <span><b>{line.name.ar}</b><small lang="en">{line.name.en}</small></span>
              <span className="pp-q"><bdi>{line.qty}</bdi> <small>{line.unit}</small></span>
              <span><Money value={line.price} /></span>
              <span><Money value={line.total} strong /></span>
            </div>
          ))}
        </div>
        <div className="pp-totals pp-in" style={k(10)}>
          <span className="pp-tl"><Label pair={L.subtotal} /><Money value={doc.subtotal} /></span>
          <span className="pp-tl pp-band"><Label pair={L.grand} /><Money value={doc.total} strong currency /></span>
          <span className="pp-tl"><Label pair={L.paid} /><Money value={doc.paid} /></span>
        </div>
        <div className="pp-notes pp-in" style={k(11)}>
          <span><b className="pp-l">{L.notes.ar} <span className="pp-dot">·</span> <span lang="en">{L.notes.en}</span></b>{doc.notes.ar}</span>
          <span lang="en">{doc.notes.en}</span>
        </div>
        <Foot doc={doc} />
      </div>
    </div>
  );
}

function Foot({ doc }: { doc: PaperDoc }) {
  return (
    <footer className="pp-foot pp-in" style={k(12)}>
      <span>{L.code} <bdi className="pp-code">{doc.code}</bdi></span>
      <span>{L.page}</span>
      <span><bdi>{L.issued}</bdi></span>
    </footer>
  );
}

/** The same receipt on an 80 mm roll: one column, each line's quantity under it, the total
 * large, the dashed separators of the paper itself. The space kept for a later QR is blank. */
export function PaperRoll({ doc, className }: { doc: PaperDoc; className?: string }) {
  return (
    <div className={`pp pp-roll${className ? ` ${className}` : ""}`} dir="rtl" lang="ar">
      <div className="pp-sheet">
        <div className="pp-r-head pp-in" style={k(0)}>
          <b>{doc.shop.name.ar}</b>
          <span className="pp-en" lang="en">{doc.shop.name.en}</span>
          <span className="pp-addr">{doc.shop.address.ar}</span>
          <span className="pp-addr" lang="en">{doc.shop.address.en}</span>
        </div>
        <span className="pp-dash" />
        <div className="pp-r-kind pp-in" style={k(1)}>
          <b>{doc.kind.ar}</b>
          <span className="pp-en" lang="en">{doc.kind.en}</span>
        </div>
        <div className="pp-r-pair pp-in" style={k(3)}><Label pair={L.no} /><b className="pp-num"><bdi>{doc.number}</bdi></b></div>
        <div className="pp-r-pair pp-in" style={k(4)}><Label pair={L.date} /><span>{doc.date.ar}</span></div>
        <span className="pp-r-rule" />
        <div className="pp-r-cust pp-in" style={k(5)}>
          <Label pair={L.customer} />
          <b>{doc.customer.ar}</b>
          <span className="pp-en" lang="en">{doc.customer.en}</span>
        </div>
        <span className="pp-dash" />
        {doc.lines.map((line, index) => (
          <div key={line.name.en} className="pp-r-line pp-in" style={k(8 + index)}>
            <b>{line.name.ar}</b>
            <span className="pp-en" lang="en">{line.name.en}</span>
            <span className="pp-r-qty">
              <span><bdi>{line.qty}</bdi> {line.unit} × <Money value={line.price} /></span>
              <Money value={line.total} strong />
            </span>
          </div>
        ))}
        <span className="pp-r-rule" />
        <div className="pp-r-pair pp-in" style={k(10)}><Label pair={L.subtotal} /><Money value={doc.subtotal} /></div>
        <span className="pp-rule2" />
        <div className="pp-r-total pp-in" style={k(10)}>
          <span className="pp-l"><b>{L.grand.ar}</b> <span lang="en">{L.grand.en}</span></span>
          <Money value={doc.total} strong currency />
        </div>
        <div className="pp-r-pair pp-in" style={k(11)}><span className="pp-l">{doc.payment.ar} <span className="pp-dot">·</span> <span lang="en">{doc.payment.en}</span></span><Money value={doc.paid} /></div>
        <div className="pp-r-notes pp-in" style={k(11)}>
          <b className="pp-l">{L.notes.ar} <span className="pp-dot">·</span> <span lang="en">{L.notes.en}</span></b>
          <span>{doc.notes.ar}</span>
          <span className="pp-en" lang="en">{doc.notes.en}</span>
        </div>
        <span className="pp-r-space" />
        <div className="pp-r-foot pp-in" style={k(12)}>
          <span>{L.code} <bdi className="pp-code">{doc.code}</bdi></span>
          <span><bdi>{L.issued}</bdi></span>
        </div>
      </div>
    </div>
  );
}

/** The foot of a receipt from a shop with no CR number: its note, as the paper prints it. */
export function PaperNote({ doc }: { doc: PaperDoc }) {
  return (
    <div className="pp pp-a4 pp-note" dir="rtl" lang="ar">
      <div className="pp-sheet">
        <div className="pp-totals">
          <span className="pp-tl pp-band"><Label pair={L.grand} /><Money value={doc.total} strong currency /></span>
          <span className="pp-tl"><Label pair={L.paid} /><Money value={doc.paid} /></span>
        </div>
        <div className="pp-noncr">
          <span>{doc.noCr.ar}</span>
          <span lang="en">{doc.noCr.en}</span>
        </div>
        <Foot doc={doc} />
      </div>
    </div>
  );
}

/** The top of the receipt, for the homepage's corner of ALYR Docs. */
export function PaperTop({ doc }: { doc: PaperDoc }) {
  return (
    <div className="pp pp-a4 pp-top" dir="rtl" lang="ar">
      <div className="pp-sheet">
        <Head doc={doc} />
        <span className="pp-rule2" />
        <div className="pp-meta">
          <div className="pp-f"><Label pair={L.no} /><b className="pp-num"><bdi>{doc.number}</bdi></b></div>
          <div className="pp-f"><Label pair={L.date} /><b>{doc.date.ar}</b></div>
        </div>
      </div>
    </div>
  );
}

/** The working drawing around a paper: a plate cut at 45 degrees, crosses at its corners and
 * a mono dimension line over each sheet ("210 mm", "80 mm"). */
export function Dimension({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`pp-dimmed${className ? ` ${className}` : ""}`}>
      <span className="pp-dim" aria-hidden="true"><span>{label}</span></span>
      {children}
    </div>
  );
}
