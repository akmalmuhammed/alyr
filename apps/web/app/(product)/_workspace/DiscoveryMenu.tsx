"use client";

// Discovery in the workspace's menu (ALY-322, spec 065 "Screens": "In the menu, Discovery is one
// item that opens to Home, To do, Reviews and Reports beneath it"; ALY-324, spec 066 "Menu": Home,
// To do, Proposals, Reviews, Reports and, for an owner or an admin only, Settings). The shell draws
// these under the Discovery item while the section is open, on a laptop's sidebar; on a phone, where
// the menu is the tab bar and its More sheet, the same views are in the More sheet (the command
// palette) and in a row at the top of the screen. Only this item has any views beneath it
// (`subItems` in `discoveryLogic.ts` answers an empty list for every other section), so every other
// entry of the menu is drawn exactly as before.
//
// Proposals says how many changes wait for this person, in words ("2 waiting"), not in a number
// disc. The count is asked for when the menu is drawn and again when a change moves (approved,
// declined, undone, prepared), never on a timer.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { discovery } from "./discoveryApi";
import { T, type Lang } from "./discoveryCopy";
import { readView, subItems, viewHref, type View } from "./discoveryLogic";
import { CHANGED_EVENT } from "./discoveryUi";

/**
 * Tells the shell which view the address names. The shell cannot read the address itself without
 * a `Suspense` around the whole workspace, so this small part reads it for the shell, inside its own.
 */
export function ViewReporter({ onView, canManage = false }: { onView: (view: View) => void; canManage?: boolean }) {
  const view = readView(useSearchParams().get("view"), canManage);
  useEffect(() => { onView(view); }, [view, onView]);
  return null;
}

// ── how many changes wait ───────────────────────────────

let waiting: number | null = null;
let inflight = false;
let again = false;
const listeners = new Set<() => void>();

async function refresh(lang: Lang): Promise<void> {
  // A question asked while one is on its way asks once more after it, so an answer is never older than the last change.
  if (inflight) { again = true; return; }
  inflight = true;
  try {
    do {
      again = false;
      try { waiting = (await discovery.proposals(lang, { status: "live" })).waiting; } catch { waiting = null; }
      listeners.forEach((l) => l());
    } while (again);
  } finally {
    inflight = false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // Nobody shows it any more: the next person to look must not see this one's number.
    if (listeners.size === 0) waiting = null;
  };
}

/** The number of changes waiting for this person, or null while it is not known (or they may not see any). */
export function useWaiting(lang: Lang): number | null {
  const value = useSyncExternalStore(subscribe, () => waiting, () => null);
  useEffect(() => {
    void refresh(lang);
    const on = () => void refresh(lang);
    window.addEventListener(CHANGED_EVENT, on);
    return () => window.removeEventListener(CHANGED_EVENT, on);
  }, [lang]);
  return value;
}

/** The views beneath the Discovery item of the sidebar, the current one marked. */
export function SubNav({ itemKey, lang, view, canManage = false }: { itemKey: string; lang: Lang; view: View; canManage?: boolean }) {
  const views = subItems(itemKey, canManage);
  const count = useWaiting(lang);
  if (views.length === 0) return null;
  const t = T[lang];
  return (
    <ul className="sh-sub" aria-label={t.viewsLabel}>
      {views.map((v) => (
        <li key={v}>
          <Link href={viewHref(v)} className={`sh-sublink ${v === view ? "on" : ""}`} aria-current={v === view ? "page" : undefined}>
            {t.views[v]}
            {v === "proposals" && count !== null && count > 0 && <small className="dv-subn">{t.waitingN(count)}</small>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
