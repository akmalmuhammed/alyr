import { notFound } from "next/navigation";
import { queryToFilters } from "@/app/(product)/_workspace/orders/logic";
import { PreviewFrame } from "./PreviewFrame";

// The Orders screens on their own, for the people who build and review them: every frame and state
// is one address (see the job file, section 4). It exists in development and is a 404 in a production
// build, the same pattern as the kit gallery.
export const metadata = { title: "ALYR Orders preview", robots: { index: false, follow: false } };

export default async function OrdersPreviewPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  if (process.env.NODE_ENV === "production") notFound();

  const query = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const params: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(query)) params[key] = one(value);

  const role = params.role === "agent" ? "agent" : params.role === "admin" ? "admin" : "owner";
  return (
    <PreviewFrame
      lang={params.lang === "ar" ? "ar" : "en"}
      theme={params.theme === "dark" ? "dark" : "light"}
      role={role}
      live={params.live === "1" || params.live === "true"}
      stateOverride={params.state ?? null}
      cancelledPreview={params.cancelled === "1"}
      initialFilters={queryToFilters(params)}
    />
  );
}
