"use client";

// This week, Discovery v2: the brief, the Ask Ticket with the asks waiting behind it, the changes
// since last week, and ALYR's bar at the foot. It draws a `ThisWeekView` (adapter.ts) and calls
// `ThisWeekActions` for every decision, so the workspace passes the real API and the preview passes
// fixtures. Keyboard: A approves, C opens Change it (where the API takes it), N is Not now, ? opens
// Why, Esc closes, Ctrl Z undoes from the toast, Ctrl K opens search.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Finding, Proposal } from "../discoveryApi";
import type { AskView, ReceiptRow, ThisWeekView } from "./adapter";
import { T, type D2Lang } from "./copy";
import { afterFromDraft, dayKeyAt, draftFor, joinNames, keepPolling, stageOf, askAgainAfter, whereOf, type Draft } from "./logic";
import { PageBrief } from "./PageBrief";
import { AskTicket, type Busy } from "./AskTicket";
import { WaitingFan } from "./WaitingFan";
import { ReceiptsList } from "./ReceiptsList";
import { OnlyYouList } from "./OnlyYou";
import { EvidenceSheet } from "./EvidenceSheet";
import { AgentBar } from "./AgentBar";
import { CommandMenu, type Command } from "./CommandMenu";
import { Toast, type ToastData } from "./Toast";
import { Say, time } from "./parts";
import "./tokens.css";
import "./discovery-v2.css";

export type ThisWeekActions = {
  approve: (p: Proposal) => Promise<Proposal>;
  decline: (p: Proposal) => Promise<Proposal>;
  undo: (p: Proposal) => Promise<Proposal>;
  /** Read one proposal again (after Approve, until it is sent). */
  read: (p: Proposal) => Promise<Proposal>;
  skip: (f: Finding) => Promise<void>;
  /** "I changed it": the owner made a change only they can make (a website step). */
  markDone?: (f: Finding) => Promise<void>;
  /** Read the page again after a decision, so every count (headline, tab, bar) is the API's. */
  refresh?: () => void;
  /** "Change it": approve a changed value (`POST /proposals/{id}/change`). The answer is a new
   * proposal. Drawn only where the proposal's `edit` allows it. */
  changeAfter?: (p: Proposal, after: Record<string, unknown>) => Promise<Proposal>;
  /** The workspace's own search palette; absent in the preview, which opens its own menu. */
  onSearch?: () => void;
  hrefs: { checks: string; changes: string; reports: string; settings: string; classic: string; setup?: string };
  sayError: (error: unknown) => string;
  /** How long to wait between reads after Approve (ms). */
  pollMs?: number;
};

type ToastState = ToastData & { undoId: string | null };

export function ThisWeek({ lang, view, actions, now, initial, tabs, onCount }: {
  lang: D2Lang;
  view: ThisWeekView;
  actions: ThisWeekActions;
  now: number;
  /** Discovery v2's tabs (U2), drawn above the brief. */
  tabs?: ReactNode;
  /** For previews and tests: proposals as they are after a decision in this visit. */
  initial?: { overrides?: Record<string, Proposal>; fan?: boolean; sheet?: boolean };
  /** The open asks left, each time it changes: the tab's count is this page's count. */
  onCount?: (count: number) => void;
}) {
  const t = T[lang];
  const [overrides, setOverrides] = useState<Record<string, Proposal>>(initial?.overrides ?? {});
  const [decided, setDecided] = useState<Set<string>>(() => new Set(Object.keys(initial?.overrides ?? {})));
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<{ id: string; kind: Busy } | null>(null);
  const [fan, setFan] = useState(!!initial?.fan);
  const [sheet, setSheet] = useState<AskView | null>(initial?.sheet ? view.asks[0] ?? null : null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [cmdk, setCmdk] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const pollMs = actions.pollMs ?? 2500;

  // After a decision the page reads the API again (`actions.refresh`): a decided ask leaves the
  // API's open asks and the next one may open. The tickets keep their order in this visit, so the
  // decided one stays in place with its life, and a newly opened ask joins behind.
  const [seen, setSeen] = useState<{ view: ThisWeekView; asks: AskView[] }>({ view, asks: view.asks });
  let shownAsks = seen.asks;
  if (seen.view !== view) {
    const fresh = new Map(view.asks.map((a) => [a.p.id, a]));
    shownAsks = [...seen.asks.map((a) => fresh.get(a.p.id) ?? a), ...view.asks.filter((a) => !seen.asks.some((b) => b.p.id === a.p.id))];
    setSeen({ view, asks: shownAsks });
  }
  const live = new Set([...view.asks.map((a) => a.p.id), ...view.owner.map((f) => f.id)]);
  const asks = shownAsks.filter((a) => live.has(a.p.id) || decided.has(a.p.id)).map((a, i, all) => ({ ...a, index: i + 1, of: all.length + view.owner.length }));
  const current = asks[0] ?? null;
  const currentP = current ? overrides[current.p.id] ?? current.p : null;
  const rest = asks.slice(1).filter((a) => !decided.has(a.p.id));
  const owner = view.owner.filter((f) => !decided.has(f.id));
  /** The one count of the page (headline, ticket, tab, bar): the API's open asks, less those decided
   * in this visit that the API has not been read again for. */
  const leftCount = Math.max(0, view.total - [...decided].filter((id) => live.has(id)).length);
  const shownDecided = asks.filter((a) => decided.has(a.p.id)).length + view.owner.filter((f) => decided.has(f.id)).length;
  const today = dayKeyAt(now);
  useEffect(() => { onCount?.(leftCount); }, [leftCount, onCount]);

  const showToast = useCallback((data: Omit<ToastState, "id">) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ ...data, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  /** Kept under the ask's own id: "Change it" answers with a new proposal (a new id). */
  const put = (key: string, p: Proposal) => setOverrides((o) => ({ ...o, [key]: p }));

  // After Approve, read the proposal again until it is sent (the API applies it in a job).
  const polling = useMemo(() => Object.entries(overrides).filter(([, p]) => keepPolling(p, 0)).map(([key]) => key).join(","), [overrides]);
  useEffect(() => {
    if (!polling) return;
    let polls = 0;
    let stop = false;
    const tick = async () => {
      for (const key of polling.split(",")) {
        const p = overrides[key];
        if (!p || !keepPolling(p, polls)) continue;
        try { const next = await actions.read(p); if (!stop) put(key, next); } catch { /* the next read tries again */ }
      }
      polls += 1;
    };
    const timer = setInterval(() => { void tick(); }, pollMs);
    return () => { stop = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling]);

  const approve = useCallback(async (ask: AskView) => {
    const p = overrides[ask.p.id] ?? ask.p;
    if (!p.can.approve || busy) return;
    setBusy({ id: p.id, kind: "approve" });
    setError("");
    try {
      const after = draft && actions.changeAfter ? afterFromDraft(p, draft) : null;
      if (draft && actions.changeAfter && !after) return;
      const next = after && actions.changeAfter ? await actions.changeAfter(p, after) : await actions.approve(p);
      put(ask.p.id, next);
      setDecided((d) => new Set(d).add(p.id));
      setDraft(null);
      setSheet(null);
      showToast({ title: t.toastApproved(next.decided?.by ?? ""), body: t.toastSending(ask.exact, ask.where), undo: next.can.undo, undoId: ask.p.id });
      actions.refresh?.();
    } catch (e) {
      setError(actions.sayError(e));
    } finally {
      setBusy(null);
    }
  }, [overrides, busy, draft, actions, showToast, t]);

  const decline = useCallback(async (ask: AskView) => {
    const p = overrides[ask.p.id] ?? ask.p;
    if (!p.can.decline || busy) return;
    setBusy({ id: p.id, kind: "decline" });
    setError("");
    try {
      put(ask.p.id, await actions.decline(p));
      setDecided((d) => new Set(d).add(p.id));
      setSnoozed((s) => ({ ...s, [p.id]: askAgainAfter(Date.now()) }));
      setSheet(null);
      setDraft(null);
      showToast({ title: t.toastNotNow, body: t.toastNotNowBody, undo: false, undoId: null });
      actions.refresh?.();
    } catch (e) {
      setError(actions.sayError(e));
    } finally {
      setBusy(null);
    }
  }, [overrides, busy, actions, showToast, t]);

  const undo = useCallback(async (p: Proposal, key: string = p.id) => {
    if (!p.can.undo || busy) return;
    setBusy({ id: key, kind: "undo" });
    try {
      const next = await actions.undo(p);
      put(key, next);
      const where = whereOf(p.target, view.sourceKind);
      const ask = view.asks.find((a) => a.p.id === key);
      const row = view.receipts.find((r): r is Extract<ReceiptRow, { kind: "change" }> => r.kind === "change" && r.p.id === key);
      showToast({ title: t.toastUndone, body: t.toastUndoneBody(ask?.before ?? row?.before ?? p.before.text, where), undo: false, undoId: null });
      actions.refresh?.();
    } catch (e) {
      showToast({ title: t.toastUndone, body: actions.sayError(e), undo: false, undoId: null });
    } finally {
      setBusy(null);
    }
  }, [busy, actions, showToast, t, view]);

  const skip = useCallback(async (f: Finding) => {
    if (busy) return;
    setBusy({ id: f.id, kind: "decline" });
    try { await actions.skip(f); setDecided((d) => new Set(d).add(f.id)); showToast({ title: t.toastNotNow, body: t.toastNotNowBody, undo: false, undoId: null }); actions.refresh?.(); }
    catch (e) { showToast({ title: t.toastNotNow, body: actions.sayError(e), undo: false, undoId: null }); }
    finally { setBusy(null); }
  }, [busy, actions, showToast, t]);

  const [doneIds, setDoneIds] = useState<Set<string>>(() => new Set());
  const markDone = useCallback(async (f: Finding) => {
    if (busy || !actions.markDone) return;
    setBusy({ id: f.id, kind: "decline" });
    try { await actions.markDone(f); setDoneIds((d) => new Set(d).add(f.id)); showToast({ title: t.toastDone, body: t.toastDoneBody, undo: false, undoId: null }); actions.refresh?.(); }
    catch (e) { showToast({ title: t.toastDone, body: actions.sayError(e), undo: false, undoId: null }); }
    finally { setBusy(null); }
  }, [busy, actions, showToast, t]);

  const openSheet = useCallback((ask: AskView) => {
    lastFocus.current = document.activeElement as HTMLElement | null;
    setSheet(ask);
  }, []);
  const closeSheet = useCallback(() => {
    setSheet(null);
    lastFocus.current?.focus({ preventScroll: true });
  }, []);
  const focusAsk = useCallback(() => {
    const el = document.getElementById("d2-ask");
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
  }, []);
  const search = useCallback(() => (actions.onSearch ? actions.onSearch() : setCmdk(true)), [actions]);

  const toastUndo = useCallback(() => {
    const id = toast?.undoId;
    setToast(null);
    const p = id ? overrides[id] : null;
    if (p && id) void undo(p, id);
  }, [toast, overrides, undo]);

  // The toast's Undo follows the proposal: it appears once the API says the change can be undone.
  const toastShown = toast ? { ...toast, undo: !!toast.undoId && !!overrides[toast.undoId]?.can.undo } : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "k" && !actions.onSearch) { e.preventDefault(); setCmdk((v) => !v); return; }
      if (e.key === "Escape") { if (cmdk) { setCmdk(false); return; } if (sheet) { closeSheet(); return; } if (draft) { setDraft(null); return; } }
      if ((e.ctrlKey || e.metaKey) && k === "z" && toastShown?.undo) { e.preventDefault(); toastUndo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || cmdk) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [contenteditable]")) return;
      if (!current || !currentP || stageOf(currentP) !== "waiting" || snoozed[current.p.id]) return;
      if (k === "a" && !e.shiftKey) { e.preventDefault(); void approve(current); }
      else if (k === "c" && actions.changeAfter && draftFor(currentP) && !sheet) { e.preventDefault(); setDraft(draft ? null : draftFor(currentP)); }
      else if (k === "n" && !sheet) { e.preventDefault(); void decline(current); }
      else if (e.key === "?" && !sheet) { e.preventDefault(); openSheet(current); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [actions, cmdk, sheet, draft, toastShown?.undo, toastUndo, current, currentP, snoozed, approve, decline, openSheet, closeSheet]);

  const commands: Command[] = [
    { id: "week", group: "go", icon: "compass", label: t.cmdThisWeek, note: t.asksLabel(leftCount), run: () => window.scrollTo({ top: 0 }) },
    { id: "checks", group: "go", icon: "check", label: t.cmdChecks, note: view.tally ? t.matchLine(view.tally.matched, view.tally.measured) : undefined, run: () => { window.location.href = actions.hrefs.checks; } },
    { id: "changes", group: "go", icon: "list", label: t.cmdChanges, run: () => { window.location.href = actions.hrefs.changes; } },
    { id: "reports", group: "go", icon: "file", label: t.cmdReports, run: () => { window.location.href = actions.hrefs.reports; } },
    { id: "settings", group: "go", icon: "gear", label: t.cmdSettings, run: () => { window.location.href = actions.hrefs.settings; } },
    ...(current ? [{ id: "ask", group: "act" as const, icon: "arrow" as const, label: t.cmdOpenAsk, note: t.askOf(current.index, current.of), run: focusAsk }] : []),
    { id: "classic", group: "act", icon: "undo", label: t.cmdClassic, run: () => { window.location.href = actions.hrefs.classic; } },
  ];

  // The bar's latest receipt: what was decided last and where it is now.
  const latestP = (currentP && decided.has(currentP.id) && stageOf(currentP) !== "declined" && stageOf(currentP) !== "undone" ? currentP : null) ?? view.latest;
  let latest = "";
  if (latestP) {
    const st = stageOf(latestP);
    if (st === "live") latest = t.latestMatches(latestP.field_label);
    else if (st === "sent" || st === "notLive") latest = t.latestSent(latestP.field_label, whereOf(latestP.target, view.sourceKind), time(latestP.applied_at, lang));
    else if (st === "approved") latest = t.latestApproved(latestP.field_label);
  }

  const remaining = joinNames([...rest.map((a) => t.waitingName(a.p.field_label, a.where)), ...owner.map((f) => t.ownerName[f.rule_id] ?? f.title.replace(/[.。]$/, ""))], lang, "and");
  const currentDecided = current && currentP && decided.has(current.p.id);
  const onItsWay = current && currentP && currentDecided && ["approved", "sent", "live"].includes(stageOf(currentP))
    ? (current.day ? t.afterLeadDay(current.day, current.after, current.where) : t.afterLead(currentP.field_label, current.where)) : "";

  return (
    <div className="d2" data-lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <div className="d2-col">
        {tabs}
        {view.sample ? <p className="d2-sr">{t.sample}</p> : null}
        <PageBrief lang={lang} state={view.state} count={leftCount + shownDecided} decided={shownDecided} remaining={remaining} onItsWay={onItsWay}
          checkedAt={view.checkedAt} recordedOn={view.recordedOn} sample={view.sample} tally={view.tally} previous={view.previous} />

        {current && currentP ? (
          <AskTicket ask={current} p={currentP} lang={lang} approvers={view.approvers} today={today} checkedAt={view.checkedAt}
            busy={busy?.id === current.p.id ? busy.kind : busy ? "approve" : null}
            snoozedUntil={snoozed[current.p.id] ?? null}
            draft={draft} onEdit={actions.changeAfter && draftFor(currentP) ? (on) => setDraft(on ? draftFor(currentP) : null) : undefined}
            onDraft={setDraft} onApprove={() => void approve(current)} onDecline={() => void decline(current)} onUndo={() => void undo(currentP, current.p.id)}
            onWhy={() => openSheet(current)} error={error} peeks={Math.min(2, rest.length + owner.length)} nextCheckAt={view.nextCheckAt} />
        ) : view.state === "noConnection" ? (
          <div className="d2-empty d2-nosource">
            <p><b>{t.noSourceTitle}</b> <Say lang={lang}>{t.noSourceBody}</Say></p>
            {actions.hrefs.setup ? <a className="d2-btn d2-btn-line" href={actions.hrefs.setup}>{t.noSourceAction}</a> : null}
          </div>
        ) : view.state !== "content" || !view.total ? (
          <div className="d2-empty"><p><Say lang={lang}>{t.emptyBody}</Say></p></div>
        ) : null}

        <WaitingFan lang={lang} asks={rest} owner={owner} startIndex={2} of={current?.of ?? view.total} open={fan} onToggle={() => setFan((v) => !v)}
          onApprove={(a) => void approve(a)} onDecline={(a) => void decline(a)} onWhy={openSheet} onSkip={(f) => void skip(f)} busyId={busy?.id ?? null} />
        {view.alsoNoticed > 0 ? <p className="d2-small d2-muted d2-also"><Say lang={lang}>{t.waitTurn(view.alsoNoticed)}</Say></p> : null}

        <OnlyYouList lang={lang} items={view.onlyYou.filter((o) => !doneIds.has(o.f.id))} busyId={busy?.id ?? null} onDone={actions.markDone ? (f) => void markDone(f) : undefined} />

        <ReceiptsList lang={lang} rows={view.receipts.filter((r) => r.kind !== "change" || !asks.some((a) => a.p.id === r.p.id)).map((r) => (r.kind === "change" && overrides[r.p.id] ? { ...r, p: overrides[r.p.id] } : r))}
          people={view.approvers} tally={view.tally} checkedAt={view.checkedAt} checksHref={actions.hrefs.checks}
          onUndo={(r) => void undo(r.p, r.p.id)} busyId={busy?.id ?? null} />
      </div>

      <AgentBar lang={lang} asks={Math.max(0, leftCount)} latest={latest} nextCheckAt={view.nextCheckAt} onSearch={search} onAsks={focusAsk}
        toast={toastShown ? <Toast toast={toastShown} lang={lang} onUndo={toastUndo} onDismiss={() => setToast(null)} /> : null} />

      {sheet ? (
        <EvidenceSheet ask={sheet} lang={lang} approvers={view.approvers} onClose={closeSheet}
          onApprove={() => void approve(sheet)} onDecline={() => void decline(sheet)} busy={busy !== null} />
      ) : null}
      {cmdk ? <CommandMenu lang={lang} items={commands} onClose={() => setCmdk(false)} /> : null}
    </div>
  );
}
