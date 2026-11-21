"use client";

import React, { useId, useRef, useState } from "react";
import { Button, Field, FormSection, Icon, Input, Modal, Radio } from "../../../_ui";
import { copy, type Lang } from "./copy";
import { firstName, itemsSummary, money } from "./logic";
import type { OrderDetail, PayMethod } from "./types";

export interface MarkPaidDialogProps {
  detail: OrderDetail;
  lang: Lang;
  onClose: () => void;
  /** Records the payment. Throws when it could not be saved (the dialog then stays open and says so). */
  onSave: (method: PayMethod, reference: string, idempotencyKey: string) => Promise<void>;
}

/** One key for each time the dialog is opened: pressing Save twice records one payment, not two. */
function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `paid-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

/** "How did they pay?": four ways, a reference, and the two things that follow. The one Volt button saves a fact. */
export function MarkPaidDialog({ detail, lang, onClose, onSave }: MarkPaidDialogProps) {
  const t = copy(lang);
  const { order } = detail;
  const formId = useId();
  const key = useRef(newKey());
  const [method, setMethod] = useState<PayMethod>("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = firstName(order.customer);
  const delivery = order.fulfilment?.mode === "delivery";

  const ways: Array<{ id: PayMethod; label: string; hint: string }> = [
    { id: "cash", label: t.methodCash, hint: "" },
    { id: "bank_transfer", label: t.methodBankTransfer, hint: t.hintBankTransfer },
    { id: "card_terminal", label: t.methodCardTerminal, hint: t.hintCardTerminal },
    { id: "cheque", label: t.methodCheque, hint: t.hintCheque },
  ];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFailed(false);
    try {
      await onSave(method, reference.trim(), key.current);
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t.markPaidTitle(order.number)}
      closeLabel={t.btnClose}
      footer={
        <>
          <Button kind="quiet" disabled={saving} onClick={onClose}>{t.btnCancelShort}</Button>
          <Button kind="volt" type="submit" form={formId} loading={saving} loadingLabel={t.btnSaving}>{t.btnSaveAsPaid}</Button>
        </>
      }
    >
      <form id={formId} className="ord-dialog" onSubmit={submit}>
        <div className="ord-tile">
          <div className="ord-tile-text">
            <span className="ord-tile-name">{order.customer}</span>
            <span className="ord-tile-sub">{itemsSummary(order.items, lang).full} · {t.trackStage(order.status, delivery)}</span>
          </div>
          <bdi className="ord-tile-total u-mono">{money(order.total, lang)}</bdi>
        </div>

        <FormSection label={t.howDidTheyPay} className="ord-radios">
          {ways.map((w) => (
            <Radio key={w.id} name="method" value={w.id} checked={method === w.id} onChange={() => setMethod(w.id)}>
              <span className="ord-radio">
                <span>{w.label}</span>
                {w.hint ? <span className="ord-radio-hint">{w.hint}</span> : null}
              </span>
            </Radio>
          ))}
        </FormSection>

        <Field label={t.refOptional} error={failed ? t.saveFailed : undefined}>
          <Input value={reference} maxLength={80} dir="auto" placeholder={t.refPlaceholder} onChange={(e) => setReference(e.target.value)} />
        </Field>

        <ul className="ord-infos">
          {detail.access.receipt_on_payment ? (
            <li><Icon name="doc" /><span>{t.receiptNotice(name)}</span></li>
          ) : null}
          <li><Icon name="clock" /><span>{t.recordNotice}</span></li>
        </ul>
      </form>
    </Modal>
  );
}
