"use client";

import React from "react";
import { Button, Drawer, Icon, Section, SkeletonText } from "../../../_ui";
import { copy, type Lang } from "./copy";
import { minutesSince, nextStep, ago } from "./logic";
import {
  ActivityTimeline,
  CustomerLine,
  HandOverRows,
  ItemRow,
  PaymentRows,
  StatusTag,
  SumRows,
  stepNote,
} from "./OrderPanels";
import type { OrderDetail, TeamMember } from "./types";

export interface OrderDrawerProps {
  detail: OrderDetail | null;
  lang: Lang;
  team: TeamMember[];
  now: number;
  /** The number to show in the title while the detail is still loading. */
  number: number;
  /** Nothing can be saved: the step, Mark paid and Cancel are drawn but cannot be pressed. */
  offline: boolean;
  /** A step is in flight. */
  busy: boolean;
  onClose: () => void;
  onOpenFull: () => void;
  onMarkPaid: () => void;
  onCancel: () => void;
  onStep: (to: "confirmed" | "ready" | "done") => void;
  onAssign: (userId: string | null) => void;
}

/** The order beside the list: who, what, where it goes, how it is paid, what happened, and the next step. */
export function OrderDrawer({ detail, lang, team, now, number, offline, busy, onClose, onOpenFull, onMarkPaid, onCancel, onStep, onAssign }: OrderDrawerProps) {
  const t = copy(lang);
  const order = detail?.order;
  const step = order ? nextStep(order.status) : null;
  const access = detail?.access;
  const note = detail ? stepNote(detail, lang) : null;
  const canMarkPaid = Boolean(detail && access?.can_record_payments && order && order.payment === "unpaid" && order.status !== "cancelled" && !order.test);
  const canCancel = Boolean(access?.can_cancel && order && order.status !== "cancelled");

  return (
    <Drawer
      open
      mode="docked"
      onClose={onClose}
      title={t.orderTitle(order?.number ?? number)}
      headerExtra={order ? <StatusTag status={order.status} lang={lang} /> : undefined}
      subtitle={order && order.status !== "done" && order.status !== "cancelled" && minutesSince(order.created_at, now) < 1440 ? <bdi className="u-mono">{ago(order.created_at, lang, now)}</bdi> : undefined}
      closeLabel={t.closeDrawer}
      className="ord-drawer"
      footer={
        detail && order ? (
          <div className="ord-foot">
            {canCancel ? (
              <Button kind="bad" size="sm" disabled={offline} onClick={onCancel}>{t.btnCancelOrder}</Button>
            ) : (
              <span />
            )}
            <div className="ord-foot-end">
              <Button kind="line" size="sm" icon={<Icon name="ext" />} onClick={onOpenFull}>{t.openFullPage}</Button>
              {step ? (
                offline ? (
                  <Button kind="line" size="sm" disabled>{t[step.label]}</Button>
                ) : (
                  <Button kind="volt" size="sm" loading={busy} loadingLabel={t.btnSaving} onClick={() => onStep(step.to)}>{t[step.label]}</Button>
                )
              ) : null}
            </div>
          </div>
        ) : undefined
      }
    >
      {!detail || !order ? (
        <div className="ord-drawer-body" aria-busy="true" aria-label={t.loadingOrders}>
          <SkeletonText lines={5} />
        </div>
      ) : (
        <div className="ord-drawer-body">
          <div className="ord-customer-row">
            <CustomerLine detail={detail} />
            <Button kind="line" size="sm" icon={<Icon name="chat" />} href={`/app/inbox?c=${encodeURIComponent(detail.customer.id)}`}>{t.conversationBtn}</Button>
          </div>

          <Section label={t.sectionItems(detail.lines.length)} level={3}>
            <div className="ord-block">
              <ul className="ord-items">
                {detail.lines.map((line, i) => (
                  <ItemRow key={i} line={line} lang={lang} />
                ))}
              </ul>
              <SumRows order={order} lines={detail.lines} lang={lang} />
            </div>
          </Section>

          <Section label={t.sectionHandOver} level={3}>
            <HandOverRows order={order} team={team} lang={lang} now={now} onAssign={onAssign} offline={offline} />
          </Section>

          <Section label={t.sectionPayment} level={3}>
            <PaymentRows detail={detail} lang={lang} />
            {canMarkPaid ? (
              <div className="ord-actions">
                <Button kind="line" size="sm" disabled={offline} onClick={onMarkPaid}>{t.btnMarkPaid}</Button>
              </div>
            ) : null}
          </Section>

          <Section label={t.sectionTimeline} level={3}>
            <ActivityTimeline detail={detail} lang={lang} now={now} />
          </Section>

          {note ? <p className="ord-note">{note}</p> : null}
        </div>
      )}
    </Drawer>
  );
}
