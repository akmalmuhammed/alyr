"use client";

// The workspace's Discovery section in its redesigned look (Discovery 2.0, U1 and U2): drawn by
// the new shell when the visitor opts in with `?ui=2` (remembered on the device; `?ui=1` turns it
// off), the same switch every redesigned section uses (uiChoice.ts, sectionRegistry.ts). The page
// (This week, Checks, Answers, Proof, Set up) is `?tab=` in the address. Search opens the shell's
// own palette (Ctrl K is the workspace's).

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SectionProps } from "../sectionRegistry";
import { DiscoveryV2, pageHref, readPage, type PageKey } from "./DiscoveryV2";

function Routed({ ws }: SectionProps) {
  const params = useSearchParams();
  const router = useRouter();
  const go = useCallback((page: PageKey) => {
    router.push(pageHref(page), { scroll: false });
    window.scrollTo({ top: 0 });
  }, [router]);
  return <DiscoveryV2 lang={ws.lang} page={readPage(params.get("tab"))} go={go} canManage={ws.state.can_manage} onSearch={ws.palette.open} />;
}

export default function DiscoveryV2Section({ ws }: SectionProps) {
  return <Suspense fallback={null}><Routed ws={ws} /></Suspense>;
}
