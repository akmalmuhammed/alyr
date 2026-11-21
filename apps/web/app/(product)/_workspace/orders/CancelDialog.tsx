"use client";

import React, { useState } from "react";
import { Banner, Button, Check, KV, KVList, Modal, Panel, SectionLabel } from "../../../_ui";
import { copy, type Lang } from "./copy";
import {
  cancelFacts,
  dayWord,
  firstName,
  formatTime,
  itemName,
  itemQty,
  money,
  none,
  replyWindow,
  stepFacts,
} from "./logic";
import type { OrderDetail } from "./types";

export interface CancelDialogProps {
  detail: OrderDetail;
  lang: Lang;
  now: number;
  onClose: () => void;
  /** Cancels the order. Throws when it could not be saved (the dialog stays open and says so). */
  onConfirm: (restock: boolean) => Promise<void>;
}

/** What the order is in one muted line: how far it got, how it goes out, how it is paid; built only from stored facts. */
function tileLine(detail: OrderDetail, lang: Lang, now: number): string {
  const t = copy(lang);
  const { order, payment } = detail;
  const facts = stepFacts(detail.activity, order.created_at);
  const parts: string[] = [];
  if (order.status === "new") parts.push(t.cancelTilePlaced(formatTime(order.created_at, lang)));
  else {
    const f = order.status === "confirmed" ? facts.confirmed : order.status === "ready" ? facts.ready : facts.done;
    const at = f.at ? formatTime(f.at, lang) : formatTime(order.created_at, lang);
    parts.push(f.by ? t.cancelTileConfirmedBy(f.by, at) : t.cancelTileConfirmedAt(at));
  }
  const fl = order.fulfilment;
  if (fl) {
    const day = dayWord(fl.deliver_on, lang, now);
    const zone = lang === "ar" && fl.zone_ar ? fl.zone_ar : fl.zone;
    parts.push(fl.mode === "delivery" && zone ? t.cancelTileDelivery(zone, day) : t.cancelTilePickup(day));
  }
  parts.push(order.payment === "paid" ? (payment.method === "link" ? t.cancelTilePaidByLink : t.cancelTilePaid) : order.payment === "on_account" ? t.cancelTileOnAccount : t.cancelTileNotPaid);
  return parts.join(" · ");
}

/** The confirm in front of a cancel: what goes back in stock, what is owed, what the customer is told. The safe choice is first and focused. */
export function CancelDialog({ detail, lang, now, onClose, onConfirm }: CancelDialogProps) {
  const t = copy(lang);
  const { order, customer, lines } = detail;
  const facts = cancelFacts(order, lines);
  const [restock, setRestock] = useState(facts.restockDefault);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = firstName(order.customer);
  const refund = facts.refundDue > 0 ? money(facts.refundDue, lang) : null;
  const window = replyWindow(customer.window_until, now);
  const wrote = customer.window_until ? formatTime(Date.parse(customer.window_until) - 24 * 3_600_000, lang) : "";
  const backList = t.joinList(lines.map((l) => `${itemQty(l, lang)} × ${itemName(l, lang)}${l.variant ? ` ${lang === "ar" && l.variant_ar ? l.variant_ar : l.variant}` : ""}`));

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onConfirm(restock);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  // Who hears about it: nobody for a test order or a person who asked for no messages.
  const notice = order.test
    ? { send: false, line: t.testOrderNote }
    : customer.opted_out
      ? { send: false, line: t.optedOutNote(name) }
      : window.kind === "open"
        ? { send: true, line: t.windowOpenNote(name, wrote) }
        : window.kind === "closed"
          ? { send: true, line: t.windowClosedNote }
          : { send: true, line: t.noWindowNote(name) };

  return (
    <Modal
      open
      onClose={onClose}
      title={t.cancelTitle(order.number)}
      closeLabel={t.btnClose}
      role="alertdialog"
      dismissOnScrim={false}
      footerNote={t.cannotBeUndone}
      footer={
        <>
          <Button kind="line" autoFocus disabled={busy} onClick={onClose}>{t.keepOrder}</Button>
          <Button kind="bad" loading={busy} loadingLabel={t.btnSaving} onClick={submit}>{t.btnCancelOrder}</Button>
        </>
      }
    >
      <div className="ord-dialog">
        <div className="ord-tile">
          <div className="ord-tile-text">
            <span className="ord-tile-name">{order.customer}</span>
            <span className="ord-tile-sub">{tileLine(detail, lang, now)}</span>
          </div>
          <bdi className="ord-tile-total u-mono">{money(order.total, lang)}</bdi>
        </div>

        <div className="ord-restock">
          <Check checked={restock} onChange={(e) => setRestock(e.target.checked)}>{t.checkRestock}</Check>
          <p className="ord-hint">{t.checkRestockSub(backList)}</p>
        </div>

        <div className="ord-happens">
          <SectionLabel>{t.whatHappens}</SectionLabel>
          <Panel>
            <KVList>
              <KV k={t.whStock}>{restock ? t.whStockBack(facts.restockCount) : t.whStockStays}</KV>
              <KV k={t.whRefundDue} mono={Boolean(refund)}>{refund ?? none(lang)}</KV>
              <KV k={t.whCredit}>{facts.creditReversal ? t.whCreditReversed : t.whCreditNone}</KV>
              {facts.documentNumber && detail.access.can_manage ? <KV k={t.documentTitle}>{t.whDocCreditNote(facts.documentNumber)}</KV> : null}
            </KVList>
          </Panel>
        </div>

        {refund ? <Banner tone="warn">{t.refundDueNote(refund)}</Banner> : null}

        <div className="ord-notice">
          {notice.send ? (
            <>
              <SectionLabel>{t.toldOnWhatsApp(name)}</SectionLabel>
              <div className="ord-wa">
                <div className="ord-wa-bubble">
                  <p className="ord-wa-text" dir="auto">{t.waCancelled(order.number, lang)}</p>
                  <span className="ord-wa-meta">{t.sentAutomatically}</span>
                </div>
              </div>
            </>
          ) : null}
          <p className="ord-hint">{notice.line}</p>
          {notice.send && facts.creditReversal ? <p className="ord-hint">{t.balanceNotice(name)}</p> : null}
        </div>

        {failed ? <p className="ord-error" role="alert">{t.cancelFailed}</p> : null}
      </div>
    </Modal>
  );
}
