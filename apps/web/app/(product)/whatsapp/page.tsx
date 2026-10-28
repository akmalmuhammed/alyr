"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** The old sales demo (chat simulator beside sample screens) is gone: the founder asked for
 *  the real product only (28 Oct 2026). An old link lands in the workspace instead. */
export default function OldDemo() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app");
  }, [router]);
  return null;
}
