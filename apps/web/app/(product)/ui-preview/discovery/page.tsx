import { notFound } from "next/navigation";
import { DiscoveryPreview } from "./DiscoveryPreview";

// Discovery v2 on fixtures shaped like the API, for the people who build and review it. Every
// state is one address:
//   This week (U1):
//     ?state=approved|loading|empty|error   the ticket after Approve, the skeleton, nothing to ask, a failed load
//     ?source=sample                        today's wording for the sample listing ("your listing", not Google)
//     ?sheet=1  ?fan=1  ?change=1           the Why sheet open, the waiting asks fanned out, Change it drawn
//   The other pages (U2): ?tab=checks|answers|proof|setup and
//     checks:  ?state=hovercard|checking|differ|empty|loading|error
//     answers: ?state=off|loading|error
//     proof:   ?state=empty|loading|error
//     setup:   ?state=new|readonly|running|loading|error
//   ?lang=ar                                Arabic, right to left, on every page
// It exists in development and is a 404 in a production build, the same pattern as the other previews.
export const metadata = { title: "ALYR Discovery v2 preview", robots: { index: false, follow: false } };

const TABS = ["checks", "answers", "proof", "setup"] as const;

export default async function DiscoveryPreviewPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const state = one(query.state);
  const tabParam = one(query.tab);
  const tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as (typeof TABS)[number]) : "week";
  return (
    <DiscoveryPreview
      lang={one(query.lang) === "ar" ? "ar" : "en"}
      state={state === "approved" || state === "loading" || state === "empty" || state === "error" ? state : "default"}
      source={one(query.source) === "sample" ? "sample" : "google"}
      sheet={one(query.sheet) === "1"}
      fan={one(query.fan) === "1"}
      change={one(query.change) === "1"}
      tab={tab}
      screenState={state ?? "default"}
    />
  );
}
