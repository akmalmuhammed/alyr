"use client";

import { ConnectSettings } from "../ConnectSettings";
import type { SectionProps } from "../sectionRegistry";

export default function ConnectSection({ ws }: SectionProps) {
  return <ConnectSettings lang={ws.lang} canManage={ws.state.can_manage} />;
}
