"use client";

import React, { useState } from "react";
import {
  Chip,
  KV,
  KVList,
  Meter,
  PageTitle,
  Panel,
  PanelFooter,
  PanelHeader,
  Search,
  Status,
  Table,
  type TableColumn,
} from "../../../_ui";
import { copy, type Lang } from "./copy";
import { FIXTURE_CLOSED } from "./fixtures";

export interface InboxClosedViewProps {
  onReopen: (customerPhone: string) => void;
  lang: Lang;
}

export function InboxClosedView({ onReopen, lang }: InboxClosedViewProps) {
  const t = copy(lang);
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const data = FIXTURE_CLOSED;

  const filteredRows = data.rows.filter((r) => {
    if (outcomeFilter !== "all" && r.outcome.toLowerCase() !== outcomeFilter.toLowerCase()) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!r.customer.toLowerCase().includes(q) && !r.phone.includes(q)) return false;
    }
    return true;
  });

  type ClosedRow = (typeof FIXTURE_CLOSED)["rows"][number];
  const columns: TableColumn<ClosedRow>[] = [
    {
      key: "customer",
      header: t.colCustomer,
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.customer}</div>
          <div style={{ fontFamily: "var(--font-ui-mono)", fontSize: "0.75rem", color: "var(--text-muted)" }}>{row.phone}</div>
        </div>
      ),
    },
    {
      key: "outcome",
      header: t.colHowItEnded,
      width: "8rem",
      cell: (row) => {
        const tone = row.outcome === "Sold" || row.outcome === "Booked" ? "ok" : row.outcome === "Lost" ? "bad" : "n";
        return <Status tone={tone}>{row.outcome}</Status>;
      },
    },
    {
      key: "note",
      header: t.colOrderBookingNote,
      width: "12rem",
      cell: (row) => <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "0.8125rem" }}>{row.note}</span>,
    },
    {
      key: "closedBy",
      header: t.colClosedBy,
      width: "7rem",
      cell: (row) => <span style={{ fontSize: "0.8125rem" }}>{row.closedBy}</span>,
    },
    {
      key: "closedAt",
      header: t.colClosed,
      width: "8rem",
      cell: (row) => <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "0.8125rem" }}>{row.closedAt}</span>,
    },
  ];

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-4)", maxInlineSize: "80rem", marginInline: "auto" }}>
      {/* Title */}
      <PageTitle
        title={t.closedTitle}
        sub={t.closedSub}
        right={
          <Search
            label={t.searchClosed}
            placeholder={t.searchClosed}
            value={searchQuery}
            onChange={setSearchQuery}
          />
        }
      />

      {/* Outcomes Band */}
      <div className="ibx-closed-band">
        <div className="ibx-closed-fig">
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--band-muted)", textTransform: "uppercase" }}>{t.statClosedWeek}</span>
          <div className="ibx-closed-fig-val">{data.summary.closedThisWeek}</div>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--band-muted)" }}>{data.summary.closedSub}</span>
        </div>
        <div className="ibx-closed-fig">
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--band-muted)", textTransform: "uppercase" }}>{t.outcomeSold}</span>
          <div className="ibx-closed-fig-val">{data.summary.sold}</div>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--band-muted)" }}>{data.summary.soldSub}</span>
        </div>
        <div className="ibx-closed-fig">
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--band-muted)", textTransform: "uppercase" }}>{t.outcomeBooked}</span>
          <div className="ibx-closed-fig-val">{data.summary.booked}</div>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--band-muted)" }}>{data.summary.bookedSub}</span>
        </div>
        <div className="ibx-closed-fig">
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--band-muted)", textTransform: "uppercase" }}>{t.outcomeAnswered}</span>
          <div className="ibx-closed-fig-val">{data.summary.answered}</div>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--band-muted)" }}>{data.summary.answeredSub}</span>
        </div>
        <div className="ibx-closed-fig">
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--band-muted)", textTransform: "uppercase" }}>{t.outcomeLost}</span>
          <div className="ibx-closed-fig-val">{data.summary.lost}</div>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--band-muted)" }}>{data.summary.lostSub}</span>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="ibx-closed-layout">
        {/* Table Panel */}
        <div style={{ flex: "1 1 20rem", minInlineSize: 0, maxInlineSize: "100%", overflowX: "auto" }}>
          <Panel>
            <div style={{ padding: "var(--space-3) var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-2)", borderBottom: "var(--rule-hairline) solid var(--line)", flexWrap: "wrap" }}>
              <Chip on={outcomeFilter === "all"} onClick={() => setOutcomeFilter("all")}>
                {t.chipAll} (142)
              </Chip>
              <Chip on={outcomeFilter === "sold"} onClick={() => setOutcomeFilter("sold")}>
                {t.outcomeSold} (31)
              </Chip>
              <Chip on={outcomeFilter === "booked"} onClick={() => setOutcomeFilter("booked")}>
                {t.outcomeBooked} (44)
              </Chip>
              <Chip on={outcomeFilter === "answered"} onClick={() => setOutcomeFilter("answered")}>
                {t.outcomeAnswered} (58)
              </Chip>
              <Chip on={outcomeFilter === "lost"} onClick={() => setOutcomeFilter("lost")}>
                {t.outcomeLost} (9)
              </Chip>
            </div>
            <Table
              caption={t.tabClosed}
              columns={columns}
              rows={filteredRows}
              rowKey={(r) => `${r.customer}-${r.closedAt}`}
            />
          </Panel>
        </div>

        {/* Side Cards (Why lost & Speed) */}
        <div className="ibx-closed-side" style={{ inlineSize: "20rem", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {/* Selected Reopen Card */}
          <Panel>
            <PanelHeader
              title="+974 5555 0190"
              right={
                <button
                  type="button"
                  style={{ background: "none", border: "none", textDecoration: "underline", fontSize: "var(--font-size-xs)", fontWeight: 500, cursor: "pointer", color: "inherit" }}
                  onClick={() => onReopen("+974 5555 0190")}
                >
                  {t.btnReopen}
                </button>
              }
            />
            <div style={{ padding: "var(--space-3) var(--space-4)", fontSize: "var(--font-size-xs)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <p style={{ margin: 0, lineHeight: 1.4 }}>
                Asked for ceramic coating for a motorbike. Bilal answered that Nuqta coats cars only.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <Status tone="bad">Lost</Status>
                <span style={{ color: "var(--text-muted)" }}>Not available</span>
              </div>
            </div>
          </Panel>

          {/* Why lost Meter Card */}
          <Panel>
            <PanelHeader title={t.whyLostHeader(9)} sub={t.whyLostThisWeek} />
            <div style={{ padding: "var(--space-3) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {data.whyLost.map((item) => (
                <div key={item.reason} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <span style={{ inlineSize: "7.5rem", fontSize: "var(--font-size-xs)" }}>{item.reason}</span>
                  <div style={{ flex: 1 }}>
                    <Meter value={Math.round((item.count / 4) * 100)} label={item.reason} />
                  </div>
                  <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
            <PanelFooter>{t.whyLostFooter}</PanelFooter>
          </Panel>

          {/* First answer Speed Card */}
          <Panel>
            <PanelHeader title={t.firstAnswerHeader} />
            <div style={{ padding: "var(--space-3) var(--space-4)" }}>
              <KVList>
                <KV k={t.firstAnswerToday} mono>{data.speed.today}</KV>
                <KV k={t.firstAnswerMedian} mono>{data.speed.median}</KV>
                <KV k={t.firstAnswerWaited15m} mono>{data.speed.waited15m}</KV>
              </KVList>
            </div>
            <PanelFooter>{t.firstAnswerFooter}</PanelFooter>
          </Panel>
        </div>
      </div>
    </div>
  );
}
