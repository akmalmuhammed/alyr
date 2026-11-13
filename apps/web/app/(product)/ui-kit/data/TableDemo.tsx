"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Banner, BulkBar, Button, DashedSlot, Empty, Icon, Panel, PanelFooter, PanelHeader, Pager, PhoneFrame, Search, Status, Table, Tabs, Tag, Chip,
  Drawer, KV, KVList, Menu, IconButton, sortRows, useToast,
} from "../../../_ui";
import type { MenuItem, SortState, TableColumn } from "../../../_ui";
import type { Words } from "./copy";
import { BY, Block, Cell, Num, ORDERS, STATUS_TONE, Two, payWord, statusWord } from "./shared";
import type { Lang, Order } from "./shared";

/** The orders table's columns, with where each goes on a phone's card. `narrow` drops two for a table beside a drawer. */
export function orderColumns(t: Words, lang: Lang, narrow = false): TableColumn<Order>[] {
  const i = lang === "ar" ? 1 : 0;
  const total = (o: Order) => <Num>{t.money(o.total)}</Num>;
  const all: (TableColumn<Order> | false)[] = [
    { key: "order", header: t.cols.order, width: "5.25rem", mono: true, strong: true, sortable: true, phone: "kicker", cell: (o) => `#${o.id}` },
    { key: "placed", header: t.cols.placed, width: "6.5rem", phone: "kicker", cell: (o) => <Two mono a={o.time} b={t.min(o.ago)} />, phoneCell: (o) => <Num>{o.time} · {t.min(o.ago)}</Num> },
    {
      key: "customer", header: t.cols.customer, sortable: true, phone: "title",
      cell: (o) => <Two a={<strong className="u-kd-name">{o.customer[i]}</strong>} b={o.items[i]} />,
      phoneCell: (o) => o.customer[i],
    },
    { key: "items", header: "", showOn: "cards", phone: "body", cell: (o) => o.items[i] },
    !narrow && { key: "handover", header: t.cols.handover, width: "6.5rem", phone: "foot", cell: (o) => <Two a={o.handover === "pickup" ? t.pickup : t.delivery} b={t.today} />, phoneCell: (o) => `${o.handover === "pickup" ? t.pickup : t.delivery} · ${t.today}` },
    { key: "payment", header: t.cols.payment, width: "8.5rem", phone: "foot-end", cell: (o) => <Status tone={o.pay === "paid" ? "ok" : o.pay === "account" ? "n" : "warn"}>{payWord(t, o.pay)}</Status> },
    !narrow && { key: "handled", header: t.cols.handled, width: "6rem", cell: (o) => (o.by ? (lang === "ar" ? BY[o.by] : o.by) : <span className="u-kd-muted">{t.nobody}</span>) },
    { key: "status", header: t.cols.status, width: "7.5rem", phone: "tag", cell: (o) => <Tag tone={STATUS_TONE[o.status]}>{statusWord(t, o.status)}</Tag> },
    { key: "total", header: t.cols.total, width: "6.5rem", align: "end", mono: true, sortable: true, phone: "amount", cell: total },
  ];
  return all.filter((c): c is TableColumn<Order> => Boolean(c));
}

function sortValue(o: Order, key: string) {
  return key === "order" ? o.id : key === "total" ? o.total : o.customer[0];
}

export function OrderBody({ t, lang, order }: { t: Words; lang: Lang; order: Order }) {
  const i = lang === "ar" ? 1 : 0;
  return (
    <>
      <div className="u-kd-who">
        <strong>{order.customer[i]}</strong>
        <span className="u-kd-muted"><bdi>{lang === "ar" ? "+974 5555 0112 · طلبها الثاني" : "+974 5555 0112 · her 2nd order"}</bdi></span>
      </div>
      <ul className="u-kd-lines">
        {order.items[i].split(/[,،] /).map((line) => <li key={line}>{line}</li>)}
      </ul>
      <KVList>
        <KV k={t.cols.total} mono>{t.money(order.total)}</KV>
        <KV k={t.cols.payment}>{payWord(t, order.pay)}</KV>
        <KV k={t.cols.handled}>{order.by ? (lang === "ar" ? BY[order.by] : order.by) : t.nobody}</KV>
      </KVList>
      <p className="u-kd-muted">{t.drawerBody}</p>
    </>
  );
}

export function TableDemo({ t, lang }: { t: Words; lang: Lang }) {
  const toast = useToast();
  const [sort, setSort] = useState<SortState>({ key: "order", dir: "desc" });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(["1037"]));
  const [active, setActive] = useState<string | null>(null);
  const [tab, setTab] = useState("open");
  const [query, setQuery] = useState("");
  const [loadingKey, setLoadingKey] = useState(0);

  const rows = useMemo(() => (sort ? sortRows(ORDERS, (o) => sortValue(o, sort.key), sort, lang) : ORDERS), [sort, lang]);
  const open = rows.find((o) => String(o.id) === active) ?? null;

  const actions = (o: Order): MenuItem[] => [
    { id: "open", label: t.actionOpen, icon: "doc", onSelect: () => setActive(String(o.id)) },
    { id: "confirm", label: t.actionConfirm, icon: "check", onSelect: () => toast.push({ text: t.tSaved, tone: "ok" }) },
    { id: "paid", label: t.actionMarkPaid, icon: "cash", disabled: o.pay === "paid", onSelect: () => toast.push({ text: t.tSaved, tone: "ok" }) },
    { type: "separator" },
    { id: "cancel", label: t.actionCancel, icon: "trash", tone: "bad", onSelect: () => toast.push({ text: t.tBad, tone: "bad" }) },
  ];

  const bulk = (
    <BulkBar
      label={t.bulkLabel}
      count={
        <>
          <span>{t.selectedCount(selected.size)}</span>
          <button type="button" className="u-link" onClick={() => setSelected(new Set(ORDERS.map((o) => String(o.id))))}>{t.selectEverything}</button>
          <button type="button" className="u-link" onClick={() => setSelected(new Set())}>{t.clear}</button>
        </>
      }
    >
      <Button size="sm">{t.confirmThem}</Button>
      <Button size="sm">{t.markPaidThem}</Button>
      <Button size="sm" icon={<Icon name="dl" />}>{t.exportThem}</Button>
    </BulkBar>
  );

  const common = {
    rowKey: (o: Order) => String(o.id),
    caption: t.caption,
    loadingLabel: t.loadingOrders,
  };

  const filters = (
    <div className="u-kd-filters">
      <Tabs
        label={t.caption}
        value={tab}
        onChange={setTab}
        items={[{ id: "open", label: t.caption, count: 14 }, { id: "new", label: t.statusNew, count: 3 }]}
      />
      <Search value={query} onChange={setQuery} label={t.openSearch} placeholder={t.openSearch} clearLabel={t.clear} className="u-kd-search" />
      <Chip on count={9}>{t.caption}</Chip>
    </div>
  );

  const phoneRows = ORDERS.slice(0, 4);

  return (
    <Block title={t.table} note={t.tableNote} id="table">
      <Cell cap={t.stateDefault} wide>
        <p className="u-kg-note">{t.sortHelp}</p>
        <div className="u-kd-split">
          <Panel clip className="u-kd-split-main">
            <PanelHeader title={t.caption} sub={t.selectedCount(selected.size)} right={filters} />
            <Table
              {...common}
              columns={orderColumns(t, lang, open !== null)}
              rows={rows}
              sort={sort}
              onSortChange={setSort}
              selection={{ selected, onChange: (next) => setSelected(next), selectAllLabel: t.selectAll, rowLabel: (o) => t.selectRow(o.id) }}
              activeKey={active}
              onRowOpen={(o) => setActive(String(o.id))}
              rowActions={{ label: t.rowActions, items: actions }}
              bulk={bulk}
              cards="never"
            />
            <Pager
              summary={t.pagerSummary(1, 9, 9)}
              navLabel={t.pagerLabel}
              previous={{ label: t.previousPage, disabled: true }}
              next={{ label: t.nextPage, disabled: true }}
            />
            <PanelFooter>{t.heatRule}</PanelFooter>
          </Panel>
          {open ? (
            <Drawer
              open
              mode="docked"
              title={`${lang === "ar" ? "الطلب" : "Order"} #${open.id}`}
              headerExtra={<Tag tone={STATUS_TONE[open.status]}>{statusWord(t, open.status)}</Tag>}
              subtitle={t.min(open.ago)}
              closeLabel={t.closeLabel}
              onClose={() => setActive(null)}
              footer={<><Button kind="bad" onClick={() => setActive(null)}>{t.drawerCancel}</Button><span className="u-push" /><Button kind="dark">{t.drawerConfirm}</Button></>}
            >
              <OrderBody t={t} lang={lang} order={open} />
            </Drawer>
          ) : null}
        </div>
        <p className="u-kg-note">{t.dockedNote}</p>
      </Cell>

      <div className="u-kg-grid u-kg-grid--wide">
        <Cell cap={t.stateLoading}>
          <Panel clip>
            <Table {...common} key={loadingKey} columns={orderColumns(t, lang, true)} rows={[]} loading skeletonRows={4} cards="never" density="compact" />
          </Panel>
          <Button size="xs" onClick={() => setLoadingKey((k) => k + 1)}>{t.errorAction}</Button>
        </Cell>

        <Cell cap={t.stateError}>
          <Banner tone="bad" action={<button type="button" className="u-link">{t.errorAction}</button>}>{t.errorText}</Banner>
          <Panel clip>
            <Table {...common} columns={orderColumns(t, lang, true)} rows={ORDERS.slice(0, 3)} cards="never" density="compact" />
          </Panel>
        </Cell>

        <Cell cap={t.stateEmpty}>
          <DashedSlot title={t.emptyTitle} action={<Button kind="volt">{t.emptyAction}</Button>}>{t.emptyText}</DashedSlot>
        </Cell>

        <Cell cap={t.stateFilter}>
          <Panel clip>
            <Table
              {...common}
              columns={orderColumns(t, lang, true)}
              rows={[]}
              cards="never"
              empty={<Empty title={t.filterTitle} action={<Button>{t.filterAction}</Button>}>{t.filterText}</Empty>}
            />
          </Panel>
        </Cell>
      </div>

      <Cell cap={t.stateOverflow} wide>
        <div className="u-kd-narrow">
          <Panel clip>
            <Table
              {...common}
              columns={orderColumns(t, lang)}
              rows={[
                { ...ORDERS[2], customer: [t.longName, t.longName], items: [t.longItems, t.longItems] },
                ORDERS[0],
              ]}
              scrollX
              cards="never"
            />
          </Panel>
        </div>
      </Cell>

      <Cell cap={t.statePhone}>
        <div className="u-kd-phones">
          <PhoneFrame caption={t.phoneCaption}>
            <div className="u-kd-phonebar">
              <Search value={query} onChange={setQuery} label={t.openSearch} placeholder={t.openSearch} clearLabel={t.clear} />
            </div>
            <Table
              {...common}
              columns={orderColumns(t, lang)}
              rows={phoneRows}
              onRowOpen={() => {}}
              rowActions={{ label: t.rowActions, items: actions }}
            />
          </PhoneFrame>
          <PhoneFrame caption={t.stateLoading}>
            <Table {...common} columns={orderColumns(t, lang)} rows={[]} loading skeletonRows={3} />
          </PhoneFrame>
        </div>
      </Cell>
    </Block>
  );
}

/** A row's "more" menu, on its own, for the menu section. */
export function RowMenu({ t, items }: { t: Words; items: MenuItem[] }): ReactNode {
  return (
    <Menu
      label={t.menuLabel}
      items={items}
      trigger={(p) => <IconButton {...p} icon={<Icon name="dots" />} label={t.menuButton} />}
    />
  );
}
