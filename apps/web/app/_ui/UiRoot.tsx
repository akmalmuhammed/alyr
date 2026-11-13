"use client";

// The root of everything the kit draws. It carries the `.u` class (which gives the kit its
// token aliases, so nothing depends on being inside the workspace shell's `.sh`), the language
// and the direction, and it tells the parts that open over the screen (dialogs, drawers,
// menus, toasts) where to draw: inside this element, so they take its colours and direction.

import { createContext, useContext, useMemo, useState } from "react";
import { cx } from "./variants";

export type UiLang = "en" | "ar";

type UiContextValue = {
  lang: UiLang;
  dir: "ltr" | "rtl";
  /** The root element, once it is mounted: the portal target for layers. Null on the first render. */
  host: HTMLElement | null;
};

const UiContext = createContext<UiContextValue>({ lang: "en", dir: "ltr", host: null });

export function UiRoot({
  lang = "en",
  className,
  children,
  ...rest
}: {
  lang?: UiLang;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "dir" | "lang">) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const value = useMemo(() => ({ lang, dir, host }) as UiContextValue, [lang, dir, host]);
  return (
    <UiContext value={value}>
      <div {...rest} ref={setHost} className={cx("u", className)} lang={lang} dir={dir} data-ui="">
        {children}
      </div>
    </UiContext>
  );
}

/** The language and direction of the nearest root. */
export function useUi(): { lang: UiLang; dir: "ltr" | "rtl" } {
  const { lang, dir } = useContext(UiContext);
  return { lang, dir };
}

/** The element layers draw into, or null before it is mounted (draw nothing until it is there). */
export function useUiHost(): HTMLElement | null {
  return useContext(UiContext).host;
}
