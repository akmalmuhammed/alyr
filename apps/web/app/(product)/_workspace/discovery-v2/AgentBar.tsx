// ALYR's voice on the page: a Carbon bar at the foot with the next check (when the API says it),
// how many asks wait (a link to the first), the latest receipt, and "Search or jump to · Ctrl K",
// which opens a menu of screens and actions. It answers nothing: there is no chat box. The toast
// lane sits just above it, so a toast never covers the page.

import type { ReactNode } from "react";
import { Mark } from "../shellParts";
import { T, type D2Lang } from "./copy";
import { Ic } from "./icons";
import { Kbd, Ltr, dayTime } from "./parts";

export function AgentBar({ lang, asks, latest, nextCheckAt, onSearch, onAsks, toast }: {
  lang: D2Lang;
  asks: number;
  latest: string;
  nextCheckAt: string | null;
  onSearch: () => void;
  onAsks: () => void;
  toast?: ReactNode;
}) {
  const t = T[lang];
  return (
    <div className="d2-foot">
      <div className="d2-toast-lane">{toast}</div>
      <div className="d2-agentbar d2-on-carbon" role="region" aria-label={t.agent}>
        <span className="d2-mark"><Mark /><b>{t.agent}</b></span>
        {nextCheckAt ? (
          <>
            <span className="d2-seg"><span className="d2-heart" aria-hidden="true" /><small>{t.nextCheck} <b><Ltr>{dayTime(nextCheckAt, lang)}</Ltr></b></small></span>
            <span className="d2-div" aria-hidden="true" />
          </>
        ) : null}
        <button className="d2-seg" type="button" onClick={onAsks} aria-label={t.asksLabel(asks)}>
          <span className="d2-count">{asks.toLocaleString("en")}</span><span>{t.asksWaiting}</span>
        </button>
        {latest ? (
          <>
            <span className="d2-div" aria-hidden="true" />
            <span className="d2-seg d2-latest"><Ic name="check" size="sm" /><span>{latest}</span></span>
          </>
        ) : <span className="d2-latest" />}
        <button className="d2-search" type="button" onClick={onSearch} aria-haspopup="dialog" aria-keyshortcuts="Control+K">
          <Ic name="search" size="sm" /><span>{t.search}</span><Kbd onCarbon>{t.searchKey}</Kbd>
        </button>
      </div>
    </div>
  );
}
