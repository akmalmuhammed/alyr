"use client";

import { useEffect } from "react";
import { ToastProvider, UiRoot, type UiLang } from "@/app/_ui";
import "@/app/_ui/ui.css";
import { OrdersView, type OrdersViewProps } from "@/app/(product)/_workspace/orders/OrdersView";

/**
 * The preview's frame: the kit root (language, direction), one toast provider, and the page's own
 * canvas. `?theme=` and `?lang=` are authoritative here: they are written on <html> the same way the
 * product layout and the kit gallery write them, whatever the device prefers.
 */
export function PreviewFrame({ lang, theme, ...view }: OrdersViewProps & { lang: UiLang; theme: "light" | "dark" }) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang, theme]);

  return (
    <UiRoot lang={lang} className="ord-preview">
      <ToastProvider labels={{ dismiss: lang === "ar" ? "إغلاق" : "Dismiss", undo: lang === "ar" ? "تراجع" : "Undo" }}>
        <div className="ord-preview-page">
          <OrdersView lang={lang} {...view} />
        </div>
      </ToastProvider>
    </UiRoot>
  );
}
