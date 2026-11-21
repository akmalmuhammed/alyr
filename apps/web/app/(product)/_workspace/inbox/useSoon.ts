"use client";

import { useEffect } from "react";

/**
 * Runs `task` once after the screen has drawn, and again whenever it changes (give it a stable
 * `useCallback`). The task may set state: it runs from a timer, never inside the effect, so the screen
 * does not draw twice in a row for one load.
 */
export function useSoon(task: () => void): void {
  useEffect(() => {
    const id = setTimeout(task, 0);
    return () => clearTimeout(id);
  }, [task]);
}
