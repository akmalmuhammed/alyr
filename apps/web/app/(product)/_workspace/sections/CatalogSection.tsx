"use client";

import { Catalog } from "../Catalog";
import type { SectionProps } from "../sectionRegistry";

export default function CatalogSection({ ws }: SectionProps) {
  const { lang, pick, current, t, show, load } = ws;
  // Named by the shop's type of business: Menu, Products, Price list (D-039, ALY-107).
  return <Catalog lang={lang} title={current ? pick(current.label) : t.productsTitle} show={show} onRenamed={() => void load()} />;
}
