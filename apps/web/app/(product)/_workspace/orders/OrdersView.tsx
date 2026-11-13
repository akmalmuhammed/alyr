"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useToast } from "../../../_ui";
import { copy, type Lang } from "./copy";
import type { OrderDetailFixture, OrderRowFixture } from "./fixtures";
import {
  type OrderFilters,
  formatTime,
  money,
} from "./logic";
import { MarkPaidDialog } from "./MarkPaidDialog";
import { CancelDialog } from "./CancelDialog";
import { OrderDrawer } from "./OrderDrawer";
import { OrderDetail } from "./OrderDetail";
import {
  OrdersEmptyFirstRun,
  OrdersErrorBanner,
  OrdersFilteredEmpty,
  OrdersOfflineBanner,
  OrdersSkeleton,
} from "./OrdersStates";
import { OrdersTable } from "./OrdersTable";
import { ordersApi, type OrdersListResponse, type TeamMember } from "./ordersApi";
import "./orders.css";

export interface OrdersViewProps {
  initialFilters?: OrderFilters;
  lang?: Lang;
  role?: string;
  live?: boolean;
  stateOverride?: string | null;
  onNavigate?: (filters: OrderFilters) => void;
}

export function OrdersView({
  initialFilters = {},
  lang = "en",
  role = "owner",
  live = false,
  stateOverride,
  onNavigate,
}: OrdersViewProps) {
  const t = copy(lang);
  const toast = useToast();

  const [filters, setFilters] = useState<OrderFilters>(initialFilters);
  const [prevInitialFilters, setPrevInitialFilters] = useState(initialFilters);
  if (initialFilters !== prevInitialFilters) {
    setPrevInitialFilters(initialFilters);
    setFilters(initialFilters);
  }

  const [data, setData] = useState<OrdersListResponse | null>(null);
  const [detailData, setDetailData] = useState<OrderDetailFixture | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>(formatTime(new Date()));
  const [reloadTick, setReloadTick] = useState(0);

  const refresh = useCallback(() => setReloadTick((t) => t + 1), []);

  // Active dialog state
  const [markPaidOrder, setMarkPaidOrder] = useState<OrderRowFixture | null>(null);
  const [cancelOrder, setCancelOrder] = useState<OrderRowFixture | null>(null);

  // Load team
  useEffect(() => {
    ordersApi.getTeam(live).then(setTeam).catch(() => {});
  }, [live]);

  // Fetch orders list
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await ordersApi.list(filters, live, role);
        if (cancelled) return;
        setData(res);
        setError(null);
        setLastUpdated(formatTime(new Date()));
      } catch (err: unknown) {
        if (cancelled) return;
        if (typeof window !== "undefined" && !window.navigator.onLine) {
          setIsOffline(true);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load orders");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters, live, role, reloadTick]);

  // Load detail if open or detail param present
  const activeDetailNum = filters.detail ? parseInt(filters.detail.replace(/^#/, ""), 10) : null;
  const activeDrawerNum = filters.open ? parseInt(filters.open.replace(/^#/, ""), 10) : null;
  const targetOrderNum = activeDetailNum || activeDrawerNum;

  useEffect(() => {
    if (!targetOrderNum) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const detail = await ordersApi.getDetail(targetOrderNum, live);
        if (cancelled) return;
        setDetailData(detail);
        // Auto open dialog if requested
        if (detail && filters.dialog === "paid") {
          setMarkPaidOrder(detail.order);
        } else if (detail && filters.dialog === "cancel") {
          setCancelOrder(detail.order);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetOrderNum, live, filters.dialog]);

  // Polling: refresh every 10 seconds in live mode
  useEffect(() => {
    if (!live) return;
    const interval = setInterval(() => {
      setReloadTick((t) => t + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, [live]);

  const updateFilters = useCallback(
    (next: Partial<OrderFilters>) => {
      const updated = { ...filters, ...next };
      setFilters(updated);
      onNavigate?.(updated);
    },
    [filters, onNavigate]
  );

  // Step transition
  const handleStep = async (orderId: string, nextStatus: string) => {
    try {
      await ordersApi.setStatus(orderId, nextStatus, undefined, live);
      const target = data?.orders.find((o) => o.id === orderId) || detailData?.order;
      const num = target ? target.number : 1000;
      const customer = target ? target.customer.split(" ")[0] : "Customer";
      const stepName = nextStatus === "confirmed" ? t.stConfirmed : nextStatus === "ready" ? t.stReady : t.stDone;

      toast.push({
        tone: "ok",
        text: t.toastStepDone(num, stepName, customer),
      });

      refresh();
      if (targetOrderNum) {
        const fresh = await ordersApi.getDetail(targetOrderNum, live);
        setDetailData(fresh);
      }
    } catch {
      const target = data?.orders.find((o) => o.id === orderId) || detailData?.order;
      const num = target ? target.number : 1000;
      const customer = target ? target.customer.split(" ")[0] : "Customer";
      const currentStep = target ? target.status : "new";
      toast.push({
        tone: "bad",
        text: t.toastSaveFailed(num, currentStep, customer),
      });
    }
  };

  // Mark paid
  const handleMarkPaid = async (
    method: "cash" | "bank_transfer" | "card_terminal" | "cheque",
    reference: string
  ) => {
    if (!markPaidOrder) return;
    await ordersApi.markPaid(markPaidOrder.id, method, reference, live);
    toast.push({
      tone: "ok",
      text: t.toastMarkedPaid(markPaidOrder.number, method, money(markPaidOrder.total)),
    });
    setMarkPaidOrder(null);
    updateFilters({ dialog: null, forOrder: undefined });
    refresh();
    if (targetOrderNum) {
      const fresh = await ordersApi.getDetail(targetOrderNum, live);
      setDetailData(fresh);
    }
  };

  // Cancel order
  const handleCancel = async (restock: boolean) => {
    if (!cancelOrder) return;
    const res = await ordersApi.setStatus(cancelOrder.id, "cancelled", restock, live);
    const stockMsg = res.stock_returned ? `${res.stock_returned} items went back to stock.` : "";
    toast.push({
      tone: "ok",
      text: t.toastCancelled(cancelOrder.number, stockMsg),
    });
    setCancelOrder(null);
    updateFilters({ dialog: null, forOrder: undefined });
    refresh();
    if (targetOrderNum) {
      const fresh = await ordersApi.getDetail(targetOrderNum, live);
      setDetailData(fresh);
    }
  };

  // Assign order
  const handleAssign = async (orderId: string, userId: string | null) => {
    await ordersApi.assign(orderId, userId, live);
    refresh();
    if (targetOrderNum) {
      const fresh = await ordersApi.getDetail(targetOrderNum, live);
      setDetailData(fresh);
    }
  };

  // Copy tracking link
  const handleCopyTrackLink = (url: string) => {
    navigator.clipboard?.writeText(url);
    toast.push({ tone: "ok", text: t.linkCopied });
  };

  // Copy store order link
  const handleCopyStoreLink = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const slug = data?.slug || "demo";
    navigator.clipboard?.writeText(`${origin}/s/${slug}`);
    toast.push({ tone: "ok", text: t.orderLinkCopied });
  };

  // State overrides for testing & demo (?state=...)
  if (stateOverride === "loading" || (loading && !data)) {
    return <OrdersSkeleton lang={lang} />;
  }

  if (stateOverride === "empty" || (data && data.counts.all === 0)) {
    return (
      <div className="ord-view">
        <h1 className="ord-title">{t.title}</h1>
        <OrdersEmptyFirstRun
          slug={data?.slug || "demo"}
          lang={lang}
          onCopyLink={handleCopyStoreLink}
        />
      </div>
    );
  }

  if (stateOverride === "filtered" || (data && data.orders.length === 0 && !error)) {
    return (
      <div className="ord-view">
        <OrdersTable
          orders={[]}
          total={0}
          counts={data?.counts || { all: 0, open: 0, new: 0, confirmed: 0, ready: 0, done: 0, cancelled: 0, pickup: 0, delivery: 0 }}
          lateNew={data?.late_new || { count: 0, items: [] }}
          openTotal={data?.open_total}
          filters={filters}
          team={team}
          lang={lang}
          role={role}
          lastUpdated={lastUpdated}
          onFilterChange={updateFilters}
          onRowClick={() => {}}
        />
        <OrdersFilteredEmpty
          query={filters.q}
          lang={lang}
          onClear={() => updateFilters({ q: undefined, payment: "all", mode: "all", assigned: "all", offset: 0 })}
        />
      </div>
    );
  }

  // Full page Order Detail view
  if (activeDetailNum && detailData) {
    return (
      <div className="ord-view">
        <OrderDetail
          orderDetail={detailData}
          lang={lang}
          team={team}
          role={role}
          onBack={() => updateFilters({ detail: undefined })}
          onOpenCancel={() => setCancelOrder(detailData.order)}
          onOpenMarkPaid={() => setMarkPaidOrder(detailData.order)}
          onStep={handleStep}
          onAssign={handleAssign}
          onCopyTrackLink={handleCopyTrackLink}
        />

        {markPaidOrder && (
          <MarkPaidDialog
            order={markPaidOrder}
            open={Boolean(markPaidOrder)}
            lang={lang}
            canRecordPayments={detailData.access.can_record_payments}
            receiptOnPayment={detailData.access.receipt_on_payment}
            onClose={() => {
              setMarkPaidOrder(null);
              updateFilters({ dialog: null });
            }}
            onSave={handleMarkPaid}
          />
        )}

        {cancelOrder && (
          <CancelDialog
            order={cancelOrder}
            open={Boolean(cancelOrder)}
            lang={lang}
            onClose={() => {
              setCancelOrder(null);
              updateFilters({ dialog: null });
            }}
            onConfirmCancel={handleCancel}
          />
        )}
      </div>
    );
  }

  // Main list view with table and drawer
  return (
    <div className="ord-view">
      {stateOverride === "offline" || isOffline ? (
        <OrdersOfflineBanner lastUpdated={lastUpdated} lang={lang} />
      ) : null}

      {stateOverride === "error" || error ? (
        <OrdersErrorBanner lastUpdated={lastUpdated} lang={lang} onRetry={refresh} />
      ) : null}

      <div className="ord-table-layout">
        <div className="ord-table-main">
          {data && (
            <OrdersTable
              orders={data.orders}
              total={data.total}
              counts={data.counts}
              lateNew={data.late_new}
              openTotal={data.open_total}
              filters={filters}
              team={team}
              lang={lang}
              role={role}
              isDrawerOpen={Boolean(activeDrawerNum)}
              activeOrderNumber={activeDrawerNum || undefined}
              lastUpdated={lastUpdated}
              onFilterChange={updateFilters}
              onRowClick={(row) => updateFilters({ open: String(row.number) })}
            />
          )}
        </div>

        {/* Docked Drawer */}
        {activeDrawerNum && (
          <OrderDrawer
            orderDetail={detailData}
            open={Boolean(activeDrawerNum)}
            lang={lang}
            team={team}
            onClose={() => updateFilters({ open: undefined })}
            onOpenDetail={(num) => updateFilters({ open: undefined, detail: String(num) })}
            onOpenMarkPaid={(order) => setMarkPaidOrder(order)}
            onOpenCancel={(order) => setCancelOrder(order)}
            onStep={handleStep}
            onAssign={handleAssign}
          />
        )}
      </div>

      {/* Dialogs */}
      {markPaidOrder && (
        <MarkPaidDialog
          order={markPaidOrder}
          open={Boolean(markPaidOrder)}
          lang={lang}
          canRecordPayments={data?.access.can_record_payments ?? true}
          receiptOnPayment={data?.access.receipt_on_payment ?? true}
          onClose={() => {
            setMarkPaidOrder(null);
            updateFilters({ dialog: null });
          }}
          onSave={handleMarkPaid}
        />
      )}

      {cancelOrder && (
        <CancelDialog
          order={cancelOrder}
          open={Boolean(cancelOrder)}
          lang={lang}
          onClose={() => {
            setCancelOrder(null);
            updateFilters({ dialog: null });
          }}
          onConfirmCancel={handleCancel}
        />
      )}
    </div>
  );
}
