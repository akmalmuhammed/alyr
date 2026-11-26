"use client";

// Discovery v2 in the workspace: This week · Checks · Answers · Proof as tabs (a segmented
// control), and Set up (the kind of business). The page shown is in the address (`?tab=`), so a
// tab can be linked and opened in a new tab. The tabs' count and ALYR's bar read the overview once.
// A business that was never checked and whose kind was never chosen opens on Set up (owner and
// admin); everyone else opens on This week.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { viewHref } from "../discoveryLogic";
import { AgentBar } from "./AgentBar";
import { discovery2 } from "./api2";
import type { D2Lang } from "./copy";
import { Tabs, type TabKey } from "./frame";
import { LiveAnswers, LiveChecks, LiveProof, LiveSetup } from "./LiveScreens";
import { LiveThisWeek } from "./LiveThisWeek";

export type PageKey = TabKey | "setup";
export const PAGE_KEYS: readonly PageKey[] = ["week", "checks", "answers", "proof", "setup"];
export const readPage = (value: string | null | undefined): PageKey | null => (PAGE_KEYS as readonly string[]).includes(value ?? "") ? (value as PageKey) : null;

/** The address of a page of Discovery v2. This week is the plain section address. */
export const pageHref = (page: PageKey) => (page === "week" ? "/app/discovery" : `/app/discovery?tab=${page}`);
/** The classic screens, until they have a v2 (`ui=1` opens them in the classic look). */
const classic = (href: string) => `${href}${href.includes("?") ? "&" : "?"}ui=1`;

export function DiscoveryV2({ lang, page, go, canManage, onSearch }: {
  lang: D2Lang;
  /** Null: no `?tab=` in the address; the page is worked out once the overview is read. */
  page: PageKey | null;
  go: (page: PageKey) => void;
  canManage: boolean;
  onSearch?: () => void;
}) {
  const [waiting, setWaiting] = useState(0);
  const [hasRun, setHasRun] = useState(true);
  const [first, setFirst] = useState<PageKey | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const plus = await discovery2.overview(lang);
        if (!live) return;
        setWaiting(plus.overview.proposals?.waiting ?? 0);
        setHasRun(plus.overview.has_run);
        if (canManage && !plus.overview.has_run && page === null) {
          const mine = await discovery2.pack(lang).catch(() => null);
          // Opens on Set up once, through the address, so the tabs work as usual afterwards.
          if (live && mine && !mine.chosen) { go("setup"); return; }
        }
        if (live) setFirst("week");
      } catch {
        if (live) setFirst("week");
      }
    })();
    return () => { live = false; };
    // The opening page is worked out once per language; `page` and `go` are read, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, canManage]);

  const shown: PageKey = page ?? first ?? "week";
  const tabs = shown === "setup" && !hasRun ? null : <Tabs lang={lang} current={shown === "setup" ? null : shown} waiting={waiting} hrefOf={pageHref} onGo={go} />;
  const foot = useCallback((toast: ReactNode) => (
    <AgentBar lang={lang} asks={waiting} latest="" nextCheckAt={null} onSearch={onSearch ?? (() => {})} onAsks={() => go("week")} toast={toast} />
  ), [lang, waiting, onSearch, go]);

  if (page === null && first === null) return null;
  switch (shown) {
    case "checks":
      return <LiveChecks lang={lang} tabs={tabs} foot={foot} hrefs={{
        week: pageHref("week"), setup: canManage ? pageHref("setup") : null,
        connections: canManage ? "/app/connections" : null,
        task: (id) => classic(viewHref("todo", { finding: id })),
      }} />;
    case "answers":
      return <LiveAnswers lang={lang} tabs={tabs} foot={foot} />;
    case "proof":
      return <LiveProof lang={lang} tabs={tabs} foot={foot} />;
    case "setup":
      return <LiveSetup lang={lang} canManage={canManage} tabs={tabs} onDone={() => go("checks")} />;
    default:
      return <LiveThisWeek lang={lang} onSearch={onSearch} tabs={tabs} checksHref={pageHref("checks")} />;
  }
}
