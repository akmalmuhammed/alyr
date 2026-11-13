"use client";

import { Suspense } from "react";
import LegacyShell from "../../_workspace/LegacyShell";
import { T } from "../../_workspace/shellCopy";

// The workspace: one catch-all page, `/app` and every address beneath it. `useWorkspace()` reads the
// address (`/app/<section>/<more>?id=`) and loads what the shop shows; the section registry says
// which section draws it. Today's shell is the one drawn. The `?id=` is read with
// `useSearchParams`, which needs the Suspense boundary: its fallback is what this page has
// always drawn before the workspace has loaded.
export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="sh-empty">{T.en.loading}</div>}>
      <LegacyShell />
    </Suspense>
  );
}
