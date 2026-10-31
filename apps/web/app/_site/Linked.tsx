import { Fragment, type ReactNode } from "react";
import { rich } from "./Text";

// A line of copy that holds links, written as [label](address) (copyLegal.ts, copyPricing.ts).
// The address is part of the copy, so the page's language is already in it (/ar/privacy). The
// rest of the line goes through `rich`, which keeps amounts, product names and Latin runs whole
// in an Arabic sentence. A label that is an address or an email (no Arabic) is read left to
// right, whatever the line's direction.

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const ARABIC = /[؀-ۿ]/;

export function linked(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    if (m.index > last) out.push(<Fragment key={`t${last}`}>{rich(text.slice(last, m.index))}</Fragment>);
    const [whole, label, href] = m;
    out.push(
      <a key={`a${m.index}`} href={href} {...(/^https?:/.test(href) ? { rel: "noopener noreferrer" } : {})}>
        {ARABIC.test(label) ? rich(label) : <bdi dir="ltr">{label}</bdi>}
      </a>,
    );
    last = m.index + whole.length;
  }
  if (last === 0) return rich(text);
  if (last < text.length) out.push(<Fragment key={`t${last}`}>{rich(text.slice(last))}</Fragment>);
  return out;
}
