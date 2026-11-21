"use client";

import React from "react";
import {
  Button,
  Icon,
  IconButton,
  KV,
  KVList,
  PageTitle,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  SectionLabel,
  Status,
  Steps,
  Table,
  type TableColumn,
  Tag,
  Thumb,
  Timeline,
  initials,
  useIsPhone,
} from "../../../_ui";
import { copy, type Lang } from "./copy";
import {
  firstName,
  formatTime,
  itemName,
  itemQty,
  itemSub,
  money,
  nextStep,
  none,
  stepFacts,
  stepIndex,
  minutesSince,
  ago,
  placedParts,
} from "./logic";
import {
  ActivityTimeline,
  CustomerLine,
  HandOverRows,
  ItemRow,
  PayTag,
  PaymentRows,
  StatusTag,
  SumRows,
  stepNote,
  windowSentence,
} from "./OrderPanels";
import type { Margin, OrderDetail as Detail, OrderLine, TeamMember } from "./types";

export interface OrderDetailProps {
  detail: Detail;
  lang: Lang;
  team: TeamMember[];
  now: number;
  /** What the order earns, for owners and admins of a shop that keeps costs; absent otherwise (never drawn for an agent). */
  margin?: Margin | null;
  offline: boolean;
  busy: boolean;
  /** Previous and next order in the list the person came from, when there is one. */
  hasPrev: boolean;
  hasNext: boolean;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  onMarkPaid: () => void;
  onCancel: () => void;
  onStep: (to: "confirmed" | "ready" | "done") => void;
  onAssign: (userId: string | null) => void;
  onCopyLink: (url: string) => void;
}

/** The margin block: what the order earns, how it was counted, and a plain note when the costs are incomplete. */
function MarginBlock({ margin, lang }: { margin: Margin; lang: Lang }) {
  const t = copy(lang);
  return (
    <div className="ord-margin">
      <SectionLabel>{t.marginTitle}</SectionLabel>
      <div className="ord-margin-figure">
        <bdi className="ord-fig u-fig">{money(margin.amount, lang)}</bdi>
        <bdi className="ord-margin-pct u-mono">{margin.amount < 0 ? t.marginBelowCost : t.marginPct(margin.pct, money(margin.revenue, lang))}</bdi>
      </div>
      <p className="ord-rule u-mono">{t.marginRule(money(margin.revenue, lang), money(margin.cost, lang))}{margin.complete ? "" : ` ${t.marginIncomplete}`}</p>
    </div>
  );
}

/** The four steps of an order, each with when it happened and who took it, read from the timeline. */
function StepsRail({ detail, lang }: { detail: Detail; lang: Lang }) {
  const t = copy(lang);
  const { order } = detail;
  const facts = stepFacts(detail.activity, order.created_at);
  const current = stepIndex(order.status);
  const name = firstName(order.customer);
  const delivery = order.fulfilment?.mode === "delivery";
  const entries: Array<{ title: string; meta: string }> = [
    { title: t.stepPlaced, meta: formatTime(facts.placed.at, lang) },
    { title: t.stepConfirmed, meta: "" },
    { title: delivery ? t.stepReadyDelivery : t.stepReadyPickup, meta: "" },
    { title: t.stepDone, meta: "" },
  ];
  (["confirmed", "ready", "done"] as const).forEach((key, i) => {
    const f = facts[key];
    const idx = i + 1;
    entries[idx].meta =
      idx < current && f.at
        ? [formatTime(f.at, lang), f.by].filter(Boolean).join(" · ")
        : idx === current
          ? detail.customer.opted_out || order.status === "cancelled"
            ? t.stepNext
            : `${t.stepNext} · ${t.toldOnWhatsApp(name)}`
          : idx === 3
            ? t.stepWhenHandedOver
            : t.stepToDo;
  });
  return (
    <Panel className="ord-rail">
      <Steps
        label={t.stepsLabel}
        current={order.status === "cancelled" ? 0 : current}
        stateLabels={{ done: t.stepStateDone, current: t.stepStateCurrent, todo: t.stepStateTodo }}
        steps={entries.map((e) => (
          <span key={e.title} className="ord-step">
            <span className="ord-step-title">{e.title}</span>
            <span className="ord-step-meta u-mono">{e.meta}</span>
          </span>
        ))}
      />
    </Panel>
  );
}

export function OrderDetail(props: OrderDetailProps) {
  const { detail, lang, team, now, margin, offline, busy, hasPrev, hasNext, onBack, onPrev, onNext, onMarkPaid, onCancel, onStep, onAssign, onCopyLink } = props;
  const t = copy(lang);
  const phone = useIsPhone();
  const { order, lines, customer, payment, document, access } = detail;
  const step = nextStep(order.status);
  const canCancel = access.can_cancel && order.status !== "cancelled";
  const canMarkPaid = access.can_record_payments && order.payment === "unpaid" && order.status !== "cancelled" && !order.test;
  const delivery = order.fulfilment?.mode === "delivery";
  const placed = placedParts(order.created_at, lang, now);
  const late = order.status === "new" && minutesSince(order.created_at, now) > 15;
  const note = stepNote(detail, lang);
  const window = windowSentence(detail, lang, now);
  const staffFirst = order.assigned ? firstName(order.assigned.name) : "";

  const voltButton = step ? (
    offline ? (
      <Button kind="line" disabled size={phone ? "touch" : "md"}>{t[step.label]}</Button>
    ) : (
      <Button kind="volt" size={phone ? "touch" : "md"} className={phone ? "ord-grow" : undefined} loading={busy} loadingLabel={t.btnSaving} onClick={() => onStep(step.to)}>{t[step.label]}</Button>
    )
  ) : null;

  const itemColumns: TableColumn<OrderLine>[] = [
    {
      key: "item",
      header: t.colItem,
      cell: (l) => (
        <span className="ord-itemcell">
          <Thumb size={36} seed={itemName(l, lang)} initials={initials(itemName(l, lang))} />
          <span className="ord-item-text">
            <span className="ord-item-name">{itemName(l, lang)}</span>
            {itemSub(l, lang) ? <span className="ord-item-sub">{itemSub(l, lang)}</span> : null}
          </span>
        </span>
      ),
    },
    { key: "code", header: t.colCode, mono: true, width: "var(--ord-w-code)", cell: (l) => <span className="ord-faint">{l.code || none(lang)}</span> },
    { key: "qty", header: t.colQty, mono: true, align: "end", width: "var(--ord-w-qty)", cell: (l) => <bdi>{itemQty(l, lang)}</bdi> },
    { key: "price", header: t.colPrice, mono: lang === "en", align: "end", width: "var(--ord-w-money)", cell: (l) => <bdi>{money(l.unit_price, lang)}</bdi> },
    { key: "line", header: t.colLine, mono: lang === "en", align: "end", width: "var(--ord-w-money)", cell: (l) => <bdi>{money(l.line_total, lang)}</bdi> },
  ];

  const customerPanel = (
    <Panel>
      <PanelHeader title={t.customerPanel} level={2} />
      <PanelBody>
        <CustomerLine detail={detail} size={40} />
        {order.price_group ? (
          <KVList>
            <KV k={t.priceGroup}>{order.price_group.is_default ? t.priceGroupStandard : lang === "ar" && order.price_group.name_ar ? order.price_group.name_ar : order.price_group.name}</KV>
          </KVList>
        ) : null}
      </PanelBody>
      <div className="ord-panel-foot">
        <Button kind="line" size="sm" icon={<Icon name="chat" />} href={`/app/inbox?c=${encodeURIComponent(customer.id)}`}>{t.openConversation}</Button>
        {window ? <p className="ord-hint">{window}</p> : null}
      </div>
    </Panel>
  );

  const handOverPanel = (
    <Panel>
      <PanelHeader title={t.sectionHandOver} right={<Tag tone="n" dot={false}>{delivery ? t.modeDelivery : t.modePickup}</Tag>} />
      <PanelBody>
        <HandOverRows order={order} team={team} lang={lang} now={now} onAssign={onAssign} offline={offline} />
      </PanelBody>
    </Panel>
  );

  const documentPanel =
    access.can_manage && document ? (
      <Panel>
        <PanelHeader title={t.documentTitle} right={<a className="ord-link" href={`/app/documents?d=${encodeURIComponent(document.id)}`}>{t.openInDocuments}</a>} />
        <PanelBody>
          <div className="ord-doc">
            <span className="ord-doc-icon" aria-hidden="true"><Icon name="doc" size="lg" /></span>
            <div className="ord-doc-text">
              <span className="ord-doc-name">{(document.kind === "receipt" ? t.docKindReceipt : document.kind === "invoice" ? t.docKindInvoice : t.docKindQuote)} <bdi className="u-mono">{document.number}</bdi></span>
              <Status tone={document.status === "issued" ? "ok" : "n"}>{document.status === "issued" ? t.docIssued : document.status === "cancelled" ? t.docCancelled : t.docDraft}</Status>
            </div>
          </div>
        </PanelBody>
        <PanelFooter>{t.docImmutable}</PanelFooter>
      </Panel>
    ) : null;

  const trackPanel = (
    <Panel>
      <PanelHeader title={t.customerSeesTitle(firstName(order.customer))} right={<a className="ord-link" href={detail.track_url} target="_blank" rel="noopener noreferrer">{t.openPage}</a>} />
      <PanelBody>
        <p className="ord-text">{t.trackingBody(firstName(order.customer), staffFirst)}</p>
        <div className="ord-row">
          <Button kind="line" size="sm" icon={<Icon name="copy" />} onClick={() => onCopyLink(detail.track_url)}>{t.copyLink}</Button>
          <Status tone="n">{t.nowShowing(t.trackStage(order.status, delivery))}</Status>
        </div>
      </PanelBody>
    </Panel>
  );

  // ── the phone: one column, the actions fixed at the bottom ──
  if (phone) {
    return (
      <div className="ord-detail ord-detail--phone">
        <h1 className="u-sr">{t.orderTitle(order.number)}</h1>
        <Button kind="quiet" size="sm" icon={<Icon name="left" />} onClick={onBack}>{t.backToOrders}</Button>
        <div className="ord-phone-head">
          <StatusTag status={order.status} lang={lang} />
          <span className={`ord-sub${late ? " ord-late" : ""}`}>
            <bdi>{t.placedPhone(placed.time, placed.today ? ago(order.created_at, lang, now) : placed.sub)}</bdi>
          </span>
          <bdi className="ord-phone-total u-mono">{money(order.total, lang)}</bdi>
        </div>
        <Panel>
          <PanelBody>
            <div className="ord-customer-row">
              <CustomerLine detail={detail} size={40} />
              <Button kind="line" size="touch" icon={<Icon name="chat" />} href={`/app/inbox?c=${encodeURIComponent(customer.id)}`}><span className="u-sr">{t.openConversation}</span></Button>
            </div>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelBody>
            <ul className="ord-items">
              {lines.map((l, i) => (
                <ItemRow key={i} line={l} lang={lang} />
              ))}
            </ul>
            <SumRows order={order} lines={lines} lang={lang} />
          </PanelBody>
        </Panel>
        {margin ? (
          <Panel>
            <PanelBody>
              <MarginBlock margin={margin} lang={lang} />
            </PanelBody>
          </Panel>
        ) : null}
        <Panel>
          <PanelBody>
            <HandOverRows order={order} team={team} lang={lang} now={now} onAssign={onAssign} offline={offline} />
            <PaymentRows detail={detail} lang={lang} />
            {order.payment !== "paid" ? (
              <KVList>
                <KV k={t.sectionPayment}><PayTag order={order} lang={lang} /></KV>
              </KVList>
            ) : null}
          </PanelBody>
        </Panel>
        <SectionLabel>{t.sectionTimeline}</SectionLabel>
        <ActivityTimeline detail={detail} lang={lang} now={now} />
        {note ? <p className="ord-note">{note}</p> : null}
        <div className="ord-phone-actions">
          {canCancel ? <Button kind="bad" size="touch" disabled={offline} onClick={onCancel}>{t.btnCancelShort}</Button> : null}
          {canMarkPaid ? <Button kind="line" size="touch" disabled={offline} onClick={onMarkPaid}>{t.btnMarkPaid}</Button> : null}
          {voltButton}
        </div>
      </div>
    );
  }

  return (
    <div className="ord-detail">
      <div className="ord-back">
        <Button kind="quiet" size="sm" icon={<Icon name="left" />} onClick={onBack}>{t.backToOrders}</Button>
      </div>
      <PageTitle
        title={
          <span className="ord-title-row">
            <span>{t.orderTitle(order.number)}</span>
            <StatusTag status={order.status} lang={lang} />
            <PayTag order={order} lang={lang} />
          </span>
        }
        sub={t.placedAt(placed.time, delivery ? "delivery" : null, placed.today ? t.dayToday : placed.sub)}
        right={
          <div className="ord-title-actions">
            {hasPrev || hasNext ? (
              <>
                <IconButton icon={<Icon name="left" />} label={t.previousOrder} onClick={onPrev} disabled={!hasPrev} />
                <IconButton icon={<Icon name="right" />} label={t.nextOrder} onClick={onNext} disabled={!hasNext} />
              </>
            ) : null}
            {canCancel ? <Button kind="bad" disabled={offline} onClick={onCancel}>{t.btnCancelOrder}</Button> : null}
            {voltButton}
          </div>
        }
      />
      {order.status !== "cancelled" ? <StepsRail detail={detail} lang={lang} /> : null}
      <div className="ord-cols">
        <div className="ord-wide">
          <Panel clip>
            <PanelHeader title={t.sectionItems(lines.length)} sub={t.itemsInLines(lines.reduce((n, l) => n + l.quantity, 0), lines.length)} />
            <Table columns={itemColumns} rows={lines} rowKey={(l) => `${l.name}-${l.code ?? ""}-${l.unit_price}`} caption={t.colItems} cards="never" scrollX={false} />
            <div className="ord-itemsfoot">
              {margin ? <MarginBlock margin={margin} lang={lang} /> : <span />}
              <SumRows order={order} lines={lines} lang={lang} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title={t.sectionPayment} right={<PayTag order={order} lang={lang} />} />
            <PanelBody>
              <div className="ord-paygrid">
                <PaymentRows detail={detail} lang={lang} amount={money(payment.amount_minor ?? order.total, lang)} link={false} />
                {payment.link_sent_at ? (
                  <div className="ord-paylink">
                    <SectionLabel>{t.payLinkTitle}</SectionLabel>
                    <Timeline
                      items={[
                        ...(payment.paid_at ? [{ text: t.payLinkPaid, meta: formatTime(payment.paid_at, lang), tone: "ok" as const }] : []),
                        { text: t.payLinkSentTo(firstName(order.customer)), meta: formatTime(payment.link_sent_at, lang), tone: "n" as const },
                      ]}
                    />
                  </div>
                ) : null}
              </div>
              {canMarkPaid ? (
                <div className="ord-actions">
                  <Button kind="line" size="sm" disabled={offline} onClick={onMarkPaid}>{t.btnMarkPaid}</Button>
                </div>
              ) : null}
            </PanelBody>
            {order.status === "cancelled" && order.payment === "paid" && !order.test ? <PanelFooter>{t.refundDueNote(money(order.total, lang))}</PanelFooter> : null}
          </Panel>

          <Panel>
            <PanelHeader title={t.sectionTimeline} sub={t.timelineSteps(detail.activity.length)} right={<span className="ord-faint">{t.newestFirst}</span>} />
            <PanelBody>
              <ActivityTimeline detail={detail} lang={lang} now={now} />
            </PanelBody>
          </Panel>
        </div>
        <div className="ord-side">
          {customerPanel}
          {handOverPanel}
          {documentPanel}
          {trackPanel}
        </div>
      </div>
    </div>
  );
}
