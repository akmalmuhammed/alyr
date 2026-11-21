"use client";

import { NotSent } from "../NotSent";
import type { SectionProps } from "../sectionRegistry";

export default function NotSentSection({ ws }: SectionProps) {
  return <NotSent lang={ws.lang} />;
}
