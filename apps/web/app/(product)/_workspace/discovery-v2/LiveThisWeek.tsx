"use client";

// This week on the shop's real Discovery API: reads the overview, the proposals waiting and the
// ones of the last days, the checks, the team (for who may approve) and the facts of the first
// ask's place, builds the view, and passes the real endpoints as actions. Nothing here invents a
// value: what the API does not send yet is simply absent (adapter.ts `Extras`).

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { discovery } from "../discoveryApi";
import { sayError, viewHref } from "../discoveryLogic";
import { buildThisWeek, type ThisWeekView } from "./adapter";
import type { D2Lang } from "./copy";
import { ThisWeek, type ThisWeekActions } from "./ThisWeek";
import { ErrorState, LoadingState } from "./States";

type Load = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; view: ThisWeekView; now: number };

/** The classic screens, until their v2 lands (U2): `ui=1` opens them in the classic look. */
const classic = (view: Parameters<typeof viewHref>[0]) => `${viewHref(view)}${viewHref(view).includes("?") ? "&" : "?"}ui=1`;

/** `tabs`: Discovery v2's tabs (U2), drawn above the brief; `checksHref`: the v2 Checks tab. */
export function LiveThisWeek({ lang, onSearch, tabs, checksHref }: { lang: D2Lang; onSearch?: () => void; tabs?: ReactNode; checksHref?: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  const read = useCallback(async () => {
    try {
      const [overview, waiting, recent, checks, team] = await Promise.all([
        discovery.overview(lang),
        discovery.proposals(lang, { status: "proposed" }),
        discovery.proposals(lang, { status: "done" }),
        discovery.checks(lang).catch(() => null),
        discovery.team().catch(() => null),
      ]);
      const first = waiting.items.find((p) => p.status === "proposed");
      const facts = first?.location ? await discovery.facts(lang, first.location.id).catch(() => []) : [];
      const now = Date.now();
      setLoad({ kind: "ready", now, view: buildThisWeek({ overview, waiting: waiting.items, recent: recent.items, checks, facts, team, now, lang }) });
    } catch (error) {
      setLoad({ kind: "error", message: sayError(error, lang) });
    }
  }, [lang]);

  useEffect(() => {
    const start = setTimeout(() => { void read(); }, 0);
    return () => clearTimeout(start);
  }, [read]);

  if (load.kind === "loading") return <LoadingState lang={lang} />;
  if (load.kind === "error") return <ErrorState lang={lang} message={load.message} onRetry={() => { setLoad({ kind: "loading" }); void read(); }} />;

  const actions: ThisWeekActions = {
    approve: (p) => discovery.approve(lang, p.id, p.change_hash),
    decline: (p) => discovery.decline(lang, p.id),
    undo: (p) => discovery.undo(lang, p.id),
    read: (p) => discovery.proposal(lang, p.id),
    skip: async (f) => { await discovery.setStatus(lang, f.id, "skipped"); },
    // TODO(D): Change it needs a route that takes a changed after value (api-gaps.md). Until then it is not drawn.
    onSearch,
    hrefs: { checks: checksHref ?? classic("home"), changes: classic("proposals"), reports: classic("reports"), settings: classic("settings"), classic: classic("home") },
    sayError: (error) => sayError(error, lang),
  };
  return <ThisWeek lang={lang} view={load.view} actions={actions} now={load.now} tabs={tabs} />;
}
