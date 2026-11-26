// Small shared pieces of Discovery v2: avatars, the Volt highlighter, a keyboard hint, and the
// date and time helpers (the product's `_ui/format.ts`: Doha time, Western digits).

import type { ReactNode } from "react";
import { formatDate, formatTime } from "../../../_ui/format.ts";
import { Mark } from "../shellParts";
import type { D2Lang } from "./copy";
import type { Person, Tone } from "./adapter";

export const day = (iso: string | null | undefined, lang: D2Lang): string => (iso ? formatDate(iso, lang) : "");
export const time = (iso: string | null | undefined, lang: D2Lang): string => (iso ? formatTime(iso, lang, { clock: 24 }) : "");
/** «Thu 12 Nov 09:40», the prototype's date and time with no comma. */
export const dayTime = (iso: string | null | undefined, lang: D2Lang): string => (iso ? `${day(iso, lang)} ${time(iso, lang)}` : "");

/** The part of a sentence to decide, behind the Volt highlighter. Draws in once (not with reduced motion). */
export function Hl({ children, draw = true, off = false }: { children: ReactNode; draw?: boolean; off?: boolean }) {
  return <span className={`d2-hl${draw ? " d2-hl-in" : ""}${off ? " d2-hl-off" : ""}`}>{children}</span>;
}

/** A Latin or numeric run inside an Arabic sentence keeps its order. */
export const Ltr = ({ children }: { children: ReactNode }) => <bdi dir="ltr" className="d2-ltr">{children}</bdi>;

export function Kbd({ children, onCarbon = false }: { children: ReactNode; onCarbon?: boolean }) {
  return <kbd className={`d2-kbd${onCarbon ? " d2-kbd-carbon" : ""}`} aria-hidden="true">{children}</kbd>;
}

export function Av({ person, tone, size, tip }: { person?: Person; tone?: Tone | "you" | "alyr"; size?: "md" | "sm"; tip?: string }) {
  const t = tone ?? person?.tone ?? "n";
  const cls = `d2-av d2-av-${t}${size ? ` d2-av-${size}` : ""}`;
  if (t === "alyr") return <span className={cls} data-tip={tip} aria-hidden={tip ? undefined : true}><Mark /></span>;
  if (t === "you") {
    return (
      <span className={cls} aria-hidden="true">
        <svg className="d2-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" /></svg>
      </span>
    );
  }
  return <span className={cls} data-tip={tip} aria-hidden={tip ? undefined : true}>{person?.initial ?? ""}</span>;
}

export function Avs({ people, size, tips }: { people: readonly Person[]; size?: "md" | "sm"; tips?: (p: Person) => string }) {
  if (!people.length) return null;
  return <span className="d2-avs">{people.map((p) => <Av key={p.name} person={p} size={size} tip={tips?.(p)} />)}</span>;
}
