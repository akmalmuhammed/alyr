"use client";

// What every layer that opens over the screen shares (Drawer, Modal, Menu, Toast). The first
// version of this (CatalogUi.tsx's Sheet) found its host with `document.querySelector(".sh")` and
// made `.sh-side, .sh-sheet, .sh-tabbar` inert by class name, which welded it to one shell. Here the
// host is the kit's root (UiRoot, which puts it in a React context): a layer draws into it, so it
// takes the root's colours, language and direction, and while a modal layer is open everything else
// in the root that is not the layer is inert. A layer is drawn after the root has mounted, never
// before, so there is nothing to hydrate.

import { useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { useUiHost } from "./UiRoot";

/** Draws its children as a direct child of the kit's root. Nothing until the root is there. */
export function Layer({ children }: { children: ReactNode }) {
  const host = useUiHost();
  return host ? createPortal(children, host) : null;
}

/** The overlays that are open, last on top. Only the top one answers Escape. */
const stack: symbol[] = [];

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusStops(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Lifted from CatalogUi's Sheet and made generic. While the layer is open:
 *  - when it is modal, the rest of the host is inert (a child marked `data-u-live`, such as the toast
 *    layer, stays reachable), and whatever was inert before stays inert after;
 *  - focus moves in (`[data-autofocus]` first), is trapped in `panel`, and goes back to where it was;
 *  - Escape closes the topmost layer wherever the focus has gone (a document-level fallback: pressing
 *    a button that then switches itself off leaves the focus outside the dialog);
 *  - the layer is sized to the visual viewport (`--u-vh`, `--u-vtop`), so an on-screen keyboard never
 *    hides its buttons.
 * `root` is the layer's own element, the direct child of the host; `panel` is what holds the focus.
 */
export function useOverlay({ root, panel, onClose, modal = true }: {
  root: RefObject<HTMLElement | null>;
  panel: RefObject<HTMLElement | null>;
  onClose: () => void;
  modal?: boolean;
}): { onKeyDown: (event: ReactKeyboardEvent) => void } {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useLayoutEffect(() => {
    const el = root.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const token = Symbol("overlay");
    stack.push(token);
    const before = document.activeElement as HTMLElement | null;
    const touched: HTMLElement[] = [];
    if (modal) {
      for (const child of Array.from(host.children) as HTMLElement[]) {
        if (child === el || child.hasAttribute("data-u-live") || child.tagName === "SCRIPT" || child.inert) continue;
        child.inert = true;
        touched.push(child);
      }
    }
    const first = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? (panel.current ? focusStops(panel.current)[0] : null);
    (first ?? panel.current)?.focus({ preventScroll: true });

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && stack[stack.length - 1] === token) closeRef.current();
    };
    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("keydown", onEscape);
      const at = stack.indexOf(token);
      if (at >= 0) stack.splice(at, 1);
      touched.forEach((child) => { child.inert = false; });
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, [root, panel, modal]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const el = root.current;
    if (!viewport || !el) return;
    const fit = () => {
      el.style.setProperty("--u-vh", `${viewport.height}px`);
      el.style.setProperty("--u-vtop", `${viewport.offsetTop}px`);
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
    };
  }, [root]);

  function onKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeRef.current();
      return;
    }
    if (event.key !== "Tab" || !modal || !panel.current) return;
    const stops = focusStops(panel.current);
    if (stops.length === 0) { event.preventDefault(); return; }
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return { onKeyDown };
}

/** The same Escape for something that is not modal (a docked drawer): it closes from inside. */
export function closeOnEscape(onClose: () => void) {
  return (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
  };
}

/** Registers a non-modal layer (a menu) so that Escape closes it before anything beneath it. */
export function useTopOfStack(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const token = Symbol("layer");
    stack.push(token);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && stack[stack.length - 1] === token) { event.stopPropagation(); closeRef.current(); }
    };
    document.addEventListener("keydown", onEscape, true);
    return () => {
      document.removeEventListener("keydown", onEscape, true);
      const at = stack.indexOf(token);
      if (at >= 0) stack.splice(at, 1);
    };
  }, [open]);
}
