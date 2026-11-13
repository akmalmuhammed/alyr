import { notFound } from "next/navigation";
import { ToastProvider, UiRoot, type UiLang } from "@/app/_ui";
import "@/app/_ui/ui.css";
import { InboxWorkbench } from "@/app/(product)/_workspace/inbox/InboxWorkbench";
import type { InboxFilters } from "@/app/(product)/_workspace/inbox/logic";

export const metadata = {
  title: "ALYR Inbox Preview",
  robots: { index: false, follow: false },
};

export default async function InboxPreviewPage({
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
  const live = one(query.live) === "1" || one(query.live) === "true";
  const stateOverride = one(query.state) || null;
  const dialogOverride = one(query.dialog) || null;
  const viewOverride = one(query.view) || null;
  const windowOverride = one(query.window) || null;
  const thread = one(query.thread);

  const initialFilters = {
    tab: (one(query.tab) as "open" | "closed") || "open",
    chip: (one(query.chip) as InboxFilters["chip"]) || null,
    q: one(query.q) || "",
  };

  return (
    <UiRoot lang={lang} data-theme={theme}>
      <ToastProvider labels={{ dismiss: lang === "ar" ? "إغلاق" : "Dismiss", undo: lang === "ar" ? "تراجع" : "Undo" }}>
        <div style={{ maxWidth: "90rem", margin: "0 auto", padding: "1.5rem" }}>
          <InboxWorkbench
            initialFilters={initialFilters}
            initialSelectedId={thread ? "rm-148" : "rm-148"}
            lang={lang}
            live={live}
            stateOverride={stateOverride}
            dialogOverride={dialogOverride}
            viewOverride={viewOverride}
            windowOverride={windowOverride}
            isPhone={Boolean(thread)}
          />
        </div>
      </ToastProvider>
    </UiRoot>
  );
}
