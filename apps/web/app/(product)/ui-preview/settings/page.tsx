import { notFound } from "next/navigation";
import { ToastProvider, UiRoot, type UiLang } from "@/app/_ui";
import "@/app/_ui/ui.css";
import { PreviewSettings } from "./PreviewSettings";

export const metadata = {
  title: "ALYR Settings Preview",
  robots: { index: false, follow: false },
};

// Development only, like the kit gallery. ?tab=privacy, ?dialog=email|close, ?state=loading|offline|error|agent,
// ?lang=ar, ?theme=dark.
export default async function SettingsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const query = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  const lang: UiLang = one(query.lang) === "ar" ? "ar" : "en";
  const rawTheme = one(query.theme);
  const theme = rawTheme === "dark" || rawTheme === "light" ? rawTheme : undefined;
  const rawState = one(query.state);
  const state = rawState === "loading" || rawState === "offline" || rawState === "error" || rawState === "agent" ? rawState : null;
  const rawDialog = one(query.dialog);
  const dialog = rawDialog === "email" || rawDialog === "close" ? rawDialog : null;
  // The agent view is the Data and privacy page seen by someone who may not download or close.
  const view = one(query.tab) === "privacy" || state === "agent" || dialog === "close" ? "privacy" : "account";

  return (
    <UiRoot lang={lang}>
      <ToastProvider labels={{ dismiss: lang === "ar" ? "إغلاق" : "Dismiss", undo: lang === "ar" ? "تراجع" : "Undo" }}>
        <PreviewSettings lang={lang} view={view} state={state} dialog={dialog} theme={theme} />
      </ToastProvider>
    </UiRoot>
  );
}
