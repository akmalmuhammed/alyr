"use client";

import React, { useState } from "react";
import {
  Button,
  Field,
  FormSection,
  Icon,
  Input,
  Modal,
  Radio,
} from "../../../_ui";
import { copy, type Lang } from "./copy";
import { itemsSummary, money } from "./logic";
import type { OrderDetailFixture, OrderRowFixture } from "./fixtures";

export interface MarkPaidDialogProps {
  order: OrderRowFixture | OrderDetailFixture["order"];
  open: boolean;
  lang: Lang;
  canRecordPayments: boolean;
  receiptOnPayment: boolean;
  onClose: () => void;
  onSave: (method: "cash" | "bank_transfer" | "card_terminal" | "cheque", reference: string) => Promise<void>;
}

export function MarkPaidDialog({
  order,
  open,
  lang,
  canRecordPayments,
  receiptOnPayment,
  onClose,
  onSave,
}: MarkPaidDialogProps) {
  const t = copy(lang);
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "card_terminal" | "cheque">("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open || !canRecordPayments) return null;

  const items = itemsSummary(order.items || [], lang);
  const stepLabel = order.status === "new"
    ? t.stNew
    : order.status === "confirmed"
    ? t.stConfirmed
    : order.status === "ready"
    ? t.stReady
    : t.stDone;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await onSave(method, reference);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t.toastSaveFailed(order.number, order.status, order.customer.split(" ")[0]);
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.markPaidTitle(order.number)}
      closeLabel={t.btnCancel}
      size="default"
    >
      <form onSubmit={handleSubmit} className="ord-drawer-body">
        {/* Order summary tile */}
        <div className="ord-note-box" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 500, color: "var(--text)" }}>{order.customer}</div>
            <div className="ord-item-sub">
              {items.line1} · {stepLabel}
            </div>
          </div>
          <div className="ord-cell-mono" style={{ fontSize: "1rem", color: "var(--text)" }}>
            {money(order.total, lang)}
          </div>
        </div>

        {/* Payment method selection */}
        <FormSection label={t.howDidTheyPay}>
          <Radio
            name="paymentMethod"
            value="cash"
            checked={method === "cash"}
            onChange={() => setMethod("cash")}
          >
            {t.methodCash}
          </Radio>
          <Radio
            name="paymentMethod"
            value="bank_transfer"
            checked={method === "bank_transfer"}
            onChange={() => setMethod("bank_transfer")}
          >
            <span>
              {t.methodBankTransfer} <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>({t.hintBankTransfer})</span>
            </span>
          </Radio>
          <Radio
            name="paymentMethod"
            value="card_terminal"
            checked={method === "card_terminal"}
            onChange={() => setMethod("card_terminal")}
          >
            <span>
              {t.methodCardTerminal} <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>({t.hintCardTerminal})</span>
            </span>
          </Radio>
          <Radio
            name="paymentMethod"
            value="cheque"
            checked={method === "cheque"}
            onChange={() => setMethod("cheque")}
          >
            <span>
              {t.methodCheque} <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>({t.hintCheque})</span>
            </span>
          </Radio>
        </FormSection>

        {/* Reference input */}
        <Field label={t.refOptional}>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={80}
            dir="auto"
            placeholder={
              method === "bank_transfer"
                ? t.hintBankTransfer
                : method === "card_terminal"
                ? t.hintCardTerminal
                : method === "cheque"
                ? t.hintCheque
                : t.refPlaceholder
            }
          />
        </Field>

        {/* Info notices */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {receiptOnPayment && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
              <Icon name="info" size="sm" />
              <span>{t.receiptNotice(order.customer.split(" ")[0])}</span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            <Icon name="clock" size="sm" />
            <span>{t.timelineNotice}</span>
          </div>
        </div>

        {errorMsg && (
          <div style={{ color: "var(--bad)", fontSize: "0.875rem" }}>
            {errorMsg}
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", paddingTop: "0.5rem" }}>
          <Button kind="quiet" type="button" onClick={onClose} disabled={saving}>
            {t.btnCancel}
          </Button>
          <Button kind="volt" type="submit" disabled={saving}>
            {saving ? t.btnSaving : t.btnSaveAsPaid}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
