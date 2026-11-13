"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { IconButton } from "./Button";
import { Layer } from "./overlay";
import { EMPTY_QUEUE, clearToasts, dismissToast, newlyVisible, pushToast } from "./toastQueue";
import type { ToastInput, ToastItem, ToastState } from "./toastQueue";
import { cx } from "./variants";

export type { ToastInput, ToastTone } from "./toastQueue";

type ToastApi = {
  /** Shows a toast and returns its id. Three show at once; the rest wait their turn. */
  push: (input: ToastInput) => number;
  dismiss: (id: number) => void;
  clear: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Tells the person what just happened, or gives it back (Undo). Needs a <ToastProvider> above it. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a <ToastProvider> above it");
  return api;
}

/** One running timer: it keeps what is left when the toast is paused (the pointer is on it, or focus is inside). */
/** The least a paused toast waits once the pointer leaves, so it is never gone the instant it is released. */
const MIN_LEFT = 1500;

type Timer = { handle: ReturnType<typeof setTimeout> | null; left: number; startedAt: number };

/**
 * The toast queue and the layer that draws it, in the corner of the screen (the inline end, so the
 * other side in Arabic). Put one provider at the top of a screen, inside the kit's root. A toast that
 * only tells goes after a few seconds; one with Undo stays longer; a problem stays longest; any of
 * them waits while the pointer is on it or focus is inside it. The layer is a polite live region, and a
 * problem is announced at once (role alert). Words come from the caller; the two the toast itself shows
 * (the dismiss button and a default for Undo) are in `labels`.
 */
export function ToastProvider({ children, labels, max }: {
  children: ReactNode;
  labels: { dismiss: string; undo: string };
  /** How many show at once. Default 3. */
  max?: number;
}) {
  const [state, setState] = useState<ToastState>(EMPTY_QUEUE);
  const stateRef = useRef(state);
  const timers = useRef(new Map<number, Timer>());
  const limit = max ?? 3;

  const commit = useCallback((next: ToastState) => { stateRef.current = next; setState(next); }, []);

  const stop = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t?.handle) clearTimeout(t.handle);
    timers.current.delete(id);
  }, []);

  const removeRef = useRef<(id: number) => void>(() => {});

  const start = useCallback((item: ToastItem, left: number = item.duration) => {
    stop(item.id);
    const handle = setTimeout(() => removeRef.current(item.id), left);
    timers.current.set(item.id, { handle, left, startedAt: Date.now() });
  }, [stop]);

  /** Moves from one state to the next: timers start for what came on screen and stop for what left. */
  const settle = useCallback((before: ToastState, after: ToastState) => {
    commit(after);
    const now = new Set(after.visible.map((t) => t.id));
    for (const gone of before.visible) if (!now.has(gone.id)) stop(gone.id);
    for (const item of newlyVisible(before, after)) start(item);
  }, [commit, start, stop]);

  const remove = useCallback((id: number) => {
    const before = stateRef.current;
    settle(before, dismissToast(before, id, limit));
  }, [limit, settle]);
  useEffect(() => { removeRef.current = remove; }, [remove]);

  const pause = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (!t || !t.handle) return;
    clearTimeout(t.handle);
    timers.current.set(id, { handle: null, left: Math.max(MIN_LEFT, t.left - (Date.now() - t.startedAt)), startedAt: 0 });
  }, []);

  const resume = useCallback((item: ToastItem) => {
    const t = timers.current.get(item.id);
    if (t && t.handle === null) start(item, t.left);
  }, [start]);

  const api = useMemo<ToastApi>(() => ({
    push: (input) => {
      const before = stateRef.current;
      const result = pushToast(before, input, limit);
      settle(before, result.state);
      return result.id;
    },
    dismiss: (id) => remove(id),
    clear: () => { const before = stateRef.current; settle(before, clearToasts(before)); },
  }), [limit, remove, settle]);

  useEffect(() => {
    const running = timers.current;
    return () => { running.forEach((t) => { if (t.handle) clearTimeout(t.handle); }); running.clear(); };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Layer>
        <div className="u-layer u-layer--toasts" data-u-live aria-live="polite" aria-atomic="false" aria-relevant="additions">
          {state.visible.map((toast) => (
            <div
              key={toast.id}
              className={cx("u-toast", `u-toast--${toast.tone}`)}
              role={toast.tone === "bad" ? "alert" : "status"}
              onPointerEnter={() => pause(toast.id)}
              onPointerLeave={() => resume(toast)}
              onFocus={() => pause(toast.id)}
              onBlur={() => resume(toast)}
            >
              <span className="u-toast-mark" aria-hidden="true">
                <Icon name={toast.tone === "ok" ? "check" : "warn"} />
              </span>
              <div className="u-toast-body">
                <p className="u-toast-text">{toast.text}</p>
                {toast.meta ? <p className="u-toast-meta">{toast.meta}</p> : null}
              </div>
              {toast.undo ? (
                <button type="button" className="u-toast-undo" onClick={() => { toast.undo?.(); remove(toast.id); }}>
                  {toast.undoLabel ?? labels.undo}
                </button>
              ) : null}
              <IconButton size="xs" bare className="u-toast-x" icon={<Icon name="x" />} label={labels.dismiss} onClick={() => remove(toast.id)} />
            </div>
          ))}
        </div>
      </Layer>
    </ToastContext.Provider>
  );
}
