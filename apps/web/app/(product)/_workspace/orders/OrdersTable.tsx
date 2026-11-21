"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Banner,
  Button,
  Chip,
  Drawer,
  Icon,
  IconButton,
  PageTitle,
  Pager,
  Panel,
  PanelFooter,
  Search,
  Select,
  Table,
  type TableColumn,
  Tag,
  UTabs,
  pageRange,
  useIsPhone,
} from "../../../_ui";
import { copy, type Lang } from "./copy";
import {
  type OrderFilters,
  PAGE_SIZE,
  effectiveFilters,
  isLateNew,
  itemsSummary,
  money,
  none,
  orderNo,
  placedParts,
  dayWord,
} from "./logic";
import { PayStatus, StatusTag } from "./OrderPanels";
import { OrdersFilteredEmpty, OrdersFirstRun } from "./OrdersStates";
import type { Order, OrdersList, TeamMember } from "./types";

export interface OrdersTableProps {
  data: OrdersList | null;
  filters: OrderFilters;
  team: TeamMember[];
  lang: Lang;
  role: string;
  /** The instant "now" is for ages and "today": the server's clock when it sent one. */
  now: number;
  /** "09:31": the time of the last answer that worked. */
  lastUpdated: string;
  loading?: boolean;
  /** Every control is shown but cannot be used (offline, or while the first answer is on its way). */
  disabled?: boolean;
  /** The order open in the docked drawer: the table gives up its widest columns to make room. */
  activeId?: string | null;
  drawerOpen?: boolean;
  /** An error or offline banner: it takes the place of the page's one banner. */
  notice?: React.ReactNode;
  onFilters: (next: OrderFilters) => void;
  onOpen: (order: Order) => void;
  onCopyLink: () => void;
}

/** What `?show=` says in words (the labels the product's links have always used). */
const SHOW_WORD = { unconfirmed: "showUnconfirmed", ready: "showReady", unpaid: "showUnpaid", paid: "showPaid" } as const;
/** Back to Open with nothing narrowing it. */
const RESET: OrderFilters = { show: null, status: undefined, payment: undefined, mode: undefined, assigned: undefined, q: undefined, offset: 0, limit: undefined };

export function OrdersTable(props: OrdersTableProps) {
  const { data, filters, team, lang, role, now, lastUpdated, loading = false, disabled: disabledProp = false, activeId = null, drawerOpen = false, notice, onFilters, onOpen, onCopyLink } = props;
  const t = copy(lang);
  const phone = useIsPhone();
  // While the first answer is on its way every control is drawn and none can be used.
  const disabled = disabledProp || loading;
  const f = effectiveFilters(filters);
  const counts = data?.counts;
  const manager = role !== "agent";
  const tab = f.status || "open";
  const [sheet, setSheet] = useState(false);

  // The search sends its words 250 ms after the last key; typing never re-queries on every letter.
  const [typed, setTyped] = useState(filters.q ?? "");
  const [seen, setSeen] = useState(filters.q ?? "");
  if ((filters.q ?? "") !== seen) {
    setSeen(filters.q ?? "");
    setTyped(filters.q ?? "");
  }
  useEffect(() => {
    if (typed === (filters.q ?? "")) return;
    const timer = setTimeout(() => onFilters({ q: typed || undefined, offset: 0 }), 250);
    return () => clearTimeout(timer);
  }, [typed, filters.q, onFilters]);

  const rows = data?.orders ?? [];
  const showHandOver = rows.some((o) => o.fulfilment) && !drawerOpen;

  const columns: TableColumn<Order>[] = useMemo(() => {
    const itemsLine = (o: Order, extra?: boolean) => {
      const s = itemsSummary(o.items, lang);
      return (
        <div className="ord-lines" title={s.full}>
          <span className="ord-line">{s.line1}</span>
          {s.line2 && !extra ? <span className="ord-line ord-line--rest">{s.line2}</span> : null}
        </div>
      );
    };
    const cols: TableColumn<Order>[] = [
      { key: "order", header: t.colOrder, mono: true, strong: true, width: "var(--ord-w-order)", phone: "kicker", cell: (o) => <bdi className="ord-nowrap">{orderNo(o.number)}</bdi> },
      {
        key: "placed",
        header: t.colPlaced,
        width: "var(--ord-w-placed)",
        phone: "kicker",
        phoneCell: (o) => {
          const p = placedParts(o.created_at, lang, now);
          const late = isLateNew(o.status, o.created_at, now);
          return (
            <span className={`ord-inline${late ? " ord-late" : ""}`}>
              <bdi className="u-mono">{p.time}</bdi> · <bdi>{p.sub}</bdi>
            </span>
          );
        },
        cell: (o) => {
          const p = placedParts(o.created_at, lang, now);
          const late = isLateNew(o.status, o.created_at, now);
          return (
            <div className="ord-placed">
              <bdi className="u-mono ord-nowrap">{p.time}</bdi>
              <span className={`ord-sub${late ? " ord-late" : ""}`}>
                <bdi>{p.sub}</bdi>
              </span>
            </div>
          );
        },
      },
      {
        key: "customer",
        header: drawerOpen ? t.colCustomer + " · " + t.colItems : t.colCustomer,
        phone: "title",
        width: drawerOpen ? undefined : "var(--ord-w-customer)",
        cell: (o) => (
          <div className="ord-customer">
            <span className="ord-customer-name">{o.customer}</span>
            {o.test || o.table || (o.price_group && !o.price_group.is_default) ? (
              <span className="ord-tags">
                {o.test ? <Tag tone="n" dot={false}>{t.tagTestOrder}</Tag> : null}
                {o.table ? <Tag tone="n" dot={false}>{o.table}</Tag> : null}
                {o.price_group && !o.price_group.is_default ? <Tag tone="n" dot={false}>{lang === "ar" && o.price_group.name_ar ? o.price_group.name_ar : o.price_group.name}</Tag> : null}
              </span>
            ) : null}
            {drawerOpen ? itemsLine(o, true) : null}
          </div>
        ),
      },
    ];
    if (!drawerOpen) cols.push({ key: "items", header: t.colItems, phone: "body", cell: (o) => itemsLine(o) });
    else cols.push({ key: "items", header: t.colItems, phone: "body", showOn: "cards", cell: (o) => <span className="ord-wrap">{itemsSummary(o.items, lang).full}</span> });
    if (showHandOver) {
      cols.push({
        key: "handover",
        header: t.colHandOver,
        width: "var(--ord-w-handover)",
        phone: "foot",
        phoneCell: (o) => {
          const fl = o.fulfilment;
          if (!fl) return null;
          const zone = lang === "ar" && fl.zone_ar ? fl.zone_ar : fl.zone;
          const day = dayWord(fl.deliver_on, lang, now);
          return <span className="ord-sub">{fl.mode === "delivery" ? t.modeDelivery : t.modePickup} · {fl.mode === "delivery" && zone ? `${zone} · ${day}` : day}</span>;
        },
        cell: (o) => {
          const fl = o.fulfilment;
          if (!fl) return <span className="ord-sub">{none(lang)}</span>;
          const zone = lang === "ar" && fl.zone_ar ? fl.zone_ar : fl.zone;
          const day = dayWord(fl.deliver_on, lang, now);
          return (
            <div className="ord-handover">
              <span>{fl.mode === "delivery" ? t.modeDelivery : t.modePickup}</span>
              <span className="ord-sub">{fl.mode === "delivery" && zone ? `${zone} · ${day}` : day}</span>
            </div>
          );
        },
      });
    }
    cols.push({ key: "payment", header: t.colPayment, width: "var(--ord-w-payment)", phone: "foot-end", cell: (o) => <PayStatus order={o} lang={lang} /> });
    if (!drawerOpen) {
      cols.push({
        key: "assigned",
        header: t.colHandledBy,
        width: "var(--ord-w-by)",
        cell: (o) =>
          o.assigned ? (
            <span className="ord-by">
              <Avatar name={o.assigned.name} size={20} />
              <span>{o.assigned.name.split(" ")[0]}</span>
            </span>
          ) : (
            <span className="ord-faint">{t.nobodyAssigned}</span>
          ),
      });
    }
    cols.push(
      { key: "status", header: t.colStatus, width: "var(--ord-w-status)", phone: "tag", cell: (o) => <StatusTag status={o.status} lang={lang} /> },
      { key: "total", header: t.colTotal, mono: lang === "en", align: "end", width: "var(--ord-w-total)", phone: "amount", cell: (o) => <bdi className="ord-nowrap">{money(o.total, lang)}</bdi> },
    );
    return cols;
  }, [t, lang, now, drawerOpen, showHandOver]);

  // The banner: the link the person came by, else the orders nobody has confirmed for too long.
  const late = data?.late_new;
  let banner: React.ReactNode = notice ?? null;
  if (notice) {
    // an error or offline notice is the page's one banner
  } else if (filters.show) {
    banner = (
      <Banner tone="n" action={<Button kind="quiet" size="sm" onClick={() => onFilters(RESET)}>{t.showAll}</Button>}>
        {t[SHOW_WORD[filters.show]]}
      </Banner>
    );
  } else if (late && late.count > 0) {
    const list = t.joinList(late.items.map((i) => t.lateEntry(i.number, i.minutes, lang)));
    banner = (
      <Banner tone="warn" action={<Button kind="quiet" size="sm" onClick={() => onFilters({ status: "new", offset: 0 })}>{t.showThem}</Button>}>
        {t.lateOrders(late.count, list)}
      </Banner>
    );
  }

  const tabItems = [
    { id: "open", label: t.tabOpen, count: counts?.open },
    { id: "new", label: t.tabNew, count: counts?.new },
    { id: "confirmed", label: t.tabConfirmed, count: counts?.confirmed },
    { id: "ready", label: t.tabReady, count: counts?.ready },
    { id: "done", label: t.tabDone, count: counts?.done },
    { id: "cancelled", label: t.tabCancelled, count: counts?.cancelled },
    { id: "all", label: t.tabAll, count: counts?.all },
  ];

  const mode = f.mode || "all";
  const showModes = (counts?.pickup ?? 0) + (counts?.delivery ?? 0) > 0;
  const total = data?.total ?? 0;
  const offset = filters.offset ?? 0;
  const limit = f.limit ?? PAGE_SIZE;
  const range = pageRange(Math.floor(offset / PAGE_SIZE) + 1, PAGE_SIZE, total);
  const sortWord = f.sort === "oldest" ? t.sortOldest : t.sortNewest;
  const filtering = Boolean(f.q || (f.payment && f.payment !== "all") || (f.mode && f.mode !== "all") || (f.assigned && f.assigned !== "all"));

  const selects = (variant: "filter" | "form") => (
    <>
      <Select variant={variant} label={t.paymentLabel} value={f.payment || "all"} disabled={disabled} onChange={(e) => onFilters({ payment: e.target.value, offset: 0 })}>
        <option value="all">{t.paymentAny}</option>
        <option value="paid">{t.paymentPaid}</option>
        <option value="unpaid">{t.paymentNotPaid}</option>
        <option value="on_account">{t.paymentOnAccount}</option>
      </Select>
      <Select variant={variant} label={t.handledByLabel} value={f.assigned || "all"} disabled={disabled} onChange={(e) => onFilters({ assigned: e.target.value, offset: 0 })}>
        <option value="all">{t.handledByAnyone}</option>
        <option value="none">{t.handledByNobody}</option>
        {team.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </Select>
    </>
  );

  // First run: no orders at all, in any tab.
  if (!loading && counts && counts.all === 0) {
    return (
      <div className="ord-page">
        <PageTitle title={t.title} />
        <OrdersFirstRun lang={lang} onCopyLink={onCopyLink} />
      </div>
    );
  }

  return (
    <div className="ord-page">
      <PageTitle title={t.title} sub={counts ? t.openOrders(counts.open) : t.loadingOrders} />
      {banner}

      {phone ? (
        <div className="ord-phonebar">
          <div className="ord-phonebar-search">
            <Search value={typed} onChange={setTyped} label={t.searchLabel} placeholder={t.searchPlaceholder} clearLabel={t.clearSearch} disabled={disabled} />
            <IconButton icon={<Icon name="filter" />} label={t.filtersButton} onClick={() => setSheet(true)} disabled={disabled} />
          </div>
          <div className="ord-chiprow" role="group" aria-label={t.tabsLabel}>
            {tabItems.slice(0, 4).map((i) => (
              <Chip key={i.id} on={tab === i.id} count={i.count} disabled={disabled} onClick={() => onFilters({ status: i.id, offset: 0 })}>{i.label}</Chip>
            ))}
          </div>
        </div>
      ) : (
        <div className="ord-toolbar">
          <UTabs items={tabItems} value={tab} label={t.tabsLabel} onChange={(id) => !disabled && onFilters({ status: id, offset: 0 })} />
          <div className="ord-filters">
            <div className="ord-search">
              <Search value={typed} onChange={setTyped} label={t.searchLabel} placeholder={t.searchPlaceholder} clearLabel={t.clearSearch} disabled={disabled} />
            </div>
            {showModes ? (
              <div className="ord-chips" role="group" aria-label={t.handOverFilter}>
                <Chip on={mode === "all"} count={counts ? counts.pickup + counts.delivery : undefined} disabled={disabled} onClick={() => onFilters({ mode: "all", offset: 0 })}>{t.filterAll}</Chip>
                <Chip on={mode === "pickup"} count={counts?.pickup} disabled={disabled} onClick={() => onFilters({ mode: "pickup", offset: 0 })}>{t.filterPickup}</Chip>
                <Chip on={mode === "delivery"} count={counts?.delivery} disabled={disabled} onClick={() => onFilters({ mode: "delivery", offset: 0 })}>{t.filterDelivery}</Chip>
              </div>
            ) : null}
            {selects("filter")}
            <span className="ord-sort">
              <Button kind="quiet" size="sm" icon={<Icon name="sort" />} disabled={disabled} onClick={() => onFilters({ sort: f.sort === "oldest" ? "newest" : "oldest", offset: 0 })}>
                {sortWord}
              </Button>
            </span>
          </div>
        </div>
      )}

      <Panel clip className="ord-panel">
        <Table
          columns={columns}
          rows={rows}
          rowKey={(o) => o.id}
          caption={t.title}
          activeKey={activeId}
          onRowOpen={onOpen}
          loading={loading}
          loadingLabel={t.loadingOrders}
          empty={!loading && data ? <OrdersFilteredEmpty filters={filters} open={counts?.open ?? 0} team={team} lang={lang} onClear={() => onFilters(RESET)} /> : undefined}
          cards="auto"
          scrollX={false}
        />
        {loading || rows.length === 0 ? null : phone ? (
          <div className="ord-more">
            <p className="ord-more-text" aria-live="polite">{t.showingOf(rows.length, total)}</p>
            {rows.length < total ? (
              <Button kind="line" block size="touch" onClick={() => onFilters({ limit: Math.min(200, limit + PAGE_SIZE) })}>{t.showMore}</Button>
            ) : null}
          </div>
        ) : (
          <Pager
            summary={
              <>
                <span className="ord-faint">{t.updatedAt(lastUpdated)}</span> · <bdi>{total === 0 ? t.pagerRange(0, 0, 0) : t.pagerRange(range.from, range.to, total)}</bdi>
              </>
            }
            previous={{ label: t.pagerPrevious, disabled: disabled || offset <= 0, onClick: () => onFilters({ offset: Math.max(0, offset - PAGE_SIZE) }) }}
            next={{ label: t.pagerNext, disabled: disabled || offset + PAGE_SIZE >= total, onClick: () => onFilters({ offset: offset + PAGE_SIZE }) }}
            navLabel={t.pagerLabel}
          />
        )}
        {!loading && !phone && tab === "open" && manager && data?.open_total !== undefined && !filtering ? (
          <PanelFooter>{t.openRuleFooter(money(data.open_total, lang))}</PanelFooter>
        ) : null}
        {!loading && !phone && (tab === "done" || tab === "cancelled") ? <PanelFooter>{t.past30Days}</PanelFooter> : null}
      </Panel>

      {phone ? (
        <Drawer open={sheet} onClose={() => setSheet(false)} title={t.filtersTitle} closeLabel={t.btnClose} footer={<Button kind="line" block size="touch" onClick={() => setSheet(false)}>{t.filtersDone}</Button>}>
          <div className="ord-sheet">
            <Select label={t.filtersShow} value={tab} onChange={(e) => onFilters({ status: e.target.value, offset: 0 })}>
              {tabItems.map((i) => (
                <option key={i.id} value={i.id}>{i.label}</option>
              ))}
            </Select>
            {selects("form")}
            {showModes ? (
              <Select label={t.handOverFilter} value={mode} onChange={(e) => onFilters({ mode: e.target.value, offset: 0 })}>
                <option value="all">{t.filterAll}</option>
                <option value="pickup">{t.filterPickup}</option>
                <option value="delivery">{t.filterDelivery}</option>
              </Select>
            ) : null}
            <Select label={t.sortLabel} value={f.sort || "newest"} onChange={(e) => onFilters({ sort: e.target.value as "newest" | "oldest", offset: 0 })}>
              <option value="newest">{t.sortNewest}</option>
              <option value="oldest">{t.sortOldest}</option>
            </Select>
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}
