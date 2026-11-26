"use client";

// This week, Discovery v2: the brief, the Ask Ticket with the asks waiting behind it, the changes
// since last week, and ALYR's bar at the foot. It draws a `ThisWeekView` (adapter.ts) and calls
// `ThisWeekActions` for every decision, so the workspace passes the real API and the preview passes
// fixtures. Keyboard: A approves, C opens Change it (where the API takes it), N is Not now, ? opens
// Why, Esc closes, Ctrl Z undoes from the toast, Ctrl K opens search.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Finding, Proposal } from "../discoveryApi";
import type { AskView, ReceiptRow, ThisWeekView } from "./adapter";
import { T, type D2Lang } from "./copy";
import { dayKeyAt, joinNames, keepPolling, stageOf, askAgainAfter, whereOf } from "./logic";
import { PageBrief } from "./PageBrief";
import { AskTicket, type Busy } from "./AskTicket";
import { WaitingFan } from "./WaitingFan";
import { ReceiptsList } from "./ReceiptsList";
import { EvidenceSheet } from "./EvidenceSheet";
import { AgentBar } from "./AgentBar";
import { CommandMenu, type Command } from "./CommandMenu";
import { Toast, type ToastData } from "./Toast";
import type { HoursDraft } from "./ListingMiniature";
import { time } from "./parts";
import "./tokens.css";
import "./discovery-v2.css";

export type ThisWeekActions = {
  approve: (p: Proposal) => Promise<Proposal>;
  decline: (p: Proposal) => Promise<Proposal>;
  undo: (p: Proposal) => Promise<Proposal>;
  /** Read one proposal again (after Approve, until it is sent). */
  read: (p: Proposal) => Promise<Proposal>;
  skip: (f: Finding) => Promise<void>;
  /** TODO(D): send a changed after value. Undefined today (the API has no route): Change it is not drawn. */
  changeAfter?: (p: Proposal, draft: HoursDraft) => Promise<Proposal>;
  /** The workspace's own search palette; absent in the preview, which opens its own menu. */
  onSearch?: () => void;
  hrefs: { checks: string; changes: string; reports: string; settings: string; classic: string };
  sayError: (error: unknown) => string;
  /** How long to wait between reads after Approve (ms). */
  pollMs?: number;
};

type ToastState = ToastData & { undoId: string | null };

export function ThisWeek({ lang, view, actions, now, initial }: {
  lang: D2Lang;
  view: ThisWeekView;
  actions: ThisWeekActions;
  now: number;
  /** For previews and tests: proposals as they are after a decision in this visit. */
  initial?: { overrides?: Record<string, Proposal>; fan?: boolean; sheet?: boolean };
}) {
  const t = T[lang];
  const [overrides, setOverrides] = useState<Record<string, Proposal>>(initial?.overrides ?? {});
  const [decided, setDecided] = useState<Set<string>>(() => new Set(Object.keys(initial?.overrides ?? {})));
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<{ id: string; kind: Busy } | null>(null);
  const [fan, setFan] = useState(!!initial?.fan);
  const [sheet, setSheet] = useState<AskView | null>(initial?.sheet ? view.asks[0] ?? null : null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [draft, setDraft] = useState<HoursDraft | null>(null);
  const [error, setError] = useState("");
  const [cmdk, setCmdk] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const pollMs = actions.pollMs ?? 2500;

  const current = view.asks[0] ?? null;
  const currentP = current ? overrides[current.p.id] ?? current.p : null;
  const rest = view.asks.slice(1).filter((a) => !decided.has(a.p.id));
  const owner = view.owner.filter((f) => !decided.has(f.id));
  const leftCount = view.total - decided.size;
  const today = dayKeyAt(now);

  const showToast = useCallback((data: Omit<ToastState, "id">) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ ...data, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const put = (p: Proposal) => setOverrides((o) => ({ ...o, [p.id]: p }));

  // After Approve, read the proposal again until it is sent (the API applies it in a job).
  const polling = useMemo(() => Object.values(overrides).filter((p) => keepPolling(p, 0)).map((p) => p.id).join(","), [overrides]);
  useEffect(() => {
    if (!polling) return;
    let polls = 0;
    let stop = false;
    const tick = async () => {
      for (const id of polling.split(",")) {
        const p = overrides[id];
        if (!p || !keepPolling(p, polls)) continue;
        try { const next = await actions.read(p); if (!stop) put(next); } catch { /* the next read tries again */ }
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
      const next = draft && actions.changeAfter ? await actions.changeAfter(p, draft) : await actions.approve(p);
      put(next);
      setDecided((d) => new Set(d).add(p.id));
      setDraft(null);
      setSheet(null);
      showToast({ title: t.toastApproved(next.decided?.by ?? ""), body: t.toastSending(ask.exact, ask.where), undo: next.can.undo, undoId: next.id });
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
      put(await actions.decline(p));
      setDecided((d) => new Set(d).add(p.id));
      setSnoozed((s) => ({ ...s, [p.id]: askAgainAfter(Date.now()) }));
      setSheet(null);
      setDraft(null);
      showToast({ title: t.toastNotNow, body: t.toastNotNowBody, undo: false, undoId: null });
    } catch (e) {
      setError(actions.sayError(e));
    } finally {
      setBusy(null);
    }
  }, [overrides, busy, actions, showToast, t]);

  const undo = useCallback(async (p: Proposal) => {
    if (!p.can.undo || busy) return;
    setBusy({ id: p.id, kind: "undo" });
    try {
      const next = await actions.undo(p);
      put(next);
      const where = whereOf(p.target, view.sourceKind);
      const ask = view.asks.find((a) => a.p.id === p.id);
      const row = view.receipts.find((r): r is Extract<ReceiptRow, { kind: "change" }> => r.kind === "change" && r.p.id === p.id);
      showToast({ title: t.toastUndone, body: t.toastUndoneBody(ask?.before ?? row?.before ?? p.before.text, where), undo: false, undoId: null });
    } catch (e) {
      showToast({ title: t.toastUndone, body: actions.sayError(e), undo: false, undoId: null });
    } finally {
      setBusy(null);
    }
  }, [busy, actions, showToast, t, view]);

  const skip = useCallback(async (f: Finding) => {
    if (busy) return;
    setBusy({ id: f.id, kind: "decline" });
    try { await actions.skip(f); setDecided((d) => new Set(d).add(f.id)); showToast({ title: t.toastNotNow, body: t.toastNotNowBody, undo: false, undoId: null }); }
    catch (e) { showToast({ title: t.toastNotNow, body: actions.sayError(e), undo: false, undoId: null }); }
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
    if (p) void undo(p);
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
      else if (k === "c" && actions.changeAfter && current.day && !sheet) { e.preventDefault(); setDraft(draft ? null : { open: current.after.split("–")[0] ?? "", close: current.after.split("–")[1] ?? "" }); }
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

  const remaining = joinNames([...rest.map((a) => t.exactField(a.p.field_label, a.where)), ...owner.map((f) => f.title)].map((s, i) => (i === 0 || lang === "ar" ? s : s[0].toLowerCase() + s.slice(1))), lang, "and");
  const currentDecided = current && currentP && decided.has(current.p.id);
  const onItsWay = current && currentP && currentDecided && ["approved", "sent", "live"].includes(stageOf(currentP))
    ? (current.day ? t.afterLeadDay(current.day, current.after, current.where) : t.afterLead(currentP.field_label, current.where)) : "";

  return (
    <div className="d2" data-lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <div className="d2-col">
        {view.sample ? <p className="d2-sr">{t.sample}</p> : null}
        <PageBrief lang={lang} state={view.state} count={view.total} decided={decided.size} remaining={remaining} onItsWay={onItsWay}
          checkedAt={view.checkedAt} recordedOn={view.recordedOn} sample={view.sample} tally={view.tally} previous={view.previous} />

        {current && currentP ? (
          <AskTicket ask={current} p={currentP} lang={lang} approvers={view.approvers} today={today} checkedAt={view.checkedAt}
            busy={busy?.id === current.p.id ? busy.kind : busy ? "approve" : null}
            snoozedUntil={snoozed[current.p.id] ?? null}
            draft={draft} onEdit={actions.changeAfter && current.day ? (on) => setDraft(on ? { open: current.after.split("–")[0] ?? "", close: current.after.split("–")[1] ?? "" } : null) : undefined}
            onDraft={setDraft} onApprove={() => void approve(current)} onDecline={() => void decline(current)} onUndo={() => void undo(currentP)}
            onWhy={() => openSheet(current)} error={error} peeks={Math.min(2, rest.length + owner.length)} />
        ) : view.state !== "content" || !view.total ? (
          <div className="d2-empty"><p>{t.emptyBody}</p></div>
        ) : null}

        <WaitingFan lang={lang} asks={rest} owner={owner} startIndex={2} of={view.total} open={fan} onToggle={() => setFan((v) => !v)}
          onApprove={(a) => void approve(a)} onDecline={(a) => void decline(a)} onWhy={openSheet} onSkip={(f) => void skip(f)} busyId={busy?.id ?? null} />

        <ReceiptsList lang={lang} rows={view.receipts.map((r) => (r.kind === "change" && overrides[r.p.id] ? { ...r, p: overrides[r.p.id] } : r))}
          people={view.approvers} tally={view.tally} checkedAt={view.checkedAt} checksHref={actions.hrefs.checks}
          onUndo={(r) => void undo(r.p)} busyId={busy?.id ?? null} />
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
