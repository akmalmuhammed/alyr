"use client";

import React from "react";
import {
  Avatar,
  KV,
  KVList,
  Select,
  Status,
  Tag,
  Thumb,
  Timeline,
  initials,
} from "../../../_ui";
import { copy, type Lang } from "./copy";
import {
  dayWord,
  formatDate,
  formatPhone,
  formatTime,
  itemName,
  itemQty,
  itemSub,
  money,
  none,
  replyWindow,
  statusKey,
  statusTone,
  timelineEntries,
  firstName,
} from "./logic";
import type { Order, OrderDetail, OrderLine, TeamMember } from "./types";

/** The pieces the drawer, the detail page and the dialogs share. Words come from `copy.ts`; figures from the kit's formatters. */

export function StatusTag({ status, lang }: { status: string; lang: Lang }) {
  return <Tag tone={statusTone(status)}>{copy(lang)[statusKey(status)]}</Tag>;
}

export function PayStatus({ order, lang }: { order: Order; lang: Lang }) {
  const t = copy(lang);
  if (order.payment === "paid") return <Status tone="ok">{t.payPaid}</Status>;
  if (order.payment === "on_account") return <Status tone="n">{t.payOnAccount}</Status>;
  return <Status tone="warn">{order.pay_link === "open" ? t.payLinkOpen : t.payNotPaid}</Status>;
}

/** The word for how a customer pays an order: the Tag in the detail's payment panel. */
export function PayTag({ order, lang }: { order: Order; lang: Lang }) {
  const t = copy(lang);
  const tone = order.payment === "paid" ? "ok" : order.payment === "unpaid" ? "warn" : "n";
  return <Tag tone={tone}>{order.payment === "paid" ? t.payPaid : order.payment === "unpaid" ? t.payNotPaid : t.payOnAccount}</Tag>;
}

/** An empty value is the word "None", never a dash. */
export const orNone = (value: string | null | undefined, lang: Lang): string => (value && value.trim() ? value : none(lang));

// ── items ─────────────────────────────────────────────────

/** One item row: thumbnail, name, the variant and its code, the quantity at its price, and the line. */
export function ItemRow({ line, lang }: { line: OrderLine; lang: Lang }) {
  const t = copy(lang);
  const name = itemName(line, lang);
  const sub = [itemSub(line, lang), line.code ? t.codeOf(line.code) : ""].filter(Boolean).join(" · ");
  return (
    <li className="ord-item">
      <Thumb size={32} seed={name} initials={initials(name)} />
      <div className="ord-item-text">
        <span className="ord-item-name">{name}</span>
        {sub ? <span className="ord-item-sub">{sub}</span> : null}
      </div>
      <div className="ord-item-money u-mono">
        <span className="ord-item-each">
          <bdi>{t.qtyTimes(itemQty(line, lang), money(line.unit_price, lang))}</bdi>
        </span>
        <bdi>{money(line.line_total, lang)}</bdi>
      </div>
    </li>
  );
}

/** Items, each discount, the delivery fee or the pickup line, and the total. */
export function SumRows({ order, lines, lang }: { order: Order; lines: OrderLine[]; lang: Lang }) {
  const t = copy(lang);
  const subtotal = order.subtotal ?? lines.reduce((sum, l) => sum + l.line_total, 0);
  const fulfilment = order.fulfilment;
  const zone = fulfilment ? (lang === "ar" && fulfilment.zone_ar ? fulfilment.zone_ar : fulfilment.zone) : null;
  return (
    <div className="ord-sum">
      <div className="ord-sum-row">
        <span>{t.sumItems}</span>
        <bdi className="u-mono">{money(subtotal, lang)}</bdi>
      </div>
      {(order.discounts ?? []).map((d, i) => (
        <div className={`ord-sum-row${d.returned ? " ord-struck" : ""}`} key={i}>
          <span>{lang === "ar" && d.text_ar ? d.text_ar : d.text}</span>
          <bdi className="u-mono">{money(-(d.amount ?? 0), lang)}</bdi>
        </div>
      ))}
      {fulfilment?.mode === "delivery" ? (
        <div className="ord-sum-row">
          <span>{zone ? t.sumDeliveryTo(zone) : t.sumDelivery}</span>
          <bdi className="u-mono">{fulfilment.fee > 0 ? money(fulfilment.fee, lang) : t.free}</bdi>
        </div>
      ) : (
        <div className="ord-sum-row">
          <span>{t.sumPickup}</span>
          <span className="u-mono">{none(lang)}</span>
        </div>
      )}
      <div className="ord-sum-row ord-sum-total">
        <span>{t.sumTotal}</span>
        <bdi className="u-mono">{money(order.total, lang)}</bdi>
      </div>
    </div>
  );
}

// ── hand-over, payment, timeline ──────────────────────────

/** "Handled by": a select of the team (alphabetical, as the API sends them), or "Nobody yet". */
export function HandledBy({ order, team, lang, onAssign, disabled }: {
  order: Order;
  team: TeamMember[];
  lang: Lang;
  onAssign: (userId: string | null) => void;
  disabled?: boolean;
}) {
  const t = copy(lang);
  return (
    <Select aria-label={t.selectHandledBy} value={order.assigned?.id ?? ""} disabled={disabled} onChange={(e) => onAssign(e.target.value || null)}>
      <option value="">{t.nobodyYet}</option>
      {team.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </Select>
  );
}

/** "Today, Thu 12 Nov" or "Fri 13 Nov": the day a delivery is promised. */
export function dayLabel(value: string | null | undefined, lang: Lang, now: number): string {
  const date = formatDate(value ?? now, lang, { now });
  return dayWord(value, lang, now) === copy(lang).todayWord ? copy(lang).dayFull(date) : date;
}

/** Pickup or delivery rows, the person it is with, and the words the customer left. */
export function HandOverRows({ order, team, lang, now, onAssign, offline }: {
  order: Order;
  team: TeamMember[];
  lang: Lang;
  now: number;
  onAssign: (userId: string | null) => void;
  offline?: boolean;
}) {
  const t = copy(lang);
  const f = order.fulfilment;
  const zone = f ? (lang === "ar" && f.zone_ar ? f.zone_ar : f.zone) : null;
  return (
    <>
      <KVList>
        {f?.mode === "delivery" ? (
          <>
            <KV k={t.kvArea}>
              <bdi>{t.areaFee(zone ?? none(lang), f.fee > 0 ? money(f.fee, lang) : t.free)}</bdi>
            </KV>
            <KV k={t.kvDay}>{dayLabel(f.deliver_on, lang, now)}</KV>
          </>
        ) : (
          <KV k={t.kvPickup}>{t.atTheShop}</KV>
        )}
        <KV k={t.handledByLabel}>
          <HandledBy order={order} team={team} lang={lang} onAssign={onAssign} disabled={offline} />
        </KV>
      </KVList>
      {f?.mode === "delivery" && f.address ? (
        <div className="ord-field">
          <span className="u-label">{t.kvAddress}</span>
          <p className="ord-field-text" dir="auto">{f.address}</p>
        </div>
      ) : null}
      {f?.mode === "delivery" && f.note ? (
        <div className="ord-field">
          <span className="u-label">{t.kvNote}</span>
          <p className="ord-field-text" dir="auto">{f.note}</p>
        </div>
      ) : null}
    </>
  );
}

/** The amount (when asked), the pay link while it is open, and how and when a paid order was paid. */
export function PaymentRows({ detail, lang, amount, link = true }: { detail: OrderDetail; lang: Lang; amount?: string; link?: boolean }) {
  const t = copy(lang);
  const { payment } = detail;
  const method = payment.method === "cash" ? t.methodCash : payment.method === "bank_transfer" ? t.methodBankTransfer : payment.method === "card_terminal" ? t.methodCardTerminal : payment.method === "cheque" ? t.methodCheque : t.methodLink;
  return (
    <KVList>
      {amount ? <KV k={t.kvAmount} mono>{amount}</KV> : null}
      {link && payment.state === "unpaid" && payment.link === "open" ? (
        <KV k={t.kvPayLink}>
          <Status tone="warn">{t.payLinkOpenSent(payment.link_sent_at ? formatTime(payment.link_sent_at, lang) : none(lang))}</Status>
        </KV>
      ) : null}
      {payment.state === "paid" ? (
        <>
          <KV k={t.kvHow}>{method}</KV>
          <KV k={t.kvPaid} mono>{payment.paid_at ? formatTime(payment.paid_at, lang) : none(lang)}</KV>
          {payment.reference ? <KV k={t.kvReference} mono>{payment.reference}</KV> : null}
          {payment.recorded_by ? <KV k={t.kvRecordedBy}>{payment.recorded_by}</KV> : null}
        </>
      ) : null}
    </KVList>
  );
}

export function ActivityTimeline({ detail, lang, now }: { detail: OrderDetail; lang: Lang; now: number }) {
  const rows = timelineEntries(detail.activity, detail.order.customer, lang, now);
  return <Timeline items={rows.map((r) => ({ text: r.text, meta: r.meta, tone: r.tone }))} />;
}

/** "Confirming tells Aisha on WhatsApp: ..." for the step the order is about to take, or why nobody is told. */
export function stepNote(detail: OrderDetail, lang: Lang): string | null {
  const t = copy(lang);
  const { order, customer } = detail;
  const name = firstName(order.customer);
  if (order.status === "cancelled" || order.status === "done") return null;
  if (customer.opted_out) return t.noteOptedOut(name);
  if (order.status === "new") return t.noteConfirm(name, order.number, lang);
  if (order.status === "ready") return t.noteDone(name, order.number, lang);
  return order.fulfilment?.mode === "delivery" ? t.noteReadyDelivery(name, order.number, lang) : t.noteReadyPickup(name, order.number, lang);
}

/** The customer line of the drawer and the detail: who, their phone, and whether typed replies are still allowed. */
export function CustomerLine({ detail, size = 36 }: { detail: OrderDetail; size?: number }) {
  return (
    <div className="ord-person">
      <Avatar name={detail.customer.name} size={size} />
      <div className="ord-person-text">
        <span className="ord-person-name">{detail.customer.name}</span>
        <bdi className="ord-person-phone u-mono">{formatPhone(detail.customer.phone)}</bdi>
      </div>
    </div>
  );
}

/** "Typed replies allowed for 23 more hours", "The 24-hour window is closed", or nothing when they never wrote. */
export function windowSentence(detail: OrderDetail, lang: Lang, now: number): string | null {
  const t = copy(lang);
  const w = replyWindow(detail.customer.window_until, now);
  if (w.kind === "never") return null;
  if (w.kind === "closed") return t.replyWindowClosed;
  return w.hours < 1 ? t.replyWindowLess : t.replyWindowHours(w.hours);
}
