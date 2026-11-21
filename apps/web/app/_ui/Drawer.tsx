"use client";

import { useId, useRef } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { IconButton } from "./Button";
import { Layer, closeOnEscape, useOverlay } from "./overlay";
import { cx } from "./variants";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  /** The drawer's heading ("Order #1042"). */
  title: ReactNode;
  /** A muted word beside the title ("4 min ago"). */
  subtitle?: ReactNode;
  /** Tags next to the title (a status). */
  headerExtra?: ReactNode;
  /** The close button's name for screen readers. */
  closeLabel: string;
  children: ReactNode;
  /** Buttons along the bottom: the one Volt button of the screen goes last, at the end. */
  footer?: ReactNode;
  /** 440 (default) or the wider 480. */
  width?: "default" | "wide";
  /**
   * `overlay` (default) opens over the screen from the inline-end edge on a scrim, traps focus and is
   * modal; on a phone it is a sheet from the bottom. `docked` sits in the page beside a list (the
   * orders list with an order open): no scrim, no trap, the list stays usable, Escape closes it from
   * inside. Put a docked drawer in the layout yourself; it does not portal.
   */
  mode?: "overlay" | "docked";
  className?: string;
};

function Inside({ headingId, title, subtitle, headerExtra, closeLabel, onClose, children, footer }: Pick<DrawerProps, "title" | "subtitle" | "headerExtra" | "closeLabel" | "onClose" | "children" | "footer"> & { headingId: string }) {
  return (
    <>
      <header className="u-drawer-head">
        <div className="u-drawer-heading">
          <h2 id={headingId} className="u-drawer-title">{title}</h2>
          {headerExtra}
          {subtitle ? <span className="u-drawer-sub">{subtitle}</span> : null}
        </div>
        <IconButton size="sm" bare icon={<Icon name="x" />} label={closeLabel} onClick={onClose} />
      </header>
      <div className="u-drawer-body">{children}</div>
      {footer ? <footer className="u-drawer-foot">{footer}</footer> : null}
    </>
  );
}

/**
 * A side panel for the detail of one thing: an order, a booking, a customer. It opens from the
 * inline-end edge, so in Arabic it comes from the left. Modal by default: the rest of the screen is
 * inert, Tab stays inside, Escape closes, the focus goes back to what opened it, and it follows the
 * on-screen keyboard. A press on the scrim closes it.
 */
export function Drawer(props: DrawerProps) {
  const { open, onClose, mode = "overlay", width = "default", className } = props;
  const headingId = useId();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { onKeyDown } = useOverlay({ root, panel, onClose, modal: open && mode === "overlay" });

  if (!open) return null;

  if (mode === "docked") {
    return (
      <aside className={cx("u-drawer", "u-drawer--docked", width === "wide" && "u-drawer--wide", className)} aria-labelledby={headingId} onKeyDown={closeOnEscape(onClose)}>
        <Inside headingId={headingId} {...props} />
      </aside>
    );
  }

  return (
    <Layer>
      <div ref={root} className="u-layer u-layer--drawer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          tabIndex={-1}
          className={cx("u-drawer", width === "wide" && "u-drawer--wide", className)}
          onKeyDown={onKeyDown}
        >
          <Inside headingId={headingId} {...props} />
        </div>
      </div>
    </Layer>
  );
}
