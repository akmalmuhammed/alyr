// "Search or jump to": a menu of screens and actions, filtered as you type, moved with the arrows,
// opened with Enter. It answers no question (its footer says so). In the workspace the shell's own
// palette opens instead; this one serves the preview, which has no shell.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { T, type D2Lang } from "./copy";
import { Ic, type IconName } from "./icons";
import { Kbd } from "./parts";

export type Command = { id: string; group: "go" | "act"; icon: IconName; label: string; note?: string; run: () => void };

export function CommandMenu({ lang, items, onClose }: { lang: D2Lang; items: Command[]; onClose: () => void }) {
  const t = T[lang];
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  const shown = useMemo(() => items.filter((c) => !query.trim() || c.label.toLowerCase().includes(query.trim().toLowerCase())), [items, query]);
  const pick = Math.min(cursor, Math.max(0, shown.length - 1));

  const keys = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setCursor((pick + 1) % Math.max(1, shown.length)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setCursor((pick - 1 + shown.length) % Math.max(1, shown.length)); }
    else if (event.key === "Enter") { event.preventDefault(); const c = shown[pick]; if (c) { onClose(); c.run(); } }
    else if (event.key === "Escape") { event.preventDefault(); onClose(); }
  };
  const group = (g: Command["group"], title: string) => {
    const list = shown.filter((c) => c.group === g);
    if (!list.length) return null;
    return (
      <>
        <div className="d2-cmdk-g" role="presentation">{title}</div>
        {list.map((c) => {
          const i = shown.indexOf(c);
          return (
            <div key={c.id} id={`d2-cmd-${c.id}`} className="d2-cmdk-i" role="option" aria-selected={i === pick} onMouseMove={() => setCursor(i)} onClick={() => { onClose(); c.run(); }}>
              <span className={`d2-cmdk-ico${c.group === "act" ? " d2-cmdk-ico-carbon" : ""}`}><Ic name={c.icon} size="sm" /></span>
              <span>{c.label}</span>
              {c.note ? <small>{c.note}</small> : null}
            </div>
          );
        })}
      </>
    );
  };
  return (
    <div className="d2-cmdk-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="d2-cmdk" role="dialog" aria-modal="true" aria-label={t.cmdPlaceholder} onKeyDown={keys}>
        <div className="d2-cmdk-in">
          <Ic name="search" />
          <input ref={input} type="text" value={query} onChange={(e) => { setQuery(e.target.value); setCursor(0); }} placeholder={t.cmdPlaceholder} aria-label={t.cmdPlaceholder}
            role="combobox" aria-expanded="true" aria-controls="d2-cmdk-list" aria-activedescendant={shown[pick] ? `d2-cmd-${shown[pick].id}` : undefined} />
          <Kbd>{t.esc}</Kbd>
        </div>
        <div className="d2-cmdk-list" role="listbox" id="d2-cmdk-list">
          {group("go", t.cmdGo)}
          {group("act", t.cmdActions)}
        </div>
        <div className="d2-cmdk-foot">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd>{t.cmdMove}</span>
          <span><Kbd>↵</Kbd>{t.cmdOpen}</span>
          <span><Kbd>{t.esc}</Kbd>{t.cmdClose}</span>
          <span className="d2-end">{t.cmdNote}</span>
        </div>
      </div>
    </div>
  );
}
