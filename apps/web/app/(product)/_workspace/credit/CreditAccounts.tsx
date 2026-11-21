"use client";

import { useMemo, useState } from "react";
import {
  Banner, Band, BandItem, Button, Chip, Empty, Meter, PageTitle, Pager, Panel, PanelFooter, PanelHeader, Search,
  Select, Table, Tag, UTabs, useIsPhone, pageRange,
  type MenuItem, type TableColumn,
} from "../../../_ui";
import { counted, formatDate, money, none } from "../../../_ui/format";
import { copy, type Lang } from "./copy";
import type { OpenOrder } from "./types";
import {
  BUCKET_KEYS, bucketShares, chipCounts, filterAccounts, limitUse, paymentsInMonth, planReminders, sortAccounts,
  summarise, tabCounts, dohaDay,
  type AccountChip, type AccountFilters, type AccountSort, type AccountTab, type CreditAccountRow, type Payment,
} from "./logic";
import { AccountTags, AgeTag, Amount, Person, PromiseCell } from "./parts";

export type AccountsProps = {
  lang: Lang;
  rows: CreditAccountRow[];
  /** Money taken this month, or null when the screen has no source for it (the block is then not drawn). */
  payments: Payment[] | null;
  /** Orders put on account and not handed over, or null (not drawn). */
  openOrders: OpenOrder[] | null;
  team: readonly { id: string; name: string }[];
  now: string;
  /** A dialog is open over the page: its own button is the screen's one main action. */
  dialogOpen: boolean;
  /** Offline: figures stay, actions that need the network are off. */
  offline: boolean;
  initialFilters?: Partial<AccountFilters>;
  onOpen: (id: string) => void;
  onRemind: () => void;
  onPay: (id: string | null) => void;
  onLimit: (id: string) => void;
};

const MIN_DAYS_DEFAULT = 30;

export function CreditAccounts(props: AccountsProps) {
  const { lang, rows, payments, openOrders, team, now, dialogOpen, offline, onOpen, onRemind, onPay, onLimit } = props;
  const t = copy(lang);
  const phone = useIsPhone();
  const [tab, setTab] = useState<AccountTab>(props.initialFilters?.tab ?? "owe");
  const [chip, setChip] = useState<AccountChip>(props.initialFilters?.chip ?? "all");
  const [search, setSearch] = useState(props.initialFilters?.search ?? "");
  const [assignee, setAssignee] = useState(props.initialFilters?.assignee ?? "");
  const [sort, setSort] = useState<AccountSort>("owes");

  const sum = useMemo(() => summarise(rows), [rows]);
  const tabs = useMemo(() => tabCounts(rows), [rows]);
  const chips = useMemo(() => chipCounts(rows, { tab, search, assignee }), [rows, tab, search, assignee]);
  const shown = useMemo(() => sortAccounts(filterAccounts(rows, { tab, chip, search, assignee }), sort), [rows, tab, chip, search, assignee, sort]);
  const plan = useMemo(() => planReminders(rows, MIN_DAYS_DEFAULT, now), [rows, now]);
  const withLimit = rows.filter((r) => (r.creditLimit ?? 0) > 0).length;
  const month = dohaDay(now).slice(0, 7);
  const monthPayments = payments ? paymentsInMonth(payments, month) : null;
  const paidTotal = monthPayments ? monthPayments.reduce((s, p) => s + p.amount, 0) : 0;
  const linkTotal = monthPayments ? monthPayments.filter((p) => p.method === "link").reduce((s, p) => s + p.amount, 0) : 0;
  const lastReminded = rows.reduce<string | null>(
    (latest, r) => (r.lastRemindedAt && (!latest || Date.parse(r.lastRemindedAt) > Date.parse(latest)) ? r.lastRemindedAt : latest), null);
  const shares = bucketShares(sum.buckets);
  const filtered = tab !== "owe" || chip !== "all" || search.trim() !== "" || assignee !== "";
  const range1 = pageRange(1, Math.max(shown.length, 1), shown.length);

  function clear() {
    setTab("owe"); setChip("all"); setSearch(""); setAssignee("");
  }

  const rowMenu = (row: CreditAccountRow): readonly MenuItem[] => [
    { id: "open", label: t.menuOpen, onSelect: () => onOpen(row.id) },
    { id: "pay", label: t.btnRecordPayment, disabled: offline || row.balance <= 0, onSelect: () => onPay(row.id) },
    { id: "limit", label: t.menuLimit, disabled: offline, onSelect: () => onLimit(row.id) },
  ];

  const columns: TableColumn<CreditAccountRow>[] = [
    {
      key: "customer", header: t.colCustomer, phone: "title",
      cell: (r) => (
        <div className="crd-who">
          <div className="crd-who-top">
            <button type="button" className="crd-link" onClick={() => onOpen(r.id)}>{<bdi>{r.name}</bdi>}</button>
            <AccountTags row={r} lang={lang} />
          </div>
          <span className="u-mono crd-phone"><bdi dir="ltr">{r.phone}</bdi></span>
        </div>
      ),
      phoneCell: (r) => <button type="button" className="crd-link" onClick={() => onOpen(r.id)}>{<bdi>{r.name}</bdi>}</button>,
    },
    { key: "tags", header: "", label: t.colTags, showOn: "cards", phone: "tag", cell: (r) => <AccountTags row={r} lang={lang} /> },
    { key: "owes", header: t.colOwes, align: "end", mono: true, strong: true, phone: "amount", width: "7rem",
      cell: (r) => <Amount value={r.balance} lang={lang} /> },
    {
      key: "limit", header: t.colLimit, phone: "body", width: "11rem",
      cell: (r) => {
        const use = limitUse(r.balance, r.creditLimit);
        if (!use.hasLimit) return <span className="crd-quiet">{r.creditLimit === 0 ? t.noCredit : none(lang)}</span>;
        return (
          <div className="crd-limit">
            <div className="crd-limit-line">
              <span className={use.over ? "crd-bad u-mono" : "u-mono"}><bdi>{use.percent}%</bdi></span>
              <span className="u-mono crd-quiet">{t.ofLimit(money(r.creditLimit ?? 0, lang))}</span>
            </div>
            <Meter value={Math.min(r.balance, r.creditLimit ?? 0)} max={r.creditLimit ?? 1} tone={use.over ? "bad" : "ink"} label={t.limitUsedLabel(r.name)} />
          </div>
        );
      },
    },
    { key: "age", header: t.colOldest, phone: "foot", width: "6.5rem", cell: (r) => <AgeTag days={r.balance > 0 ? r.oldestDays : 0} lang={lang} /> },
    { key: "promise", header: t.colPromise, phone: "foot", width: "9.5rem", cell: (r) => <PromiseCell row={r} lang={lang} /> },
    {
      key: "reminder", header: t.colReminder, width: "8.5rem",
      cell: (r) => r.lastRemindedAt ? (
        <div className="crd-stack-2">
          <span>{formatDate(r.lastRemindedAt, lang)}</span>
          {r.remindersSent !== null ? <span className="crd-quiet crd-small">{t.sent(r.remindersSent)}</span> : null}
        </div>
      ) : <span className="crd-quiet">{none(lang)}</span>,
    },
    { key: "who", header: t.colFollows, phone: "foot-end", width: "7rem", cell: (r) => <Person name={r.assigned?.name} lang={lang} /> },
  ];

  const mainAction = (
    <Button kind={dialogOpen ? "dark" : "volt"} disabled={offline} onClick={onRemind}>
      {t.btnSendReminders}
    </Button>
  );

  return (
    <div className="crd-page">
      <PageTitle
        title={t.title}
        sub={t.subtitle(withLimit, sum.owing)}
        right={
          <>
            <Button kind="line" href="/app/orders">{t.btnRecordSale}</Button>
            <Button kind="line" disabled={offline} onClick={() => onPay(null)}>{t.btnRecordPayment}</Button>
            {phone ? null : mainAction}
          </>
        }
      />

      {offline ? <Banner tone="warn">{t.offline}</Banner> : null}

      <Band className="crd-band" aria-label={t.bandLabel}>
        <BandItem label={t.owedToYou} value={<Amount value={sum.owed} lang={lang} />} unit={counted(sum.owing, t.nounCustomer, lang)}>
          <div className="crd-age" role="img" aria-label={t.ageSummary(BUCKET_KEYS.map((k) => `${t.bucket[k]}: ${money(sum.buckets[k], lang)}`).join(", "))}>
            <div className="crd-age-bar" aria-hidden="true">
              {BUCKET_KEYS.map((k) => shares[k] > 0 ? <span key={k} className={`crd-age-part crd-age-${k}`} style={{ inlineSize: `${shares[k]}%` }} /> : null)}
            </div>
            <dl className="crd-age-key">
              {BUCKET_KEYS.map((k) => (
                <div key={k} className="crd-age-item">
                  <dt><span className={`crd-age-dot crd-age-${k}`} aria-hidden="true" />{t.bucket[k]}</dt>
                  <dd className="u-mono"><Amount value={sum.buckets[k]} lang={lang} /></dd>
                </div>
              ))}
            </dl>
          </div>
        </BandItem>
        <BandItem
          label={t.over60}
          value={<Amount value={sum.over60.amount} lang={lang} />}
          sub={sum.over60.names.length === 0 ? t.over60None : t.over60Sub(sum.over60.names, sum.over60.withoutPromise)}
        />
        <BandItem
          label={t.promised}
          value={<Amount value={sum.promised.amount} lang={lang} />}
          sub={t.promisedSub(sum.promised.names, sum.promised.passed, sum.promised.names.length === 1 ? formatDate(rows.find((r) => r.name === sum.promised.names[0])?.promisedUntil ?? null, lang) : null)}
        />
        {monthPayments ? (
          <BandItem
            label={t.paidIn(t.months[Number(month.slice(5, 7)) - 1])}
            value={<Amount value={paidTotal} lang={lang} />}
            sub={t.paidInSub(monthPayments.length, linkTotal > 0 ? money(linkTotal, lang) : null)}
          />
        ) : null}
      </Band>

      <div className="crd-bar">
        <UTabs
          label={t.tabsLabel}
          value={tab}
          onChange={(id) => { setTab(id as AccountTab); setChip("all"); }}
          items={[
            { id: "owe", label: t.tabOwe, count: tabs.owe },
            { id: "nothing", label: t.tabNothing, count: tabs.nothing },
            { id: "all", label: t.tabAll, count: tabs.all },
          ]}
        />
      </div>

      <div className="crd-filters">
        <Search value={search} onChange={setSearch} label={t.searchLabel} placeholder={t.searchPlaceholder} clearLabel={t.clear} />
        <div className="crd-chips" role="group" aria-label={t.chipsLabel}>
          <Chip on={chip === "all"} count={chips.all} onClick={() => setChip("all")}>{t.chipAll}</Chip>
          <Chip on={chip === "over30"} count={chips.over30} onClick={() => setChip(chip === "over30" ? "all" : "over30")}>{t.chipOver30}</Chip>
          <Chip on={chip === "promised"} count={chips.promised} onClick={() => setChip(chip === "promised" ? "all" : "promised")}>{t.chipPromised}</Chip>
          <Chip on={chip === "passed"} count={chips.passed} onClick={() => setChip(chip === "passed" ? "all" : "passed")}>{t.chipPassed}</Chip>
          <Chip on={chip === "overLimit"} count={chips.overLimit} onClick={() => setChip(chip === "overLimit" ? "all" : "overLimit")}>{t.chipOverLimit}</Chip>
          <Chip on={chip === "stop"} count={chips.stop} onClick={() => setChip(chip === "stop" ? "all" : "stop")}>{t.chipStop}</Chip>
        </div>
        <div className="crd-selects">
          <Select variant="filter" label={t.followsUp} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{t.anyone}</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <Select variant="filter" label={t.sort} value={sort} onChange={(e) => setSort(e.target.value as AccountSort)}>
            <option value="owes">{t.sortOwes}</option>
            <option value="oldest">{t.sortOldest}</option>
            <option value="name">{t.sortName}</option>
          </Select>
        </div>
      </div>

      <Panel clip>
        <Table
          caption={t.tableCaption}
          columns={columns}
          rows={shown}
          rowKey={(r) => r.id}
          onRowOpen={(r) => onOpen(r.id)}
          rowActions={{ label: t.rowMenu, items: rowMenu }}
          scrollX={false}
          empty={
            <Empty level={2}
              title={t.noMatch}
              action={<Button kind="line" onClick={clear}>{t.clearFilters}</Button>}
            >
              {filtered ? t.noMatchHelp : t.nobody}
            </Empty>
          }
        />
        <Pager
          navLabel={t.pagerLabel}
          summary={t.pager(range1.from, range1.to, shown.length, plan.go.length, lastReminded ? formatDate(lastReminded, lang) : null)}
          previous={{ label: t.previous, disabled: true }}
          next={{ label: t.next, disabled: true }}
        />
        <PanelFooter>{t.ruleAccounts}</PanelFooter>
      </Panel>

      {openOrders || monthPayments ? (
        <div className="crd-pair">
          {openOrders ? (
            <Panel clip>
              <PanelHeader
                title={t.openOrdersTitle}
                sub={t.openOrdersSub(openOrders.length, money(openOrders.reduce((s, o) => s + o.amount, 0), lang))}
                right={<Button kind="quiet" href="/app/orders" size="sm">{t.openOrders}</Button>}
              />
              <Table
                caption={t.openOrdersTitle}
                density="compact"
                scrollX={false}
                rowKey={(o) => o.id}
                rows={openOrders}
                columns={[
                  { key: "no", header: t.colOrder, mono: true, phone: "kicker", width: "5rem", cell: (o) => <bdi>#{o.number}</bdi> },
                  { key: "who", header: t.colCustomer, strong: true, phone: "title", cell: (o) => <bdi>{o.customerName}</bdi> },
                  { key: "status", header: t.colStatus, phone: "tag", width: "7rem",
                    cell: (o) => <Tag tone={o.status === "ready" ? "ok" : o.status === "new" ? "warn" : "n"}>{t.orderStatus[o.status]}</Tag> },
                  { key: "with", header: t.colWithIt, phone: "body",
                    cell: (o) => <span className="crd-quiet">{t.withIt(money(o.owes + o.amount, lang), money(o.limit, lang))}</span> },
                  { key: "amount", header: t.colAmount, align: "end", mono: true, phone: "amount", width: "7rem", cell: (o) => <Amount value={o.amount} lang={lang} /> },
                ]}
              />
              <PanelFooter>{t.openOrdersRule}</PanelFooter>
            </Panel>
          ) : null}
          {monthPayments ? (
            <Panel clip>
              <PanelHeader title={t.paidIn(t.months[Number(month.slice(5, 7)) - 1])} sub={<Amount value={paidTotal} lang={lang} />} />
              <Table
                caption={t.paidIn(t.months[Number(month.slice(5, 7)) - 1])}
                density="compact"
                scrollX={false}
                rowKey={(p) => p.id}
                rows={[...monthPayments].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))}
                columns={[
                  { key: "date", header: t.colDate, mono: true, phone: "kicker", width: "7rem", cell: (p) => formatDate(p.at, lang) },
                  { key: "who", header: t.colCustomer, strong: true, phone: "title", cell: (p) => (
                    <div className="crd-stack-2"><bdi>{p.customerName}</bdi><span className="crd-quiet crd-small">{t.paidHow(p.method, p.by)}</span></div>
                  ) },
                  { key: "amount", header: t.colAmount, align: "end", mono: true, phone: "amount", width: "7rem", cell: (p) => <Amount value={p.amount} lang={lang} /> },
                ]}
              />
            </Panel>
          ) : null}
        </div>
      ) : null}

      {phone ? (
        <div className="crd-sticky">
          <span className="crd-sticky-note">{t.stickyNote(shown.length, rows.filter((r) => r.balance > 0).length, plan.go.length)}</span>
          {mainAction}
        </div>
      ) : null}
    </div>
  );
}

