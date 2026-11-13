"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

/** The phone breakpoint: the tokens' `tablet` (48rem). Media queries cannot read custom properties. */
const TABLET = 48;
const PHONE_QUERY = `(max-width: ${TABLET - 0.01}${"rem"})`;

function subscribe(onChange: () => void) {
  const list = window.matchMedia(PHONE_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/** Inside a PhoneFrame the kit draws its phone variants whatever the window is. */
export const PhoneContext = createContext(false);

/** True under 48rem, or inside a PhoneFrame. False on the server and on the first paint. */
export function useIsPhone(): boolean {
  const forced = useContext(PhoneContext);
  const media = useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false);
  return forced || media;
}

/** Reduced motion: only the end state shows. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia("(prefers-reduced-motion: reduce)");
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
