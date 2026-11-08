"use client";

// Discovery in the workspace's menu (ALY-322, spec 065 "Screens": "In the menu, Discovery is one
// item that opens to Home, To do, Reviews and Reports beneath it"). The shell draws these under
// the Discovery item while the section is open, on a laptop's sidebar; on a phone the same four are
// in the More sheet (the command palette) and at the top of the screen. Only this item has any
// views beneath it (`subItems` in `discoveryLogic.ts` answers an empty list for every other
// section), so every other entry of the menu is drawn exactly as before.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { T, type Lang } from "./discoveryCopy";
import { readView, subItems, viewHref, type View } from "./discoveryLogic";

/**
 * Tells the shell which view the address names. The shell cannot read the address itself without
 * a `Suspense` around the whole workspace, so this small part reads it for the shell, inside its own.
 */
export function ViewReporter({ onView }: { onView: (view: View) => void }) {
  const view = readView(useSearchParams().get("view"));
  useEffect(() => { onView(view); }, [view, onView]);
  return null;
}

/** The four views beneath the Discovery item of the sidebar, the current one marked. */
export function SubNav({ itemKey, lang, view }: { itemKey: string; lang: Lang; view: View }) {
  const views = subItems(itemKey);
  if (views.length === 0) return null;
  const t = T[lang];
  return (
    <ul className="sh-sub" aria-label={t.viewsLabel}>
      {views.map((v) => (
        <li key={v}>
          <Link href={viewHref(v)} className={`sh-sublink ${v === view ? "on" : ""}`} aria-current={v === view ? "page" : undefined}>{t.views[v]}</Link>
        </li>
      ))}
    </ul>
  );
}
