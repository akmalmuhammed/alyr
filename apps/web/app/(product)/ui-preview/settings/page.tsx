import { notFound } from "next/navigation";
import { ToastProvider, UiRoot, type UiLang } from "@/app/_ui";
import "@/app/_ui/ui.css";
import { SettingsWorkbench } from "@/app/(product)/_workspace/settings/SettingsWorkbench";

export const metadata = {
  title: "ALYR Settings Preview",
  robots: { index: false, follow: false },
};

export default async function SettingsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const query = await searchParams;
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const rawLang = one(query.lang);
  const lang: UiLang = rawLang === "ar" ? "ar" : "en";
  const theme = one(query.theme) === "dark" ? "dark" : "light";

  const rawTab = one(query.tab);
  const initialTab = rawTab === "privacy" ? "privacy" : "account";
  const initialDialog = (one(query.dialog) as "email" | "close") || undefined;
  const initialState = (one(query.state) as "loading" | "agent" | "offline") || undefined;

  return (
    <UiRoot lang={lang} data-theme={theme} style={{ inlineSize: "100%", maxInlineSize: "100%", overflowX: "hidden" }}>
      <ToastProvider
        labels={{
          dismiss: lang === "ar" ? "إغلاق" : "Dismiss",
          undo: lang === "ar" ? "تراجع" : "Undo",
        }}
      >
        <SettingsWorkbench
          initialTab={initialTab}
          initialDialog={initialDialog}
          initialState={initialState}
          initialLang={lang}
          initialTheme={theme}
        />
      </ToastProvider>
    </UiRoot>
  );
}
