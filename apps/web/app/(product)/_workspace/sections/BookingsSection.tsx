"use client";

import { BookingsListScreen } from "../screens/BookingsListScreen";
import type { SectionProps } from "../sectionRegistry";
import { workProps } from "./workProps";

export default function BookingsSection({ ws }: SectionProps) {
  return <BookingsListScreen {...workProps(ws)} />;
}
