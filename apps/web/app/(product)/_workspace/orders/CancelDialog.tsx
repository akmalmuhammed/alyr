"use client";

import React, { useState } from "react";
import {
  Banner,
  Button,
  Check,
  KV,
  KVList,
  Modal,
} from "../../../_ui";
import { copy, type Lang } from "./copy";
import {
  cancelConsequences,
  formatTime,
  itemsSummary,
  money,
  orderNo,
} from "./logic";
import type { OrderDetailFixture, OrderRowFixture } from "./fixtures";

export interface CancelDialogProps {
  order: OrderRowFixture | OrderDetailFixture["order"];
  open: boolean;
  lang: Lang;
  onClose: () => void;
  onConfirmCancel: (restock: boolean) => Promise<void>;
}

export function CancelDialog({
  order,
  open,
  lang,
  onClose,
  onConfirmCancel,
}: CancelDialogProps) {
  const t = copy(lang);
  const consequences = cancelConsequences(order);
  const [restock, setRestock] = useState(consequences.restockDefault);
  const [cancelling, setCancelling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) return null;

  const items = itemsSummary(order.items || [], lang);
  const firstName = order.customer.split(" ")[0];

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    setErrorMsg(null);
    try {
      await onConfirmCancel(restock);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t.toastSaveFailed(order.number, order.status, firstName);
      setErrorMsg(msg);
    } finally {
      setCancelling(false);
    }
  };

  const refundDueAmt = consequences.refundDue > 0 ? money(consequences.refundDue, lang) : "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.cancelTitle(order.number)}
      closeLabel={t.btnCancel}
      role="alertdialog"
      dismissOnScrim={false}
      size="default"
    >
      <div className="ord-drawer-body">
        {/* Order summary tile */}
        <div className="ord-note-box" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 500, color: "var(--text)" }}>{order.customer}</div>
            <div className="ord-item-sub">
              {orderNo(order.number)} · {items.line1}
            </div>
          </div>
          <div className="ord-cell-mono" style={{ fontSize: "1rem", color: "var(--text)" }}>
            {money(order.total, lang)}
          </div>
        </div>

        {/* Restock checkbox */}
        <div>
          <Check
            checked={restock}
            onChange={(e) => setRestock(e.target.checked)}
          >
            {t.checkRestock}
          </Check>
          <div className="ord-item-sub" style={{ marginInlineStart: "1.75rem", marginTop: "0.25rem" }}>
            {t.checkRestockSub(items.full || items.line1)}
          </div>
        </div>

        {/* What happens KV panel */}
        <div style={{ background: "var(--surface-subtle)", padding: "0.75rem", borderRadius: "var(--radius-sm, 0.375rem)" }}>
          <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            {t.whatHappensHeading}
          </div>
          <KVList>
            <KV k={t.whStock}>
              {restock ? t.whStockBack(consequences.restockCount) : t.whStockStays}
            </KV>
            <KV k={t.whRefundDue}>
              {consequences.refundDue > 0 ? refundDueAmt : t.whNone}
            </KV>
            <KV k={t.whCredit}>
              {consequences.isCreditReversal ? t.whCreditReversed : t.whCreditNone}
            </KV>
            {consequences.cancelsDocument && order.document && (
              <KV k={t.documentTitle}>
                {t.whDocCreditNote(order.document.number)}
              </KV>
            )}
          </KVList>
        </div>

        {/* Refund banner if money moves */}
        {consequences.refundDue > 0 && (
          <Banner tone="warn">
            {t.refundBanner(refundDueAmt)}
          </Banner>
        )}

        {/* Customer WhatsApp notice bubble */}
        <div>
          <div style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: "0.375rem" }}>
            {t.customerToldOnWa(firstName)}
          </div>
          <div className="ord-wa-box">
            <div className="ord-wa-bubble">
              <p className="ord-wa-text">{t.waMsgCancelled(order.number)}</p>
              <div className="ord-wa-sub">{t.sentAutomatically}</div>
            </div>
            <div className="ord-wa-policy">
              {t.windowOpenExplanation(formatTime(order.created_at))}
            </div>
          </div>
        </div>

        {errorMsg && (
          <div style={{ color: "var(--bad)", fontSize: "0.875rem" }}>
            {errorMsg}
          </div>
        )}

        {/* Footer actions with Keep order first and focused */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.5rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {t.cannotBeUndone}
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button kind="line" onClick={onClose} disabled={cancelling} autoFocus>
              {t.keepOrder}
            </Button>
            <Button kind="bad" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? t.btnSaving : t.btnCancelOrder}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
