"use client";

// The workspace's Discovery section in its redesigned look (Discovery 2.0, U1): drawn by the new
// shell when the visitor opts in with `?ui=2` (remembered on the device; `?ui=1` turns it off), the
// same switch every redesigned section uses (uiChoice.ts, sectionRegistry.ts). Search opens the
// shell's own palette (Ctrl K is the workspace's).

import type { SectionProps } from "../sectionRegistry";
import { LiveThisWeek } from "./LiveThisWeek";

export default function DiscoveryV2Section({ ws }: SectionProps) {
  return <LiveThisWeek lang={ws.lang} onSearch={ws.palette.open} />;
}
