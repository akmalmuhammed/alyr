"use client";

// The last shot of the hero's film (HeroFilm.tsx): the real ALYR Agent home, as the workspace
// draws it (`_agent/AgentDashboard`, showcase mode, no rule lines), at 16:20. The HTML is that
// moment, the still. While the film plays, film.ts says when the screen changes: under the
// closing fold it is put back to 16:19 without a roll ("hush"), and when the film reaches 16:20
// it counts order #1442 the way the live figure does ("roll": the changed figures roll, a count
// that went up gets one Volt rule that fades), so the numbers on it are always the sample's.

import { useEffect, useMemo, useState } from "react";
import { AgentDashboard } from "../_agent/AgentDashboard";
import type { AgentView } from "../_agent/types";
import { liveView } from "./live";

/** The window event film.ts sends: "before" (16:19) or "after" (16:20). */
export const FILM_DASH_EVENT = "alyr:film-dash";

/** The top of the screen only: the summary, Needs you now and Done for you. The summary keeps its
 * plain sentences and leaves out the one against last week (its percentages change width as they
 * roll, which would move the words after them). */
const top = (v: AgentView): AgentView => ({
  ...v, header: { ...v.header, summary: v.header.summary.filter((s) => !s.muted) },
  kpis: [], kpi_caption: null, suggestions: [], week: null, hours: null, top: null, owed: null, team: null, report: null,
});

/** `view` is the engine's sample as it is (the same object the page's other figures get, so the
 * page carries it once); 16:19 is worked out from it, one order of QAR 98 and one message back. */
export function FilmDash({ view, suggestions }: { view: AgentView; suggestions: string }) {
  const after = useMemo(() => top(view), [view]);
  const before = useMemo(() => top(liveView(view, [{ at: "16:19", title: "", adds: ["sent"], order: 98, undo: true }], 1)), [view]);
  const [at, setAt] = useState<"before" | "after">("after");
  const [live, setLive] = useState<"roll" | "hush">("hush");
  useEffect(() => {
    const on = (event: Event) => {
      const next = (event as CustomEvent<"before" | "after">).detail;
      setLive(next === "after" ? "roll" : "hush");
      setAt(next);
    };
    window.addEventListener(FILM_DASH_EVENT, on);
    return () => window.removeEventListener(FILM_DASH_EVENT, on);
  }, []);
  return (
    <AgentDashboard view={at === "after" ? after : before} mode="showcase" headings={false} ruleLines={false}
      labels={{ suggestions }} live={live} />
  );
}
