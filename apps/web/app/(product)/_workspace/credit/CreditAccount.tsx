"use client";

import { useMemo, useState } from "react";
import {
  Banner, Band, BandItem, Button, Icon, KV, KVList, Meter, PageTitle, Panel, PanelBody, PanelFooter, PanelHeader, Select,
  Table, Tabs, Tag, Timeline, useIsPhone, type TableColumn, type TimelineItem,
} from "../../../_ui";
import { counted, formatDate, formatTime, money, none } from "../../../_ui/format";
import { copy, type Lang } from "./copy";
import type { EarlierStatement, OpenOrder, PromiseRecord, ReminderEvent } from "./types";
import {
  csvOf, isWindowOpen, limitUse, openSales, paidSince, promiseState, reminderStages, reminderTier, signed,
  windowClosesAt, withBalance,
  type CreditAccountRow, type CreditEntry, type LedgerLine, type OpenSale,
} from "./logic";
import { AccountTags, AgeTag, Amount, Person } from "./parts";

export type AccountProps = {
  lang: Lang;
  row: CreditAccountRow;
  entries: CreditEntry[];
  /** When they started buying on account. */
  since: string | null;
  promise: PromiseRecord | null;
  reminders: ReminderEvent[] | null;
  /** A deposit that belongs to the customer and is not part of this account, or null. */
  separate: { amount: number; booking: number } | null;
  lastStatement: EarlierStatement | null;
  openOrders: OpenOrder[] | null;
  team: readonly { id: string; name: string }[];
  now: string;
  dialogOpen: boolean;
  offline: boolean;
  /** Owners and admins may assign a team member and change the limit. */
  canManage: boolean;
  /** Which handlers exist: a missing one hides its button (nothing is drawn that cannot be done). */
  can: { pay: boolean; limit: boolean; statement: boolean; assign: boolean };
  onBack: () => void;
  onPay: () => void;
  onLimit: () => void;
  onStatement: () => void;
  onAssign: (userId: string | null) => void;
};

type EntryTab = "all" | "sales" | "payments";

export function CreditAccount(p: AccountProps) {
  const { lang, row, entries, now, offline, canManage, can } = p;
  const t = copy(lang);
  const phone = useIsPhone();
  const [tab, setTab] = useState<EntryTab>("all");

  const open = useMemo(() => openSales(entries, now), [entries, now]);
  const lines = useMemo(() => withBalance(entries), [entries]);
  const use = limitUse(row.balance, row.creditLimit);
  const state = promiseState(row);
  const oldestSale = open[0] ?? null;
  const stages = reminderStages(row.balance > 0 ? row.oldestDays : 0, oldestSale?.at ?? null);
  const tier = reminderTier(row.oldestDays);
  const windowOpen = isWindowOpen(row.lastInboundAt, now);
  const closes = windowClosesAt(row.lastInboundAt);
  const mine = p.openOrders?.filter((o) => o.customerName === row.name) ?? null;
  const mineTotal = mine ? mine.reduce((s, o) => s + o.amount, 0) : null;
  const newest = [...lines].reverse();
  const shown = newest.filter((e) => (tab === "sales" ? e.kind === "sale" : tab === "payments" ? e.kind === "payment" : true));
  const counts = { all: lines.length, sales: lines.filter((e) => e.kind === "sale").length, payments: lines.filter((e) => e.kind === "payment").length };
  const paidAfterPromise = p.promise ? paidSince(entries, p.promise.madeAt) : 0;

  const stateTag = state === "passed" ? <Tag tone="warn">{t.tagPromisePassed}</Tag> : state === "open" ? <Tag tone="n">{t.tagPromiseOpen}</Tag> : null;

  const saleColumns: TableColumn<OpenSale>[] = [
    { key: "sale", header: t.colSale, strong: true, phone: "title",
      cell: (s) => <div className="crd-stack-2"><span>{s.ref}</span><span className="crd-quiet crd-small crd-clip">{s.note}</span></div>,
      phoneCell: (s) => s.ref },
    { key: "note", header: "", label: t.colSale, showOn: "cards", phone: "body", cell: (s) => <span className="crd-quiet crd-small">{s.note}</span> },
    { key: "put", header: t.colPutOn, width: "7rem", cell: (s) => (s.days === 0 ? `${t.today} ${formatTime(s.at, lang)}` : formatDate(s.at, lang)) },
    { key: "age", header: t.colAge, width: "6rem", phone: "tag", cell: (s) => (s.days === 0 ? <Tag tone="n" dot={false}>{t.today}</Tag> : <AgeTag days={s.days} lang={lang} />) },
    { key: "amount", header: t.colAmount, align: "end", mono: true, width: "7rem", cell: (s) => <Amount value={s.amount} lang={lang} /> },
    { key: "paid", header: t.colPaid, align: "end", mono: true, width: "7rem", cell: (s) => (s.paid > 0 ? <Amount value={s.paid} lang={lang} /> : <span className="crd-quiet">{t.nothing}</span>) },
    { key: "left", header: t.colStillOwed, align: "end", mono: true, strong: true, phone: "amount", width: "7rem", cell: (s) => <Amount value={s.remaining} lang={lang} /> },
  ];

  const entryColumns: TableColumn<LedgerLine>[] = [
    { key: "date", header: t.colDate, width: "8rem", phone: "kicker",
      cell: (e) => <div className="crd-stack-2"><span>{formatDate(e.at, lang)}</span><span className="u-mono crd-quiet crd-small">{formatTime(e.at, lang)}</span></div> },
    { key: "entry", header: t.colEntry, phone: "title",
      cell: (e) => (
        <div className="crd-stack-2">
          <span><strong>{t.entryKind[e.kind]}</strong> <span className="u-mono crd-ref"><bdi>{e.ref}</bdi></span></span>
          <span className="crd-quiet crd-small">{e.note}</span>
        </div>
      ),
      phoneCell: (e) => <span><strong>{t.entryKind[e.kind]}</strong> <span className="u-mono crd-ref"><bdi>{e.ref}</bdi></span></span> },
    { key: "note", header: "", label: t.colEntry, showOn: "cards", phone: "body", cell: (e) => <span className="crd-quiet crd-small">{e.note}</span> },
    { key: "by", header: t.colBy, width: "9rem", phone: "foot",
      cell: (e) => (e.method === "link" ? <span className="crd-quiet">{t.byProvider}</span> : <Person name={e.by} lang={lang} />) },
    { key: "put", header: t.colPutOn, align: "end", mono: true, width: "8rem",
      cell: (e) => (e.kind === "payment" ? null : <Amount value={signed(e)} lang={lang} />) },
    { key: "paid", header: t.colPaid, align: "end", mono: true, width: "8rem",
      cell: (e) => (e.kind === "payment" ? <Amount value={e.amount} lang={lang} /> : null) },
    { key: "after", header: t.colOwesAfter, align: "end", mono: true, strong: true, width: "8rem", phone: "amount", cell: (e) => <Amount value={e.owesAfter} lang={lang} /> },
  ];

  function exportCsv() {
    const head = [t.colDate, t.colEntry, t.colRef, t.colNote, t.colBy, t.colPutOn, t.colPaid, t.colOwesAfter];
    const body = lines.map((e) => [
      `${formatDate(e.at, lang)} ${formatTime(e.at, lang)}`, t.entryKind[e.kind], e.ref, e.note, e.by,
      e.kind === "payment" ? "" : String(signed(e) / 100), e.kind === "payment" ? String(e.amount / 100) : "", String(e.owesAfter / 100),
    ]);
    const blob = new Blob(["﻿", csvOf([head, ...body])], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${row.name.replace(/\s+/g, "-")}-entries.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pay = (
    <Button kind={p.dialogOpen || row.balance <= 0 ? "dark" : "volt"} disabled={offline || row.balance <= 0} onClick={p.onPay}>{t.btnRecordPayment}</Button>
  );

  const oldestParts = open.slice(0, 2).map((s) => (s.days === 0 ? t.sinceToday(money(s.remaining, lang)) : t.forDays(money(s.remaining, lang), counted(s.days, t.nounDay, lang))));

  return (
    <div className="crd-page">
      <nav className="crd-crumbs" aria-label={t.crumbsLabel}>
        <button type="button" className="crd-link" onClick={p.onBack}>{t.title}</button>
        <span aria-hidden="true" className="crd-quiet">/</span>
        <bdi aria-current="page">{row.name}</bdi>
      </nav>

      <PageTitle
        title={<span className="crd-title-line"><bdi>{row.name}</bdi> {stateTag}<AccountTags row={row} lang={lang} /></span>}
        sub={t.accountSub(row.phone, p.since ? formatDate(p.since, lang, { year: "always" }) : null, row.assigned?.name ?? null)}
        right={
          <>
            {can.statement ? <Button kind="line" icon={<Icon name="doc" />} onClick={p.onStatement}>{t.btnStatement}</Button> : null}
            <Button kind="line" href="/app/orders">{t.btnRecordSale}</Button>
            {can.pay && !phone ? pay : null}
          </>
        }
      />

      {offline ? <Banner tone="warn">{t.offline}</Banner> : null}
      {p.separate ? (
        <Banner tone="warn" action={<Button kind="quiet" size="sm" href="/app/payments">{t.openInPayments}</Button>}>
          {t.separateDeposit(money(p.separate.amount, lang), p.separate.booking, row.name)}
        </Banner>
      ) : null}

      <Band aria-label={row.name}>
        <BandItem
          label={t.owes}
          value={<Amount value={row.balance} lang={lang} />}
          unit={counted(open.length, t.nounSale, lang)}
          sub={row.balance > 0 ? oldestParts.join(" · ") + (open.length > 2 ? ` · ${t.andMore(open.length - 2)}` : "") : t.owesNothing}
        />
        <BandItem
          label={t.creditLimit}
          value={use.hasLimit ? <Amount value={row.creditLimit ?? 0} lang={lang} /> : row.creditLimit === 0 ? t.noCredit : t.noLimitSet}
          unit={use.hasLimit ? t.percentUsed(use.percent) : undefined}
          sub={use.hasLimit ? (use.over ? t.overBy(money(row.balance - (row.creditLimit ?? 0), lang)) : t.leftBefore(money(use.left, lang))) : t.limitNoneHelp}
        />
        <BandItem
          label={t.oldestDebt}
          value={row.balance > 0 ? counted(row.oldestDays, t.nounDay, lang) : none(lang)}
          unit={oldestSale ? t.since(formatDate(oldestSale.at, lang)) : undefined}
          sub={oldestSale ? oldestSale.ref : undefined}
        />
        <BandItem
          label={t.promiseTo}
          tone={state === "passed" ? "warn" : "volt"}
          value={state === "passed" ? t.passed : state === "open" ? formatDate(row.promisedUntil, lang) : t.noPromise}
          unit={state === "passed" && p.promise ? formatDate(p.promise.until, lang) : undefined}
          sub={state === "passed" && p.promise
            ? t.promisedOnNothing(formatDate(p.promise.madeAt, lang), paidAfterPromise)
            : state === "open" ? t.promiseOpenSub : t.promiseNoneSub}
        />
      </Band>

      <div className="crd-two">
        <Panel clip>
          <PanelHeader title={t.notPaid} sub={t.notPaidSub(open.length)} />
          <Table
            caption={t.notPaid}
            density="compact"
            scrollX={false}
            rowKey={(s) => s.ref}
            rows={open}
            columns={saleColumns}
            empty={<p className="crd-empty-line">{t.owesNothing}</p>}
          />
          <div className="crd-total">
            <span>{t.owesTotal(row.name)}</span>
            <strong className="u-mono"><Amount value={row.balance} lang={lang} /></strong>
          </div>
          <PanelFooter>{t.ruleOldest}</PanelFooter>
        </Panel>

        <Panel clip>
          <PanelHeader
            title={t.creditLimit}
            right={canManage && can.limit ? <Button kind="quiet" size="sm" disabled={offline} onClick={p.onLimit}>{t.change}</Button> : undefined}
          />
          <PanelBody>
            <div className="crd-limit-fig">
              <span className="u-fig crd-limit-now"><Amount value={row.balance} lang={lang} /></span>
              {use.hasLimit ? <span className="u-mono crd-quiet">{t.ofLimit(money(row.creditLimit ?? 0, lang))}</span> : null}
            </div>
            {use.hasLimit ? <Meter size="md" value={Math.min(row.balance, row.creditLimit ?? 0)} max={row.creditLimit ?? 1} tone={use.over ? "bad" : "ink"} label={t.limitUsedLabel(row.name)} /> : <p className="crd-quiet">{t.limitNoneHelp}</p>}
          </PanelBody>
          <KVList className="crd-kv">
            {use.hasLimit ? <KV k={t.leftToUse} mono><Amount value={use.left} lang={lang} /></KV> : null}
            {mineTotal !== null ? <KV k={t.openOrdersOnAccount} mono>{mineTotal > 0 ? <Amount value={mineTotal} lang={lang} /> : t.noneWord}</KV> : null}
          </KVList>
          <PanelFooter>{t.ruleLimit}</PanelFooter>
        </Panel>
      </div>

      <div className="crd-three">
        <Panel clip>
          <PanelHeader title={t.promiseTitle} right={stateTag ?? undefined} />
          <KVList className="crd-kv">
            {p.promise ? (
              <>
                <KV k={t.promisedOn}>{formatDate(p.promise.madeAt, lang)} <bdi className="u-mono">{formatTime(p.promise.madeAt, lang)}</bdi></KV>
                <KV k={t.how}>{p.promise.via === "button" ? t.howButton : t.howStaff}</KV>
                <KV k={t.toPayBy}>{formatDate(p.promise.until, lang)}</KV>
                <KV k={t.paidSince}>{paidAfterPromise > 0 ? <Amount value={paidAfterPromise} lang={lang} /> : t.nothing}</KV>
              </>
            ) : (
              <KV k={t.promiseTitle}>{state === "open" ? formatDate(row.promisedUntil, lang) : t.noPromise}</KV>
            )}
          </KVList>
          {canManage && can.limit ? (
            <PanelBody className="crd-actions"><Button kind="line" size="sm" disabled={offline} onClick={p.onLimit}>{t.setNewDate}</Button></PanelBody>
          ) : null}
          <PanelFooter>{t.rulePromise}</PanelFooter>
        </Panel>

        <Panel clip>
          <PanelHeader title={t.remindersTitle} sub={row.remindersSent !== null ? t.sent(row.remindersSent) : undefined} />
          <ol className="crd-stages" aria-label={t.stagesLabel}>
            {stages.map((s) => (
              <li key={s.tone} className={s.current ? "crd-stage crd-stage-on" : "crd-stage"} aria-current={s.current ? "step" : undefined}>
                <span className="crd-stage-name">{t.tone[s.tone]}</span>
                <span className="crd-quiet crd-small">{t.stageRange(s.from, s.to)}</span>
                <span className="u-mono crd-small">
                  {s.current ? t.stageNow(row.oldestDays) : s.startsAt ? t.stageFrom(formatDate(s.startsAt, lang)) : ""}
                </span>
              </li>
            ))}
          </ol>
          {p.reminders && p.reminders.length > 0 ? (
            <PanelBody>
              <Timeline items={p.reminders.map((r): TimelineItem => ({
                key: r.id,
                tone: r.kind === "promise" ? "warn" : "n",
                text: r.kind === "promise" ? t.eventPromise : t.eventReminder(t.tone[r.tone], money(r.amount, lang), r.readAt ? formatTime(r.readAt, lang) : null),
                meta: r.kind === "promise"
                  ? `${formatDate(r.at, lang)} ${formatTime(r.at, lang)} · ${t.promiseUntil(formatDate(r.until, lang))}`
                  : `${formatDate(r.at, lang)} ${formatTime(r.at, lang)} · ${t.sendRemindersBy(r.by)}`,
              }))} />
            </PanelBody>
          ) : null}
          <PanelFooter>{row.balance > 0 ? t.nextReminder(t.tone[tier], money(row.balance, lang)) : t.noReminderNeeded}</PanelFooter>
        </Panel>

        <Panel clip>
          <PanelHeader title={t.customerTitle} right={<Button kind="quiet" size="sm" href="/app/customers">{t.openProfile}</Button>} />
          <KVList className="crd-kv">
            <KV k={t.whatsapp} mono><bdi dir="ltr">{row.phone}</bdi></KV>
            <KV k={t.language}>{row.lang === "ar" ? t.langArabic : t.langEnglish}</KV>
            <KV k={t.messages}>{row.optedOut ? t.messagesStopped : t.messagesAllowed}</KV>
            <KV k={t.followsUp}>
              {canManage && can.assign ? (
                <Select
                  aria-label={t.followsUp}
                  value={row.assigned?.id ?? ""}
                  disabled={offline}
                  onChange={(e) => p.onAssign(e.target.value || null)}
                >
                  <option value="">{t.nobody2}</option>
                  {p.team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              ) : <Person name={row.assigned?.name} lang={lang} />}
            </KV>
            {p.lastStatement ? <KV k={t.lastStatement} mono>{formatDate(p.lastStatement.at, lang)} · <bdi>{p.lastStatement.number}</bdi></KV> : null}
          </KVList>
          <PanelBody className="crd-actions">
            <Button kind="line" size="sm" icon={<Icon name="chat" />} href="/app/inbox">{t.conversation}</Button>
            <span className="crd-quiet crd-small">
              {closes && windowOpen && row.lastInboundAt
                ? t.windowOpen(formatDate(row.lastInboundAt, lang), formatTime(row.lastInboundAt, lang), formatDate(closes, lang), formatTime(closes, lang))
                : t.windowClosed}
            </span>
          </PanelBody>
        </Panel>
      </div>

      <Panel clip>
        <PanelHeader
          title={t.entries}
          sub={t.newestFirst}
          right={
            <>
              <Tabs
                label={t.entriesTabs}
                value={tab}
                onChange={(id) => setTab(id as EntryTab)}
                items={[
                  { id: "all", label: t.tabAllEntries, count: counts.all },
                  { id: "sales", label: t.tabSales, count: counts.sales },
                  { id: "payments", label: t.tabPayments, count: counts.payments },
                ]}
              />
              {phone ? null : <Button kind="quiet" size="sm" icon={<Icon name="dl" />} onClick={exportCsv}>{t.export}</Button>}
            </>
          }
        />
        <Table
          caption={t.entries}
          scrollX={false}
          rowKey={(e) => e.id}
          rows={shown}
          columns={entryColumns}
          empty={<p className="crd-empty-line">{t.noEntries}</p>}
        />
        <PanelFooter right={phone ? <Button kind="quiet" size="sm" icon={<Icon name="dl" />} onClick={exportCsv}>{t.export}</Button> : undefined}>
          {t.ruleEntries}
        </PanelFooter>
      </Panel>

      {phone && can.pay ? (
        <div className="crd-sticky">
          <span className="crd-sticky-note">{t.writesDown}</span>
          {pay}
        </div>
      ) : null}
    </div>
  );
}

