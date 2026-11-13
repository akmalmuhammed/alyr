import { notFound } from "next/navigation";
import { Gallery } from "./Gallery";

// The kit's gallery: every component in every state, for the people who build the product screens.
// It exists in development and is a 404 in a production build. `?lang=ar&theme=dark` switches the
// language and the theme.
export const metadata = { title: "ALYR UI kit", robots: { index: false, follow: false } };

export default async function UiKitPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const lang = one(query.lang) === "ar" ? "ar" : "en";
  const theme = one(query.theme) === "dark" ? "dark" : one(query.theme) === "light" ? "light" : null;
  return <Gallery lang={lang} theme={theme} />;
}
