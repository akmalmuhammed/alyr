"use client";

// /agent's Sunday report follows the sample chosen on the page's ALYR Agent figure: the
// figure's switch sends `alyr:sample` with its `sync` id (AgentFigure.tsx), and this shows
// that sample's message. Without scripts it stays on the first sample, which
// is what the figure shows then too.

import { useEffect, useState } from "react";
import type { SampleKey } from "./copy";
import { ReportPhone, type ReportWords } from "./ReportPhone";
import type { ReportSample } from "./samples";

export const SAMPLE_EVENT = "alyr:sample";
export type SampleEvent = CustomEvent<{ id: string; key: SampleKey }>;

type Props = {
  /** The id the figure's switch sends with its choice. */
  sync: string;
  start: SampleKey;
  samples: Record<SampleKey, ReportSample>;
  words: Record<SampleKey, ReportWords>;
  /** What each sample is, said first to screen readers and crawlers (site audit 03, A1);
   * the phone's header says "Sample business" for the eye. */
  fictional: Record<SampleKey, string>;
};

export function ReportSwitch({ sync, start, samples, words, fictional }: Props) {
  const [key, setKey] = useState<SampleKey>(start);
  useEffect(() => {
    const pick = (event: Event) => {
      const { id, key: next } = (event as SampleEvent).detail ?? {};
      if (id === sync && next in samples) setKey(next);
    };
    window.addEventListener(SAMPLE_EVENT, pick);
    return () => window.removeEventListener(SAMPLE_EVENT, pick);
  }, [sync, samples]);

  return (
    <>
      <figcaption className="sr-only">{fictional[key]}</figcaption>
      <ReportPhone sample={samples[key]} words={words[key]} />
    </>
  );
}
