"use client";

// Part 2 of the kit's gallery: tables, overlays, charts, the calendar, the composer, the workbench and
// the icons, in every state, in both languages and both themes. Not part of the product: it is a 404 in a
// production build (page.tsx). The words are samples in copy.ts; the product takes its own from each
// screen's copy file. `?lang=ar&theme=dark` switches the language and the theme.

import { useEffect } from "react";
import { Button, ToastProvider, UiRoot } from "../../../_ui";
import "../../../_ui/ui.css";
import "../gallery.css";
import "./data.css";
import { CalendarDemo, HeatDemo } from "./CalendarDemo";
import { ChartDemo } from "./ChartDemo";
import { ComposerDemo, WorkbenchDemo } from "./ComposerDemo";
import { IconsDemo } from "./IconsDemo";
import { MenuDemo, OverlayDemo, SkeletonDemo, ToastDemo } from "./OverlayDemo";
import { TableDemo } from "./TableDemo";
import { T } from "./copy";

export function Gallery({ lang, theme }: { lang: "en" | "ar"; theme: "light" | "dark" | null }) {
  const t = T[lang];

  // `?theme=` sets the same attribute the product layout and the site's switch set.
  useEffect(() => {
    if (!theme) return;
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const link = (nextLang: string, nextTheme: string | null) => `?lang=${nextLang}${nextTheme ? `&theme=${nextTheme}` : ""}`;

  return (
    <UiRoot lang={lang} className="u-kg">
      <ToastProvider labels={{ dismiss: t.toastDismiss, undo: t.toastUndoWord }}>
        <header className="u-kg-bar">
          <h1 className="u-kg-bar-title">{t.barTitle}</h1>
          <nav className="u-kg-switch" aria-label="Language and theme">
            <Button size="xs" href={link("en", theme)} kind={lang === "en" ? "dark" : "line"}>{t.languageNames[0]}</Button>
            <Button size="xs" href={link("ar", theme)} kind={lang === "ar" ? "dark" : "line"}>{t.languageNames[1]}</Button>
            <Button size="xs" href={link(lang, null)} kind={theme === null ? "dark" : "line"}>{t.themeNames[0]}</Button>
            <Button size="xs" href={link(lang, "light")} kind={theme === "light" ? "dark" : "line"}>{t.themeNames[1]}</Button>
            <Button size="xs" href={link(lang, "dark")} kind={theme === "dark" ? "dark" : "line"}>{t.themeNames[2]}</Button>
          </nav>
        </header>
        <main className="u-kg-main">
          <p className="u-kg-note">{t.note}</p>
          <IconsDemo t={t} />
          <TableDemo t={t} lang={lang} />
          <OverlayDemo t={t} lang={lang} />
          <MenuDemo t={t} />
          <ToastDemo t={t} />
          <SkeletonDemo t={t} />
          <ChartDemo t={t} lang={lang} />
          <CalendarDemo t={t} lang={lang} />
          <HeatDemo t={t} lang={lang} />
          <ComposerDemo t={t} />
          <WorkbenchDemo t={t} lang={lang} />
        </main>
      </ToastProvider>
    </UiRoot>
  );
}
