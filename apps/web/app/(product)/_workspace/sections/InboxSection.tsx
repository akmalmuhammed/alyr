"use client";

import { InboxScreen } from "../screens/InboxScreen";
import type { SectionProps } from "../sectionRegistry";
import { workProps } from "./workProps";

export default function InboxSection({ ws }: SectionProps) {
  return <InboxScreen {...workProps(ws)} />;
}
