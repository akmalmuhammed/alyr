"use client";

import React, { useState } from "react";
import {
  Avatar,
  Button,
  Drawer,
  KV,
  KVList,
  Section,
  Select,
  Tag,
  Thumb,
  Timeline,
  type TimelineItem,
} from "../../../_ui";
import { copy, type Lang } from "./copy";
import {
  formatAgeOrDate,
  formatPhone,
  formatTime,
  money,
  nextStep,
  timelineSentence,
} from "./logic";
import type { OrderDetailFixture } from "./fixtures";
import type { TeamMember } from "./ordersApi";

export interface OrderDrawerProps {
  orderDetail: OrderDetailFixture | null;
  open: boolean;
  lang: Lang;
  team: TeamMember[];
  onClose: () => void;
  onOpenDetail: (num: number) => void;
  onOpenMarkPaid: (order: OrderDetailFixture["order"]) => void;
  onOpenCancel: (order: OrderDetailFixture["order"]) => void;
  onStep: (orderId: string, nextStatus: string) => Promise<void>;
  onAssign: (orderId: string, userId: string | null) => Promise<void>;
}

export function OrderDrawer({
  orderDetail,
  open,
  lang,
  team,
  onClose,
  onOpenDetail,
  onOpenMarkPaid,
  onOpenCancel,
  onStep,
  onAssign,
}: OrderDrawerProps) {
  const t = copy(lang);
  const [submittingStep, setSubmittingStep] = useState(false);

  if (!open || !orderDetail) return null;

  const { order, lines, customer, payment, activity, access } = orderDetail;
  const firstName = customer.name.split(" ")[0];
  const step = nextStep(order.status);

  // Status tag tone
  const statusTone = order.status === "new"
    ? "ink"
    : order.status === "confirmed"
    ? "n"
    : order.status === "ready"
    ? "ok"
    : order.status === "done"
    ? "ok"
    : "n";

  const statusLabel = order.status === "new"
    ? t.stNew
    : order.status === "confirmed"
    ? t.stConfirmed
    : order.status === "ready"
    ? t.stReady
    : order.status === "done"
    ? t.stDone
    : t.stCancelled;

  const handleStepClick = async () => {
    if (!step || submittingStep) return;
    setSubmittingStep(true);
    try {
      await onStep(order.id, step.nextStatus);
    } finally {
      setSubmittingStep(false);
    }
  };

  // Timeline items
  const timelineItems: TimelineItem[] = [...activity].reverse().map((a, idx) => ({
    text: timelineSentence(a, customer.name, lang),
    meta: a.created_at ? formatTime(a.created_at) : "",
    tone: a.action === "paid" ? "ok" : a.action === "refund_due" || a.action === "late_payment" ? "warn" : idx === 0 ? "volt" : "n",
  }));

  // Note box sentence
  const noteSentence = order.status === "new"
    ? t.noteConfirming(firstName, order.number)
    : order.status === "ready"
    ? t.noteDone(firstName, order.number)
    : order.fulfilment?.mode === "delivery"
    ? t.noteReadyDelivery(firstName, order.number)
    : t.noteReadyPickup(firstName, order.number);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      mode="docked"
      title={`${t.drawerTitle(order.number)}`}
      closeLabel={t.btnCancel}
      footer={
        <div className="ord-drawer-footer">
          {access.can_cancel && order.status !== "cancelled" ? (
            <Button kind="bad" size="sm" onClick={() => onOpenCancel(order)}>
              {t.btnCancelOrder}
            </Button>
          ) : (
            <div />
          )}

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Button kind="line" size="sm" onClick={() => onOpenDetail(order.number)}>
              {t.openFullPage}
            </Button>
            {step && (
              <Button kind="volt" size="sm" disabled={submittingStep} onClick={handleStepClick}>
                {submittingStep ? t.btnSaving : lang === "ar" ? step.labelAr : step.labelEn}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="ord-drawer-body">
        {/* Header meta */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Tag tone={statusTone}>{statusLabel}</Tag>
          <span className="ord-cell-age ord-cell-mono">
            {formatAgeOrDate(order.created_at, lang)}
          </span>
        </div>

        {/* 1. Customer row */}
        <div className="ord-drawer-customer">
          <div className="ord-customer-info">
            <Avatar name={customer.name} size={36} />
            <div>
              <div style={{ fontWeight: 500 }}>{customer.name}</div>
              <div className="ord-customer-phone">{formatPhone(customer.phone)}</div>
            </div>
          </div>
          <Button
            kind="line"
            size="sm"
            href={`/app/inbox?c=${customer.id}`}
          >
            {t.conversationBtn}
          </Button>
        </div>

        {/* 2. Items Section */}
        <Section label={t.sectionItems(lines.length)}>
          <div className="ord-items-list">
            {lines.map((it, idx) => {
              const name = lang === "ar" && it.name_ar ? it.name_ar : it.name;
              const variant = lang === "ar" && it.variant_ar ? it.variant_ar : it.variant;
              const code = it.sku;
              return (
                <div key={idx} className="ord-item-row">
                  <div className="ord-item-meta">
                    <Thumb seed={name} initials={name.slice(0, 2)} size={32} />
                    <div className="ord-item-text">
                      <span className="ord-item-name">{name}</span>
                      <span className="ord-item-sub">
                        {variant ? `${variant} · ` : ""}
                        {code ? `${t.codeLabel} ${code}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="ord-item-price">
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginInlineEnd: "0.5rem" }}>
                      {it.quantity} × {it.price ? money(it.price, lang) : ""}
                    </span>
                    <strong>{it.line_total ? money(it.line_total, lang) : ""}</strong>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ord-sum-block">
            <div className="ord-sum-row">
              <span>{t.sumItems}</span>
              <span className="ord-cell-mono">{money(order.subtotal || order.total, lang)}</span>
            </div>
            {order.fulfilment?.mode === "delivery" ? (
              <div className="ord-sum-row">
                <span>{order.fulfilment.zone ? (lang === "ar" ? `التوصيل إلى ${order.fulfilment.zone}` : `Delivery to ${order.fulfilment.zone}`) : t.sumDelivery}</span>
                <span className="ord-cell-mono">
                  {order.fulfilment.fee > 0 ? money(order.fulfilment.fee, lang) : t.noFee}
                </span>
              </div>
            ) : (
              <div className="ord-sum-row">
                <span>{t.sumPickupFree}</span>
                <span className="ord-cell-mono">{t.noFee}</span>
              </div>
            )}
            <div className="ord-sum-row ord-sum-total">
              <span>{t.sumTotal}</span>
              <span className="ord-cell-mono">{money(order.total, lang)}</span>
            </div>
          </div>
        </Section>

        {/* 3. Hand-over Section */}
        <Section label={t.sectionHandOver}>
          <KVList>
            {order.fulfilment?.mode === "delivery" ? (
              <>
                <KV k={lang === "ar" ? "المنطقة" : "Area"}>
                  {`${order.fulfilment.zone || ""} · ${order.fulfilment.fee > 0 ? money(order.fulfilment.fee, lang) : t.noFee}`}
                </KV>
                {order.fulfilment.deliver_on && (
                  <KV k={lang === "ar" ? "اليوم" : "Day"}>{t.todayWord}</KV>
                )}
                {order.fulfilment.address && (
                  <KV k={lang === "ar" ? "العنوان" : "Address"}>{order.fulfilment.address}</KV>
                )}
                {order.fulfilment.note && (
                  <KV k={lang === "ar" ? "ملاحظة العميل" : "Note from customer"}>{order.fulfilment.note}</KV>
                )}
              </>
            ) : (
              <KV k={t.pickupAtShop}>{lang === "ar" ? "في المتجر" : "At the shop"}</KV>
            )}
            <KV k={t.handledByLabel}>
              <Select
                value={order.assigned?.id || ""}
                onChange={(e) => onAssign(order.id, e.target.value || null)}
              >
                <option value="">{t.nobodyYet}</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </KV>
          </KVList>
        </Section>

        {/* 4. Payment Section */}
        <Section label={t.sectionPayment}>
          <KVList>
            {payment.state === "unpaid" && payment.link === "open" ? (
              <KV k={lang === "ar" ? "رابط الدفع" : "Pay link"}>
                <span style={{ color: "var(--warn)" }}>
                  {lang === "ar" ? `مفتوح · أرسل ${payment.link_sent_at ? formatTime(payment.link_sent_at) : ""}، لم يُدفع بعد` : `Open · sent ${payment.link_sent_at ? formatTime(payment.link_sent_at) : ""}, not paid yet`}
                </span>
              </KV>
            ) : null}

            {payment.state === "paid" ? (
              <>
                <KV k={lang === "ar" ? "تاريخ الدفع" : "Paid"}>
                  {payment.paid_at ? formatTime(payment.paid_at) : t.payPaid}
                </KV>
                <KV k={lang === "ar" ? "طريقة الدفع" : "How"}>
                  {payment.method === "cash"
                    ? t.methodCash
                    : payment.method === "bank_transfer"
                    ? t.methodBankTransfer
                    : payment.method === "card_terminal"
                    ? t.methodCardTerminal
                    : payment.method === "cheque"
                    ? t.methodCheque
                    : lang === "ar" ? "رابط الدفع" : "Payment link"}
                </KV>
                {payment.reference && (
                  <KV k={lang === "ar" ? "المرجع" : "Reference"}>
                    <span className="ord-cell-mono">{payment.reference}</span>
                  </KV>
                )}
              </>
            ) : null}
          </KVList>

          {access.can_record_payments && payment.state === "unpaid" && order.status !== "cancelled" && !order.test && (
            <div style={{ marginTop: "0.5rem" }}>
              <Button kind="line" size="sm" onClick={() => onOpenMarkPaid(order)}>
                {t.btnMarkPaid}
              </Button>
            </div>
          )}
        </Section>

        {/* 5. Timeline Section */}
        <Section label={t.sectionTimeline}>
          <Timeline items={timelineItems} />
        </Section>

        {/* 6. Note Box */}
        {step && (
          <div className="ord-note-box">
            {noteSentence}
          </div>
        )}
      </div>
    </Drawer>
  );
}
