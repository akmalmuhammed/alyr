import { notFound } from "next/navigation";
import { ToastProvider, UiRoot, type UiLang } from "@/app/_ui";
import { OrdersView } from "@/app/(product)/_workspace/orders/OrdersView";
import { queryToFilters } from "@/app/(product)/_workspace/orders/logic";

export const metadata = {
  title: "ALYR Orders Preview",
  robots: { index: false, follow: false },
};

export default async function OrdersPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const query = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  const rawLang = one(query.lang);
  const lang: UiLang = rawLang === "ar" ? "ar" : "en";
  const theme = one(query.theme) === "dark" ? "dark" : "light";
  const role = one(query.role) || "owner";
  const live = one(query.live) === "1" || one(query.live) === "true";
  const stateOverride = one(query.state) || null;

  // Flatten search params into string map
  const paramMap: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(query)) {
    paramMap[k] = one(v);
  }

  const initialFilters = queryToFilters(paramMap);

  return (
    <UiRoot lang={lang} data-theme={theme}>
      <ToastProvider labels={{ dismiss: lang === "ar" ? "إغلاق" : "Dismiss", undo: lang === "ar" ? "تراجع" : "Undo" }}>
        <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "1.5rem" }}>
          <OrdersView
            initialFilters={initialFilters}
            lang={lang}
            role={role}
            live={live}
            stateOverride={stateOverride}
          />
        </div>
      </ToastProvider>
    </UiRoot>
  );
}
