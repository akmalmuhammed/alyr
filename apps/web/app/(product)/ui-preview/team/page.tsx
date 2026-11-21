import { notFound } from "next/navigation";
import { ToastProvider, UiRoot } from "@/app/_ui";
import type { UiLang } from "@/app/_ui";
import "@/app/_ui/ui.css";
import { TeamPreview } from "@/app/(product)/_workspace/team/TeamPreview";
import type { Scene } from "@/app/(product)/_workspace/team/TeamPreview";

export const metadata = {
  title: "ALYR Team Preview",
  robots: { index: false, follow: false },
};

const SCENES: readonly Scene[] = ["agent", "empty", "offline", "loading"];

/**
 * Dev-only: the Team screens on the sample shop, nothing sent anywhere. Routes:
 *   /ui-preview/team                      People            ?open=salma  the person drawer
 *   ?tab=week                             This week         ?dialog=invite | ?dialog=remove&person=yusuf
 *   ?state=loading | agent | empty | offline   the states (They open on This week; add &tab=people for the roster)
 * ?lang=ar and ?theme=dark as everywhere in the preview routes.
 */
export default async function TeamPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();

  const query = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  const lang: UiLang = one(query.lang) === "ar" ? "ar" : "en";
  const theme = one(query.theme) === "dark" ? "dark" : "light";
  const asked = one(query.state);
  const scene: Scene = SCENES.find((s) => s === asked) ?? "default";
  const tab = one(query.tab);
  const view = tab === "week" || (!tab && scene !== "default") ? "week" : "people";
  const dialog = one(query.dialog);

  return (
    <UiRoot lang={lang} data-theme={theme}>
      <ToastProvider labels={{ dismiss: lang === "ar" ? "إغلاق" : "Dismiss", undo: lang === "ar" ? "تراجع" : "Undo" }}>
        <TeamPreview
          lang={lang}
          scene={scene}
          view={view}
          openId={one(query.open) ?? null}
          dialog={dialog === "invite" || dialog === "remove" ? dialog : null}
          removeId={one(query.person) ?? (dialog === "remove" ? "yusuf" : null)}
        />
      </ToastProvider>
    </UiRoot>
  );
}
