// The small drawings and helpers the workspace shell and its sections share: the line icons, the
// ALYR mark, the tick, the stagger style and the initials of a name. Moved out of the shell page
// unchanged, so the legacy shell and the sections draw exactly what they drew before.

import type { CSSProperties } from "react";
import { color } from "../../_tokens/tokens";

export const ICON: Record<string, string> = {
  home: "M4 11 12 4l8 7v9H4z M10 20v-5h4v5",
  inbox: "M4 5h16v10H14l-2 3-2-3H4z",
  calendar: "M5 5h14v15H5z M8 3v4 M16 3v4 M5 10h14",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6",
  book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h10",
  apps: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
  catalog: "M4 4h7v8H4z M13 4h7v5h-7z M13 11h7v9h-7z M4 14h7v6H4z",
  doc: "M7 3h8l4 4v14H7z M15 3v4h4 M10 12h6 M10 16h6",
  plug: "M9 3v5 M15 3v5 M6 8h12v3a6 6 0 0 1-12 0z M12 17v4",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M3 21v-2a6 6 0 0 1 12 0v2 M16 4.5a3.5 3.5 0 0 1 0 6.5 M17 15a5 5 0 0 1 4 4.9V21",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M5 21v-1a7 7 0 0 1 14 0v1",
  plus: "M12 5v14 M5 12h14",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M20 20l-4-4",
  chat: "M4 5h16v11H10l-6 4z M8 10h8",
  card: "M3 6h18v12H3z M3 10h18 M7 14h4",
  chart: "M3 20h18 M6 20v-6 M11 20V8 M16 20v-9 M21 4l-5 4-5-3-5 5",
  wallet: "M4 7h15v12H4z M4 7l11-3v3 M15 13h2",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  out: "M14 4h6v16h-6 M10 8l-4 4 4 4 M6 12h10",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M3 12h18 M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z",
  send: "M4 12 20 4l-6 16-3-7z",
  enter: "M20 5v7H6 M10 8l-4 4 4 4",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
};

export function Icon({ name, className = "sh-ico" }: { name: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {(ICON[name] ?? ICON.apps).split(" M").map((d, i) => <path key={i} d={i ? `M${d}` : d} />)}
    </svg>
  );
}

export function Mark({ volt = color.brand.volt }: { volt?: string }) {
  return (
    <svg className="sh-mark" viewBox="0 0 190 160" aria-hidden="true">
      <polygon fill="currentColor" points="50,0 180,0 130,62 0,62" />
      <polygon fill="currentColor" points="0,72 126,72 39,160" />
      <polygon fill={volt} points="134,72 190,72 142,160 46,160" />
    </svg>
  );
}

export function Tick() {
  return <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5 5 9l4.5-6" /></svg>;
}

export const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "A";
}
