import { notFound } from "next/navigation";
import { ToastProvider, UiRoot, type UiLang } from "@/app/_ui";
import "@/app/_ui/ui.css";
import { CreditWorkbench } from "@/app/(product)/_workspace/credit/CreditWorkbench";

export const metadata = {
  title: "ALYR Credit Preview",
  robots: { index: false, follow: false },
};

export default async function CreditPreviewPage({
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

  const initialAccount = one(query.account) || null;
  const initialDialog = (one(query.dialog) as "reminders" | "payment" | "limit") || null;
  const initialView = (one(query.view) as "statement") || null;
  const initialState =
    (one(query.state) as "loading" | "empty" | "offline" | "filtered") || null;

  const phoneQuery = one(query.phone);
  const isPhone = phoneQuery === "1" || phoneQuery === "true";

  return (
    <UiRoot lang={lang} data-theme={theme}>
      <ToastProvider
        labels={{
          dismiss: lang === "ar" ? "إغلاق" : "Dismiss",
          undo: lang === "ar" ? "تراجع" : "Undo",
        }}
      >
        <CreditWorkbench
          lang={lang}
          initialAccount={initialAccount}
          initialDialog={initialDialog}
          initialView={initialView}
          initialState={initialState}
          isPhone={isPhone}
        />
      </ToastProvider>
    </UiRoot>
  );
}
