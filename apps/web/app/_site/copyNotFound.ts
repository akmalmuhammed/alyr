// The words of the page a visitor sees when an address has nothing behind it (404), English and
// Arabic (design QA of the live site, finding F-02). It is published as `404.html` and, for an
// address under /ar, as `ar/404.html` (scripts/build-site.sh); Cloudflare serves the nearest one.
//
// Plain and short: what happened, what to do next. No apology theatre, no joke, nothing that
// promises more than the site has (every product link goes to a page that exists).
//
// The Arabic is formal-plain Modern Standard Arabic and a DRAFT for the native review (ALY-66).

export type NotFoundPage = {
  /** The tab's title. */
  title: string;
  /** The small label above the heading. */
  eyebrow: string;
  heading: string;
  lead: string;
  /** The one action: back to the homepage. */
  home: string;
  /** The heading of the list of products. */
  productsTitle: string;
};

export const notFoundEn: NotFoundPage = {
  title: "Page not found · ALYR",
  eyebrow: "Error 404",
  heading: "We could not find that page.",
  lead: "The address may have a typo, or the page may have moved. Start from the homepage, or open one of the products.",
  home: "Go to the homepage",
  productsTitle: "Or open a product",
};

// DRAFT for the native review (ALY-66).
export const notFoundAr: NotFoundPage = {
  title: "الصفحة غير موجودة · ALYR",
  eyebrow: "خطأ 404",
  heading: "لم نعثر على هذه الصفحة.",
  lead: "قد يكون في العنوان خطأ مطبعي، وقد تكون الصفحة نُقلت. ابدأ من الصفحة الرئيسية، أو افتح أحد المنتجات.",
  home: "إلى الصفحة الرئيسية",
  productsTitle: "أو افتح أحد المنتجات",
};
