"use client";

import { useEffect, useMemo } from "react";
import { buildThisWeek } from "@/app/(product)/_workspace/discovery-v2/adapter";
import type { D2Lang } from "@/app/(product)/_workspace/discovery-v2/copy";
import { FIXTURE_NOW, approvedHours, fixture } from "@/app/(product)/_workspace/discovery-v2/fixtures";
import { ThisWeek, type ThisWeekActions } from "@/app/(product)/_workspace/discovery-v2/ThisWeek";
import { ErrorState, LoadingState } from "@/app/(product)/_workspace/discovery-v2/States";
import type { Proposal } from "@/app/(product)/_workspace/discoveryApi";
import { PreviewTabs, ScreensPreview, type ScreenTab } from "./ScreensPreview";

/**
 * The preview's frame: the fixtures through the same adapter the workspace uses, and actions that
 * answer like the API would (Approve answers "approved", the next read "applied"), without a server.
 * `lang` is written on <html> the way the product layout writes it.
 */
export function DiscoveryPreview({ lang, state, source, sheet, fan, change, tab = "week", screenState = "default" }: {
  lang: D2Lang;
  state: "default" | "approved" | "loading" | "empty" | "error";
  /** U2: the page; This week is U1's. */
  tab?: "week" | ScreenTab;
  /** U2: the state of a Checks, Answers, Proof or Set up page. */
  screenState?: string;
  source: "google" | "sample";
  sheet: boolean;
  fan: boolean;
  change: boolean;
}) {
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";
    root.setAttribute("data-theme", "light");
  }, [lang]);

  const f = useMemo(() => fixture(lang, source), [lang, source]);
  const view = useMemo(() => {
    const input = state === "empty"
      ? { ...f, waiting: [], recent: [], asks: { ...f.asks, open: [] }, overview: { ...f.overview, up_next: [], done: [], proposals: { waiting: 0, approved: 0, failed: 0, next: null } } }
      : f;
    return buildThisWeek({ ...input, extras: f.extras, now: FIXTURE_NOW, lang });
  }, [f, state, lang]);

  const by = lang === "ar" ? "هناء" : "Hana";
  const at = new Date(FIXTURE_NOW + 60_000).toISOString();
  const later = (p: Proposal): Promise<Proposal> => new Promise((done) => setTimeout(() => done(p), 400));
  const actions: ThisWeekActions = {
    approve: (p) => later({ ...p, status: "approved", decided: { by, channel: "portal", at, reason: "" }, can: { approve: false, decline: false, undo: false } }),
    read: (p) => later({ ...p, status: "applied", applied_at: at, verification: "pending", undo_until: new Date(FIXTURE_NOW + 7 * 864e5).toISOString(), can: { approve: false, decline: false, undo: true },
      life: { state: "sent", at, text: "" }, life_history: [{ state: "approved", at, text: "" }, { state: "sent", at, text: "" }], next_check_at: new Date(FIXTURE_NOW + 20 * 36e5).toISOString() }),
    decline: (p) => later({ ...p, status: "declined", decided: { by, channel: "portal", at, reason: "" }, can: { approve: false, decline: false, undo: false } }),
    undo: (p) => later({ ...p, status: "undone", undone: { by, channel: "portal", at, reason: "" }, can: { approve: false, decline: false, undo: false } }),
    skip: () => new Promise((done) => setTimeout(done, 300)),
    // The API answers an edited approval with a new proposal: the changed value, `approved_as: "edited"`.
    changeAfter: change ? (p, after) => later({
      ...p, id: `${p.id}-edited`, status: "approved", approved_as: "edited", edited_from: p.id,
      decided: { by, channel: "portal", at, reason: "" }, can: { approve: false, decline: false, undo: false },
      after: { ...p.after, lines: p.after.lines.map((l) => {
        const span = (after as Record<string, unknown>)[l.day];
        return Array.isArray(span) ? { ...l, text: `${span[0]} – ${span[1]}` } : l;
      }) },
    }) : undefined,
    hrefs: { checks: "#checks", changes: "#changes", reports: "#reports", settings: "#settings", classic: "#classic" },
    sayError: () => (lang === "ar" ? "تعذّر ذلك. لم يتغيّر شيء." : "That did not work. Nothing changed."),
    pollMs: 700,
  };

  if (tab !== "week") return <main className="d2-preview"><ScreensPreview lang={lang} tab={tab} state={screenState} /></main>;
  if (state === "loading") return <LoadingState lang={lang} />;
  if (state === "error") return <ErrorState lang={lang} message="" onRetry={() => window.location.reload()} />;
  const initial = state === "approved" ? { overrides: { [f.waiting[0].id]: approvedHours(f, lang) } } : undefined;
  return (
    <main className="d2-preview">
      <ThisWeek key={`${lang}-${state}-${source}`} lang={lang} view={view} actions={actions} now={FIXTURE_NOW} initial={{ ...initial, sheet, fan }} tabs={<PreviewTabs lang={lang} current="week" />} />
    </main>
  );
}
