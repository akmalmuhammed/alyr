"use client";

import { useId, useRef } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { Button, IconButton } from "./Button";
import { Layer, useOverlay } from "./overlay";
import { cx } from "./variants";

/**
 * A dialog over the screen: 520 wide (narrow 440 for a yes or no), a 10 px radius, the float shadow, a
 * title and a close button, a body, and a footer on a quiet fill whose buttons sit at the end with the
 * main one last. Modal: the rest of the screen is inert, Tab stays inside, Escape closes, the focus
 * goes back to what opened it. A press on the scrim closes it unless `dismissOnScrim` is off.
 */
export function Modal({
  open, onClose, title, closeLabel, children, footer, footerNote, size = "default", dismissOnScrim = true,
  role = "dialog", className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  closeLabel: string;
  children: ReactNode;
  /** Buttons, main one last. */
  footer?: ReactNode;
  /** A short line at the start of the footer ("This cannot be undone."). */
  footerNote?: ReactNode;
  size?: "default" | "narrow";
  dismissOnScrim?: boolean;
  /** `alertdialog` for a confirm that interrupts. */
  role?: "dialog" | "alertdialog";
  className?: string;
}) {
  const headingId = useId();
  const bodyId = useId();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { onKeyDown } = useOverlay({ root, panel, onClose, modal: open });

  if (!open) return null;
  return (
    <Layer>
      <div
        ref={root}
        className="u-layer u-layer--modal"
        onMouseDown={(event) => { if (dismissOnScrim && event.target === event.currentTarget) onClose(); }}
      >
        <div
          ref={panel}
          role={role}
          aria-modal="true"
          aria-labelledby={headingId}
          aria-describedby={role === "alertdialog" ? bodyId : undefined}
          tabIndex={-1}
          className={cx("u-modal", size === "narrow" && "u-modal--narrow", className)}
          onKeyDown={onKeyDown}
        >
          <header className="u-modal-head">
            <h2 id={headingId} className="u-modal-title">{title}</h2>
            <IconButton size="sm" bare icon={<Icon name="x" />} label={closeLabel} onClick={onClose} />
          </header>
          <div id={bodyId} className="u-modal-body">{children}</div>
          {footer || footerNote ? (
            <footer className="u-modal-foot">
              {footerNote ? <p className="u-modal-note">{footerNote}</p> : null}
              <div className="u-modal-buttons">{footer}</div>
            </footer>
          ) : null}
        </div>
      </div>
    </Layer>
  );
}

/**
 * The confirm that stands in front of anything that cannot be taken back. `destructive` draws the
 * confirm button as `bad` (red words, outlined) and puts the safe choice first in the tab order, with
 * the focus on it; a press on the scrim does not confirm and does not close it. Say what will happen in
 * the body, in the words of the result ("4 items go back in stock"), and name the button for the act
 * ("Cancel order"), never "Yes" or "OK". Both buttons are in the copy file, in both languages.
 */
export function ConfirmDialog({
  open, onCancel, onConfirm, title, closeLabel, children, confirmLabel, cancelLabel, note, destructive = false, busy = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: ReactNode;
  closeLabel: string;
  children: ReactNode;
  confirmLabel: string;
  /** The safe choice ("Keep the order"). */
  cancelLabel: string;
  note?: ReactNode;
  destructive?: boolean;
  /** The confirm is in flight: the button shows its work and ignores presses. */
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      closeLabel={closeLabel}
      size="narrow"
      role="alertdialog"
      dismissOnScrim={false}
      footerNote={note}
      footer={
        <>
          <Button kind="line" data-autofocus="" onClick={onCancel}>{cancelLabel}</Button>
          <Button kind={destructive ? "bad" : "dark"} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
