import type { MetadataRoute } from "next";
import { PATHS, SITE_URL } from "./_site/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.values(PATHS).flatMap((page) => {
    const languages = { en: `${SITE_URL}${page.en}`, ar: `${SITE_URL}${page.ar}`, "x-default": `${SITE_URL}${page.en}` };
    return [page.en, page.ar].map((path) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency: "monthly" as const,
      alternates: { languages },
    }));
  });
}
