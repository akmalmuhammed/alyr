import { notFound } from "next/navigation";
import { ToastProvider, UiRoot, type UiLang } from "@/app/_ui";
import "@/app/_ui/ui.css";
import { AuthWorkbench, type AuthFlow, type AuthStep } from "@/app/(product)/_workspace/auth/AuthWorkbench";

export const metadata = {
  title: "ALYR Auth Preview",
  robots: { index: false, follow: false },
};

export default async function AuthPreviewPage({
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

  const rawFlow = one(query.flow);
  const rawStep = one(query.step);

  let initialFlow: AuthFlow = "signin";
  let initialStep: AuthStep = "email";

  if (rawFlow === "signup") {
    initialFlow = "signup";
    if (rawStep === "setup") {
      initialStep = "setup";
    } else if (rawStep === "plan") {
      initialStep = "plan";
    } else {
      initialStep = "type";
    }
  } else {
    initialFlow = "signin";
    if (rawStep === "code") {
      initialStep = "code";
    } else if (rawStep === "choose") {
      initialStep = "choose";
    } else if (rawStep === "states") {
      initialStep = "states";
    } else {
      initialStep = "email";
    }
  }

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.setAttribute('data-theme', '${theme}'); document.documentElement.lang = '${lang}'; document.documentElement.dir = '${lang === "ar" ? "rtl" : "ltr"}';`
        }}
      />
      <UiRoot lang={lang} data-theme={theme} style={{ inlineSize: "100%", maxInlineSize: "100%", overflowX: "hidden" }}>
        <ToastProvider
          labels={{
            dismiss: lang === "ar" ? "إغلاق" : "Dismiss",
            undo: lang === "ar" ? "تراجع" : "Undo",
          }}
        >
          <AuthWorkbench
            initialFlow={initialFlow}
            initialStep={initialStep}
            initialLang={lang}
            initialTheme={theme}
          />
        </ToastProvider>
      </UiRoot>
    </>
  );
}
