"use client";

import React, { useState } from "react";
import {
  Avatar,
  Button,
  IconButton,
  KV,
  KVList,
  PageTitle,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  Select,
  Steps,
  Table,
  type TableColumn,
  Tag,
  Thumb,
  Timeline,
  type TimelineItem,
  UiIcon,
} from "../../../_ui";
import { copy, type Lang } from "./copy";
import {
  formatPhone,
  formatTime,
  money,
  nextStep,
  type OrderItemLine,
  orderNo,
  timelineSentence,
} from "./logic";
import type { OrderDetailFixture } from "./fixtures";
import type { TeamMember } from "./ordersApi";

export interface OrderDetailProps {
  orderDetail: OrderDetailFixture;
  lang: Lang;
  team: TeamMember[];
  role?: string;
  onBack: () => void;
  onPrevOrder?: () => void;
  onNextOrder?: () => void;
  onOpenCancel: () => void;
  onOpenMarkPaid: () => void;
  onStep: (orderId: string, nextStatus: string) => Promise<void>;
  onAssign: (orderId: string, userId: string | null) => Promise<void>;
  onCopyTrackLink: (url: string) => void;
}

export function OrderDetail({
  orderDetail,
  lang,
  team,
  role = "owner",
  onBack,
  onPrevOrder,
  onNextOrder,
  onOpenCancel,
  onOpenMarkPaid,
  onStep,
  onAssign,
  onCopyTrackLink,
}: OrderDetailProps) {
  const t = copy(lang);
  const [submittingStep, setSubmittingStep] = useState(false);

  const { order, lines, customer, payment, activity, document, track_url, access } = orderDetail;
  const isManager = role !== "agent" && access.can_manage;
  const firstName = customer.name.split(" ")[0];
  const step = nextStep(order.status);

  // Status tag tone & label
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

  const paymentTone = order.payment === "paid" ? "ok" : order.payment === "unpaid" ? "warn" : "n";
  const paymentLabel = order.payment === "paid" ? t.payPaid : order.payment === "unpaid" ? t.payNotPaid : t.payOnAccount;

  // Progression steps for Steps rail
  const stepIndex = order.status === "new" ? 0 : order.status === "confirmed" ? 1 : order.status === "ready" ? 2 : 3;
  const stepsList = [
    <span key="new">{t.stNew} · {formatTime(order.created_at)}</span>,
    <span key="confirmed">{t.stConfirmed} · {order.status !== "new" ? (lang === "ar" ? "09:20 · سلمى" : "09:20 · Salma") : (lang === "ar" ? "لاحقاً" : "To do")}</span>,
    <span key="ready">{order.fulfilment?.mode === "delivery" ? (lang === "ar" ? "جاهز للتوصيل" : "Ready for delivery") : (lang === "ar" ? "جاهز للاستلام" : "Ready for collection")} · {stepIndex >= 2 ? t.stReady : stepIndex === 1 ? (lang === "ar" ? "التالي" : "Next") : (lang === "ar" ? "لاحقاً" : "To do")}</span>,
    <span key="done">{t.stDone} · {order.status === "done" ? t.stDone : (lang === "ar" ? "عند التسليم" : "When handed over")}</span>,
  ];

  const handleStepClick = async () => {
    if (!step || submittingStep) return;
    setSubmittingStep(true);
    try {
      await onStep(order.id, step.nextStatus);
    } finally {
      setSubmittingStep(false);
    }
  };

  // Items table columns
  const itemColumns: TableColumn<OrderItemLine>[] = [
    {
      key: "item",
      header: t.colItems,
      cell: (it) => {
        const name = lang === "ar" && it.name_ar ? it.name_ar : it.name;
        const variant = lang === "ar" && it.variant_ar ? it.variant_ar : it.variant;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Thumb seed={name} initials={name.slice(0, 2)} size={36} />
            <div>
              <div style={{ fontWeight: 500 }}>{name}</div>
              {variant && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{variant}</div>}
            </div>
          </div>
        );
      },
    },
    {
      key: "code",
      header: t.codeLabel,
      cell: (it) => (
        <span className="ord-cell-mono" style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
          {it.sku || ""}
        </span>
      ),
    },
    {
      key: "qty",
      header: lang === "ar" ? "الكمية" : "Qty",
      align: "end",
      cell: (it) => <span className="ord-cell-mono">{it.quantity}</span>,
    },
    {
      key: "price",
      header: lang === "ar" ? "السعر" : "Price",
      align: "end",
      cell: (it) => (
        <span className="ord-cell-mono">{it.price ? money(it.price) : ""}</span>
      ),
    },
    {
      key: "line",
      header: lang === "ar" ? "المجموع" : "Line",
      align: "end",
      cell: (it) => (
        <span className="ord-cell-mono" style={{ fontWeight: 600 }}>
          {it.line_total ? money(it.line_total) : ""}
        </span>
      ),
    },
  ];

  // Activity timeline items
  const timelineItems: TimelineItem[] = [...activity].reverse().map((a, idx) => ({
    text: timelineSentence(a, customer.name, lang),
    meta: a.created_at ? formatTime(a.created_at) : "",
    tone: a.action === "paid" ? "ok" : a.action === "refund_due" || a.action === "late_payment" ? "warn" : idx === 0 ? "volt" : "n",
  }));

  return (
    <div className="ord-detail-view">
      {/* Back button & Title */}
      <div>
        <Button kind="quiet" size="sm" onClick={onBack} style={{ marginBlockEnd: "0.5rem" }}>
          ← {t.backToOrders}
        </Button>
        <PageTitle
          title={
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <span>{orderNo(order.number)}</span>
              <Tag tone={statusTone}>{statusLabel}</Tag>
              <Tag tone={paymentTone}>{paymentLabel}</Tag>
            </span>
          }
          sub={`${lang === "ar" ? `تم الطلب اليوم عند ${formatTime(order.created_at)}` : `Placed today at ${formatTime(order.created_at)}`}${
            order.fulfilment?.mode === "delivery" ? ` · ${lang === "ar" ? "للتوصيل اليوم" : "for delivery today"}` : ""
          }`}
          right={
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {onPrevOrder && (
                <IconButton
                  icon={<UiIcon name="start" />}
                  label={t.previousOrder}
                  onClick={onPrevOrder}
                />
              )}
              {onNextOrder && (
                <IconButton
                  icon={<UiIcon name="end" />}
                  label={t.nextOrder}
                  onClick={onNextOrder}
                />
              )}
              {isManager && order.status !== "cancelled" && (
                <Button kind="bad" size="sm" onClick={onOpenCancel}>
                  {t.btnCancelOrder}
                </Button>
              )}
              {step && (
                <Button kind="volt" size="sm" disabled={submittingStep} onClick={handleStepClick}>
                  {submittingStep ? t.btnSaving : lang === "ar" ? step.labelAr : step.labelEn}
                </Button>
              )}
            </div>
          }
        />
      </div>

      {/* Steps rail */}
      <Panel>
        <PanelBody>
          <Steps
            steps={stepsList}
            current={stepIndex}
          />
        </PanelBody>
      </Panel>

      {/* Grid: Wide column + 400px Side column */}
      <div className="ord-detail-grid">
        {/* WIDE COLUMN */}
        <div className="ord-detail-wide">
          {/* Items Panel */}
          <Panel>
            <PanelHeader title={t.sectionItems(lines.length)} />
            <Table
              columns={itemColumns}
              rows={lines}
              rowKey={(r) => r.name}
              caption={t.colItems}
              density="compact"
            />
            <PanelFooter>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%", flexWrap: "wrap", gap: "1rem" }}>
                {/* Left: Margin block (owners/admins only) */}
                {isManager ? (
                  <div className="ord-margin-block" style={{ maxWidth: "20rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>
                      {t.marginTitle}
                    </div>
                    <div className="ord-margin-val">QAR 78</div>
                    <div className="ord-margin-pct">46% of QAR 170</div>
                    <div className="ord-margin-rule">
                      {t.marginRule("QAR 170", "QAR 92")}
                    </div>
                  </div>
                ) : <div />}

                {/* Right: Sum block */}
                <div style={{ minWidth: "14rem" }}>
                  <div className="ord-sum-row">
                    <span>{t.sumItems}</span>
                    <span className="ord-cell-mono">{money(order.subtotal || order.total)}</span>
                  </div>
                  {order.fulfilment?.mode === "delivery" ? (
                    <div className="ord-sum-row">
                      <span>{order.fulfilment.zone ? (lang === "ar" ? `التوصيل إلى ${order.fulfilment.zone}` : `Delivery to ${order.fulfilment.zone}`) : t.sumDelivery}</span>
                      <span className="ord-cell-mono">
                        {order.fulfilment.fee > 0 ? money(order.fulfilment.fee) : t.noFee}
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
                    <span className="ord-cell-mono">{money(order.total)}</span>
                  </div>
                </div>
              </div>
            </PanelFooter>
          </Panel>

          {/* Payment Panel */}
          <Panel>
            <PanelHeader
              title={t.sectionPayment}
              right={<Tag tone={paymentTone}>{paymentLabel}</Tag>}
            />
            <PanelBody>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                {/* Left KV */}
                <KVList>
                  <KV k={lang === "ar" ? "المبلغ" : "Amount"}>
                    <span className="ord-cell-mono">{money(order.total)}</span>
                  </KV>
                  {payment.state === "paid" && (
                    <>
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
                      <KV k={lang === "ar" ? "تاريخ الدفع" : "Paid"}>
                        {payment.paid_at ? formatTime(payment.paid_at) : t.payPaid}
                      </KV>
                      {payment.reference && (
                        <KV k={lang === "ar" ? "المرجع" : "Reference"}>
                          <span className="ord-cell-mono">{payment.reference}</span>
                        </KV>
                      )}
                    </>
                  )}
                </KVList>

                {/* Right Pay Link timeline */}
                <div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                    {lang === "ar" ? "رابط الدفع" : "Payment link"}
                  </div>
                  {payment.link_sent_at ? (
                    <Timeline
                      items={[
                        {
                          text: lang === "ar" ? `أرسل الرابط إلى ${firstName} عبر واتساب` : `Link sent to ${firstName} on WhatsApp`,
                          meta: formatTime(payment.link_sent_at),
                          tone: "n",
                        },
                        ...(payment.paid_at
                          ? [
                              {
                                text: t.payPaid,
                                meta: formatTime(payment.paid_at),
                                tone: "ok" as const,
                              },
                            ]
                          : []),
                      ]}
                    />
                  ) : (
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      {lang === "ar" ? "لم يُرسل رابط دفع" : "No payment link sent"}
                    </div>
                  )}

                  {access.can_record_payments && payment.state === "unpaid" && order.status !== "cancelled" && (
                    <div style={{ marginTop: "1rem" }}>
                      <Button kind="line" size="sm" onClick={onOpenMarkPaid}>
                        {t.btnMarkPaid}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </PanelBody>
            {order.status === "cancelled" && payment.state === "paid" && (
              <PanelFooter>
                <div style={{ color: "var(--warn)", fontSize: "0.8125rem" }}>
                  {t.refundBanner(money(order.total))}
                </div>
              </PanelFooter>
            )}
          </Panel>

          {/* Timeline Panel */}
          <Panel>
            <PanelHeader title={`${t.sectionTimeline} · ${t.timelineSteps(activity.length)}`} />
            <PanelBody>
              <Timeline items={timelineItems} />
            </PanelBody>
          </Panel>
        </div>

        {/* SIDE COLUMN (400px) */}
        <div className="ord-detail-side">
          {/* Customer Card */}
          <Panel>
            <PanelHeader title={t.colCustomer} />
            <PanelBody>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                <Avatar name={customer.name} size={40} />
                <div>
                  <div style={{ fontWeight: 600 }}>{customer.name}</div>
                  <div className="ord-cell-mono" style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    {formatPhone(customer.phone)}
                  </div>
                </div>
              </div>
              <KVList>
                <KV k={lang === "ar" ? "مجموعة الأسعار" : "Price group"}>
                  {order.price_group?.name || (lang === "ar" ? "الافتراضية" : "Standard")}
                </KV>
              </KVList>
            </PanelBody>
            <PanelFooter>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
                <Button kind="line" size="sm" href={`/app/inbox?c=${customer.id}`}>
                  {t.openConversation}
                </Button>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {customer.window_until ? t.replyWindowHours(23) : t.replyWindowClosed}
                </div>
              </div>
            </PanelFooter>
          </Panel>

          {/* Hand-over Card */}
          <Panel>
            <PanelHeader
              title={t.sectionHandOver}
              right={<Tag tone="n">{order.fulfilment?.mode === "delivery" ? t.deliveryMode : t.pickupAtShop}</Tag>}
            />
            <PanelBody>
              <KVList>
                {order.fulfilment?.mode === "delivery" ? (
                  <>
                    <KV k={lang === "ar" ? "المنطقة" : "Area"}>
                      {`${order.fulfilment.zone || ""} · ${order.fulfilment.fee > 0 ? money(order.fulfilment.fee) : t.noFee}`}
                    </KV>
                    <KV k={lang === "ar" ? "اليوم" : "Day"}>{t.todayWord}</KV>
                    {order.fulfilment.address && (
                      <KV k={lang === "ar" ? "العنوان بالتفصيل" : "Address in words"}>
                        {order.fulfilment.address}
                      </KV>
                    )}
                    {order.fulfilment.note && (
                      <KV k={lang === "ar" ? "ملاحظة العميل" : "Note from customer"}>
                        {order.fulfilment.note}
                      </KV>
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
            </PanelBody>
          </Panel>

          {/* Document Card (managers only) */}
          {isManager && document && (
            <Panel>
              <PanelHeader
                title={t.documentTitle}
                right={
                  <Button kind="quiet" size="sm" href={`/app/documents?d=${document.id}`}>
                    {t.openInDocuments}
                  </Button>
                }
              />
              <PanelBody>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ fontWeight: 600 }}>
                    {document.kind === "receipt" ? "Receipt" : "Invoice"} {document.number}
                  </div>
                  <Tag tone={document.status === "issued" ? "ok" : "n"}>{document.status}</Tag>
                </div>
              </PanelBody>
              <PanelFooter>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {t.docImmutableNote}
                </span>
              </PanelFooter>
            </Panel>
          )}

          {/* What Customer Sees (Tracking page card) */}
          <Panel>
            <PanelHeader
              title={t.whatCustomerSeesTitle(firstName)}
              right={
                <a className="u-btn u-btn--quiet u-btn--sm" href={track_url} target="_blank" rel="noopener noreferrer">
                  {t.openPage}
                </a>
              }
            />
            <PanelBody>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.4, margin: "0 0 0.75rem 0" }}>
                {t.trackingDesc}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Button kind="line" size="sm" onClick={() => onCopyTrackLink(track_url)}>
                  {t.copyLink}
                </Button>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {t.nowShowing(statusLabel)}
                </span>
              </div>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}
