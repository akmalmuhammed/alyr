"use client";

import React, { useEffect, useState, useTransition } from "react";
import { Avatar, Button, Chip, Search, Tabs, UiIcon, useToast } from "../../../_ui";
import { copy, type Lang } from "./copy";
import {
  FIXTURE_CONVERSATIONS,
  FIXTURE_THREAD_MARIAM,
  FIXTURE_THREAD_RASHID,
  FIXTURE_CONTEXT_MARIAM,
  FIXTURE_CONTEXT_RASHID,
  type MessageItem,
  type CustomerContextData,
} from "./fixtures";
import {
  closeConversation,
  fetchConversations,
  fetchCustomerContext,
  fetchThread,
  postNote,
  postReply,
  toggleAssistant,
} from "./inboxApi";
import { InboxCloseDialog } from "./InboxCloseDialog";
import { InboxClosedView } from "./InboxClosedView";
import { InboxContextPane } from "./InboxContextPane";
import { InboxConversationList } from "./InboxConversationList";
import { InboxNotDelivered } from "./InboxNotDelivered";
import {
  InboxEmptyFirstRun,
  InboxFilteredEmpty,
  InboxOfflineBanner,
  InboxSkeleton,
} from "./InboxStates";
import { InboxThread } from "./InboxThread";
import { InboxWindowClosed } from "./InboxWindowClosed";
import type { ConversationItem, InboxFilters } from "./logic";
import "./inbox.css";

export interface InboxWorkbenchProps {
  initialFilters?: Partial<InboxFilters>;
  initialSelectedId?: string;
  lang?: Lang;
  live?: boolean;
  stateOverride?: string | null;
  dialogOverride?: string | null;
  viewOverride?: string | null;
  windowOverride?: string | null;
  isPhone?: boolean;
}

export function InboxWorkbench({
  initialFilters,
  initialSelectedId = "rm-148",
  lang = "en",
  live = false,
  stateOverride = null,
  dialogOverride = null,
  viewOverride = null,
  windowOverride = null,
  isPhone = false,
}: InboxWorkbenchProps) {
  const t = copy(lang);
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [filters, setFilters] = useState<InboxFilters>({
    tab: initialFilters?.tab || "open",
    chip: initialFilters?.chip || null,
    q: initialFilters?.q || "",
  });

  const [selectedId, setSelectedId] = useState<string>(
    windowOverride === "closed" ? "ms-saleh" : initialSelectedId
  );
  const [conversations, setConversations] = useState<ConversationItem[]>(FIXTURE_CONVERSATIONS);
  const [counts, setCounts] = useState({
    open: 23,
    closed: 142,
    unassigned: 4,
    mine: 6,
    unread: 12,
    waiting: 3,
  });

  const [messages, setMessages] = useState<MessageItem[]>(
    selectedId === "ms-saleh" ? FIXTURE_THREAD_MARIAM : FIXTURE_THREAD_RASHID
  );
  const [customerCtx, setCustomerCtx] = useState<CustomerContextData>(
    selectedId === "ms-saleh" ? FIXTURE_CONTEXT_MARIAM : FIXTURE_CONTEXT_RASHID
  );

  const [closeDialogOpen, setCloseDialogOpen] = useState(dialogOverride === "close");
  const [phoneShowThread, setPhoneShowThread] = useState(
    isPhone && (initialSelectedId || windowOverride) ? true : false
  );

  // Load data on change or in live mode
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetchConversations(filters, live);
        if (active) {
          setConversations(res.conversations);
          setCounts(res.counts);
        }
      } catch {
        // fallback
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [filters, live]);

  useEffect(() => {
    let active = true;
    async function loadThread() {
      try {
        const [threadData, ctxData] = await Promise.all([
          fetchThread(selectedId, live),
          fetchCustomerContext(selectedId, live),
        ]);
        if (active) {
          setMessages(threadData.messages);
          setCustomerCtx(ctxData);
        }
      } catch {
        // fallback
      }
    }
    loadThread();
    return () => {
      active = false;
    };
  }, [selectedId, live]);

  // Active customer object
  const activeCustomer =
    conversations.find((c) => c.id === selectedId) ||
    FIXTURE_CONVERSATIONS.find((c) => c.id === selectedId) ||
    FIXTURE_CONVERSATIONS[4];

  // Actions
  const handleReply = async (text: string) => {
    await postReply(selectedId, text, live);
    setMessages((prev) => [
      ...prev,
      {
        id: `m-${Date.now()}`,
        type: "message",
        direction: "out",
        sender: "You",
        text,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        status: "Sent",
      },
    ]);
    toast.push({ text: t.btnReply, tone: "ok" });
  };

  const handleSaveNote = async (text: string) => {
    await postNote(selectedId, text, live);
    setMessages((prev) => [
      ...prev,
      {
        id: `n-${Date.now()}`,
        type: "note",
        sender: "You",
        text,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const handleCloseConfirm = async (outcome: string, reason?: string, note?: string) => {
    await closeConversation(selectedId, outcome, reason, note, live);
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, status: "closed" } : c))
    );
  };

  const handleToggleAssistant = async (paused: boolean) => {
    await toggleAssistant(selectedId, paused, live);
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, assistant_paused: paused } : c))
    );
  };

  // State overrides
  if (stateOverride === "loading") {
    return <InboxSkeleton lang={lang} />;
  }
  if (stateOverride === "empty") {
    return <InboxEmptyFirstRun lang={lang} />;
  }
  if (stateOverride === "filtered") {
    return (
      <div className="ibx-workbench">
        <InboxConversationList
          conversations={[]}
          selectedId={null}
          onSelect={() => {}}
          filters={filters}
          onFilterChange={(f) => setFilters((p) => ({ ...p, ...f }))}
          counts={counts}
          lang={lang}
        />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <InboxFilteredEmpty lang={lang} onClear={() => setFilters({ tab: "open", chip: null, q: "" })} />
        </div>
      </div>
    );
  }

  // Views: Not delivered (/unsent)
  if (viewOverride === "unsent") {
    return (
      <InboxNotDelivered
        onRetry={async () => {
          toast.push({ text: t.btnSendAgain, tone: "ok" });
        }}
        onOpenConversation={() => {
          startTransition(() => {
            setSelectedId("kn-ar");
          });
        }}
        lang={lang}
      />
    );
  }

  // Views: Closed
  if (viewOverride === "closed") {
    return (
      <InboxClosedView
        onReopen={(phone) => {
          toast.push({ text: `${t.btnReopen}: ${phone}`, tone: "ok" });
        }}
        lang={lang}
      />
    );
  }

  // Mobile view
  if (isPhone) {
    if (phoneShowThread) {
      return (
        <div style={{ maxWidth: "24.375rem", margin: "0 auto", background: "var(--surface)", border: "var(--rule-hairline) solid var(--line)" }}>
          {/* Mobile Top Bar */}
          <div style={{ height: "3rem", paddingInline: "var(--space-3)", display: "flex", alignItems: "center", gap: "var(--space-2)", borderBottom: "var(--rule-hairline) solid var(--line)" }}>
            <Button kind="quiet" size="sm" onClick={() => setPhoneShowThread(false)}>
              <UiIcon name="start" className="u-ico" />
              <span>{t.backToInbox}</span>
            </Button>
            <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{activeCustomer.name}</span>
          </div>

          {/* Quick Customer Summary Strip */}
          <div style={{ padding: "var(--space-2) var(--space-4)", background: "var(--surface-subtle)", borderBottom: "var(--rule-hairline) solid var(--line)", display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--font-size-xs)" }}>
            <span style={{ color: "var(--text-muted)" }}>{t.owesTitle}</span>
            <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 600 }}>{customerCtx.owesAmount || t.nothingOwed}</span>
            <span>·</span>
            <span style={{ color: "var(--text-muted)" }}>{t.nextBookingTitle}</span>
            <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 600 }}>{customerCtx.booking ? "Sat 08:00" : "None"}</span>
            <span>·</span>
            <span style={{ color: "var(--text-muted)" }}>{t.ordersCount(customerCtx.orders.length)}</span>
          </div>

          <InboxThread
            customer={activeCustomer}
            messages={messages}
            onReply={handleReply}
            onSaveNote={handleSaveNote}
            onCloseClick={() => setCloseDialogOpen(true)}
            onToggleAssistant={handleToggleAssistant}
            lang={lang}
          />
        </div>
      );
    }

    // Phone Inbox List
    const waitingList = conversations.filter((c) => c.mark && c.mark[0] === "wait");
    const otherList = conversations.filter((c) => !(c.mark && c.mark[0] === "wait"));

    return (
      <div style={{ maxWidth: "24.375rem", margin: "0 auto", background: "var(--surface)", border: "var(--rule-hairline) solid var(--line)" }}>
        <div style={{ padding: "var(--space-3) var(--space-4)", borderBottom: "var(--rule-hairline) solid var(--line)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Tabs
              label={t.title}
              items={[
                { id: "open", label: t.tabOpen, count: counts.open },
                { id: "closed", label: t.tabClosed },
              ]}
              value={filters.tab}
              onChange={(val) => setFilters((p) => ({ ...p, tab: val as "open" | "closed" }))}
            />
            <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              {t.unreadCount(counts.unread)}
            </span>
          </div>

          <Search
            label={t.searchConversations}
            placeholder={t.searchConversations}
            value={filters.q || ""}
            onChange={(val) => setFilters((p) => ({ ...p, q: val }))}
          />

          <div style={{ display: "flex", gap: "var(--space-1)", overflowX: "auto" }}>
            <Chip on={filters.chip === "waiting"} count={counts.waiting} onClick={() => setFilters((p) => ({ ...p, chip: p.chip === "waiting" ? null : "waiting" }))}>
              {t.chipWaiting}
            </Chip>
            <Chip on={filters.chip === "mine"} count={counts.mine} onClick={() => setFilters((p) => ({ ...p, chip: p.chip === "mine" ? null : "mine" }))}>
              {t.chipMine}
            </Chip>
            <Chip on={filters.chip === "unassigned"} count={counts.unassigned} onClick={() => setFilters((p) => ({ ...p, chip: p.chip === "unassigned" ? null : "unassigned" }))}>
              {t.chipUnassigned}
            </Chip>
          </div>
        </div>

        {/* Group 1: Waiting for a person */}
        {waitingList.length > 0 && (
          <div>
            <div style={{ padding: "var(--space-2) var(--space-4)", background: "var(--surface-subtle)", fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
              <span>{t.waitingForPersonGroup}</span>
              <span style={{ fontFamily: "var(--font-ui-mono)" }}>3 · oldest 12 min</span>
            </div>
            {waitingList.map((item) => (
              <div
                key={item.id}
                style={{ padding: "var(--space-3) var(--space-4)", borderBottom: "var(--rule-hairline) solid var(--line)", display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: "pointer" }}
                onClick={() => {
                  setSelectedId(item.id);
                  setPhoneShowThread(true);
                }}
              >
                <Avatar name={item.name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{item.name}</span>
                    <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>09:27</span>
                  </div>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.last.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Group 2: Answered or handled */}
        <div>
          <div style={{ padding: "var(--space-2) var(--space-4)", background: "var(--surface-subtle)", fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
            <span>{t.answeredGroup}</span>
            <span style={{ fontFamily: "var(--font-ui-mono)" }}>20</span>
          </div>
          {otherList.map((item) => (
            <div
              key={item.id}
              style={{ padding: "var(--space-3) var(--space-4)", borderBottom: "var(--rule-hairline) solid var(--line)", display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: "pointer" }}
              onClick={() => {
                setSelectedId(item.id);
                setPhoneShowThread(true);
              }}
            >
              <Avatar name={item.name} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{item.name}</span>
                  <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>09:38</span>
                </div>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.last.body}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Desktop 3-pane workbench
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      {stateOverride === "offline" && <InboxOfflineBanner lang={lang} time="09:40" />}

      <div className="ibx-workbench">
        {/* Pane 1: Conversation List */}
        <InboxConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
          }}
          filters={filters}
          onFilterChange={(f) => setFilters((p) => ({ ...p, ...f }))}
          counts={counts}
          lang={lang}
        />

        {/* Pane 2: Message Thread OR Window Closed */}
        {windowOverride === "closed" || selectedId === "ms-saleh" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <InboxThread
              customer={activeCustomer}
              messages={messages}
              onReply={handleReply}
              onSaveNote={handleSaveNote}
              onCloseClick={() => setCloseDialogOpen(true)}
              onToggleAssistant={handleToggleAssistant}
              lang={lang}
            />
            <InboxWindowClosed
              customerName={activeCustomer.name}
              onSendTemplate={(tpl) => {
                toast.push({ text: `${t.btnSendTemplate}: ${tpl}`, tone: "ok" });
              }}
              lang={lang}
            />
          </div>
        ) : (
          <InboxThread
            customer={activeCustomer}
            messages={messages}
            onReply={handleReply}
            onSaveNote={handleSaveNote}
            onCloseClick={() => setCloseDialogOpen(true)}
            onToggleAssistant={handleToggleAssistant}
            lang={lang}
          />
        )}

        {/* Pane 3: Customer Context */}
        <InboxContextPane data={customerCtx} lang={lang} />
      </div>

      {/* Close Conversation Modal */}
      <InboxCloseDialog
        open={closeDialogOpen}
        customerName={activeCustomer.name}
        onClose={() => setCloseDialogOpen(false)}
        onConfirm={handleCloseConfirm}
        lang={lang}
      />
    </div>
  );
}
