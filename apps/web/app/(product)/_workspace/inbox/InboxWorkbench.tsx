"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, Icon, SkeletonRows, Workbench, useIsPhone, useToast, type WorkbenchPane } from "../../../_ui";
import { ApiError, say } from "../../../_ui/api";
import { formatTime, money } from "../../../_ui/format";
import { copy, type Lang } from "./copy";
import { FIXTURE_CONVERSATIONS, ME, NOW } from "./fixtures";
import {
  fetchContext, fetchConversations, fetchSavedReplies, fetchShop, fetchTemplates, fetchThread,
  postAssign, postAutomatic, postNote, postRead, postReply, postStatus, type Mode, type Shop,
} from "./inboxApi";
import { InboxCloseDialog, type CloseDraft } from "./InboxCloseDialog";
import { InboxClosedView } from "./InboxClosedView";
import { InboxContextPane } from "./InboxContextPane";
import { InboxConversationList } from "./InboxConversationList";
import { InboxNotDelivered } from "./InboxNotDelivered";
import { InboxFirstRun, InboxOffline, InboxPick } from "./InboxStates";
import { InboxThread } from "./InboxThread";
import { type ConversationItem, type InboxCounts, type InboxFilters, type LostReason, type Outcome } from "./logic";
import type { CustomerContext, Role, SavedReply, Template, ThreadItem } from "./types";
import { useSoon } from "./useSoon";
import "./inbox.css";

export type InboxView = "conversations" | "unsent" | "closed";

export type InboxWorkbenchProps = {
  lang?: Lang;
  /** Talk to the product's API. Off: the sample (Nuqta Car Care), which sends nothing anywhere. */
  live?: boolean;
  /** The role the screen is drawn for; the live screen reads it from the session. */
  role?: Role;
  /** The moment the screen draws. The sample pins it; the live screen reads the clock. */
  now?: number;
  view?: InboxView;
  /** One state of the States frame: loading, empty, firstrun, offline. (A filtered list is `initialFilters.q`.) */
  state?: string | null;
  /** A dialog open on arrival: "close". */
  dialog?: string | null;
  initialFilters?: Partial<InboxFilters>;
  initialSelectedId?: string | null;
  /** The pane a phone starts on. */
  initialPane?: WorkbenchPane;
  /** Texts already typed in a conversation's box (the sample's drawing has one). */
  drafts?: Record<string, string>;
  closeInitial?: Partial<CloseDraft>;
  /** The workspace's own sections that the pane links to. */
  hrefs?: { credit: string; bookings: string; orders: string };
};

const HREFS = { credit: "/app/credit", bookings: "/app/bookings", orders: "/app/orders" };
const LIVE_POLL = 10_000;

export function InboxWorkbench({
  lang = "en", live = false, role: roleProp, now: nowProp, view: viewProp = "conversations", state = null, dialog = null,
  initialFilters, initialSelectedId = "rm-148", initialPane = "list", drafts: draftsProp, closeInitial, hrefs = HREFS,
}: InboxWorkbenchProps) {
  const t = copy(lang);
  const toast = useToast();
  const phone = useIsPhone();
  const mode = useMemo<Mode>(() => ({ live }), [live]);

  // The clock: pinned in the sample, the device's in the product (read after mount, so the server and client draw the same).
  const [clock, setClock] = useState<number>(nowProp ?? (live ? 0 : NOW));
  const readClock = useCallback(() => {
    if (nowProp === undefined && live) setClock(Date.now());
  }, [nowProp, live]);
  useSoon(readClock);
  useEffect(() => {
    if (nowProp !== undefined || !live) return;
    const id = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [nowProp, live]);
  const now = nowProp ?? clock;

  const [view, setView] = useState<InboxView>(viewProp);
  const [shop, setShop] = useState<Shop | null>(null);
  const role: Role = roleProp ?? shop?.me.role ?? "owner";
  const me = shop?.me ?? { ...ME, role: "owner" as Role };
  const members = shop?.members ?? [];

  // The list
  const [filters, setFilters] = useState<InboxFilters>({ tab: initialFilters?.tab ?? "open", chip: initialFilters?.chip ?? null, q: initialFilters?.q ?? "" });
  const [sample, setSample] = useState<ConversationItem[]>(() => FIXTURE_CONVERSATIONS.map((c) => ({ ...c })));
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [counts, setCounts] = useState<InboxCounts>({ open: 0, closed: 0, waiting: 0, mine: 0, unassigned: 0, unread: 0 });
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(false);
  const [offlineAt, setOfflineAt] = useState<number | null>(state === "offline" ? NOW : null);
  const loadedAt = useRef<number>(now);

  // The open conversation
  const asWindowClosed = dialog === "close" || state === "window";
  const [selectedId, setSelectedId] = useState<string | null>(asWindowClosed ? "ms-saleh" : initialSelectedId);
  const [pane, setPane] = useState<WorkbenchPane>(initialPane);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [threadCustomer, setThreadCustomer] = useState<ConversationItem | null>(null);
  const [ctx, setCtx] = useState<CustomerContext | null>(null);
  const [loadingThread, setLoadingThread] = useState(true);
  const [threadError, setThreadError] = useState(false);
  const [savedReplies, setSavedReplies] = useState<SavedReply[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  // What is being typed
  const [drafts, setDrafts] = useState<Record<string, string>>(draftsProp ?? {});
  const [modes, setModes] = useState<Record<string, "reply" | "note">>({});
  const [sending, setSending] = useState(false);
  // The States frame's "a reply that could not go": the sample draws it as a lost connection, the text kept in the box.
  const [sendError, setSendError] = useState<string | null>(state === "notsent" ? `${t.couldNotReach} ${t.replyKept}` : null);
  const [closeOpen, setCloseOpen] = useState(dialog === "close");
  // Each time the dialog is opened it starts clean (nothing chosen, no note), whatever was typed in the last one.
  const [closeRun, setCloseRun] = useState(0);

  const forcedLoading = state === "loading";
  const forcedEmpty = state === "empty";
  const ready = now !== 0;

  // ── loading ────────────────────────────────────────────────

  const loadList = useCallback(async () => {
    if (!ready) return;
    try {
      const answer = await fetchConversations(filters, mode, lang, now, sample);
      setItems(answer.conversations);
      setCounts(answer.counts);
      setListError(false);
      // The sample's offline frame stays offline: nothing there can come back.
      if (state !== "offline") setOfflineAt(null);
      loadedAt.current = now;
    } catch (error) {
      setListError(true);
      if (error instanceof ApiError && error.code === "offline") setOfflineAt(loadedAt.current);
    } finally {
      setLoadingList(false);
    }
  }, [filters, mode, lang, now, sample, ready, state]);

  useSoon(loadList);

  const loadThread = useCallback(async (id: string) => {
    try {
      const [answer, context] = await Promise.all([fetchThread(id, mode), fetchContext(id, mode, role)]);
      setThread(answer.items);
      setThreadCustomer(answer.customer);
      setCtx(context);
      setThreadError(false);
    } catch {
      setThreadError(true);
    } finally {
      setLoadingThread(false);
    }
  }, [mode, role]);

  const openThread = useCallback(() => {
    if (!selectedId) return;
    void loadThread(selectedId);
    void postRead(selectedId, mode).catch(() => undefined);
  }, [selectedId, loadThread, mode]);
  useSoon(openThread);

  const loadShop = useCallback(() => {
    void fetchShop(mode).then(setShop).catch(() => undefined);
    void fetchSavedReplies(mode).then(setSavedReplies).catch(() => undefined);
    void fetchTemplates(mode).then(setTemplates).catch(() => undefined);
  }, [mode]);
  useSoon(loadShop);

  // The product polls; the sample does not (nothing changes by itself in a drawing).
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      void loadList();
      if (selectedId) void loadThread(selectedId);
    }, LIVE_POLL);
    return () => clearInterval(id);
  }, [live, loadList, loadThread, selectedId]);

  const current = items.find((c) => c.id === selectedId) ?? sample.find((c) => c.id === selectedId) ?? threadCustomer;
  const draft = (selectedId && drafts[selectedId]) || "";
  const typing = (selectedId && modes[selectedId]) || "reply";

  // ── what a person does ─────────────────────────────────────

  const patch = (id: string, change: Partial<ConversationItem>) => {
    setSample((all) => all.map((c) => (c.id === id ? { ...c, ...change } : c)));
    setItems((all) => all.map((c) => (c.id === id ? { ...c, ...change } : c)));
  };

  async function send() {
    const id = selectedId;
    const text = draft.trim();
    if (!id || !text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      if (typing === "note") {
        await postNote(id, text, mode);
        if (!mode.live) setThread((all) => [...all, { kind: "note", id: `n-${all.length}`, at: new Date(now).toISOString(), author: me.name, text }]);
      } else {
        const result = await postReply(id, text, mode);
        if (result.blocked) {
          setSendError(`${t.blockedReason(result.blocked)}. ${t.replyKept}`);
          return;
        }
        if (result.sample) {
          // The sample sends nothing, so it never says it did: the bubble is marked as a preview.
          setThread((all) => [...all, { kind: "message", id: `p-${all.length}`, at: new Date(now).toISOString(), direction: "out", by: me.name, text, delivery: { status: "preview" } }]);
        }
      }
      setDrafts((all) => ({ ...all, [id]: "" }));
      if (mode.live) await loadThread(id);
    } catch (error) {
      setSendError(`${error instanceof ApiError && error.code === "offline" ? t.couldNotReach : say(error, lang)} ${t.replyKept}`.trim());
    } finally {
      setSending(false);
    }
  }

  async function assign(userId: string | null) {
    const id = selectedId;
    if (!id) return;
    const who = members.find((m) => m.id === userId) ?? (userId === ME.id ? ME : null);
    try {
      await postAssign(id, userId, mode);
      patch(id, { assigned: who ? { id: who.id, name: who.name } : null });
    } catch (error) {
      toast.push({ text: say(error, lang), tone: "bad" });
    }
  }

  async function turnBackOn() {
    const id = selectedId;
    if (!id) return;
    try {
      await postAutomatic(id, false, mode);
      patch(id, { assistant_paused: false });
    } catch (error) {
      toast.push({ text: say(error, lang), tone: "bad" });
    }
  }

  async function closeConversation(outcome: Outcome, reason: LostReason | null, note: string) {
    const id = selectedId;
    if (!id || !current) return;
    await postStatus(id, "closed", mode, outcome, reason ?? undefined);
    if (note) await postNote(id, note, mode);
    patch(id, { status: "closed" });
    toast.push({ text: t.closedToast(current.name), tone: "ok" });
    const next = (mode.live ? items : sample).find((c) => c.id !== id && c.status === "open");
    select(next?.id ?? null);
    setPane("list");
    if (mode.live) void loadList();
  }

  /** Choose a conversation: its thread loads, a phone moves to it, and what a failed send said is forgotten. */
  function select(id: string | null) {
    if (id !== selectedId) {
      setLoadingThread(Boolean(id));
      setSendError(null);
    }
    setSelectedId(id);
  }

  function open(id: string) {
    select(id);
    setPane("main");
    setView("conversations");
  }

  // ── pages that are not the three panes ─────────────────────

  if (state === "firstrun") return <InboxFirstRun lang={lang} />;

  if (view === "unsent") {
    return (
      <InboxNotDelivered
        lang={lang}
        now={now}
        mode={mode}
        canSendTemplates={templates.length > 0}
        onOpenConversation={open}
      />
    );
  }

  if (view === "closed") {
    return (
      <InboxClosedView
        lang={lang}
        now={now}
        mode={mode}
        role={role}
        openCount={counts.open || sample.filter((c) => c.status === "open").length}
        onOpenTab={() => setView("conversations")}
        onUnavailable={() => {
          setFilters((f) => ({ ...f, tab: "closed", chip: null }));
          setView("conversations");
        }}
      />
    );
  }

  // ── the three panes ────────────────────────────────────────

  const showItems = forcedEmpty ? [] : items;
  const showCounts: InboxCounts = forcedEmpty
    ? { open: 0, closed: counts.closed, waiting: 0, mine: 0, unassigned: 0, unread: 0, not_delivered: 0, window_closed: 0 }
    : counts;
  const loading = forcedLoading || loadingList || !ready;

  const strip = ctx ? (
    <button type="button" className="ibx-strip" aria-label={t.stripButton} onClick={() => setPane("context")}>
      {ctx.balanceOwed ? (
        <span><span className="ibx-muted">{t.strip.owes}</span> <b className="u-mono"><bdi>{money(ctx.balanceOwed, lang)}</bdi></b></span>
      ) : null}
      {ctx.nextBooking ? (
        <span><span className="ibx-muted">{t.strip.next}</span> <b className="u-mono"><bdi>{formatTime(ctx.nextBooking.startsAt, lang)}</bdi></b></span>
      ) : null}
      {ctx.ordersTotal ? <span className="ibx-muted">{t.strip.orders(ctx.ordersTotal)}</span> : null}
      <span className="ibx-strip-end">{t.strip.customer}<Icon name="right" /></span>
    </button>
  ) : null;

  const main = forcedLoading ? (
    <div className="ibx-mainload" aria-busy="true"><SkeletonRows rows={5} columns={2} label={t.states.loading} /></div>
  ) : current && !forcedEmpty ? (
    <InboxThread
      customer={current}
      items={thread}
      lang={lang}
      now={now}
      members={members}
      templates={templates}
      savedReplies={savedReplies}
      draft={draft}
      onDraft={(text) => selectedId && setDrafts((all) => ({ ...all, [selectedId]: text }))}
      mode={typing}
      onMode={(next) => selectedId && setModes((all) => ({ ...all, [selectedId]: next }))}
      onSend={() => void send()}
      sending={sending}
      sendError={sendError}
      onAssign={(id) => void assign(id)}
      onClose={() => { setCloseRun((n) => n + 1); setCloseOpen(true); }}
      onTurnBackOn={() => void turnBackOn()}
      onSendTemplate={() => toast.push({ text: t.templatePreviewNote })}
      yieldVolt={closeOpen}
      offline={offlineAt !== null}
      phone={phone}
      onBack={() => setPane("list")}
      strip={strip}
      loading={loadingThread}
      writesIn={ctx?.writesIn}
    />
  ) : threadError ? (
    <Banner tone="bad" action={<Button kind="quiet" size="xs" onClick={() => selectedId && void loadThread(selectedId)}>{t.states.tryNow}</Button>}>{t.states.loadError}</Banner>
  ) : (
    <InboxPick lang={lang} />
  );

  return (
    <div className="ibx-frame">
      {offlineAt !== null ? <InboxOffline lang={lang} time={formatTime(offlineAt, lang)} onRetry={() => void loadList()} /> : null}
      <div className="ibx-wb">
        <Workbench
          pane={pane}
          labels={{ list: t.listLabel, main: t.threadLabel, context: t.contextLabel }}
          list={
            <InboxConversationList
              items={showItems}
              selectedId={phone ? null : selectedId}
              onSelect={open}
              filters={filters}
              onFilters={(next) => setFilters((f) => ({ ...f, ...next }))}
              counts={showCounts}
              lang={lang}
              now={now}
              loading={loading}
              error={listError && offlineAt === null}
              onRetry={() => void loadList()}
              onSeeClosed={() => setFilters((f) => ({ ...f, tab: "closed", chip: null }))}
              grouped={phone}
            />
          }
          main={main}
          context={
            forcedEmpty || !selectedId ? undefined : (
              <InboxContextPane data={ctx} lang={lang} now={now} loading={loadingThread || forcedLoading} hrefs={hrefs} onBack={phone ? () => setPane("main") : undefined} />
            )
          }
        />
      </div>

      {current ? (
        <InboxCloseDialog
          key={`${current.id}-${closeRun}`}
          open={closeOpen}
          customerName={current.name}
          lang={lang}
          onClose={() => setCloseOpen(false)}
          onConfirm={closeConversation}
          initial={dialog === "close" ? closeInitial : undefined}
        />
      ) : null}
    </div>
  );
}

