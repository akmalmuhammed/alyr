import type { MetadataRoute } from "next";
import { PATHS, SITE_URL } from "./_site/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = { en: `${SITE_URL}${PATHS.en}`, ar: `${SITE_URL}${PATHS.ar}` };
  return [PATHS.en, PATHS.ar].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "monthly",
    alternates: { languages },
  }));
}
