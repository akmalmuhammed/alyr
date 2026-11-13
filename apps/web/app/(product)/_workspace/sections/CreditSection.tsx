"use client";

import { CreditScreen } from "../screens/CreditScreen";
import type { SectionProps } from "../sectionRegistry";
import { workProps } from "./workProps";

export default function CreditSection({ ws }: SectionProps) {
  return <CreditScreen {...workProps(ws)} />;
}
