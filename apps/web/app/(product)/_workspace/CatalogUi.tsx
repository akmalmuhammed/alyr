"use client";

// The small parts every Catalog screen shares: icons, the sheet that holds a form (a bottom
// sheet on a phone, a side panel on a wide screen), the toast, the switch and the photo
// tile. They use the workspace shell's tokens and patterns (shell.css), so the Catalog
// reads as the same instrument as the screens beside it.

import { cloneElement, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Lang } from "./catalogCopy";
import type { Photo } from "./catalogApi";
import "./catalog.css";
import { SampleArt } from "./CatalogSample";

// ── icons (the shell's drawing: 24 grid, 1.7 line, round ends) ──

const ICON: Record<string, string> = {
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M20 20l-4-4",
  plus: "M12 5v14 M5 12h14",
  x: "M6 6l12 12 M18 6 6 18",
  check: "M5 12.5l5 5L19 7",
  camera: "M4 8h3l2-3h6l2 3h3v11H4z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  image: "M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M9 9.5h.01",
  down: "M6 9l6 6 6-6",
  start: "M15 6l-6 6 6 6",
  end: "M9 6l6 6-6 6",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  trash: "M5 7h14 M10 7V4h4v3 M7 7l1 13h8l1-13 M10 11v6 M14 11v6",
  undo: "M9 14 4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-4",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  list: "M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01",
  sliders: "M4 7h10 M18 7h2 M4 17h2 M10 17h10 M14 4v6 M6 14v6",
  warn: "M12 4 3 20h18z M12 10v4 M12 17h.01",
  tag: "M4 4h8l8 8-8 8-8-8z M8 8h.01",
  up: "M12 19V5 M6 11l6-6 6 6",
  low: "M12 5v14 M6 13l6 6 6-6",
  star: "M12 4l2.4 5 5.6.7-4.1 3.8 1.1 5.5L12 16.3 7 19l1.1-5.5L4 9.7 9.6 9z",
  stock: "M4 8l8-4 8 4v8l-8 4-8-4z M4 8l8 4 8-4 M12 12v8",
  retry: "M20 12a8 8 0 1 1-2.3-5.7 M20 4v5h-5",
  share: "M12 15V4 M7 9l5-5 5 5 M5 14v6h14v-6",
  copy: "M9 9h11v11H9z M5 15V4h11",
  download: "M12 4v11 M7 11l5 5 5-5 M5 20h14",
  printer: "M7 9V4h10v5 M7 17H4v-8h16v8h-3 M7 14h10v6H7z",
  qr: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h3v3 M20 14v3 M14 20h6 M17 17v3",
  upload: "M12 16V5 M7 9l5-5 5 5 M5 20h14",
  sheet: "M6 3h9l4 4v14H6z M15 3v4h4 M9 12h6 M9 16h6",
  // Documents (ALY-146)
  doc: "M7 3h8l4 4v14H7z M15 3v4h4 M10 12h6 M10 16h6",
  mail: "M3 6h18v12H3z M3 7l9 6 9-6",
  cash: "M3 7h18v10H3z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M6 10h.01 M18 14h.01",
  ban: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M5.7 5.7l12.6 12.6",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  edit: "M4 20h4L19 9l-4-4L4 16z M13 7l4 4",
  lock: "M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3",
  filter: "M4 6h16 M7 12h10 M10 18h4",
  send: "M4 12 20 4l-6 16-3-7z",
  chat: "M4 5h16v11H10l-6 4z M8 10h8",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6",
};

export function Icon({ name, className = "sh-ico" }: { name: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {(ICON[name] ?? ICON.image).split(" M").map((d, i) => <path key={i} d={i ? `M${d}` : d} />)}
    </svg>
  );
}

// ── toasts ──────────────────────────────────────────────

export type Toast = { id: number; text: string; tone: "ok" | "bad" | "warn"; undo?: () => void; undoLabel?: string };

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (text: string, options: { tone?: "ok" | "bad" | "warn"; undo?: () => void; undoLabel?: string } = {}) => {
      const id = next.current++;
      setToasts((all) => [...all.slice(-2), { id, text, tone: options.tone ?? "ok", undo: options.undo, undoLabel: options.undoLabel }]);
      // A toast with Undo stays long enough to be read and used; one that only tells stays short.
      setTimeout(() => dismiss(id), options.undo ? 9000 : options.tone === "bad" || options.tone === "warn" ? 8000 : 4500);
      return id;
    },
    [dismiss],
  );
  const clear = useCallback(() => setToasts([]), []);
  return { toasts, push, dismiss, clear };
}

/** The shell's own root: the layer draws inside it so it takes the shell's colours and direction. */
function useHost(): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const found = document.querySelector<HTMLElement>(".sh");
    const timer = setTimeout(() => setHost(found), 0);
    return () => clearTimeout(timer);
  }, []);
  return host;
}

export function ToastLayer({ toasts, dismiss, lang, undoWord, dismissWord }: {
  toasts: Toast[]; dismiss: (id: number) => void; lang: Lang; undoWord: string; dismissWord: string;
}) {
  const host = useHost();
  if (!host) return null;
  return createPortal(
    <div className="ct-toasts" aria-live="polite" aria-atomic="false" lang={lang}>
      {toasts.map((toast) => (
        <div key={toast.id} className={`ct-toast ${toast.tone}`} role={toast.tone === "bad" ? "alert" : "status"}>
          <span className="ct-toast-mark" aria-hidden="true"><Icon name={toast.tone === "ok" ? "check" : "warn"} /></span>
          <span className="ct-toast-text">{toast.text}</span>
          {toast.undo && (
            <button type="button" className="btn small ct-toast-undo"
              onClick={() => { toast.undo?.(); dismiss(toast.id); }}>
              <Icon name="undo" />{toast.undoLabel ?? undoWord}
            </button>
          )}
          <button type="button" className="sh-iconbtn ct-toast-x" aria-label={dismissWord} onClick={() => dismiss(toast.id)}>
            <Icon name="x" />
          </button>
        </div>
      ))}
    </div>,
    host,
  );
}

// ── the sheet ───────────────────────────────────────────

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A form that sits over the screen: a bottom sheet on a phone, a side panel on a wide
 * screen. It traps focus, closes on Escape, gives focus back, and follows the on-screen
 * keyboard (the visual viewport) so its buttons are never hidden under it.
 */
export function Sheet({ title, subtitle, onClose, closeLabel, footer, children, wide = false }: {
  title: string; subtitle?: string; onClose: () => void; closeLabel: string;
  footer?: React.ReactNode; children: React.ReactNode; wide?: boolean;
}) {
  const host = useHost();
  const id = useId();
  const scrim = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  // Everything behind the sheet is inert while it is open, and focus returns when it closes.
  useEffect(() => {
    if (!host) return;
    const before = document.activeElement as HTMLElement | null;
    const behind = Array.from(host.querySelectorAll<HTMLElement>(".sh-side, .sh-sheet, .sh-tabbar"));
    behind.forEach((el) => { el.inert = true; });
    const first = dialog.current?.querySelector<HTMLElement>("[data-autofocus]") ?? dialog.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
    return () => {
      behind.forEach((el) => { el.inert = false; });
      before?.focus?.({ preventScroll: true });
    };
  }, [host]);

  // Escape closes the sheet wherever the focus has gone: pressing a button that then switches
  // itself off (Send, Save) leaves the focus on the page, outside the dialog, and the dialog's
  // own key handler would never hear it. The dialog's handler stops the key first when the focus
  // is inside it, so this runs only for the rest.
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, []);

  // Follow the on-screen keyboard: size the sheet to what is actually visible.
  useEffect(() => {
    const viewport = window.visualViewport;
    const el = scrim.current;
    if (!viewport || !el) return;
    const fit = () => {
      el.style.setProperty("--ct-vh", `${viewport.height}px`);
      el.style.setProperty("--ct-top", `${viewport.offsetTop}px`);
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
    };
  }, [host]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeRef.current();
      return;
    }
    if (event.key !== "Tab" || !dialog.current) return;
    const stops = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (stops.length === 0) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  // A field that takes focus and is not fully in view (the keyboard has come up and the
  // sheet has shrunk to what is left) is scrolled into view. A field already in view is left
  // alone, so the form never moves under a thumb for no reason.
  function onFocusCapture(event: React.FocusEvent) {
    const target = event.target as HTMLElement;
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    setTimeout(() => {
      const body = dialog.current?.querySelector<HTMLElement>(".ct-sheet-body");
      // Only for the field the person is still in; one they have left must not pull the form back.
      if (!body || !target.isConnected || document.activeElement !== target) return;
      const room = body.getBoundingClientRect();
      const box = target.getBoundingClientRect();
      if (box.top < room.top + 8 || box.bottom > room.bottom - 8) target.scrollIntoView({ block: "center" });
    }, 300);
  }

  if (!host) return null;
  return createPortal(
    <div className="ct-scrim" ref={scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`ct-sheet ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={id}
        ref={dialog} onKeyDown={onKeyDown} onFocusCapture={onFocusCapture}>
        <header className="ct-sheet-head">
          <div className="ct-sheet-title">
            <h2 id={id}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="sh-iconbtn ct-close" aria-label={closeLabel} onClick={onClose}><Icon name="x" /></button>
        </header>
        <div className="ct-sheet-body">{children}</div>
        {footer && <footer className="ct-sheet-foot">{footer}</footer>}
      </div>
    </div>,
    host,
  );
}

// ── small controls ──────────────────────────────────────

/** The shell's switch, with a larger area to press. The state is also said in words beside it. */
export function Switch({ on, onChange, label, disabled = false }: {
  on: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className="sh-switch ct-hit" onClick={() => onChange(!on)} />
  );
}

/** One cover. A photo that is not ready (still being saved, not saved, or not there) is a drawn tile, never a broken image. */
export function Tile({ photo, sizes, labels, className = "", sample }: {
  photo: Photo | null | undefined; sizes: string;
  labels: { pending: string; failed: string; missing: string; sample?: string }; className?: string;
  // A sample item has no photo; its tile is drawn from this key (CatalogSample.tsx).
  sample?: string;
}) {
  if (photo && photo.state === "ready" && photo.urls) {
    return (
      <span className={`ct-tile ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the address is the shop's own stored photo; sizes come from srcset */}
        <img src={photo.urls.thumb} srcSet={photo.srcset || undefined} sizes={sizes} alt="" loading="lazy" decoding="async"
          width={photo.width ?? undefined} height={photo.height ?? undefined} />
      </span>
    );
  }
  if (sample) {
    return (
      <span className={`ct-tile ct-sample ${className}`}>
        <SampleArt sampleKey={sample} />
        <span className="ct-sr">{labels.sample ?? ""}</span>
      </span>
    );
  }
  const state = photo?.state === "pending" ? "pending" : photo?.state === "failed" ? "failed" : "missing";
  return (
    <span className={`ct-tile ct-ph ${state} ${className}`}>
      <Icon name={state === "failed" ? "warn" : state === "pending" ? "retry" : "image"} className="sh-ico ct-ph-ico" />
      <span className="ct-sr">{labels[state]}</span>
    </span>
  );
}

/**
 * Draws its children in the shell's own root, not inside the screen. A screen that arrives
 * with the shell's rise animation keeps a transform (the identity, but still one), and
 * anything fixed inside it is placed against the whole screen rather than the window.
 */
export function Layer({ children }: { children: React.ReactNode }) {
  const host = useHost();
  return host ? createPortal(children, host) : null;
}

/** Text only for screen readers. */
export function Sr({ children }: { children: React.ReactNode }) {
  return <span className="ct-sr">{children}</span>;
}

/** The number of results that changed, announced politely. */
export function Announce({ text }: { text: string }) {
  return <p className="ct-sr" role="status" aria-live="polite">{text}</p>;
}

/** A label, one control, and what to say about it. The control gets its id and its hint and error by reference. */
export function Field({ label, hint, error, children, className = "" }: {
  label: string; hint?: string; error?: string; children: React.ReactElement<Record<string, unknown>>; className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = cloneElement(children, {
    id,
    "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
    "aria-invalid": error ? true : undefined,
  });
  return (
    <div className={`ct-field ${error ? "bad" : ""} ${className}`}>
      <label htmlFor={id}>{label}</label>
      {control}
      {hint && <p className="ct-hint" id={hintId}>{hint}</p>}
      {error && <p className="ct-error" id={errorId}>{error}</p>}
    </div>
  );
}

/** A part of a form that can be opened and closed. Native, so it works from the keyboard and a screen reader. */
export function Fold({ title, summary, open, onToggle, children }: {
  title: string; summary?: string; open?: boolean; onToggle?: (open: boolean) => void; children: React.ReactNode;
}) {
  return (
    <details className="ct-fold" open={open} onToggle={(e) => onToggle?.((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="ct-fold-title">{title}</span>
        {summary && <span className="ct-fold-sum">{summary}</span>}
        <Icon name="down" className="sh-ico ct-fold-chev" />
      </summary>
      <div className="ct-fold-body">{children}</div>
    </details>
  );
}
