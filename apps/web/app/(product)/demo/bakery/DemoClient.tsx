"use client";

// The demo is drawn in the browser only: it reads the visit from this browser's storage
// before its first frame, so nothing jumps after hydration.

import dynamic from "next/dynamic";

const Demo = dynamic(() => import("./Demo"), { ssr: false, loading: () => <div className="dm-boot" /> });

export default function DemoClient() {
  return <Demo />;
}
