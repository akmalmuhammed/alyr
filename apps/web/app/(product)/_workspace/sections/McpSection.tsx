"use client";

import { Mcp } from "../Mcp";
import type { SectionProps } from "../sectionRegistry";

export default function McpSection({ ws }: SectionProps) {
  return <Mcp lang={ws.lang} role={ws.state.me.role} />;
}
