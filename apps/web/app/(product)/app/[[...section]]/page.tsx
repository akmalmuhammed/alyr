"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import LegacyShell from "../../_workspace/LegacyShell";
import { v2Of } from "../../_workspace/sectionRegistry";
import { T } from "../../_workspace/shellCopy";
import { UI_STORE, parseRemembered, remember, resolveUi, uiFromQuery, type Remembered } from "../../_workspace/uiChoice";
import { isReady, useWorkspace } from "../../_workspace/useWorkspace";

// Loaded only when a visitor opted in, so the classic page ships none of the new shell's script or
// stylesheet (the kit's `ui.css` comes with it).
const NewShell = dynamic(() => import("../../_workspace/NewShell"));

// The workspace: one catch-all page, `/app` and every address beneath it. `useWorkspace()` reads the
// address (`/app/<section>/<more>?id=`) and loads what the shop shows; the section registry says
// which section draws it. The classic shell draws every section unless the visitor opted in to
// the redesigned look for one that has it (`?ui=2`, remembered on their device for that section;
// `?ui=1` goes back): then the new shell draws that section. No section is on by default. The
// `?id=` is read with `useSearchParams`, which needs the Suspense boundary: its fallback is what
// this page has always drawn before the workspace has loaded.
export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="sh-empty">{T.en.loading}</div>}>
      <Workspace />
    </Suspense>
  );
}

function Workspace() {
  const ws = useWorkspace();
  const asked = uiFromQuery(useSearchParams().get("ui"));
  const { section } = ws;
  const v2 = v2Of(section);
  // What this device remembered, read after mount (the server has no device). Null until read.
  const [remembered, setRemembered] = useState<Remembered | null>(null);

  useEffect(() => {
    const read = setTimeout(() => {
      let stored: Remembered = {};
      try { stored = parseRemembered(localStorage.getItem(UI_STORE)); } catch { /* nothing remembered */ }
      if (asked && v2Of(section)) {
        stored = remember(stored, section, asked);
        try { localStorage.setItem(UI_STORE, JSON.stringify(stored)); } catch { /* not remembered */ }
      }
      setRemembered(stored);
    }, 0);
    return () => clearTimeout(read);
  }, [section, asked]);

  if (!isReady(ws)) return <div className="sh-empty">{ws.offline ? ws.t.offline : ws.t.loading}</div>;
  if (!v2) return <LegacyShell ws={ws} />;

  // The visitor's own words first, then the device's memory, then the section's default (the classic look).
  const known = asked !== null || remembered !== null;
  if (!known) return <div className="sh-empty">{ws.t.loading}</div>;
  if (resolveUi(section, asked, remembered ?? {}, v2.defaultUi) !== 2) return <LegacyShell ws={ws} />;

  const Section = v2.load;
  return (
    <NewShell ws={ws} fill={v2.fill}>
      <Section key={`${section}-${ws.lang}`} ws={ws} />
    </NewShell>
  );
}
