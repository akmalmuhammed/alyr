"use client";

import { Documents } from "../Documents";
import type { SectionProps } from "../sectionRegistry";

export default function DocumentsSection({ ws }: SectionProps) {
  const { lang, pick, current, t, show } = ws;
  return <Documents lang={lang} title={current ? pick(current.label) : t.productsTitle} show={show} />;
}
