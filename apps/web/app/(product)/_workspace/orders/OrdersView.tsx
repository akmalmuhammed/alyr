"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsPhone, useToast } from "../../../_ui";
import { usePolling } from "../poll";
import { CancelDialog } from "./CancelDialog";
import { copy, type Lang } from "./copy";
import {
  type OrderFilters,
  effectiveFilters,
  filtersToQuery,
  queryToFilters,
  firstName,
  formatTime,
  methodWord,
  money,
  stillKey,
} from "./logic";
import { MarkPaidDialog } from "./MarkPaidDialog";
import { OrderDetail } from "./OrderDetail";
import { OrderDrawer } from "./OrderDrawer";
import { OrderDetailSkeleton, OrderMissing, OrdersErrorBanner, OrdersOfflineBanner } from "./OrdersStates";
import { OrdersTable } from "./OrdersTable";
import { ApiError, type OrdersApi, createFixtureApi, liveApi } from "./ordersApi";
import type { Margin, Order, OrderDetail as Detail, OrdersList, PayMethod, TeamMember } from "./types";
import "./orders.css";

export interface OrdersViewProps {
  /** What the address says (`?show=`, `?open=`, `?detail=`, `?dialog=`...): the starting point; the view keeps its own state after. */
  initialFilters?: OrderFilters;
  lang?: Lang;
  /** "owner", "admin" or "agent". The server enforces it; the screens hide what the role may not see. */
  role?: string;
  /** Read the real API (same origin) instead of the sample shop. */
  live?: boolean;
  /** Preview only: show one state of the screen (`loading`, `empty`, `filtered`, `error`, `offline`). */
  stateOverride?: string | null;
  /** Preview only: show the opened order as a cancelled one. */
  cancelledPreview?: boolean;
  /** Called with the new filters whenever the person changes them, so the page can keep the address in step. */
  onNavigate?: (filters: OrderFilters) => void;
}

type Dialog = { kind: "paid" | "cancel"; id: string };
const FILTERED_PREVIEW: OrderFilters = { mode: "delivery", payment: "paid", assigned: "u-yusuf" };

/** The words a refusal gets: the ones the product says for each code, else nothing (the caller picks the general line). */
function refusalText(error: unknown, lang: Lang, id: number): string | null {
  const t = copy(lang);
  if (!(error instanceof ApiError)) return null;
  if (error.status === 403) return t.errNotAllowed;
  if (error.status === 409) {
    return { already_paid: t.errAlreadyPaid(id, lang), order_cancelled: t.errCancelled, order_on_account: t.errOnAccount, order_is_test: t.errTest }[error.code] ?? null;
  }
  return null;
}

export function OrdersView({ initialFilters = {}, lang = "en", role = "owner", live = false, stateOverride = null, cancelledPreview = false, onNavigate }: OrdersViewProps) {
  const t = copy(lang);
  const toast = useToast();
  const phone = useIsPhone();
  const api: OrdersApi = useMemo(() => (live ? liveApi : createFixtureApi({ cancelledPreview, empty: stateOverride === "empty" })), [live, cancelledPreview, stateOverride]);

  const [filters, setFilters] = useState<OrderFilters>(() =>
    stateOverride === "filtered" && !Object.keys(initialFilters).length ? FILTERED_PREVIEW : initialFilters,
  );
  const [dialog, setDialog] = useState<Dialog | null>(() =>
    initialFilters.dialog ? { kind: initialFilters.dialog, id: initialFilters.for ?? initialFilters.detail ?? initialFilters.open ?? "" } : null,
  );
  const [data, setData] = useState<OrdersList | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [margins, setMargins] = useState<Record<string, Margin>>({});
  const [detail, setDetail] = useState<Detail | null>(null);
  const [missingId, setMissingId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [offlineNow, setOfflineNow] = useState(false);
  const [lastGood, setLastGood] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const now = data?.now ? Date.parse(data.now) : clock;
  const offline = stateOverride === "offline" || offlineNow;
  const manager = role !== "agent";

  /** A number in the address (the preview) or an id: the id of the order in the list, when it is there. */
  const resolve = useCallback(
    (param?: string): string | null => {
      if (!param) return null;
      const bare = param.replace(/^#/, "");
      return data?.orders.find((o) => o.id === param || String(o.number) === bare)?.id ?? param;
    },
    [data],
  );
  const detailParam = filters.detail ?? dialog?.id ?? filters.open;
  const detailId = resolve(detailParam);
  // Only the order that is asked for is ever drawn: a slower answer for another order is ignored.
  const current = detail && detail.order.id === detailId ? detail : null;
  const missing = missingId !== null && missingId === detailId;
  const drawerId = filters.detail ? null : resolve(filters.open);

  // ── reading ──
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  // The list is asked again when what it is asked for changes, not when a drawer opens: the query string stands for it.
  const query = filtersToQuery(filters).toString();
  const listFilters = useMemo(() => queryToFilters(Object.fromEntries(new URLSearchParams(query))), [query]);
  const loadList = useCallback(async () => {
    try {
      const res = await api.list(listFilters, role);
      setData(res);
      setClock(Date.now());
      setLastGood(formatTime(res.now ?? Date.now(), lang));
      setFailed(false);
      setOfflineNow(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === "offline") setOfflineNow(true);
      else setFailed(true);
    }
  }, [api, role, lang, listFilters]);

  const loadDetail = useCallback(async () => {
    if (!detailId) return;
    try {
      const res = await api.detail(detailId, role);
      setDetail(res);
      setMissingId(res === null ? detailId : null);
    } catch {
      // The list's own banner says when the connection is down; a detail that did not load keeps what it had.
    }
  }, [api, role, detailId]);

  const refresh = useCallback(async () => {
    await Promise.all([loadList(), loadDetail()]);
  }, [loadList, loadDetail]);

  // At once, when what is asked changes, then every 10 s while the page is on show. Never a skeleton after the first answer.
  usePolling(loadList, 10_000);
  usePolling(loadDetail, 10_000, Boolean(detailId));

  useEffect(() => {
    void api.members().then(setTeam, () => setTeam([]));
  }, [api]);
  useEffect(() => {
    if (!manager || !detailId) return;
    void api.margins(role).then(setMargins, () => setMargins({}));
  }, [api, role, manager, detailId]);

  // ── the address ──
  const change = useCallback(
    (next: OrderFilters) => {
      // The link's preset is spelled out into real filters, so changing one keeps the rest; a new filter starts at the first page.
      const merged: OrderFilters = { ...effectiveFilters(filtersRef.current), ...next, show: next.show ?? null };
      if (next.offset === undefined && next.limit === undefined) merged.offset = 0;
      filtersRef.current = merged;
      setFilters(merged);
      onNavigate?.(merged);
    },
    [onNavigate],
  );
  const open = (order: Order) => change(phone ? { detail: order.id, open: undefined } : { open: order.id, detail: undefined });
  const closeDialog = () => {
    setDialog(null);
    if (filtersRef.current.dialog) change({ dialog: null, for: undefined });
  };

  // ── doing ──
  const stepName = (n: number, to: "confirmed" | "ready" | "done", told: boolean, name: string) => t.toastStep(n, to, name, told, lang);

  const doStep = async (to: "confirmed" | "ready" | "done") => {
    if (!current || busy) return;
    const { order, customer } = current;
    setBusy(true);
    try {
      await api.setStatus(order.id, to);
      toast.push({ tone: "ok", text: stepName(order.number, to, !customer.opted_out, firstName(order.customer)) });
      await refresh();
    } catch (error) {
      const known = error instanceof ApiError && error.status === 422 && error.code === "backwards" ? t.errBackwards : null;
      toast.push({ tone: "bad", text: known ?? t.toastStepFailed(order.number, t[stillKey(order.status)], firstName(order.customer), lang) });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const doMarkPaid = async (method: PayMethod, reference: string, key: string) => {
    if (!current) return;
    const { order } = current;
    try {
      const res = await api.markPaid(order.id, { method, reference }, key);
      toast.push({
        tone: "ok",
        text: t.toastPaid(order.number, methodWord(res.payment.method, lang), money(res.payment.amount_minor, lang), lang),
        meta: res.receipt?.number ? t.receiptMeta(res.receipt.number) : undefined,
      });
      closeDialog();
      await refresh();
    } catch (error) {
      const text = refusalText(error, lang, order.number);
      if (!text) throw error; // the dialog stays open and says it did not save
      toast.push({ tone: "bad", text });
      closeDialog();
      await refresh();
    }
  };

  const doCancel = async (restock: boolean) => {
    if (!current) return;
    const { order } = current;
    const res = await api.setStatus(order.id, "cancelled", restock);
    toast.push({
      tone: "ok",
      text: t.toastCancelled(order.number, res.stock_returned ?? 0, res.refund_due ? money(order.total, lang) : null, Boolean(res.credit_reversed_text), lang),
    });
    closeDialog();
    await refresh();
  };

  const doAssign = async (userId: string | null) => {
    if (!current) return;
    try {
      await api.assign(current.order.id, userId);
    } catch {
      toast.push({ tone: "bad", text: t.assignFailed });
    }
    await refresh();
  };

  const copyText = (text: string, done: string) => {
    void navigator.clipboard?.writeText(text);
    toast.push({ tone: "ok", text: done });
  };
  const copyTrack = (url: string) => copyText(new URL(url, window.location.origin).href, t.linkCopied);
  const copyOrderLink = () => copyText(`${window.location.origin}/s/${data?.slug ?? ""}`, t.orderLinkCopied);

  // ── what to show ──
  const loading = stateOverride === "loading" || (data === null && !failed && !offlineNow);
  const notice = offline ? (
    <OrdersOfflineBanner lastUpdated={lastGood ?? formatTime(now, lang)} lang={lang} />
  ) : stateOverride === "error" || failed ? (
    <OrdersErrorBanner lastUpdated={lastGood} lang={lang} onRetry={() => void refresh()} />
  ) : null;

  const dialogs = dialog && current && current.order.id === resolve(dialog.id) ? (
    dialog.kind === "paid" ? (
      <MarkPaidDialog detail={current} lang={lang} onClose={closeDialog} onSave={doMarkPaid} />
    ) : (
      <CancelDialog detail={current} lang={lang} now={now} onClose={closeDialog} onConfirm={doCancel} />
    )
  ) : null;

  // the full page of one order
  if (filters.detail) {
    const rows = data?.orders ?? [];
    const at = rows.findIndex((o) => o.id === detailId);
    const go = (i: number) => rows[i] && change({ detail: rows[i].id });
    return (
      <div className="ord-view">
        {notice}
        {missing ? (
          <OrderMissing lang={lang} onBack={() => change({ detail: undefined })} />
        ) : current ? (
          <OrderDetail
            detail={current}
            lang={lang}
            team={team}
            now={now}
            margin={manager ? margins[current.order.id] ?? null : null}
            offline={offline}
            busy={busy}
            hasPrev={at > 0}
            hasNext={at >= 0 && at < rows.length - 1}
            onBack={() => change({ detail: undefined })}
            onPrev={() => go(at - 1)}
            onNext={() => go(at + 1)}
            onMarkPaid={() => setDialog({ kind: "paid", id: current.order.id })}
            onCancel={() => setDialog({ kind: "cancel", id: current.order.id })}
            onStep={doStep}
            onAssign={doAssign}
            onCopyLink={copyTrack}
          />
        ) : (
          <OrderDetailSkeleton lang={lang} />
        )}
        {dialogs}
      </div>
    );
  }

  // the list, with the order beside it
  return (
    <div className="ord-view">
      <div className={`ord-split${drawerId && !phone ? " ord-split--open" : ""}`}>
        <div className="ord-main">
          <OrdersTable
            data={stateOverride === "loading" ? null : data}
            filters={filters}
            team={team}
            lang={lang}
            role={role}
            now={now}
            lastUpdated={lastGood ?? formatTime(now, lang)}
            loading={loading}
            disabled={offline}
            activeId={drawerId}
            drawerOpen={Boolean(drawerId) && !phone}
            notice={notice}
            onFilters={change}
            onOpen={open}
            onCopyLink={copyOrderLink}
          />
        </div>
        {drawerId && !phone ? (
          <OrderDrawer
            detail={current && current.order.id === drawerId ? current : null}
            number={Number(filters.open?.replace(/^#/, "")) || data?.orders.find((o) => o.id === drawerId)?.number || 0}
            lang={lang}
            team={team}
            now={now}
            offline={offline}
            busy={busy}
            onClose={() => change({ open: undefined })}
            onOpenFull={() => change({ open: undefined, detail: drawerId })}
            onMarkPaid={() => setDialog({ kind: "paid", id: drawerId })}
            onCancel={() => setDialog({ kind: "cancel", id: drawerId })}
            onStep={doStep}
            onAssign={doAssign}
          />
        ) : null}
      </div>
      {dialogs}
    </div>
  );
}
