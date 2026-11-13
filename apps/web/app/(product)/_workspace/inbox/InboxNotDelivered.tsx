"use client";

import React, { useState } from "react";
import { Button, PageTitle, Panel, PanelFooter, PanelHeader, Search, Stat, Table, type TableColumn, Tabs } from "../../../_ui";
import { copy, type Lang } from "./copy";
import { FIXTURE_NOT_DELIVERED } from "./fixtures";

export interface InboxNotDeliveredProps {
  onRetry: (id: string) => Promise<void>;
  onOpenConversation: () => void;
  lang: Lang;
}

export function InboxNotDelivered({ onRetry, onOpenConversation, lang }: InboxNotDeliveredProps) {
  const t = copy(lang);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const data = FIXTURE_NOT_DELIVERED;

  const tabItems = [
    { id: "all", label: t.chipAll, count: data.stats.total14d },
    { id: "held", label: t.chipHeldBack, count: data.stats.heldBack },
    { id: "failed", label: t.chipFailed, count: data.stats.failed },
  ];

  // Held back columns
  type HeldBackRow = (typeof FIXTURE_NOT_DELIVERED)["heldBack"][number];
  type FailedRow = (typeof FIXTURE_NOT_DELIVERED)["failed"][number];

  const heldCols: TableColumn<HeldBackRow>[] = [
    {
      key: "when",
      header: t.colWhen,
      width: "6rem",
      cell: (row) => <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "0.8125rem" }}>{row.when}</span>,
    },
    {
      key: "customer",
      header: t.colCustomer,
      width: "10rem",
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.customer}</div>
          <div style={{ fontFamily: "var(--font-ui-mono)", fontSize: "0.75rem", color: "var(--text-muted)" }}>{row.phone}</div>
        </div>
      ),
    },
    {
      key: "message",
      header: t.colMessage,
      cell: (row) => (
        <div>
          <div>{row.message}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{row.sender}</div>
        </div>
      ),
    },
    {
      key: "why",
      header: t.colWhy,
      width: "12rem",
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 500 }}>{row.why}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{row.whySub}</div>
        </div>
      ),
    },
    {
      key: "whenCanGo",
      header: t.colWhenItCanGo,
      width: "12rem",
      cell: (row) => <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{row.whenCanGo}</span>,
    },
    {
      key: "action",
      header: "",
      width: "8rem",
      cell: (row) =>
        row.canSendTemplate ? (
          <Button kind="line" size="xs">
            {t.btnSendTemplate}
          </Button>
        ) : (
          <span style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>{t.cannotGo}</span>
        ),
    },
  ];

  // Failed columns
  const failedCols: TableColumn<FailedRow>[] = [
    {
      key: "when",
      header: t.colWhen,
      width: "6rem",
      cell: (row) => <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "0.8125rem" }}>{row.when}</span>,
    },
    {
      key: "customer",
      header: t.colCustomer,
      width: "10rem",
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.customer}</div>
          <div style={{ fontFamily: "var(--font-ui-mono)", fontSize: "0.75rem", color: "var(--text-muted)" }}>{row.phone}</div>
        </div>
      ),
    },
    {
      key: "message",
      header: t.colMessage,
      cell: (row) => (
        <div>
          <div>{row.message}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{row.sender}</div>
        </div>
      ),
    },
    {
      key: "why",
      header: t.colWhy,
      width: "12rem",
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 500 }}>{row.reason}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{row.reasonSub}</div>
        </div>
      ),
    },
    {
      key: "details",
      header: t.colWhatsAppReason,
      width: "12rem",
      cell: (row) => (
        <div>
          <div style={{ fontSize: "0.8125rem" }}>{row.error}</div>
          {row.code && <div style={{ fontFamily: "var(--font-ui-mono)", fontSize: "0.75rem", color: "var(--text-muted)" }}>{row.code}</div>}
        </div>
      ),
    },
    {
      key: "action",
      header: "",
      width: "8rem",
      cell: (row) =>
        row.canRetry ? (
          <Button kind="line" size="xs" onClick={() => onRetry(row.id)}>
            {t.btnSendAgain}
          </Button>
        ) : (
          <Button kind="quiet" size="xs" onClick={onOpenConversation}>
            {t.btnOpenConversation}
          </Button>
        ),
    },
  ];

  return (
    <div className="ibx-unsent-view">
      {/* Title */}
      <PageTitle
        title={t.notDeliveredTitle}
        sub={t.notDeliveredSub}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <Search
              label={t.searchNotDelivered}
              placeholder={t.searchNotDelivered}
              value={searchQuery}
              onChange={setSearchQuery}
            />
            <Tabs label={t.notDeliveredTitle} items={tabItems} value={activeTab} onChange={setActiveTab} />
          </div>
        }
      />

      {/* 4 Stat Tiles */}
      <div className="ibx-stats-grid">
        <Stat
          label={t.statNotDelivered14d}
          value={String(data.stats.total14d)}
          sub={t.statNotDelivered14dSub(data.stats.sentTotal)}
        />
        <Stat
          label={t.statNewSinceYesterday}
          value={String(data.stats.newYesterday)}
          sub={t.statNewSinceYesterdaySub}
        />
        <Stat
          label={t.statHeldBack}
          value={String(data.stats.heldBack)}
          sub={t.statHeldBackSub}
        />
        <Stat
          label={t.statFailed}
          value={String(data.stats.failed)}
          sub={t.statFailedSub}
        />
      </div>

      {/* Held Back Table Panel */}
      {(activeTab === "all" || activeTab === "held") && (
        <Panel>
          <PanelHeader title={t.statHeldBack} sub={String(data.heldBack.length)} />
          <div style={{ overflowX: "auto", maxInlineSize: "100%" }}>
            <Table
              caption={t.statHeldBack}
              columns={heldCols}
              rows={data.heldBack}
              rowKey={(r) => r.phone + r.when}
            />
          </div>
          <PanelFooter>{t.heldBackFooter}</PanelFooter>
        </Panel>
      )}

      {/* Failed Table Panel */}
      {(activeTab === "all" || activeTab === "failed") && (
        <Panel>
          <PanelHeader title={t.statFailed} sub={String(data.failed.length)} />
          <div style={{ overflowX: "auto", maxInlineSize: "100%" }}>
            <Table
              caption={t.statFailed}
              columns={failedCols}
              rows={data.failed}
              rowKey={(r) => r.id}
            />
          </div>
          <PanelFooter>{t.failedFooter}</PanelFooter>
        </Panel>
      )}
    </div>
  );
}
