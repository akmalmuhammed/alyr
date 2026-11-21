import { notFound } from "next/navigation";
import "@/app/_ui/ui.css";
import { AuthWorkbench, type AuthFlow, type AuthStep } from "@/app/(product)/_workspace/auth/AuthWorkbench";

// A dev-only preview of the sign-in and sign-up screens on fixtures. It is a 404 in production,
// calls no endpoint, sends no email and creates no account.
// ?flow=signup  the sign-up screens;  ?step=email|code|choose|states|type|setup|plan
// ?lang=ar  Arabic;  ?theme=dark  dark.

export const metadata = {
  title: "ALYR Auth Preview",
  robots: { index: false, follow: false },
};

const SIGN_IN_STEPS: readonly AuthStep[] = ["email", "code", "choose", "states"];
const SIGN_UP_STEPS: readonly AuthStep[] = ["type", "setup", "plan"];

export default async function AuthPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const query = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  const lang = one(query.lang) === "ar" ? "ar" : "en";
  const theme = one(query.theme) === "dark" ? "dark" : "light";
  const flow: AuthFlow = one(query.flow) === "signup" ? "signup" : "signin";
  const known = flow === "signup" ? SIGN_UP_STEPS : SIGN_IN_STEPS;
  const asked = one(query.step) as AuthStep | undefined;
  const step: AuthStep = asked && known.includes(asked) ? asked : known[0];

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.setAttribute("data-theme","${theme}");document.documentElement.lang="${lang}";document.documentElement.dir="${lang === "ar" ? "rtl" : "ltr"}";`,
        }}
      />
      <AuthWorkbench initialFlow={flow} initialStep={step} initialLang={lang} initialTheme={theme} />
    </>
  );
}
