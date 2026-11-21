"use client";

import { Suspense } from "react";
import { Discovery } from "../Discovery";
import { T as DISCOVERY } from "../discoveryCopy";
import type { SectionProps } from "../sectionRegistry";

export default function DiscoverySection({ ws }: SectionProps) {
  return (
    <Suspense fallback={<p className="sh-note">{DISCOVERY[ws.lang].loading}</p>}>
      <Discovery lang={ws.lang} canManage={ws.state.can_manage} />
    </Suspense>
  );
}
