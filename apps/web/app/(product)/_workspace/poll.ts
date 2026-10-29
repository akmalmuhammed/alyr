// How the workspace looks again for changes (ALY-275 PERF-1). Twelve staff with screens that
// asked every 1.5 s, hidden tabs included, saturated the database with no customers at all.
// A screen now asks only while it is on show, never twice at once, and at once when the
// person comes back to it.

import { useEffect, useRef } from "react";

/**
 * One "look again". It runs `load` unless the page is hidden. A call made while one is still
 * running does not start a second: it asks for one more run after it, so the newest question
 * (another chat, another filter) is always answered and slow answers never pile up.
 */
export function ticker(load: () => unknown, visible: () => boolean): () => Promise<void> {
  let running = false;
  let again = false;
  return async function tick() {
    if (!visible()) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        try {
          await load();
        } catch {
          // A failed look is the screen's to report; the next one tries again.
        }
      } while (again);
    } finally {
      running = false;
    }
  };
}

/**
 * Calls `load` at once and whenever it changes, then every `ms` while the page is visible,
 * and as soon as it is shown again after being hidden. `load` should come from useCallback.
 */
export function usePolling(load: () => unknown, ms: number, on = true): void {
  const latest = useRef(load);
  // One ticker for the life of the screen, made the first time an effect needs it, so a run
  // still going when `load` changes is followed by the new one, never overlapped by it.
  const ticking = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    latest.current = load;
    if (!on) return;
    const tick = (ticking.current ??= ticker(() => latest.current(), visible));
    const now = setTimeout(tick, 0);
    return () => clearTimeout(now);
  }, [load, on]);
  useEffect(() => {
    if (!on) return;
    const tick = (ticking.current ??= ticker(() => latest.current(), visible));
    const timer = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms, on]);
}

function visible(): boolean {
  return document.visibilityState === "visible";
}
