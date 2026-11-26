"use client";

import { useEffect, useMemo } from "react";
import { buildThisWeek } from "@/app/(product)/_workspace/discovery-v2/adapter";
import type { D2Lang } from "@/app/(product)/_workspace/discovery-v2/copy";
import { FIXTURE_NOW, approvedHours, fixture } from "@/app/(product)/_workspace/discovery-v2/fixtures";
import { ThisWeek, type ThisWeekActions } from "@/app/(product)/_workspace/discovery-v2/ThisWeek";
import { ErrorState, LoadingState } from "@/app/(product)/_workspace/discovery-v2/States";
import type { Proposal } from "@/app/(product)/_workspace/discoveryApi";

/**
 * The preview's frame: the fixtures through the same adapter the workspace uses, and actions that
 * answer like the API would (Approve answers "approved", the next read "applied"), without a server.
 * `lang` is written on <html> the way the product layout writes it.
 */
export function DiscoveryPreview({ lang, state, source, sheet, fan, change }: {
  lang: D2Lang;
  state: "default" | "approved" | "loading" | "empty" | "error";
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
      ? { ...f, waiting: [], recent: [], overview: { ...f.overview, up_next: [], done: [], proposals: { waiting: 0, approved: 0, failed: 0, next: null } } }
      : f;
    return buildThisWeek({ ...input, extras: f.extras, now: FIXTURE_NOW, lang });
  }, [f, state, lang]);

  const by = lang === "ar" ? "هناء" : "Hana";
  const at = new Date(FIXTURE_NOW + 60_000).toISOString();
  const later = (p: Proposal): Promise<Proposal> => new Promise((done) => setTimeout(() => done(p), 400));
  const actions: ThisWeekActions = {
    approve: (p) => later({ ...p, status: "approved", decided: { by, channel: "portal", at }, can: { approve: false, decline: false, undo: false } }),
    read: (p) => later({ ...p, status: "applied", applied_at: at, verification: "pending", undo_until: new Date(FIXTURE_NOW + 7 * 864e5).toISOString(), can: { approve: false, decline: false, undo: true } }),
    decline: (p) => later({ ...p, status: "declined", decided: { by, channel: "portal", at }, can: { approve: false, decline: false, undo: false } }),
    undo: (p) => later({ ...p, status: "undone", undone: { by, channel: "portal", at }, can: { approve: false, decline: false, undo: false } }),
    skip: () => new Promise((done) => setTimeout(done, 300)),
    changeAfter: change ? (p, draft) => later({ ...p, status: "approved", decided: { by, channel: "portal", at }, can: { approve: false, decline: false, undo: false }, after: { ...p.after, lines: p.after.lines.map((l) => (l.day === "fri" ? { ...l, text: `${draft.open} to ${draft.close}` } : l)) } }) : undefined,
    hrefs: { checks: "#checks", changes: "#changes", reports: "#reports", settings: "#settings", classic: "#classic" },
    sayError: () => (lang === "ar" ? "تعذّر ذلك. لم يتغيّر شيء." : "That did not work. Nothing changed."),
    pollMs: 700,
  };

  if (state === "loading") return <LoadingState lang={lang} />;
  if (state === "error") return <ErrorState lang={lang} message="" onRetry={() => window.location.reload()} />;
  const initial = state === "approved" ? { overrides: { [f.waiting[0].id]: approvedHours(f, lang) } } : undefined;
  return (
    <main className="d2-preview">
      <ThisWeek key={`${lang}-${state}-${source}`} lang={lang} view={view} actions={actions} now={FIXTURE_NOW} initial={{ ...initial, sheet, fan }} />
    </main>
  );
}
