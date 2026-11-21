"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { buttonClass, cx } from "./variants";
import type { ButtonKind, ButtonSize } from "./variants";
import { Dot } from "./Tag";

type Common = {
  size?: ButtonSize;
  /** Draws as a quiet grey button with a Volt dot while an action is in flight. The button keeps its place and ignores presses. */
  loading?: boolean;
  /** What to say while it works ("Sending the invite"). Defaults to the button's own words. */
  loadingLabel?: ReactNode;
  /** Fill the width of the container (phones, dialog footers). */
  block?: boolean;
  /** Makes it a link that looks like a button. */
  href?: string;
  className?: string;
  children: ReactNode;
};

/**
 * One Volt button per screen, with its words and nothing else. Every other kind may carry a
 * 16 px icon before its label. `icon` is therefore a type error on `kind="volt"`.
 */
export type ButtonProps =
  | (Common & { kind: "volt"; icon?: never } & ButtonNative)
  | (Common & { kind?: Exclude<ButtonKind, "volt">; icon?: ReactNode } & ButtonNative);

type ButtonNative = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">;

export function Button(props: ButtonProps) {
  const {
    kind = "line", size = "md", icon, loading = false, loadingLabel, block, href, children, className,
    disabled, onClick, type = "button", ...native
  } = props as Common & ButtonNative & { icon?: ReactNode; kind?: ButtonKind };
  const classes = buttonClass({ kind, size, busy: loading, disabled, block, className });
  const content = loading ? (
    <>
      <Dot tone="volt" />
      <span className="u-btn-label">{loadingLabel ?? children}</span>
    </>
  ) : (
    <>
      {icon && kind !== "volt" ? <span className="u-btn-icon" aria-hidden="true">{icon}</span> : null}
      <span className="u-btn-label">{children}</span>
    </>
  );

  if (href !== undefined) {
    const off = disabled || loading;
    return (
      <a
        href={off ? undefined : href}
        className={classes}
        aria-disabled={off || undefined}
        aria-busy={loading || undefined}
        onClick={onClick as unknown as React.MouseEventHandler<HTMLAnchorElement> | undefined}
        {...(native as object)}
      >
        {content}
      </a>
    );
  }
  return (
    <button
      {...native}
      type={type}
      className={classes}
      disabled={disabled}
      // A busy button stays in the tab order (the person who pressed it keeps their place) but does nothing.
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? (event) => event.preventDefault() : onClick}
    >
      {content}
    </button>
  );
}

/** An icon with no words. `label` is its name for screen readers and its tooltip. */
export function IconButton({
  icon, label, size = "sm", bare = false, className, type = "button", ...native
}: {
  icon: ReactNode;
  label: string;
  /** xs 28 or sm 32; both grow to 44 on a phone and on touch screens. */
  size?: Extract<ButtonSize, "xs" | "sm">;
  /** No border (a close button in a header). */
  bare?: boolean;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "aria-label">) {
  return (
    <button
      {...native}
      type={type}
      aria-label={label}
      title={label}
      className={cx(buttonClass({ kind: "line", size, iconOnly: true }), bare && "u-btn--bare", className)}
    >
      <span className="u-btn-icon" aria-hidden="true">{icon}</span>
    </button>
  );
}
