"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Banner,
  Button,
  Chip,
  Pager,
  Panel,
  PanelFooter,
  Search,
  Select,
  Status,
  Table,
  type TableColumn,
  Tag,
  UTabs,
} from "../../../_ui";
import { copy, type Lang } from "./copy";
import type { OrderRowFixture } from "./fixtures";
import {
  formatAgeOrDate,
  formatTime,
  isLateNew,
  itemsSummary,
  money,
  orderNo,
  type OrderFilters,
} from "./logic";
import type { TeamMember } from "./ordersApi";

export interface OrdersTableProps {
  orders: OrderRowFixture[];
  total: number;
  counts: {
    all: number;
    open: number;
    new: number;
    confirmed: number;
    ready: number;
    done: number;
    cancelled: number;
    pickup: number;
    delivery: number;
  };
  lateNew: {
    count: number;
    items: Array<{ number: number; minutes: number }>;
  };
  openTotal?: number;
  filters: OrderFilters;
  team: TeamMember[];
  lang: Lang;
  role?: string;
  isDrawerOpen?: boolean;
  activeOrderNumber?: number;
  lastUpdated?: string;
  onFilterChange: (filters: Partial<OrderFilters>) => void;
  onRowClick: (order: OrderRowFixture) => void;
}

export function OrdersTable({
  orders,
  total,
  counts,
  lateNew,
  openTotal,
  filters,
  team,
  lang,
  role = "owner",
  isDrawerOpen = false,
  activeOrderNumber,
  lastUpdated,
  onFilterChange,
  onRowClick,
}: OrdersTableProps) {
  const t = copy(lang);
  const isManager = role !== "agent";

  // Search input debouncing (250ms)
  const [searchValue, setSearchValue] = useState(filters.q || "");
  const [prevQ, setPrevQ] = useState(filters.q || "");
  if ((filters.q || "") !== prevQ) {
    setPrevQ(filters.q || "");
    setSearchValue(filters.q || "");
  }

  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchValue !== (filters.q || "")) {
        onFilterChange({ q: searchValue || undefined, offset: 0 });
      }
    }, 250);
    return () => clearTimeout(handler);
  }, [searchValue, filters.q, onFilterChange]);

  // Tab items
  const activeTab = filters.status || "open";
  const tabItems = [
    { id: "open", label: t.tabOpen, count: counts.open },
    { id: "new", label: t.tabNew, count: counts.new },
    { id: "confirmed", label: t.tabConfirmed, count: counts.confirmed },
    { id: "ready", label: t.tabReady, count: counts.ready },
    { id: "done", label: t.tabDone, count: counts.done },
    { id: "cancelled", label: t.tabCancelled, count: counts.cancelled },
    { id: "all", label: t.tabAll, count: counts.all },
  ];

  // Table columns
  const columns: TableColumn<OrderRowFixture>[] = useMemo(() => {
    const cols: TableColumn<OrderRowFixture>[] = [
      {
        key: "order",
        header: t.colOrder,
        phone: "kicker",
        width: "6rem",
        cell: (row) => (
          <span className="ord-cell-mono" style={{ fontWeight: 600 }}>
            {orderNo(row.number)}
          </span>
        ),
      },
      {
        key: "placed",
        header: t.colPlaced,
        width: "6.5rem",
        cell: (row) => {
          const late = isLateNew(row.status, row.created_at);
          return (
            <div className="ord-cell-placed">
              <span className="ord-cell-mono">{formatTime(row.created_at)}</span>
              <span className={`ord-cell-age ${late ? "ord-cell-age-warn" : ""}`}>
                {formatAgeOrDate(row.created_at, lang)}
              </span>
            </div>
          );
        },
      },
      {
        key: "customer",
        header: t.colCustomer,
        phone: "title",
        cell: (row) => {
          const hasTags = row.test || row.table || (row.price_group && !row.price_group.is_default);
          const pgName = row.price_group
            ? lang === "ar" && row.price_group.name_ar
              ? row.price_group.name_ar
              : row.price_group.name
            : "";
          return (
            <div className="ord-cell-customer">
              <span className="ord-customer-name">{row.customer}</span>
              {hasTags && (
                <div className="ord-tags-row">
                  {row.test && <Tag tone="n">{t.tagTestOrder}</Tag>}
                  {row.table && <Tag tone="n">{row.table}</Tag>}
                  {pgName && <Tag tone="n">{pgName}</Tag>}
                </div>
              )}
            </div>
          );
        },
      },
      {
        key: "items",
        header: t.colItems,
        phone: "body",
        cell: (row) => {
          const summary = itemsSummary(row.items || [], lang);
          return (
            <div className="ord-cell-items" title={summary.full}>
              <span className="ord-item-line">{summary.line1}</span>
              {summary.line2 && <span className="ord-item-line ord-item-line-rest">{summary.line2}</span>}
            </div>
          );
        },
      },
    ];

    // Dropped when drawer is open
    if (!isDrawerOpen) {
      cols.push({
        key: "handover",
        header: t.colHandOver,
        phone: "foot",
        cell: (row) => {
          if (!row.fulfilment) return null;
          const isDelivery = row.fulfilment.mode === "delivery";
          const modeLabel = isDelivery ? t.deliveryMode : t.pickupAtShop;
          const zoneName = row.fulfilment.zone ? (lang === "ar" && row.fulfilment.zone_ar ? row.fulfilment.zone_ar : row.fulfilment.zone) : "";
          return (
            <div className="ord-cell-handover">
              <span style={{ fontWeight: 500 }}>{modeLabel}</span>
              {isDelivery && zoneName && (
                <span className="ord-handover-sub">{zoneName} · {t.todayWord}</span>
              )}
            </div>
          );
        },
      });
    }

    cols.push({
      key: "payment",
      header: t.colPayment,
      phone: "foot-end",
      cell: (row) => {
        if (row.payment === "unpaid" && row.pay_link === "open") {
          return <Status tone="warn">{t.payLinkOpen}</Status>;
        }
        if (row.payment === "paid") {
          return <Status tone="ok">{t.payPaid}</Status>;
        }
        if (row.payment === "on_account") {
          return <Status tone="n">{t.payOnAccount}</Status>;
        }
        return <Status tone="warn">{t.payNotPaid}</Status>;
      },
    });

    if (!isDrawerOpen) {
      cols.push({
        key: "assigned",
        header: t.colHandledBy,
        cell: (row) => {
          if (!row.assigned) {
            return <span style={{ color: "var(--text-faint)", fontSize: "0.8125rem" }}>{t.nobodyAssigned}</span>;
          }
          return (
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <Avatar name={row.assigned.name} size={20} />
              <span style={{ fontSize: "0.8125rem" }}>{row.assigned.name.split(" ")[0]}</span>
            </div>
          );
        },
      });
    }

    cols.push(
      {
        key: "status",
        header: t.colStatus,
        phone: "tag",
        cell: (row) => {
          const tone = row.status === "new"
            ? "ink"
            : row.status === "confirmed"
            ? "n"
            : row.status === "ready"
            ? "ok"
            : row.status === "done"
            ? "ok"
            : "n";
          const label = row.status === "new"
            ? t.stNew
            : row.status === "confirmed"
            ? t.stConfirmed
            : row.status === "ready"
            ? t.stReady
            : row.status === "done"
            ? t.stDone
            : t.stCancelled;
          return <Tag tone={tone}>{label}</Tag>;
        },
      },
      {
        key: "total",
        header: t.colTotal,
        align: "end",
        phone: "amount",
        cell: (row) => (
          <span className="ord-cell-mono" style={{ fontWeight: 600 }}>
            {money(row.total)}
          </span>
        ),
      }
    );

    return cols;
  }, [t, lang, isDrawerOpen]);

  // Fulfilment mode chips
  const showModeChips = counts.delivery + counts.pickup > 0;
  const currentMode = filters.mode || "all";

  // Pager calculation
  const offset = filters.offset || 0;
  const limit = filters.limit || 50;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + limit, total);
  const pagerSummary = `${pageStart}–${pageEnd} of ${total}`;

  // Footer note
  let footerNote: string | null = null;
  if (activeTab === "open") {
    if (isManager && openTotal !== undefined) {
      footerNote = t.openRuleFooter(money(openTotal));
    }
  } else if (activeTab === "done" || activeTab === "cancelled") {
    footerNote = t.past30DaysNote;
  }

  return (
    <div className="ord-view">
      {/* Header */}
      <div className="ord-header">
        <div className="ord-header-start">
          <h1 className="ord-title">{t.title}</h1>
          <span className="ord-subtitle">{t.subtitleOpen(counts.open)}</span>
        </div>
      </div>

      {/* Late Orders Alert Banner */}
      {lateNew.count > 0 && (
        <Banner
          tone="warn"
          action={
            <Button
              kind="line"
              size="sm"
              onClick={() => onFilterChange({ status: "new" })}
            >
              {t.showThem}
            </Button>
          }
        >
          {t.lateOrdersBanner(
            lateNew.count,
            lateNew.items.map((i) => `#${i.number}`).join(", ")
          )}
        </Banner>
      )}

      {/* Toolbar: Tabs & Filters */}
      <div className="ord-toolbar">
        <UTabs
          items={tabItems}
          value={activeTab}
          label={t.title}
          onChange={(id) => onFilterChange({ status: id, offset: 0 })}
        />

        <div className="ord-filter-row">
          <div className="ord-search-wrap">
            <Search
              value={searchValue}
              onChange={setSearchValue}
              label={t.searchPlaceholder}
              placeholder={t.searchPlaceholder}
              clearLabel={t.clearFilters}
            />
          </div>

          {showModeChips && (
            <div className="ord-chips-row">
              <Chip
                on={currentMode === "all"}
                onClick={() => onFilterChange({ mode: "all", offset: 0 })}
              >
                {t.filterAll}
              </Chip>
              <Chip
                on={currentMode === "pickup"}
                count={counts.pickup}
                onClick={() => onFilterChange({ mode: "pickup", offset: 0 })}
              >
                {t.filterPickup}
              </Chip>
              <Chip
                on={currentMode === "delivery"}
                count={counts.delivery}
                onClick={() => onFilterChange({ mode: "delivery", offset: 0 })}
              >
                {t.filterDelivery}
              </Chip>
            </div>
          )}

          <Select
            variant="filter"
            value={filters.payment || "all"}
            onChange={(e) => onFilterChange({ payment: e.target.value, offset: 0 })}
          >
            <option value="all">{t.paymentLabel}: {t.paymentAny}</option>
            <option value="paid">{t.paymentPaid}</option>
            <option value="unpaid">{t.paymentNotPaid}</option>
            <option value="on_account">{t.paymentOnAccount}</option>
          </Select>

          <Select
            variant="filter"
            value={filters.assigned || "all"}
            onChange={(e) => onFilterChange({ assigned: e.target.value, offset: 0 })}
          >
            <option value="all">{t.handledByLabel}: {t.handledByAnyone}</option>
            <option value="none">{t.handledByNobody}</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>

          <Button
            kind="quiet"
            size="sm"
            onClick={() =>
              onFilterChange({
                sort: filters.sort === "oldest" ? "newest" : "oldest",
              })
            }
          >
            {filters.sort === "oldest" ? t.sortOldest : t.sortNewest}
          </Button>
        </div>
      </div>

      {/* Table Panel */}
      <Panel className="ord-table-panel">
        <Table
          columns={columns}
          rows={orders}
          rowKey={(r) => r.id}
          caption={t.title}
          density="row"
          activeKey={activeOrderNumber ? `ord-${activeOrderNumber}` : null}
          onRowOpen={onRowClick}
          cards="auto"
        />
        <PanelFooter>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", width: "100%" }}>
            <Pager
              summary={
                <span>
                  {lastUpdated && (
                    <span style={{ color: "var(--text-faint)", marginInlineEnd: "0.75rem" }}>
                      {t.updatedAt(lastUpdated)}
                    </span>
                  )}
                  {pagerSummary}
                </span>
              }
              previous={{
                label: "Previous",
                disabled: offset <= 0,
                onClick: () => onFilterChange({ offset: Math.max(0, offset - limit) }),
              }}
              next={{
                label: "Next",
                disabled: offset + limit >= total,
                onClick: () => onFilterChange({ offset: offset + limit }),
              }}
              navLabel="Orders pagination"
            />
            {footerNote && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>
                {footerNote}
              </div>
            )}
          </div>
        </PanelFooter>
      </Panel>
    </div>
  );
}
