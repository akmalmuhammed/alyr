// The Toast queue's pure half: what is on screen, what waits, how long each stays. The timers and
// the live region are in Toast.tsx; this file holds the rules so `node --test` can check them
// (toastQueue.test.mjs). A toast with Undo stays long enough to be read and used; one that only
// tells stays short; one that reports a problem stays longest (lifted from CatalogUi's useToasts).

export type ToastTone = "ok" | "warn" | "bad";

export type ToastInput = {
  text: string;
  tone?: ToastTone;
  /** A mono line under the text: "09:41 · by Hana". */
  meta?: string;
  undo?: () => void;
  undoLabel?: string;
  /** A second push with the same key replaces the first instead of stacking beside it. */
  key?: string;
  /** Milliseconds; the rules below decide when it is left out. */
  duration?: number;
};

export type ToastItem = {
  id: number;
  key?: string;
  text: string;
  tone: ToastTone;
  meta?: string;
  undo?: () => void;
  undoLabel?: string;
  duration: number;
};

export type ToastState = { next: number; visible: ToastItem[]; waiting: ToastItem[] };

export const MAX_VISIBLE = 3;
export const DURATION = { tell: 4500, problem: 8000, undo: 9000 } as const;

export const EMPTY_QUEUE: ToastState = { next: 1, visible: [], waiting: [] };

export function durationFor(input: Pick<ToastInput, "tone" | "undo" | "duration">): number {
  if (input.duration !== undefined) return input.duration;
  if (input.undo) return DURATION.undo;
  if (input.tone === "bad" || input.tone === "warn") return DURATION.problem;
  return DURATION.tell;
}

function build(id: number, input: ToastInput): ToastItem {
  return {
    id,
    key: input.key,
    text: input.text,
    tone: input.tone ?? "ok",
    meta: input.meta,
    undo: input.undo,
    undoLabel: input.undoLabel,
    duration: durationFor(input),
  };
}

/** Adds a toast. It shows at once while there is room, otherwise it waits its turn, oldest first. */
export function pushToast(state: ToastState, input: ToastInput, max: number = MAX_VISIBLE): { state: ToastState; id: number; shown: boolean } {
  const id = state.next;
  const item = build(id, input);
  if (input.key !== undefined) {
    const at = state.visible.findIndex((t) => t.key === input.key);
    if (at >= 0) {
      const visible = state.visible.slice();
      visible[at] = item;
      return { state: { ...state, next: id + 1, visible }, id, shown: true };
    }
    const waitingAt = state.waiting.findIndex((t) => t.key === input.key);
    if (waitingAt >= 0) {
      const waiting = state.waiting.slice();
      waiting[waitingAt] = item;
      return { state: { ...state, next: id + 1, waiting }, id, shown: false };
    }
  }
  if (state.visible.length < max) return { state: { ...state, next: id + 1, visible: [...state.visible, item] }, id, shown: true };
  return { state: { ...state, next: id + 1, waiting: [...state.waiting, item] }, id, shown: false };
}

/** Takes a toast away (read, undone, dismissed, timed out) and lets the next waiting one in. */
export function dismissToast(state: ToastState, id: number, max: number = MAX_VISIBLE): ToastState {
  const visible = state.visible.filter((t) => t.id !== id);
  const waiting = state.waiting.filter((t) => t.id !== id);
  while (visible.length < max && waiting.length > 0) visible.push(waiting.shift() as ToastItem);
  return { ...state, visible, waiting };
}

export function clearToasts(state: ToastState): ToastState {
  return { ...state, visible: [], waiting: [] };
}

/** Which toasts came on screen between two states: the timers start for exactly these. */
export function newlyVisible(before: ToastState, after: ToastState): ToastItem[] {
  const had = new Set(before.visible.map((t) => t.id));
  return after.visible.filter((t) => !had.has(t.id));
}
