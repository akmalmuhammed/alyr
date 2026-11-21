import { notFound } from "next/navigation";
import { ToastProvider, UiRoot, type UiLang } from "@/app/_ui";
import "@/app/_ui/ui.css";
import { CreditWorkbench, type CreditState } from "@/app/(product)/_workspace/credit/CreditWorkbench";
import { previewData } from "@/app/(product)/_workspace/credit/fixtures";

export const metadata = {
  title: "ALYR Credit Preview",
  robots: { index: false, follow: false },
};

const STATES: readonly string[] = ["loading", "empty", "offline", "error", "filtered"];
const DIALOGS: readonly string[] = ["reminders", "payment", "limit"];

/**
 * Development only (404 in production): the Credit screens on sample data, with every action simulated
 * on the page. Nothing is saved or sent. `?role=agent` shows what an agent sees (no credit at all).
 *   ?account=bluefin  ?dialog=reminders|payment|limit  ?view=statement  ?state=loading|empty|offline|error|filtered
 */
export default async function CreditPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const query = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  const lang: UiLang = one(query.lang) === "ar" ? "ar" : "en";
  const theme = one(query.theme) === "dark" ? "dark" : "light";
  const state = one(query.state);
  const dialog = one(query.dialog);

  return (
    <UiRoot lang={lang} data-theme={theme} className="crd-preview">
      <ToastProvider labels={{ dismiss: lang === "ar" ? "إغلاق" : "Dismiss", undo: lang === "ar" ? "تراجع" : "Undo" }}>
        <div className="crd-preview-page">
          <CreditWorkbench
            lang={lang}
            role={one(query.role) || "owner"}
            data={previewData()}
            preview
            initialAccount={one(query.account) || null}
            initialDialog={dialog && DIALOGS.includes(dialog) ? (dialog as "reminders" | "payment" | "limit") : null}
            initialView={one(query.view) === "statement" ? "statement" : null}
            initialState={state && STATES.includes(state) ? (state as CreditState) : null}
          />
        </div>
      </ToastProvider>
    </UiRoot>
  );
}
