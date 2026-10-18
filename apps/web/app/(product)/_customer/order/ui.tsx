"use client";

// The small pieces the order page is built from (ALY-112): a price, a photo in a box that
// never jumps, a stepper with 44 px targets, and the dialog the item and the review open in.

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Glyph } from "../Frame";
import { formatPrice, formatRange, type Lang } from "../price";
import type { Photo } from "./types";

/** An amount, written the way the page's language writes it, in one unbroken run. */
export function Price({ value, lang, className = "" }: { value: number; lang: Lang; className?: string }) {
  return <bdi className={`num ox-nb ${className}`}>{formatPrice(value, lang)}</bdi>;
}

export function PriceRange({ low, high, lang, className = "" }: { low: number; high: number; lang: Lang; className?: string }) {
  return <bdi className={`num ox-nb ${className}`}>{formatRange(low, high, lang)}</bdi>;
}

/**
 * A photo, or a calm tile where there is none (no photo yet, one still being saved, one
 * that failed). The box has its shape before the file arrives, so nothing moves when it
 * does. `sizes` tells the browser how wide the picture really is on screen, so a phone
 * fetches the 320 px file for a thumbnail and not the 1,600 px one.
 */
export function Tile({
  photo, sizes, alt = "", ratio = "1 / 1", className = "", eager = false,
}: {
  photo: Photo | null | undefined; sizes: string; alt?: string; ratio?: string; className?: string; eager?: boolean;
}) {
  const shown = photo && photo.state === "ready" && photo.src ? photo : null;
  return (
    <span className={`ox-ph ${shown ? "" : "blank"} ${className}`} style={{ aspectRatio: ratio } as CSSProperties}>
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own sizes, picked by srcset; no image service
        <img src={shown.src} srcSet={shown.srcset} sizes={sizes} alt={alt}
          width={shown.w ?? undefined} height={shown.h ?? undefined}
          loading={eager ? "eager" : "lazy"} decoding="async" />
      ) : (
        <Glyph name="image" className="ox-ph-glyph" />
      )}
    </span>
  );
}

/** − 2 +, with targets of 44 px. At `max` the + stays but does nothing and says why. */
export function Stepper({
  qty, onMinus, onPlus, atMax, labels,
}: {
  qty: number; onMinus: () => void; onPlus: () => void; atMax: boolean;
  labels: { minus: string; plus: string; quantity: string };
}) {
  return (
    <div className="ox-step" role="group" aria-label={labels.quantity}>
      <button type="button" aria-label={labels.minus} onClick={onMinus}><Glyph name="minus" /></button>
      <span className="num" aria-live="polite">{qty}</span>
      <button type="button" aria-label={labels.plus} aria-disabled={atMax || undefined} onClick={onPlus}><Glyph name="plus" /></button>
    </div>
  );
}

/**
 * The browser's own modal dialog: focus stays inside, Escape closes, the page behind cannot
 * be reached, and focus goes back to what opened it. A bottom sheet on a phone.
 */
export function Dialog({
  label, onClose, children, wide = false,
}: { label: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const el = ref.current;
    if (!el || el.open) return;
    // Focus goes back to what opened it, once it closes (it is removed from the page rather
    // than closed, and the browser only gives focus back when a dialog is closed).
    const before = document.activeElement as HTMLElement | null;
    el.showModal();
    // The page behind does not move.
    document.documentElement.classList.add("ox-locked");
    return () => {
      document.documentElement.classList.remove("ox-locked");
      if (el.open) el.close();
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog ref={ref} className={`ox-dialog ${wide ? "wide" : ""}`} aria-label={label}
      onCancel={(e) => { e.preventDefault(); close.current(); }}
      onClick={(e) => { if (e.target === ref.current) close.current(); }}>
      {children}
    </dialog>
  );
}

/** A heading row for a dialog, with the close button. */
export function DialogHead({ title, closeLabel, onClose, id }: { title: string; closeLabel: string; onClose: () => void; id?: string }) {
  return (
    <header className="ox-dhead">
      <h2 id={id}>{title}</h2>
      <button type="button" className="ox-x" aria-label={closeLabel} onClick={onClose}><Glyph name="close" /></button>
    </header>
  );
}
