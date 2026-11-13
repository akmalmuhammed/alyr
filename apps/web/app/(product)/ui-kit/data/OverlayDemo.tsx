"use client";

import { useState } from "react";
import {
  Button, Chip, ConfirmDialog, ContextMenu, Drawer, Field, Icon, IconButton, Input, Menu, Modal, Select, Skeleton, SkeletonRows, SkeletonText, Tag, useToast,
} from "../../../_ui";
import type { MenuItem } from "../../../_ui";
import type { Words } from "./copy";
import { Block, Cell, ORDERS, STATUS_TONE, statusWord } from "./shared";
import type { Lang } from "./shared";
import { OrderBody } from "./TableDemo";

export function OverlayDemo({ t, lang }: { t: Words; lang: Lang }) {
  const [drawer, setDrawer] = useState<"none" | "default" | "wide">("none");
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState<"none" | "destructive" | "plain">("none");
  const [slot, setSlot] = useState("17:00");
  const toast = useToast();
  const order = ORDERS[0];

  const footer = (
    <>
      <Button kind="bad" onClick={() => setConfirm("destructive")}>{t.drawerCancel}</Button>
      <span className="u-push" />
      <Button onClick={() => setDrawer("none")}>{t.drawerOpenFull}</Button>
      <Button kind="volt" onClick={() => { setDrawer("none"); toast.push({ text: t.tSaved }); }}>{t.drawerConfirm}</Button>
    </>
  );

  return (
    <Block title={t.overlays} note={t.overlaysNote} id="overlays">
      <div className="u-kg-row">
        <Button onClick={() => setDrawer("default")}>{t.openDrawer}</Button>
        <Button onClick={() => setDrawer("wide")}>{t.openDrawerWide}</Button>
        <Button onClick={() => setModal(true)}>{t.openModal}</Button>
        <Button kind="bad" onClick={() => setConfirm("destructive")}>{t.openConfirm}</Button>
        <Button onClick={() => setConfirm("plain")}>{t.confirmPlain}</Button>
      </div>

      <Drawer
        open={drawer !== "none"}
        width={drawer === "wide" ? "wide" : "default"}
        onClose={() => setDrawer("none")}
        title={t.drawerTitle}
        headerExtra={<Tag tone={STATUS_TONE[order.status]}>{statusWord(t, order.status)}</Tag>}
        subtitle={t.drawerSub}
        closeLabel={t.closeLabel}
        footer={footer}
      >
        <OrderBody t={t} lang={lang} order={order} />
        <Button onClick={() => setModal(true)}>{t.openNested}</Button>
      </Drawer>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={t.modalTitle}
        closeLabel={t.closeLabel}
        footerNote={t.modalNote}
        footer={
          <>
            <Button kind="quiet" onClick={() => setModal(false)}>{t.modalCancel}</Button>
            <Button kind="dark" onClick={() => { setModal(false); toast.push({ text: t.tSaved }); }}>{t.modalSave}</Button>
          </>
        }
      >
        <p>{t.modalBody}</p>
        <div className="u-kd-fields">
          <Field label={t.modalDay}><Input defaultValue={lang === "ar" ? "الجمعة 13 نوفمبر 2026" : "Fri 13 Nov 2026"} /></Field>
          <Field label={t.modalPerson}>
            <Select defaultValue="y"><option value="y">Detailing · Yusuf</option><option value="b">Ceramic · Bilal</option></Select>
          </Field>
        </div>
        <div className="u-kd-slots" role="group" aria-label={t.modalFree}>
          {["13:00", "14:00", "17:00", "17:30"].map((s) => <Chip key={s} on={slot === s} onClick={() => setSlot(s)}><bdi>{s}</bdi></Chip>)}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== "none"}
        destructive={confirm === "destructive"}
        onCancel={() => setConfirm("none")}
        onConfirm={() => { setConfirm("none"); toast.push({ text: confirm === "destructive" ? t.tBad : t.tMarked, meta: t.tMarkedMeta, tone: confirm === "destructive" ? "bad" : "ok", undo: confirm === "destructive" ? undefined : () => toast.push({ text: t.tUndone }) }); }}
        title={confirm === "destructive" ? t.confirmTitle : t.confirmPlain}
        closeLabel={t.closeLabel}
        confirmLabel={confirm === "destructive" ? t.confirmAct : t.confirmPlainAct}
        cancelLabel={confirm === "destructive" ? t.confirmKeep : t.modalCancel}
        note={confirm === "destructive" ? t.confirmNote : undefined}
      >
        <p>{confirm === "destructive" ? t.confirmBody : t.modalBody}</p>
      </ConfirmDialog>
    </Block>
  );
}

export function MenuDemo({ t }: { t: Words }) {
  const toast = useToast();
  const say = (text: string) => () => toast.push({ text });
  const items: MenuItem[] = [
    { type: "label", label: t.mGroup },
    { id: "open", label: t.mOpen, icon: "doc", shortcut: "O", onSelect: say(t.mOpen) },
    { id: "confirm", label: t.mConfirm, icon: "check", shortcut: "C", onSelect: say(t.mConfirm) },
    { id: "paid", label: t.mPaid, icon: "cash", onSelect: say(t.mPaid) },
    { id: "link", label: t.mLink, icon: "send", onSelect: say(t.mLink) },
    { id: "conv", label: t.mConversation, icon: "chat", onSelect: say(t.mConversation) },
    { id: "print", label: t.mUnavailable, icon: "print", disabled: true, onSelect: () => {} },
    { type: "separator" },
    { id: "cancel", label: t.mCancel, icon: "trash", tone: "bad", onSelect: say(t.mCancel) },
  ];
  return (
    <Block title={t.menus} note={t.menusNote} id="menus">
      <div className="u-kg-grid">
        <Cell cap={t.menuButton}>
          <div className="u-kg-row">
            <Menu
              label={t.menuLabel}
              items={items}
              trigger={(p) => <IconButton {...p} icon={<Icon name="dots" />} label={t.menuButton} />}
            />
            <Menu
              label={t.menuLabel}
              items={items}
              align="start"
              trigger={(p) => <Button {...p} icon={<Icon name="down" />}>{t.menuButton}</Button>}
            />
          </div>
        </Cell>
        <Cell cap={t.contextBox}>
          <ContextMenu items={items} label={t.menuLabel}>
            <div className="u-kd-context" tabIndex={0}>{t.contextBox}</div>
          </ContextMenu>
        </Cell>
      </div>
    </Block>
  );
}

export function ToastDemo({ t }: { t: Words }) {
  const toast = useToast();
  const [n, setN] = useState(0);
  return (
    <Block title={t.toasts} note={t.toastsNote} id="toasts">
      <div className="u-kg-row">
        <Button onClick={() => toast.push({ text: t.tSaved })}>{t.toastTell}</Button>
        <Button onClick={() => toast.push({ text: t.tMarked, meta: t.tMarkedMeta, undo: () => toast.push({ text: t.tUndone }) })}>{t.toastUndo}</Button>
        <Button onClick={() => toast.push({ text: t.tWarn, tone: "warn" })}>{t.toastWarn}</Button>
        <Button kind="bad" onClick={() => toast.push({ text: t.tBad, tone: "bad" })}>{t.toastBad}</Button>
        <Button onClick={() => { for (let k = 1; k <= 5; k += 1) toast.push({ text: t.tN(n + k) }); setN((v) => v + 5); }}>{t.toastMany}</Button>
      </div>
    </Block>
  );
}

export function SkeletonDemo({ t }: { t: Words }) {
  return (
    <Block title={t.skeletons} note={t.skeletonsNote} id="skeletons">
      <div className="u-kg-grid">
        <Cell cap={t.skeletonRows}>
          <div className="u-kd-box"><SkeletonRows rows={4} columns={4} label={t.loadingOrders} /></div>
        </Cell>
        <Cell cap={t.skeletonText}>
          <div className="u-kd-box u-kd-pad"><Skeleton width={40} height="var(--ui-space-14)" /><SkeletonText lines={3} /></div>
        </Cell>
        <Cell cap={t.skeletonRound}>
          <div className="u-kg-row"><Skeleton round height="var(--ui-size-control)" /><Skeleton round height="var(--ui-size-control-xs)" /></div>
        </Cell>
      </div>
    </Block>
  );
}
