import { notFound } from "next/navigation";
import { ToastProvider, UiRoot, type UiLang } from "@/app/_ui";
import "@/app/_ui/ui.css";
import { TeamWorkbench } from "@/app/(product)/_workspace/team/TeamWorkbench";

export const metadata = {
  title: "ALYR Team Preview",
  robots: { index: false, follow: false },
};

export default async function TeamPreviewPage({
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
  const initialTab = rawTab === "week" ? "week" : "people";

  const initialOpenPersonId = one(query.open) || null;
  const initialDialog = (one(query.dialog) as "invite" | "remove") || null;
  const initialRemovePersonId = one(query.person) || "yusuf";
  const initialState =
    (one(query.state) as "loading" | "agent" | "empty" | "offline" | "all") ||
    null;

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
        <TeamWorkbench
          lang={lang}
          initialTab={initialTab}
          initialOpenPersonId={initialOpenPersonId}
          initialDialog={initialDialog}
          initialRemovePersonId={initialRemovePersonId}
          initialState={initialState}
          isPhone={isPhone}
        />
      </ToastProvider>
    </UiRoot>
  );
}
